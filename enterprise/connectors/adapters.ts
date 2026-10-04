import {z} from 'zod';
import {boundary,requestJson} from './transport';
export const configuration=z.discriminatedUnion('provider',[
 z.object({provider:z.literal('graph'),directoryId:z.uuid(),clientId:z.uuid(),clientSecret:z.string().min(8).max(4096),driveId:z.string().regex(/^[\w!,-]+$/).max(256)}).strict(),
 z.object({provider:z.literal('laserfiche'),authorizationKey:z.string().min(8).max(8192),repositoryId:z.string().regex(/^[\w-]+$/).max(128),folderId:z.number().int().nonnegative()}).strict()
]);
export type ConnectorConfig=z.infer<typeof configuration>;
export type Page={items:Record<string,unknown>[],cursor:string,complete:boolean};
export async function page(config:ConnectorConfig,cursor:string|null,send:typeof fetch=fetch):Promise<Page>{
 const graph=config.provider==='graph';
 const tokenUrl=graph?new URL(`https://login.microsoftonline.com/${config.directoryId}/oauth2/v2.0/token`):new URL('https://signin.laserfiche.com/oauth/token');
 const form=graph?new URLSearchParams({grant_type:'client_credentials',client_id:config.clientId,client_secret:config.clientSecret,scope:'https://graph.microsoft.com/.default'}):new URLSearchParams({grant_type:'client_credentials',scope:'repository.Read'});
 const token=z.object({access_token:z.string().min(1),expires_in:z.number().positive()}).parse(await requestJson(tokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(!graph?{Authorization:`Bearer ${config.authorizationKey}`}:{})},body:form.toString()},send));
 const host=graph?'graph.microsoft.com':'api.laserfiche.com';
 const path=graph?`/v1.0/drives/${encodeURIComponent(config.driveId)}/`:`/repository/v1/Repositories/${encodeURIComponent(config.repositoryId)}/Entries/${config.folderId}/Laserfiche.Repository.Folder/children`;
 const start=`https://${host}${path}${graph?'root/delta?$top=100':'?$top=100'}`;
 const result=await requestJson(boundary(cursor||start,host,path),{headers:{Authorization:`Bearer ${token.access_token}`}},send);
 const items=z.array(z.record(z.string(),z.unknown())).max(1000).parse(result.value);
 const next=typeof result['@odata.nextLink']==='string'?result['@odata.nextLink']:null;
 const delta=typeof result['@odata.deltaLink']==='string'?result['@odata.deltaLink']:null;
 if(graph&&!next&&!delta)throw new Error('Graph delta response missing continuation');
 const nextCursor=next||delta||start;boundary(nextCursor,host,path);
 return {items,cursor:nextCursor,complete:!next};
}
