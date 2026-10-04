import {recordResponse} from './metrics';
export function required(name: string): string {
 const value=process.env[name]?.trim(); if(!value) throw new Error(`Missing configuration: ${name}`); return value;
}
export function httpsUrl(name: string): URL {const url=new URL(required(name)); if(url.protocol!=='https:') throw new Error(`${name} requires HTTPS`); return url;}
export class HttpError extends Error {constructor(public status: number, message:string){super(message);}}
export function failure(error:unknown): Response {
 const status=error instanceof HttpError?error.status:error instanceof Error && error.name==='ZodError'?400:503;
 console.error(JSON.stringify({event:'request_failure',status,kind:error instanceof Error?error.name:'Unknown'}));
 return recordResponse(Response.json({error:status===503?'Service dependency unavailable':error instanceof Error?error.message:'Request rejected'},{status}));
}
export async function body(request:Request):Promise<unknown>{
 if(!request.headers.get('content-type')?.includes('application/json'))throw new HttpError(415,'JSON required');
 const reader=request.body?.getReader(); if(!reader)throw new HttpError(400,'Body required');
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw new HttpError(413,'Body too large');}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'Invalid JSON');}
}
