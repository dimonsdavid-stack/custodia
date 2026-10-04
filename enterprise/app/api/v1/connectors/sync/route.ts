import {z} from 'zod';
import {authenticate,origin} from '../../../../../backend/auth';
import {body,failure} from '../../../../../backend/config';
import {sync} from '../../../../../connectors/store';
export const runtime='nodejs';
export async function POST(request:Request){try{origin(request);const p=await authenticate(request,'connectors:sync');const input=z.object({id:z.uuid()}).strict().parse(await body(request));return Response.json(await sync(p,input.id),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
