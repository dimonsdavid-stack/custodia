import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {z} from 'zod';
import {authenticate,origin} from '../../../backend/auth';
import {body,failure,HttpError} from '../../../backend/config';
import {transaction,createRequest} from '../../../backend/database';
export const runtime='nodejs';
export async function POST(request:Request){try{origin(request);const p=await authenticate(request,'records:read');const parsed=await body(request);const server=new McpServer({name:'custodia',version:'1.0.0'});
 server.registerTool('requests_list',{description:'Read the latest 100 requests in the authenticated tenant',inputSchema:{}},async()=>({content:[{type:'text',text:JSON.stringify(await transaction(p,async c=>(await c.query('SELECT id,status,version::text FROM custodia.requests ORDER BY updated_at DESC LIMIT 100')).rows))}]}));
 server.registerTool('request_create',{description:'Create an intake request in the authenticated tenant',inputSchema:{text:z.string().min(10).max(20000),requesterEmail:z.email()}},async input=>{if(!p.scopes.has('records:write'))throw new HttpError(403,'Write scope required');return {content:[{type:'text',text:JSON.stringify(await createRequest(p,input))}]};});
 server.registerResource('workflow','custodia://workflow',{description:'Allowed request state transitions'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify({states:['intake','searching','review','pending_confirmation','released'],releaseRequires:'records:release'})}]}));
 const transport=new WebStandardStreamableHTTPServerTransport({enableJsonResponse:true});await server.connect(transport);try{return await transport.handleRequest(request,{parsedBody:parsed});}finally{await server.close();}
 }catch(e){return failure(e);}}
export async function GET(){return new Response(null,{status:405,headers:{Allow:'POST'}});}
export async function DELETE(){return new Response(null,{status:405,headers:{Allow:'POST'}});}
