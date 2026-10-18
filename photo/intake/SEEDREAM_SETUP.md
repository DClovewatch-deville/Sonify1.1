# 豆包 API 已接入：配置与真实验证

## 目前状态

已完成 Seedream Flash 单张与1–5张独立图片的并行入口。每张调用一次官方图生图接口；一份云端线稿保存为艺术展示图，另存规范化结构图后进入几何、Sonic Grammar、MIDI与现有三模式。未再对生成线稿执行 Canny。

14项自动测试通过，其中5个请求通过同步屏障证明重叠执行；一张403失败，另外四张仍完成几何。限流重试、认证错误、超时不重复提交、错误脱敏也有覆盖。这里的云端响应使用测试替身，不代表已验证真实模型效果、并发额度或实际耗时。

真实单张验证已运行预检，结果为 missing_api_key，未发送计费请求。报告保存于 batch_results/seedream-live-verification/live-1.json。账号验证、模型权限及余额均尚未向真实服务核实，不能声称已经开通或已经不足。

## 用户现在需要完成

1. 登录火山方舟，确认可用的 API Key，以及 Seedream 5.0 Flash 的访问权限。若提示实名验证、服务开通或余额不足，请在控制台完成。
2. 打开本目录 ark.local.env，将 ARK_API_KEY= 后面填入密钥；不要发到聊天，不要填写手机豆包登录密码。此文件已被 Git 忽略，只供本机服务读取。
3. 告知 Codex“本地密钥已配置”。接着先跑1张真实端到端，再跑5张并行，保存每张耗时和错误分类。

官方入口：[方舟 API Key](https://ark.volcengine.com/region:cn-beijing/apikey)。

## 模型和请求

默认 doubao-seedream-5-0-flash-260915，尺寸1K；config.local.json可改ark_model、ark_size、timeout_seconds、ark_attempts。Pro仅可手动指定，没有失败后自动切换更贵模型。官方模型与接口依据：[Seedream模型能力](https://docs.volcengine.com/docs/ark/seedream-4-0-5-0?lang=en)、[图片生成API](https://docs.volcengine.com/docs/ark/image-generation-api?lang=en)。

统一提示词在seedream.py，版本structure-v1。输入单张Base64图片；输出请求PNG/Base64，在本地持久化，保留水印。多个独立照片不会混在一个多参考图请求里。

每个任务最多2次请求，只有429和服务端5xx作一次有限退避重试。这些重试也可能涉及计费；超时/网络中断不自动重投，因为上游可能已经生成并计费。没有自动升级模型或无限重试。页面手动重投也明确提示可能计费。

## 运行

单张入口：http://127.0.0.1:8781/ （选择豆包精简线稿）

批量入口：http://127.0.0.1:8781/cloud-batch （最多5张；逐张状态/线稿/作品）

手机上传默认仍用本地快速路径。需要付费云生成时，在config.local.json明确设 phone_provider 为 seedream 后重启服务；手机仍不能自行切换模型或访问控制台。

首次验证：项目Python运行 verify_seedream.py --execute --count 1。

五张并发：项目Python运行 verify_seedream.py --execute --count 5。

默认测试输入为上传测试图中的原始照片，不是把已经生成的线稿再次丢给模型。可用 --input-dir 指定另一组原始图片。未使用 --execute 时只检查密钥是否配置，不调用计费接口。真实调用结果保存在 batch_results/seedream-live-verification，产物保存在独立 runtime，不覆盖已有测试集或主线产物。

## 当前边界

云端最多5图并行，音乐渲染依次运行。后端任务总容量8，满额会逐张报告拒绝，不将丢失任务伪装成成功。批量中任一图片失败不删除其余结果。阶段进度是真实处理状态，不承诺20秒完成。

401提示检查密钥；403提示检查账号/模型权限；402提示核实余额；429提示核实限流/额度。部分平台错误可能使用400，届时先核实请求参数和控制台详情，不能只靠HTTP码认定一定是充值问题。返回前端的内容不含原始云端错误正文、认证头或密钥。

当前依旧需要改进的是主体几何选材，不属于“API能调用成功”即可解决的问题。这不阻断本次工程接入，也不将API成功等同于音乐审美合格。
