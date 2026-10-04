import base64
import concurrent.futures
import json
import multiprocessing
import resource
import socket
import struct
from engine import sanitize_pdf

def initialize():
    resource.setrlimit(resource.RLIMIT_AS,(768*1024*1024,768*1024*1024))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))

def receive(stream,length):
    data=bytearray()
    while len(data)<length:
        part=stream.recv(min(65536,length-len(data)))
        if not part:raise ValueError('Truncated VSOCK frame')
        data.extend(part)
    return bytes(data)

if __name__=='__main__':
    pool=concurrent.futures.ProcessPoolExecutor(max_workers=1,mp_context=multiprocessing.get_context('spawn'),initializer=initialize,max_tasks_per_child=25)
    server=socket.socket(socket.AF_VSOCK,socket.SOCK_STREAM)
    server.bind((socket.VMADDR_CID_ANY,5006))
    server.listen(2)
    while True:
        stream,peer=server.accept()
        try:
            stream.settimeout(25)
            if peer[0]!=3:raise ValueError('Only Nitro parent CID allowed')
            length=struct.unpack('!I',receive(stream,4))[0]
            if not 0<length<=8*1024*1024:raise ValueError('VSOCK request limit')
            payload=json.loads(receive(stream,length))
            result=pool.submit(sanitize_pdf,base64.b64decode(payload['content'],validate=True),payload['policy']).result(timeout=20)
            output=json.dumps(result,separators=(',',':')).encode('utf8')
            if len(output)>30*1024*1024:raise ValueError('VSOCK response limit')
            stream.sendall(struct.pack('!I',len(output))+output)
        except concurrent.futures.TimeoutError:
            import os
            os._exit(70)
        except Exception:
            output=b'{"error":"Enclave document policy rejected"}'
            try:stream.sendall(struct.pack('!I',len(output))+output)
            except OSError:pass
        finally:
            stream.close()
