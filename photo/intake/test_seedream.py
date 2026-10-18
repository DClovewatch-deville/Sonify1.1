import base64
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import patch
import seedream
from server import Pipeline,make_handler
from http.server import ThreadingHTTPServer
from urllib.request import Request,urlopen
from test_intake import image_bytes


class SeedreamTests(unittest.TestCase):
    def test_five_requests_overlap_and_one_failure_isolated(self):
        with tempfile.TemporaryDirectory() as root:
            pipeline=Pipeline(root,{'build_music':False})
            barrier=threading.Barrier(5)
            lock=threading.Lock();calls=[]
            def request(url,payload,headers):
                with lock:
                    number=len(calls);calls.append(payload)
                barrier.wait(timeout=8)
                if number==2:
                    raise HTTPError(url,403,'forbidden',{},io.BytesIO(b'secret body must not leak'))
                return json.dumps({'data':[{'b64_json':base64.b64encode(image_bytes()).decode()}]}).encode()
            with patch('seedream.key',return_value='test-key'),patch.object(pipeline,'request',side_effect=request),patch('server.cv2.Canny',side_effect=AssertionError('generated lineart must not pass through Canny')):
                jobs=[pipeline.create(image_bytes(),'seedream') for _ in range(5)]
                pipeline.pool.shutdown(wait=True)
            final=[pipeline.snapshot(j['id']) for j in jobs]
            self.assertEqual(len(calls),5)
            self.assertTrue(all(isinstance(c['image'],str) for c in calls))
            self.assertEqual(sum(j['status']=='completed' for j in final),4)
            failed=[j for j in final if j['status']=='failed'][0]
            self.assertEqual(failed['error_code'],'permission')
            self.assertNotIn('secret',json.dumps(final))
            for job in final:
                if job['status']=='completed':
                    self.assertTrue(job['artistic'])
                    self.assertTrue(job['structural'])
                    self.assertTrue(job['geometry'])
                    self.assertEqual(job['api_metrics']['model'],seedream.DEFAULT_MODEL)
                    self.assertTrue((Path(root)/job['id']/'artistic.png').exists())

    def test_retry_rate_limit_once_then_success(self):
        calls=[]
        def request(url,payload,headers):
            calls.append(payload)
            if len(calls)==1:raise HTTPError(url,429,'rate limit',{},io.BytesIO())
            return json.dumps({'data':[{'b64_json':base64.b64encode(image_bytes()).decode()}]}).encode()
        with patch('seedream.key',return_value='test-key'),patch('seedream.time.sleep'):
            raw,metrics=seedream.generate(image_bytes(),{},'.',request)
        self.assertEqual(raw,image_bytes())
        self.assertEqual(metrics['attempts'],2)

    def test_auth_failure_not_retried_or_leaked(self):
        def request(*args):raise HTTPError('https://example.com',401,'sensitive-key',{},io.BytesIO(b'sensitive-key'))
        with patch('seedream.key',return_value='sensitive-key'):
            with self.assertRaises(seedream.SeedreamError) as error:
                seedream.generate(image_bytes(),{},'.',request)
        self.assertEqual(error.exception.code,'authentication')
        self.assertNotIn('sensitive-key',str(error.exception))

    def test_timeout_does_not_resubmit(self):
        with patch('seedream.key',return_value='test-key'),patch('seedream.time.sleep') as sleep:
            def request(*args):raise TimeoutError()
            with self.assertRaises(seedream.SeedreamError) as error:
                seedream.generate(image_bytes(),{},'.',request)
            self.assertEqual(error.exception.code,'network');sleep.assert_not_called()

    def test_model_not_open_classified_without_account_details(self):
        def request(*args):
            raise HTTPError('https://example.com',404,'not found',{},io.BytesIO(json.dumps({'error':{'code':'ModelNotOpen','message':'private-account-detail'}}).encode()))
        with patch('seedream.key',return_value='test-key'):
            with self.assertRaises(seedream.SeedreamError) as error:
                seedream.generate(image_bytes(),{},'.',request)
            self.assertEqual(error.exception.code,'model_not_open')
            self.assertNotIn('private-account-detail',str(error.exception))

    def test_missing_key_blocks_before_request(self):
        with patch('seedream.key',return_value=''):
            with self.assertRaises(seedream.SeedreamError) as error:
                seedream.generate(image_bytes(),{},'.',lambda *args:self.fail('must not send'))
            self.assertEqual(error.exception.code,'missing_key')

    def test_image_encoding_accepts_linebreaks_and_data_uri(self):
        encoded=base64.b64encode(image_bytes()).decode()
        wrapped='data:image/png;base64,'+'\n'.join(encoded[i:i+76] for i in range(0,len(encoded),76))
        with patch('seedream.key',return_value='test-key'):
            raw,_=seedream.generate(image_bytes(),{},'.',lambda *args:json.dumps({'data':[{'b64_json':wrapped}]}).encode())
        self.assertEqual(raw,image_bytes())

    def test_batch_endpoint_accepts_independent_images_and_rejects_six(self):
        with tempfile.TemporaryDirectory() as root:
            pipeline=Pipeline(root,{'build_music':False})
            service=ThreadingHTTPServer(('127.0.0.1',0),make_handler(pipeline))
            thread=threading.Thread(target=service.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{service.server_port}/api/jobs/batch'
            image=base64.b64encode(image_bytes()).decode()
            response=json.dumps({'data':[{'b64_json':image}]}).encode()
            try:
                with patch('seedream.key',return_value='test-key'),patch.object(pipeline,'request',return_value=response):
                    body=json.dumps({'images':[{'image':image},{'image':'invalid'},{'image':image}]}).encode()
                    with urlopen(Request(url,data=body,headers={'Content-Type':'application/json'})) as r:
                        result=json.load(r)
                    pipeline.pool.shutdown(wait=True)
                self.assertEqual(len(result['accepted']),2)
                self.assertEqual(result['errors'][0]['index'],1)
                self.assertNotEqual(result['accepted'][0]['job']['id'],result['accepted'][1]['job']['id'])
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(url,data=json.dumps({'images':[{'image':image}]*6}).encode(),headers={'Content-Type':'application/json'}))
                self.assertEqual(error.exception.code,400)
            finally:
                pipeline.pool.shutdown(wait=True);service.shutdown();service.server_close();thread.join()


if __name__=='__main__':unittest.main()
