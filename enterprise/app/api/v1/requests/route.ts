import {authenticate,origin} from '../../../../backend/auth';
import {body,failure} from '../../../../backend/config';
import {transaction,createRequest,changeStatus} from '../../../../backend/database';
import {z} from 'zod';
export const runtime='nodejs';
export async function GET(request:Request){try{const p=await authenticate(request,'records:read');const records=await transaction(p,async c=>(await c.query('SELECT id,status,version::text,payload,updated_at FROM custodia.requests ORDER BY updated_at DESC LIMIT 100')).rows);return Response.json({records},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{origin(request);const p=await authenticate(request,'records:write');const input=z.object({text:z.string().min(10).max(20000),requesterEmail:z.email()}).strict().parse(await body(request));return Response.json(await createRequest(p,input),{status:201});}catch(e){return failure(e);}}
export async function PATCH(request:Request){try{origin(request);const p=await authenticate(request,'records:write');const input=z.object({id:z.uuid(),status:z.enum(['searching','review','pending_confirmation','released']),version:z.string().regex(/^[1-9][0-9]*$/)}).strict().parse(await body(request));return Response.json(await changeStatus(p,input.id,input.status,input.version));}catch(e){return failure(e);}}
