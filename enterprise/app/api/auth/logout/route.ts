import {origin} from '../../../../backend/auth';
import {failure} from '../../../../backend/config';
export async function POST(request:Request){try{origin(request);return Response.json({ok:true},{headers:{'Set-Cookie':'__Host-custodia=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0','Cache-Control':'no-store'}});}catch(e){return failure(e);}}
