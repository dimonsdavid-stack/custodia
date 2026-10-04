import base64
import concurrent.futures
import json
import multiprocessing
import os
import resource
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from engine import sanitize_pdf

def initialize_worker():
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

pool = concurrent.futures.ProcessPoolExecutor(max_workers=2, mp_context=multiprocessing.get_context('spawn'), initializer=initialize_worker, max_tasks_per_child=50)
capacity = threading.BoundedSemaphore(2)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return
    def respond(self, status, value):
        body = json.dumps(value, separators=(',', ':')).encode('utf8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self):
        if self.path != '/redact' or self.headers.get('Content-Type') != 'application/json':
            self.respond(415, {'error': 'Unsupported request'})
            return
        if not capacity.acquire(blocking=False):
            self.respond(429, {'error': 'Worker capacity exhausted'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8 * 1024 * 1024:
                self.respond(413, {'error': 'Request size rejected'})
                return
            self.connection.settimeout(10)
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError('Incomplete body')
            payload = json.loads(raw)
            content = base64.b64decode(payload['content'], validate=True)
            task = pool.submit(sanitize_pdf, content, payload['policy'])
            try:
                result = task.result(timeout=20)
            except concurrent.futures.TimeoutError:
                # The container supervisor enforces a hard process bound after an unresponsive native parser.
                self.respond(503, {'error': 'Parser timeout'})
                os._exit(70)
            self.respond(200, result)
        except Exception:
            self.respond(422, {'error': 'Document rejected by sanitization policy'})
        finally:
            capacity.release()

if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', 8443), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_3
    context.load_cert_chain(os.environ['TLS_CERT_FILE'], os.environ['TLS_KEY_FILE'])
    context.load_verify_locations(cafile=os.environ['TLS_CLIENT_CA_FILE'])
    context.verify_mode = ssl.CERT_REQUIRED
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.serve_forever()
