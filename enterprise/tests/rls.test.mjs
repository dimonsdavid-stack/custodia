import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('migration enforces tenant RLS and immutable ledger',async()=>{
 const db=new PGlite();await db.exec(await readFile(new URL('../migrations/001_core.sql',import.meta.url),'utf8'));
 await db.exec(`CREATE ROLE application LOGIN;GRANT custodia_app TO application;SET ROLE application;`);
 const tenant='11111111-1111-4111-8111-111111111111';const other='22222222-2222-4222-8222-222222222222';const id='33333333-3333-4333-8333-333333333333';
 await db.exec('BEGIN');await db.query("SELECT set_config('app.current_tenant_id',$1,true)",[tenant]);
 await db.query('INSERT INTO custodia.requests(tenant_id,id,status,payload) VALUES($1,$2,\'intake\',\'{}\')',[tenant,id]);
 await db.query('INSERT INTO custodia.events(tenant_id,sequence,request_id,actor,event_type,payload,canonical,previous_hash,signature,key_id) VALUES($1,1,$2,\'operator\',\'created\',\'{}\',\'{}\',\'zero\',$3,\'v1\')',[tenant,id,'a'.repeat(64)]);await db.exec('COMMIT');
 assert.equal((await db.query('SELECT * FROM custodia.requests')).rows.length,0);
 await db.exec('BEGIN');await db.query("SELECT set_config('app.current_tenant_id',$1,true)",[other]);assert.equal((await db.query('SELECT * FROM custodia.requests')).rows.length,0);
 await assert.rejects(db.query('INSERT INTO custodia.requests(tenant_id,id,status,payload) VALUES($1,$2,\'intake\',\'{}\')',[tenant,id]));await db.exec('ROLLBACK');
 await db.exec('RESET ROLE');await assert.rejects(db.exec("UPDATE custodia.events SET actor='tamper'"));await assert.rejects(db.exec('TRUNCATE custodia.events'));await db.close();
});
