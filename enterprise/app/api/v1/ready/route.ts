import {recordResponse} from '../../../../backend/metrics';
import {readiness} from '../../../../backend/readiness';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){const result=await readiness();return recordResponse(Response.json(result,{status:result.ok?200:503,headers:{'Cache-Control':'no-store'}}));}
