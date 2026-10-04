import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {transaction,canonical,signature} from '../backend/database';
import {required,HttpError} from '../backend/config';
import type {Principal} from '../backend/auth';
import {configuration,page,type ConnectorConfig} from './adapters';
function key(){const value=required('CONNECTOR_ENCRYPTION_KEY');if(!/^[a-f0-9]{64}$/i.test(value))throw new Error('Connector encryption key must be 32-byte hex');return Buffer.from(value,'hex');}
export function seal(value:unknown,context:string){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),nonce);cipher.setAAD(Buffer.from(context));const encrypted=Buffer.concat([cipher.update(canonical(value)),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64');}
export function unseal(value:string,context:string):unknown{const bytes=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));decipher.setAAD(Buffer.from(context));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));}
export async function configure(p:Principal,config:ConnectorConfig){const id=randomUUID();return transaction(p,async c=>{await c.query('INSERT INTO custodia.connectors(tenant_id,id,provider,config) VALUES($1,$2,$3,$4)',[p.tenant,id,config.provider,seal(config,`${p.tenant}:${id}:config`)]);const audit=canonical({tenant:p.tenant,connector:id,actor:p.actor,event:'configured',provider:config.provider});await c.query('INSERT INTO custodia.connector_audit(tenant_id,id,connector_id,canonical,signature,key_id) VALUES($1,$2,$3,$4,$5,$6)',[p.tenant,randomUUID(),id,audit,signature(audit),required('LEDGER_KEY_ID')]);return {id,provider:config.provider};});}
export async function list(p:Principal){return transaction(p,async c=>(await c.query('SELECT id,provider,version::text,last_synced_at FROM custodia.connectors ORDER BY id LIMIT 100')).rows);}
export async function sync(p:Principal,id:string){
 const current=await transaction(p,async c=>(await c.query('SELECT config,cursor,version::text FROM custodia.connectors WHERE id=$1',[id])).rows[0]);if(!current)throw new HttpError(404,'Connector not found');
 const config=configuration.parse(unseal(current.config,`${p.tenant}:${id}:config`));const cursor=current.cursor?String(unseal(current.cursor,`${p.tenant}:${id}:cursor`)):null;
 const result=await page(config,cursor);
 return transaction(p,async c=>{
  const locked=(await c.query('SELECT version::text FROM custodia.connectors WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!locked||locked.version!==current.version)throw new HttpError(409,'Concurrent connector sync; retry');
  for(const item of result.items){const externalId=String(item.id??'');if(!externalId||externalId.length>512)throw new Error('Invalid provider item ID');const hash=createHash('sha256').update(canonical(item)).digest('hex');await c.query('INSERT INTO custodia.connector_items(tenant_id,connector_id,external_id,payload,content_hash,deleted) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,connector_id,external_id) DO UPDATE SET payload=EXCLUDED.payload,content_hash=EXCLUDED.content_hash,deleted=EXCLUDED.deleted,updated_at=now()',[p.tenant,id,externalId,seal(item,`${p.tenant}:${id}:${externalId}`),hash,Object.hasOwn(item,'deleted')]);}
  await c.query('UPDATE custodia.connectors SET cursor=$1,version=version+1,last_synced_at=now() WHERE id=$2',[seal(result.cursor,`${p.tenant}:${id}:cursor`),id]);
  const audit=canonical({tenant:p.tenant,connector:id,actor:p.actor,version:current.version,count:result.items.length,complete:result.complete,cursorHash:createHash('sha256').update(result.cursor).digest('hex')});await c.query('INSERT INTO custodia.connector_audit(tenant_id,id,connector_id,canonical,signature,key_id) VALUES($1,$2,$3,$4,$5,$6)',[p.tenant,randomUUID(),id,audit,signature(audit),required('LEDGER_KEY_ID')]);
  return {id,items:result.items.length,complete:result.complete,version:(BigInt(current.version)+1n).toString()};
 });
}
