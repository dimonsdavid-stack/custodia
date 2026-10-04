import {authenticate} from '../../../../backend/auth';
import {failure} from '../../../../backend/config';
import {prometheus,requestMetrics} from '../../../../backend/metrics';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{await authenticate(request,'metrics:read');return new Response(prometheus()+requestMetrics(),{headers:{'Content-Type':'text/plain; version=0.0.4','Cache-Control':'no-store'}});}catch(e){return failure(e);}}
