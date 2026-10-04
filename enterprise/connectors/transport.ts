import {HttpError} from '../backend/config';
export function boundary(value:string,host:string,path:string){const u=new URL(value);if(u.protocol!=='https:'||u.hostname!==host||u.port||u.username||u.password||!u.pathname.startsWith(path))throw new HttpError(400,'Connector destination rejected');return u;}
export async function requestJson(url:URL,init:RequestInit={},send:typeof fetch=fetch):Promise<Record<string,unknown>>{
 for(let attempt=0;attempt<4;attempt++){
  try{const response=await send(url,{...init,redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store'});
   if([429,502,503,504].includes(response.status)&&attempt<3){await response.body?.cancel();const retry=response.headers.get('retry-after');const seconds=retry?Number(retry):NaN;const date=retry?Date.parse(retry):NaN;const delay=Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-Date.now():250*2**attempt+Math.random()*250;await new Promise(r=>setTimeout(r,Math.min(5000,Math.max(0,delay))));continue;}
   if(!response.ok){await response.body?.cancel();throw new HttpError(response.status===410?409:502,`Connector upstream HTTP ${response.status}`);}
   const reader=response.body?.getReader();if(!reader)throw new Error('Empty connector response');const chunks:Uint8Array[]=[];let total=0;for(;;){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>4194304){await reader.cancel();throw new Error('Connector response limit exceeded');}chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(e){if(e instanceof HttpError||attempt===3)throw e;await new Promise(r=>setTimeout(r,250*2**attempt+Math.random()*250));}
 }throw new Error('Connector retry exhaustion');
}
