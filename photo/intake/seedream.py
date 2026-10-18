"""Official Ark image-to-image adapter. No credentials in results or errors."""
import base64
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError

DEFAULT_MODEL='doubao-seedream-5-0-flash-260915'
ENDPOINT='https://ark.cn-beijing.volces.com/api/v3/images/generations'
PROMPT='''将输入图片转换为干净白底、深色、稀疏而连续的结构线稿。保持原图构图、长宽比、透视、主体位置和主要空间层次。保留主体外轮廓、建筑主要结构、山脊、河岸及树干主分支；树冠以成组轮廓表达。弱化阴影、灰度填充、交叉排线、草叶碎线、密集水纹、石块内部纹理和次要细枝。不要新增光线、物体、装饰边框或改变主体形状。优先保留少量清楚、连续、可解析的主要结构，不逐像素复制细节。若原始画面中出现水印、文字、字幕、日期、签名或标识，请在生成线稿时自动剔除，并依据周围真实结构自然补全被遮挡的画面与轮廓；不要将这些文字或水印转成几何线条，不添加替代文字，不凭空增添物体。'''


class SeedreamError(ValueError):
    def __init__(self, code, message):
        self.code=code
        super().__init__(message)


def key(root):
    value=os.environ.get('ARK_API_KEY','').strip()
    if value:return value
    file=Path(root)/'ark.local.env'
    if file.exists():
        for line in file.read_text(encoding='utf-8-sig').splitlines():
            if line.strip().startswith('ARK_API_KEY='):
                return line.split('=',1)[1].strip().strip('\"\'')
    return ''


def generate(raw,config,root,request,on_attempt=lambda n:None):
    secret=key(root)
    if not secret:raise SeedreamError('missing_key','尚未配置方舟 API Key，请在本机配置后重试。')
    model=config.get('ark_model') or DEFAULT_MODEL
    body=dict(model=model,prompt=PROMPT,image='data:image/png;base64,'+base64.b64encode(raw).decode(),
              size=config.get('ark_size') or '1K',response_format='b64_json',output_format='png',watermark=True)
    started=time.perf_counter()
    attempts=max(1,min(2,int(config.get('ark_attempts',2))))
    for attempt in range(attempts):
        on_attempt(attempt+1)
        try:
            response=json.loads(request(ENDPOINT,body,{'Authorization':'Bearer '+secret}))
            data=response.get('data',[])
            if not data or not data[0].get('b64_json'):
                raise SeedreamError('invalid_response','云端未返回预期图片，请检查模型和响应格式。')
            encoded=data[0]['b64_json']
            if not isinstance(encoded,str):
                raise SeedreamError('invalid_response','云端图片编码格式异常。')
            if encoded.startswith('data:'):
                encoded=encoded.split(',',1)[-1]
            image=base64.b64decode(''.join(encoded.split()),validate=True)
            return image,dict(model=model,elapsed_seconds=round(time.perf_counter()-started,3),attempts=attempt+1,prompt_version='structure-v2-text-cleanup')
        except HTTPError as error:
            status=error.code
            error_code=''
            try:
                details=json.loads(error.read(32768))
                error_code=details.get('error',{}).get('code','')
            except (ValueError,AttributeError,TypeError):
                pass
            # Persist only a classification, never the raw body or auth headers.
            error.close()
            if error_code=='ModelNotOpen':
                raise SeedreamError('model_not_open','密钥已送达，但账号尚未开通所选模型。请在方舟控制台开通模型服务后重试。') from None
            if (status==429 or 500<=status<600) and attempt+1<attempts:
                time.sleep(.5*2**attempt);continue
            if status==401:raise SeedreamError('authentication','API Key 无效或已过期，请检查方舟密钥。') from None
            if status==403:raise SeedreamError('permission','账号或模型访问被拒绝，请检查实名验证、模型开通和权限。') from None
            if status==402:raise SeedreamError('billing','云端要求检查账户余额或额度，请在方舟控制台确认。') from None
            if status==429:raise SeedreamError('rate_limit','云端限流或额度限制，请在控制台核实后再试。') from None
            if status==400:raise SeedreamError('invalid_request','请求被拒绝，请核实模型权限、尺寸、输入或内容限制。') from None
            raise SeedreamError('upstream_error',f'云端请求未完成（HTTP {status}），请检查服务状态。') from None
        except (TimeoutError,URLError):
            # Ambiguous outcomes are not retried automatically: billing may have occurred.
            raise SeedreamError('network','云端连接超时或中断，结果未确认；本次未自动重复提交，请检查控制台。') from None
        except (ValueError,KeyError,TypeError) as error:
            if isinstance(error,SeedreamError):raise
            raise SeedreamError('invalid_response','云端响应格式异常，未取得有效图片。') from None
