import {z} from 'zod';
import {authenticate,origin} from '../../../../../backend/auth';
import {body,failure,HttpError} from '../../../../../backend/config';
import {importGraph} from '../../../../../connectors/content';
import {Policy} from '../../../../../documents/sanitize';
export const runtime='nodejs';
export async function POST(request:Request){try{origin(request);const p=await authenticate(request,'connectors:read');if(!p.scopes.has('documents:write'))throw new HttpError(403,'Document import permission required');const input=z.object({connectorId:z.uuid(),itemId:z.string().min(1).max(512),requestId:z.uuid(),policy:Policy}).strict().parse(await body(request));return Response.json(await importGraph(p,input.connectorId,input.itemId,input.requestId,input.policy),{status:201});}catch(e){return failure(e);}}
