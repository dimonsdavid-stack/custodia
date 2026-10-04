import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { AttestationVerifier } from './attestation.mjs';
import { transition, optOutToken, verifyOptOut, classifyReply } from '../outbound/router.mjs';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pcrs = { 0: 'a'.repeat(96) };
function verifier(quoteVerifier) { return new AttestationVerifier({ issuer: 'issuer', audience: 'custodia', pcrs, trustAnchors: { key: publicKey.export({type:'spki',format:'pem'}) }, verifyHardwareQuote: quoteVerifier }); }
function assertion(nonce, overrides = {}) {
  const header = Buffer.from(JSON.stringify({alg:'EdDSA',typ:'JWT',kid:'key'})).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const body = Buffer.from(JSON.stringify({iss:'issuer',aud:'custodia',nonce,iat:now,exp:now+60,debug:false,pcrs,quote:'quote',...overrides})).toString('base64url');
  return `${header}.${body}.${sign(null,Buffer.from(`${header}.${body}`),privateKey).toString('base64url')}`;
}
test('Attestation fails without hardware quote verifier', async () => { const v=verifier(); const n=v.challenge(); await assert.rejects(v.verify(assertion(n),n),/unavailable/); });
test('Verified assertion consumes nonce and rejects replay', async () => { const v=verifier(async ({nonce})=>({authentic:true,nonce})); const n=v.challenge(); assert.equal((await v.verify(assertion(n),n)).verified,true); await assert.rejects(v.verify(assertion(n),n),/replayed/); });
test('PCR mismatch and debug fail closed', async()=>{ const v=verifier(); const n=v.challenge(); await assert.rejects(v.verify(assertion(n,{pcrs:{0:'b'.repeat(96)}}),n),/mismatch/); await assert.rejects(v.verify(assertion(n,{debug:true}),n),/Debug/); });
test('Tampered signatures are rejected', async()=>{const v=verifier();const n=v.challenge(); const t=assertion(n); await assert.rejects(v.verify(`${t.slice(0,-8)}AAAAAAAA`,n),/signature/);});
test('Outbound cannot bypass sender and suppression gates',()=>{assert.throws(()=>transition({state:'scheduled',email:'a@b.com'},'sent'),/sender/); assert.throws(()=>transition({state:'discovered',email:'a@b.com'},'enriched',{suppression:new Set(['a@b.com'])}),/suppressed/);});
test('Signed opt-out detects alteration and expiry',()=>{const key='k'.repeat(32);const token=optOutToken({tenantId:'t',leadId:'l',expires:Date.now()+1000},key);assert.equal(verifyOptOut(token,key).leadId,'l');assert.throws(()=>verifyOptOut(token+'x',key));assert.throws(()=>verifyOptOut(token,key,Date.now()+2000),/Expired/);assert.equal(classifyReply('Stop emailing me'),'opt_out');});
