use anyhow::{bail,ensure,Context,Result};
use aws_nitro_enclaves_nsm_api::{api::{Request,Response},driver::{nsm_init,nsm_exit,nsm_process_request}};
use base64::{Engine,engine::general_purpose::URL_SAFE_NO_PAD};
use custodia_nitro::{Policy,attest,verify_document,now_ms,read_frame,write_frame};
use std::{env,fs,io::Write,process::{Command,Stdio},time::{Duration,Instant}};
use vsock::VsockListener;
fn required(name:&str)->Result<String>{let s=env::var(name).with_context(||format!("missing {name}"))?;ensure!(!s.trim().is_empty(),"empty {name}");Ok(s)}
fn enclave()->Result<()> {
 let fd=nsm_init();ensure!(fd>=0,"/dev/nsm unavailable; refusing simulated attestation");
 let listener=VsockListener::bind_with_cid_port(u32::MAX,5005)?;
 for connection in listener.incoming() {let mut stream=connection?;stream.set_read_timeout(Some(Duration::from_secs(2)))?;stream.set_write_timeout(Some(Duration::from_secs(2)))?;
 let outcome=(||->Result<()>{let nonce=read_frame(&mut stream)?;ensure!(nonce.len()==32,"32-byte nonce required");let response=nsm_process_request(fd,Request::Attestation{user_data:None,nonce:Some(nonce.into()),public_key:None});match response{Response::Attestation{document}=>write_frame(&mut stream,&document),_=>bail!("NSM attestation failed")}})();
 if outcome.is_err(){eprintln!("attestation request rejected");}
 } nsm_exit(fd);Ok(())
}
fn sign(payload:&[u8],key_uri:&str)->Result<Vec<u8>> {
 ensure!(key_uri.starts_with("pkcs11:")&&!key_uri.contains("pin-value="),"HSM PKCS11 key URI required; PIN must come from provider configuration");
 let mut child=Command::new("/usr/bin/openssl").args(["dgst","-sha256","-provider","default","-provider","pkcs11","-sign",key_uri]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn()?;
 child.stdin.take().context("signer stdin")?.write_all(payload)?;
 let deadline=Instant::now()+Duration::from_secs(2);
 loop {if child.try_wait()?.is_some(){break;}if Instant::now()>=deadline{let _=child.kill();let _=child.wait();bail!("HSM signing deadline exceeded");}std::thread::sleep(Duration::from_millis(10));}
 let output=child.wait_with_output()?;ensure!(output.status.success()&&!output.stdout.is_empty()&&output.stdout.len()<=1024,"HSM assertion signing failed");Ok(output.stdout)
}
fn gateway()->Result<()> {
 let policy:Policy=serde_json::from_slice(&fs::read(required("NITRO_POLICY_FILE")?)?)?;let root=fs::read(required("NITRO_ROOT_PEM")?)?;
 let key_uri=required("ASSERTION_PKCS11_KEY_URI")?;let cid:u32=required("ENCLAVE_CID")?.parse()?;
 // Loopback HTTP is accessible only through the separately configured TLS mesh ingress.
 let server=tiny_http::Server::http("127.0.0.1:9080").map_err(|e|anyhow::anyhow!("{e}"))?;
 for request in server.incoming_requests() {
 let result=(||->Result<String>{ensure!(request.method()==&tiny_http::Method::Get,"GET required");let url=url::Url::parse(&format!("https://custodia.invalid{}",request.url()))?;ensure!(url.path()=="/attest","route absent");let nonce=url.query_pairs().find(|(k,_)|k=="nonce").context("nonce missing")?.1.into_owned();ensure!(nonce.len()==64,"nonce invalid");let decoded=hex::decode(&nonce)?;
 let raw=attest(cid,5005,&decoded)?;let pcrs=verify_document(&raw,&decoded,&policy,&root)?;
 let payload=serde_json::to_vec(&serde_json::json!({"nonce":nonce,"issuedAt":now_ms()?,"hardwareVerified":true,"debug":false,"issuer":policy.issuer,"audience":policy.audience,"subject":policy.subject,"pcrs":pcrs}))?;
 let signature=sign(&payload,&key_uri)?;Ok(serde_json::to_string(&serde_json::json!({"payload":URL_SAFE_NO_PAD.encode(payload),"signature":URL_SAFE_NO_PAD.encode(signature)}))? )})();
 let response=match result {Ok(body)=>tiny_http::Response::from_string(body).with_status_code(200),Err(_)=>{eprintln!("hardware assertion rejected");tiny_http::Response::from_string("{\"error\":\"Attestation unavailable\"}").with_status_code(503)}};
 let response=response.with_header(tiny_http::Header::from_bytes("Content-Type","application/json").unwrap()).with_header(tiny_http::Header::from_bytes("Cache-Control","no-store").unwrap());let _=request.respond(response);
 }Ok(())
}
fn main()->Result<()> {match env::args().nth(1).as_deref(){Some("enclave")=>enclave(),Some("gateway")=>gateway(),_=>bail!("Usage: custodia-nitro enclave|gateway")}}
