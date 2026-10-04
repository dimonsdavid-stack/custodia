use anyhow::{anyhow,bail,ensure,Context,Result};
use ciborium::value::Value;
use openssl::{bn::BigNum,ecdsa::EcdsaSig,hash::MessageDigest,sign::Verifier,stack::Stack,x509::{X509,store::X509StoreBuilder,X509StoreContext}};
use serde::Deserialize;
use std::{collections::BTreeMap,io::{Read,Write},time::{Duration,SystemTime,UNIX_EPOCH}};
use vsock::VsockStream;
#[derive(Deserialize)]
pub struct Policy { pub pcrs:BTreeMap<u16,String>, pub issuer:String, pub audience:String, pub subject:String }
#[derive(Deserialize)]
struct Document { digest:String,timestamp:u64,pcrs:BTreeMap<u16,serde_bytes::ByteBuf>,certificate:serde_bytes::ByteBuf,cabundle:Vec<serde_bytes::ByteBuf>,nonce:Option<serde_bytes::ByteBuf> }
pub fn now_ms()->Result<u64>{Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis().try_into()?)}
fn bytes(v:&Value)->Result<&[u8]>{if let Value::Bytes(b)=v{Ok(b)}else{bail!("CBOR byte string required")}}
pub fn verify_document(raw:&[u8],nonce:&[u8],policy:&Policy,root_pem:&[u8])->Result<BTreeMap<u16,String>> {
 ensure!(raw.len()<=65536,"oversized document");
 let value:Value=ciborium::de::from_reader(raw)?;
 let value=match value{Value::Tag(18,v)=>*v,v=>v};
 let a=match value{Value::Array(a) if a.len()==4=>a,_=>bail!("COSE Sign1 required")};
 let protected=bytes(&a[0])?; let payload=bytes(&a[2])?; let signature=bytes(&a[3])?;
 let headers:Value=ciborium::de::from_reader(protected)?;
 let map=match headers{Value::Map(m)=>m,_=>bail!("COSE protected map required")};
 ensure!(map.len()==1,"unexpected COSE protected headers");
 ensure!(map.iter().any(|(k,v)|*k==Value::Integer(1.into())&&*v==Value::Integer((-35).into())),"ES384 required");
 ensure!(signature.len()==96,"invalid ES384 signature length");
 let doc:Document=ciborium::de::from_reader(payload)?;
 ensure!(doc.digest=="SHA384","unsupported PCR digest");
 let now=now_ms()?;ensure!(doc.timestamp<=now+1000&&now.saturating_sub(doc.timestamp)<=30000,"stale attestation");
 ensure!(doc.nonce.as_deref()==Some(nonce),"nonce mismatch");
 ensure!(!policy.pcrs.is_empty(),"empty PCR policy");
 for (index,expected) in &policy.pcrs {ensure!(expected.len()==96&&expected.chars().all(|c|c.is_ascii_hexdigit()),"invalid expected PCR");let actual=doc.pcrs.get(index).context("PCR absent")?;ensure!(actual.len()==48&&actual.iter().any(|b|*b!=0),"debug PCR rejected");ensure!(hex::encode(actual)==expected.to_lowercase(),"PCR mismatch");}
 // Debug enclaves have zero-valued PCRs. Require image PCR0 even if the policy omitted it.
 ensure!(doc.pcrs.get(&0).is_some_and(|p|p.len()==48&&p.iter().any(|b|*b!=0)),"debug enclave rejected");
 let leaf=X509::from_der(&doc.certificate)?;let root=X509::from_pem(root_pem)?;
 let mut store=X509StoreBuilder::new()?;store.add_cert(root)?;let store=store.build();
 let mut intermediates=Stack::new()?;for c in &doc.cabundle {intermediates.push(X509::from_der(c)?)?;}
 let mut context=X509StoreContext::new()?;ensure!(context.init(&store,&leaf,&intermediates,|c|c.verify_cert())?,"Nitro certificate chain rejected");
 let structure=Value::Array(vec![Value::Text("Signature1".into()),Value::Bytes(protected.to_vec()),Value::Bytes(vec![]),Value::Bytes(payload.to_vec())]);let mut signed=Vec::new();ciborium::ser::into_writer(&structure,&mut signed)?;
 let der=EcdsaSig::from_private_components(BigNum::from_slice(&signature[..48])?,BigNum::from_slice(&signature[48..])?)?.to_der()?;
 let key=leaf.public_key()?;let mut verifier=Verifier::new(MessageDigest::sha384(),&key)?;verifier.update(&signed)?;ensure!(verifier.verify(&der)?,"COSE signature rejected");
 Ok(doc.pcrs.into_iter().map(|(i,p)|(i,hex::encode(p))).collect())
}
pub fn write_frame(stream:&mut impl Write,data:&[u8])->Result<()> {ensure!(data.len()<=65536,"frame exceeds limit");stream.write_all(&(data.len() as u32).to_be_bytes())?;stream.write_all(data)?;Ok(())}
pub fn read_frame(stream:&mut impl Read)->Result<Vec<u8>> {let mut n=[0;4];stream.read_exact(&mut n)?;let len=u32::from_be_bytes(n) as usize;ensure!(len>0&&len<=65536,"invalid frame");let mut b=vec![0;len];stream.read_exact(&mut b)?;Ok(b)}
pub fn attest(cid:u32,port:u32,nonce:&[u8])->Result<Vec<u8>> {ensure!(cid>=4,"invalid enclave CID");let mut s=VsockStream::connect_with_cid_port(cid,port).map_err(|e|anyhow!(e))?;s.set_read_timeout(Some(Duration::from_secs(2)))?;s.set_write_timeout(Some(Duration::from_secs(2)))?;write_frame(&mut s,nonce)?;read_frame(&mut s)}

#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn frame_roundtrip(){let mut out=Vec::new();write_frame(&mut out,b"nonce").unwrap();assert_eq!(read_frame(&mut out.as_slice()).unwrap(),b"nonce");}
 #[test] fn reject_oversized_frame(){assert!(read_frame(&mut [0,1,0,1].as_slice()).is_err());}
 #[test] fn reject_non_cose(){let p=Policy{pcrs:BTreeMap::new(),issuer:String::new(),audience:String::new(),subject:String::new()};assert!(verify_document(b"not-cbor",b"nonce",&p,b"not-pem").is_err());}
}
