import base64
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from PIL import Image, ImageDraw
from server import Pipeline, Share, make_handler
from urllib.request import build_opener, HTTPCookieProcessor
from http.cookiejar import CookieJar


def image_bytes():
    image = Image.new('RGB', (500, 600), 'white')
    draw = ImageDraw.Draw(image)
    draw.polygon([(60, 180), (250, 50), (440, 180)], outline='black', width=5)
    draw.rectangle((80, 180, 420, 520), outline='black', width=5)
    for x in (130, 230, 330):
        draw.rectangle((x, 260, x + 45, 360), outline='black', width=4)
    output = io.BytesIO()
    image.save(output, format='PNG')
    return output.getvalue()


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pipeline = Pipeline(self.tmp.name, {'build_music': False})

    def tearDown(self):
        self.pipeline.pool.shutdown(wait=True)
        self.tmp.cleanup()

    def wait(self, jid):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            job = self.pipeline.snapshot(jid)
            if job['status'] in ('completed', 'failed'):
                return job
            time.sleep(.05)
        self.fail('job did not complete')

    def test_real_upload_extract_and_handoff(self):
        job = self.wait(self.pipeline.create(image_bytes(), 'local')['id'])
        self.assertEqual(job['status'], 'completed', job)
        folder = Path(self.tmp.name) / job['id']
        geometry = json.loads((folder / 'geometry.json').read_text(encoding='utf-8'))
        handoff = json.loads((folder / 'handoff.json').read_text(encoding='utf-8'))
        self.assertGreater(len(geometry['paths']), 0)
        self.assertTrue(all(0 <= coordinate <= 1 for p in geometry['paths'] for point in p['points'] for coordinate in point))
        self.assertFalse(handoff['aligned_to_artistic'])
        self.assertEqual(handoff['music_status'], 'not_started')
        self.assertEqual(handoff['job_id'], geometry['job_id'])

    def test_music_retry_reuses_structure_without_provider(self):
        jid = self.wait(self.pipeline.create(image_bytes(), 'local')['id'])['id']
        with self.assertRaises(ValueError):
            self.pipeline.retry_music(jid)
        self.pipeline.update(jid, music_status='failed')
        from types import SimpleNamespace
        with patch.object(self.pipeline, 'request', side_effect=AssertionError('provider must not run')), patch('server.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=b'', stderr=b'')) as run:
            self.pipeline.retry_music(jid)
            job = self.wait(jid)
        self.assertEqual(job['music_status'], 'completed', job)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(job['workspace'], f'/works/{jid}/studio.html')

    def test_explicit_opencv_fallback_only_after_cloud_output_failure(self):
        with patch.object(self.pipeline,'availability',return_value=dict(local=True,comfy=False,artistic=False,seedream=True)), patch('server.seedream.generate',side_effect=RuntimeError('simulated cloud outage')):
            job=self.wait(self.pipeline.create(image_bytes(),'seedream',guest_owner='owner-a')['id'])
        self.assertEqual(job['status'],'failed')
        self.assertIsNone(job['structural'])  # No automatic fallback.
        fallback=self.wait(self.pipeline.fallback_local(job['id'])['id'])
        self.assertEqual(fallback['provider'],'local')
        self.assertEqual(fallback['guest_owner'],'owner-a')
        self.assertEqual(fallback['fallback_from'],job['id'])
        with self.assertRaises(ValueError):self.pipeline.fallback_local(fallback['id'])
        self.pipeline.update(job['id'],artistic_status='completed',artistic='/already-generated.png')
        with self.assertRaises(ValueError):self.pipeline.fallback_local(job['id'])

    def test_blank_image_reports_no_structure(self):
        output = io.BytesIO()
        Image.new('RGB', (300, 300), 'white').save(output, format='PNG')
        job = self.wait(self.pipeline.create(output.getvalue(), 'local')['id'])
        self.assertEqual(job['status'], 'failed')
        self.assertIn('未提取', job['error'])

    def test_reject_bad_images_and_unconfigured_services(self):
        for raw, provider, art in [(b'not an image', 'local', False), (image_bytes(), 'comfy', False), (image_bytes(), 'local', True)]:
            with self.assertRaises(ValueError):
                self.pipeline.create(raw, provider, art)

    def test_protect_8190(self):
        self.pipeline.config = dict(comfy_url='http://127.0.0.1:8190')
        with self.assertRaisesRegex(ValueError, '8190'):
            self.pipeline.comfy('not-a-job')

    def test_restart_marks_interrupted_job_failed(self):
        folder = Path(self.tmp.name) / ('a' * 32)
        folder.mkdir()
        (folder / 'job.json').write_text(json.dumps(dict(id='a'*32, status='processing')), encoding='utf-8')
        restarted = Pipeline(self.tmp.name, {})
        try:
            self.assertEqual(restarted.snapshot('a'*32)['status'], 'failed')
        finally:
            restarted.pool.shutdown()

    def test_artistic_base64_and_failure_isolation(self):
        self.pipeline.config['ark_model'] = 'configured-test-model'
        received = []
        def reply(url, payload, headers):
            received.append(payload)
            return json.dumps({'data': [{'b64_json': base64.b64encode(image_bytes()).decode()}]}).encode()
        with patch.dict('os.environ', {'ARK_API_KEY': 'test-only-key'}), patch.object(self.pipeline, 'request', side_effect=reply):
            jid = self.pipeline.create(image_bytes(), 'local', True)['id']
            self.pipeline.pool.shutdown(wait=True)
        job = self.pipeline.snapshot(jid)
        self.assertEqual(job['status'], 'completed')
        self.assertEqual(job['artistic_status'], 'completed')
        self.assertTrue(received[0]['image'].startswith('data:image/png;base64,'))
        manifest = json.loads((Path(self.tmp.name) / jid / 'handoff.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['artistic'], job['artistic'])
        # New pool because shutdown above waited for both branches to settle.
        from concurrent.futures import ThreadPoolExecutor
        self.pipeline.pool = ThreadPoolExecutor(max_workers=2)
        with patch.dict('os.environ', {'ARK_API_KEY': 'test-only-key'}), patch.object(self.pipeline, 'request', side_effect=TimeoutError):
            jid = self.pipeline.create(image_bytes(), 'local', True)['id']
            self.pipeline.pool.shutdown(wait=True)
        job = self.pipeline.snapshot(jid)
        self.assertEqual(job['status'], 'completed')
        self.assertEqual(job['artistic_status'], 'failed')
        self.assertIsNotNone(job['geometry'])

    def test_comfy_upload_prompt_history_and_output_node(self):
        received = {}
        raw = image_bytes()
        class ComfyStub(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def respond(self, body):
                self.send_response(200); self.end_headers(); self.wfile.write(body)
            def do_POST(self):
                body = self.rfile.read(int(self.headers['Content-Length']))
                received[self.path] = body
                if self.path == '/upload/image':
                    self.respond(b'{"name":"input.png","subfolder":"sonify","type":"input"}')
                else:
                    self.respond(b'{"prompt_id":"test-prompt","node_errors":{}}')
            def do_GET(self):
                if self.path.startswith('/history/'):
                    self.respond(json.dumps({'test-prompt': {'status': {'completed': True}, 'outputs': {'9': {'images': [{'filename': 'result.png', 'type': 'output', 'subfolder': ''}]}}}}).encode())
                else:
                    self.respond(raw)
        stub = ThreadingHTTPServer(('127.0.0.1', 0), ComfyStub)
        thread = threading.Thread(target=stub.serve_forever, daemon=True); thread.start()
        workflow = Path(self.tmp.name) / 'workflow.json'
        workflow.write_text(json.dumps({'1': {'class_type': 'LoadImage', 'inputs': {'image': 'old.png'}}, '9': {'class_type': 'SaveImage', 'inputs': {}}}), encoding='utf-8')
        self.pipeline.config = dict(build_music=False, comfy_url=f'http://127.0.0.1:{stub.server_port}', comfy_workflow=str(workflow), comfy_input_node='1', comfy_output_node='9')
        try:
            job = self.wait(self.pipeline.create(raw, 'comfy')['id'])
            self.assertEqual(job['status'], 'completed', job)
            prompt = json.loads(received['/prompt'])
            self.assertEqual(prompt['prompt']['1']['inputs']['image'], 'sonify/input.png')
            self.assertIn(b'Content-Disposition: form-data; name="image"', received['/upload/image'])
            self.assertEqual(json.loads(workflow.read_text())['1']['inputs']['image'], 'old.png')
        finally:
            stub.shutdown(); stub.server_close(); thread.join()

    def test_http_upload_media_and_cross_origin(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.pipeline))
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        url = f'http://127.0.0.1:{server.server_port}'
        body = json.dumps({'image': base64.b64encode(image_bytes()).decode()}).encode()
        try:
            with urlopen(Request(url + '/api/jobs', data=body, headers={'Content-Type': 'application/json'})) as response:
                self.assertEqual(response.status, 202)
                job = self.wait(json.load(response)['id'])
            with urlopen(url + job['structural']) as response:
                self.assertEqual(response.headers['Content-Type'], 'image/png')
            for path in ['/media/../../server.py', '/media/' + job['id'] + '/job.json']:
                with self.assertRaises(HTTPError): urlopen(url + path)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(url + '/api/jobs', data=body, headers={'Origin': 'https://other.example'}))
            self.assertEqual(error.exception.code, 403)
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_phone_pairing_upload_isolation_and_host_queue(self):
        self.pipeline.config['phone_provider']='local'  # Obsolete setting must not override cloud default.
        patches=[patch.object(self.pipeline,'availability',return_value=dict(local=True,comfy=False,artistic=False,seedream=True)),patch('server.seedream.generate',return_value=(image_bytes(),{'elapsed_seconds':.01}))]
        for item in patches:item.start();self.addCleanup(item.stop)
        self.pipeline.share = Share(8782, ['192.168.1.20'])
        self.pipeline.share.token='test-pairing-token'
        admin = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.pipeline))
        phone = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.pipeline, guest=True))
        threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in (admin, phone)]
        for thread in threads: thread.start()
        host_url = f'http://127.0.0.1:{admin.server_port}'
        phone_url = f'http://127.0.0.1:{phone.server_port}'
        alice = build_opener(HTTPCookieProcessor(CookieJar()))
        bob = build_opener(HTTPCookieProcessor(CookieJar()))
        try:
            with self.assertRaises(HTTPError): urlopen(phone_url + '/upload?join=wrong')
            with self.assertRaises(HTTPError):
                urlopen(Request(phone_url + '/api/health', headers={'Cookie': 'sonify_guest=' + 'a'*48}))
            for client in (alice, bob):
                with client.open(phone_url + '/upload?join=' + self.pipeline.share.token) as response:
                    self.assertTrue(response.url.endswith('/upload'))
                    self.assertIn('从相册选择照片', response.read().decode())
            body = json.dumps({'image': base64.b64encode(image_bytes()).decode(), 'provider': 'comfy', 'artistic': True}).encode()
            with alice.open(Request(phone_url + '/api/jobs', data=body, headers={'Content-Type': 'application/json'})) as response:
                received = json.load(response)
            self.assertNotIn('guest_owner', received)
            job = self.wait(received['id'])
            self.assertEqual(job['provider'], 'seedream')
            self.assertTrue(job['artistic_requested'])
            with alice.open(phone_url + '/api/jobs/' + job['id']) as response:
                self.assertEqual(json.load(response)['id'], job['id'])
            with alice.open(phone_url + job['original']) as response:
                self.assertEqual(response.headers['Content-Type'], 'image/png')
            for path in ('/api/jobs/' + job['id'], job['original'], '/host', '/api/share/qr.png'):
                with self.assertRaises(HTTPError): bob.open(phone_url + path)
            with bob.open(phone_url + '/api/host') as response:
                self.assertEqual(json.load(response)['jobs'], [])
            with alice.open(phone_url + '/api/host') as response:
                self.assertEqual([item['id'] for item in json.load(response)['jobs']], [job['id']])
            with urlopen(host_url + '/api/host') as response:
                listed = json.load(response)
            self.assertEqual(listed['jobs'][0]['submission'], 'phone')
            self.assertNotIn('guest_owner', listed['jobs'][0])
            with urlopen(host_url + '/api/share/qr.png') as response:
                raw = response.read()
            import cv2
            import numpy as np
            decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_GRAYSCALE))
            self.assertEqual(decoded, self.pipeline.share.info()['url'])
            self.pipeline.update(job['id'],status='failed',artistic_status='failed',artistic=None)
            fallback_path=phone_url+'/api/jobs/'+job['id']+'/fallback-local'
            with self.assertRaises(HTTPError) as forbidden:
                bob.open(Request(fallback_path,data=b'',method='POST'))
            self.assertEqual(forbidden.exception.code,403)
            with alice.open(Request(fallback_path,data=b'',method='POST')) as response:
                fallback=self.wait(json.load(response)['id'])
            self.assertEqual(fallback['provider'],'local')
            self.assertEqual(fallback['fallback_from'],job['id'])
            with self.assertRaises(HTTPError):
                urlopen(Request(host_url + '/api/share/address', data=b'{"address":"8.8.8.8"}', headers={'Content-Type':'application/json'}))
        finally:
            for server in (admin, phone): server.shutdown(); server.server_close()
            for thread in threads: thread.join()


if __name__ == '__main__':
    unittest.main()
