import {authenticate,origin} from '../../../../backend/auth';
import {body,failure} from '../../../../backend/config';
import {configuration} from '../../../../connectors/adapters';
import {configure,list} from '../../../../connectors/store';
export const runtime='nodejs';
export async function GET(request:Request){try{return Response.json({connectors:await list(await authenticate(request,'connectors:read'))},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{origin(request);const p=await authenticate(request,'connectors:write');return Response.json(await configure(p,configuration.parse(await body(request))),{status:201,headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
