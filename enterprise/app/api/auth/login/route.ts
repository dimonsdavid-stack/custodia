import {startLogin} from '../../../../backend/session';
import {failure} from '../../../../backend/config';
export async function GET(){try{const login=startLogin();return new Response(null,{status:302,headers:{Location:login.url.href,'Set-Cookie':`__Host-custodia-login=${login.value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
