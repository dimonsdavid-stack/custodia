import {test,expect} from '@playwright/test';
const origin=process.env.CUSTODIA_E2E_ORIGIN;
if(!origin || new URL(origin).protocol!=='https:')throw Error('CUSTODIA_E2E_ORIGIN must be the actual HTTPS deployment');
const api='/api/v1/requests';
function token(which){const value=process.env[`CUSTODIA_E2E_TOKEN_${which}`];if(!value)throw Error(`Missing real tenant ${which} access token`);return value;}
function headers(which){return {Authorization:`Bearer ${token(which)}`};}
const uuid=/^[0-9a-f-]{36}$/i;
function fixture(which){const id=process.env[`CUSTODIA_E2E_RECORD_${which}`];if(!id||!uuid.test(id))throw Error(`Provision a dedicated persisted fixture record for tenant ${which}`);return id;}
test('landing renders across viewports without runtime failures',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.goto(origin,{waitUntil:'networkidle'});
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }
 expect(errors).toEqual([]);
});
test('readiness verifies live dependencies',async({request})=>{
 const response=await request.get(`${origin}/api/v1/ready`);expect(response.status()).toBe(200);
});
test('anonymous protected reads are rejected',async({request})=>{
 expect((await request.get(origin+api)).status()).toBe(401);
});
test('independent authenticated sessions see durable own records and never foreign records',async({playwright})=>{
 const a=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:headers('A')});
 const b=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:headers('B')});
 try{
  const ar=await a.get(api),br=await b.get(api);expect(ar.status()).toBe(200);expect(br.status()).toBe(200);
  const ai=(await ar.json()).records.map(row=>row.id),bi=(await br.json()).records.map(row=>row.id);
  expect(ai).toContain(fixture('A'));expect(bi).toContain(fixture('B'));expect(ai).not.toContain(fixture('B'));expect(bi).not.toContain(fixture('A'));
  // Cross-tenant update resolves no row and cannot mutate the foreign fixture.
  const foreign=await b.patch(api,{headers:{Origin:origin},data:{id:fixture('A'),status:'searching',version:'1'}});
  expect(foreign.status()).toBe(404);
  const fresh=await playwright.request.newContext({baseURL:origin,extraHTTPHeaders:headers('A')});
  try{const reread=await fresh.get(api);expect((await reread.json()).records.map(row=>row.id)).toContain(fixture('A'));}finally{await fresh.dispose();}
 }finally{await a.dispose();await b.dispose();}
});
test('untrusted cross-origin mutations reject before database access',async({request})=>{
 const response=await request.post(origin+api,{headers:{...headers('A'),Origin:'https://untrusted.invalid'},data:{text:'Cross-origin denial verification',requesterEmail:'security@example.invalid'}});
 expect(response.status()).toBe(403);
});
test('real OIDC login uses PKCE and host-scoped HttpOnly Secure cookies',async({page,context})=>{
 await page.goto(`${origin}/api/auth/login`,{waitUntil:'domcontentloaded'});
 const url=new URL(page.url());expect(url.protocol).toBe('https:');expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('state')).toBeTruthy();
 const cookies=await context.cookies(origin),flow=cookies.find(cookie=>cookie.name==='__Host-custodia-login');
 expect(flow).toBeTruthy();expect(flow.secure).toBe(true);expect(flow.httpOnly).toBe(true);expect(flow.sameSite).toBe('Lax');expect(flow.path).toBe('/');expect(flow.domain).toBe(new URL(origin).hostname);
});
test('real session fixture survives navigation and rejects tampering',async({browser})=>{
 const state=process.env.CUSTODIA_E2E_STORAGE_STATE;
 if(!state)throw Error('CUSTODIA_E2E_STORAGE_STATE must point to a real completed OIDC browser session');
 const context=await browser.newContext({storageState:state});
 try{
  const page=await context.newPage();await page.goto(origin);
  expect(await page.evaluate(async()=> (await fetch('/api/v1/requests')).status)).toBe(200);
  const cookie=(await context.cookies(origin)).find(value=>value.name==='__Host-custodia');expect(cookie).toBeTruthy();expect(cookie.secure&&cookie.httpOnly).toBe(true);
  await context.addCookies([{...cookie,value:'invalid-authenticated-cookie'}]);
  expect(await page.evaluate(async()=> (await fetch('/api/v1/requests')).status)).toBe(401);
 }finally{await context.close();}
});
