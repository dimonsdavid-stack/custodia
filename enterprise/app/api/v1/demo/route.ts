import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {origin} from '../../../../backend/auth';
import {body,failure,required,HttpError} from '../../../../backend/config';
import {database} from '../../../../backend/database';
export const runtime='nodejs';
export async function POST(request:Request){try{origin(request);const input=z.object({name:z.string().min(2).max(200),email:z.email().max(254),organization:z.string().min(2).max(200),message:z.string().max(3000).default('')}).strict().parse(await body(request));
 const {createClient}=await import('redis');const url=required('REDIS_URL');if(!url.startsWith('rediss://'))throw new Error('Redis TLS required');const cache=createClient({url,socket:{connectTimeout:2000,reconnectStrategy:false}});cache.on('error',()=>{});await cache.connect();try{const key='custodia:demo:'+Buffer.from(input.email.toLowerCase()).toString('base64url');const count=await cache.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],3600) end;return n",{keys:[key],arguments:[]});if(Number(count)>3)throw new HttpError(429,'Please retry later');}finally{await cache.quit();}
 const id=randomUUID();await database().query('INSERT INTO custodia.demo_requests(id,name,email,organization,message) VALUES($1,$2,$3,$4,$5)',[id,input.name,input.email,input.organization,input.message]);return Response.json({id,message:'Your request has been received. A consultation is not yet scheduled.'},{status:201});}catch(e){return failure(e);}}
