import json
import os
import socket
import ssl
import struct
import threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from enclave import receive
capacity=threading.BoundedSemaphore(2)
class Handler(BaseHTTPRequestHandler):
    def log_message(self,format,*args):return
    def respond(self,status,data):
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.end_headers()
        self.wfile.write(data)
    def do_POST(self):
        if self.path!='/redact' or self.headers.get('Content-Type')!='application/json':
            self.respond(415,b'{"error":"Unsupported request"}')
            return
        if not capacity.acquire(False):
            self.respond(429,b'{"error":"Capacity exhausted"}')
            return
        try:
            self.connection.settimeout(10)
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=8*1024*1024:raise ValueError('Invalid body limit')
            data=self.rfile.read(length)
            if len(data)!=length:raise ValueError('Truncated request')
            cid=int(os.environ['ENCLAVE_CID'])
            if cid<4:raise ValueError('Invalid enclave CID')
            with socket.socket(socket.AF_VSOCK,socket.SOCK_STREAM) as stream:
                stream.settimeout(25)
                stream.connect((cid,5006))
                stream.sendall(struct.pack('!I',length)+data)
                output_length=struct.unpack('!I',receive(stream,4))[0]
                if not 0<output_length<=30*1024*1024:raise ValueError('Invalid output limit')
                output=receive(stream,output_length)
                status=422 if 'error' in json.loads(output) else 200
            self.respond(status,output)
        except Exception:
            self.respond(503,b'{"error":"Enclave execution unavailable"}')
        finally:capacity.release()
if __name__=='__main__':
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version=ssl.TLSVersion.TLSv1_3
    context.load_cert_chain(os.environ['TLS_CERT_FILE'],os.environ['TLS_KEY_FILE'])
    context.load_verify_locations(cafile=os.environ['TLS_CLIENT_CA_FILE'])
    context.verify_mode=ssl.CERT_REQUIRED
    server=ThreadingHTTPServer(('0.0.0.0',8443),Handler)
    server.socket=context.wrap_socket(server.socket,server_side=True)
    server.serve_forever()
