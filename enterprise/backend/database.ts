import {Pool,PoolClient} from 'pg';
import {createHmac,randomUUID} from 'node:crypto';
import {required,HttpError} from './config';
import {containment} from './containment';
import {observe,timed} from './metrics';
import type {Principal} from './auth';
let pool:Pool|undefined;
export function database(){if(!pool){const url=new URL(required('DATABASE_URL'));if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Postgres URL required');url.searchParams.delete('sslmode');pool=new Pool({connectionString:url.href,max:20,idleTimeoutMillis:30000,connectionTimeoutMillis:3000,maxLifetimeSeconds:600,ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA?{ca:process.env.DATABASE_CA}:{})},statement_timeout:5000,query_timeout:6000});pool.on('error',()=>console.error('{"event":"postgres_pool_error"}'));}return pool;}
export async function transaction<T>(p:Principal,fn:(c:PoolClient)=>Promise<T>):Promise<T>{return timed('database_transaction',async()=>{await containment();const start=performance.now();const c=await database().connect();observe('pool_wait',performance.now()-start);let destroy=false;const warning=setTimeout(()=>console.error('{"event":"pool_lease_exceeded"}'),10000);warning.unref();try{
 await c.query('BEGIN');const role=await c.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');if(role.rows[0]?.rolsuper||role.rows[0]?.rolbypassrls)throw new Error('Unsafe database role');
 await c.query("SELECT set_config('app.current_tenant_id',$1,true)",[p.tenant]);await c.query("SET LOCAL lock_timeout='3s'");const result=await fn(c);await c.query('COMMIT');return result;
 }catch(e){try{await c.query('ROLLBACK');}catch{destroy=true;}throw e;}finally{clearTimeout(warning);observe('pool_lease',performance.now()-start);c.release(destroy);}});}
export const transitions:Record<string,string[]>={intake:['searching'],searching:['review'],review:['pending_confirmation'],pending_confirmation:['released','review'],released:[]};
export function canonical(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';}
export function signature(value:string){const key=required('LEDGER_HMAC_KEY');if(!/^[a-f0-9]{64,}$/i.test(key)||key.length%2)throw new Error('Ledger key must be at least 32 bytes hex');return createHmac('sha256',Buffer.from(key,'hex')).update(value).digest('hex');}
async function event(c:PoolClient,p:Principal,id:string,type:string,payload:unknown){
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[p.tenant]);
 const prior=await c.query('SELECT sequence::text,signature FROM custodia.events ORDER BY sequence DESC LIMIT 1');const sequence=(BigInt(prior.rows[0]?.sequence??'0')+1n).toString();const previous=prior.rows[0]?.signature??'0'.repeat(64);const keyId=required('LEDGER_KEY_ID');
 const signed=canonical({tenant:p.tenant,sequence,requestId:id,actor:p.actor,type,payload,previous,keyId});
 await c.query('INSERT INTO custodia.events(tenant_id,sequence,request_id,actor,event_type,payload,canonical,previous_hash,signature,key_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[p.tenant,sequence,id,p.actor,type,JSON.stringify(payload),signed,previous,signature(signed),keyId]);
}
export async function createRequest(p:Principal,payload:unknown){return transaction(p,async c=>{const id=randomUUID();await c.query('INSERT INTO custodia.requests(tenant_id,id,status,payload) VALUES($1,$2,$3,$4)',[p.tenant,id,'intake',JSON.stringify(payload)]);await event(c,p,id,'created',payload);return {id,status:'intake',version:'1'};});}
export async function changeStatus(p:Principal,id:string,next:string,version:string){return transaction(p,async c=>{const result=await c.query('SELECT status,version::text FROM custodia.requests WHERE id=$1 FOR UPDATE',[id]);const row=result.rows[0];if(!row)throw new HttpError(404,'Request not found');if(row.version!==version)throw new HttpError(409,'Version conflict');if(!transitions[row.status]?.includes(next))throw new HttpError(409,'Invalid transition');if(next==='released'&&!p.scopes.has('records:release'))throw new HttpError(403,'Release permission required');await event(c,p,id,'status_changed',{from:row.status,to:next,version});const out=await c.query('UPDATE custodia.requests SET status=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING id,status,version::text',[next,id]);return out.rows[0];});}
