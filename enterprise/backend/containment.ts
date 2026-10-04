import {attestationRequest} from '../hardware/attestation-client';
import {createPublicKey,randomBytes,verify} from 'node:crypto';
import {required,httpsUrl} from './config';
let validUntil=0;
let verification:Promise<void>|undefined;
export async function containment():Promise<void>{
 if(Date.now()<validUntil)return;
 verification??=(async()=>{const nonce=randomBytes(32).toString('hex');const url=httpsUrl('ATTESTATION_URL');url.searchParams.set('nonce',nonce);const document=await attestationRequest(url);if(typeof document.payload!=='string'||document.payload.length>65536||typeof document.signature!=='string')throw new Error('Malformed assertion');const bytes=Buffer.from(document.payload,'base64url');if(!verify('sha256',bytes,createPublicKey(required('ATTESTATION_PUBLIC_KEY')),Buffer.from(document.signature,'base64url')))throw new Error('Attestation signature rejected');const claims=JSON.parse(bytes.toString());const age=Date.now()-claims.issuedAt;if(claims.nonce!==nonce||!Number.isFinite(age)||age<0||age>30000||claims.hardwareVerified!==true||claims.debug!==false||claims.issuer!==required('ATTESTATION_ISSUER')||claims.audience!==required('ATTESTATION_AUDIENCE')||claims.subject!==required('ATTESTATION_SUBJECT'))throw new Error('Attestation claims rejected');const expected=JSON.parse(required('ATTESTATION_PCRS'));if(!Object.keys(expected).length||Object.entries(expected).some(([k,v])=>!/^\d+$/.test(k)||typeof v!=='string'||!/^[a-f0-9]{96}$/.test(v)||claims.pcrs?.[k]!==v))throw new Error('PCR mismatch');validUntil=Math.min(claims.issuedAt+30000,Date.now()+10000);})();
 try{await verification;}finally{verification=undefined;}
}
