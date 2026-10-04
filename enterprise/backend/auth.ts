import {sessionToken} from './session';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {required,httpsUrl,HttpError} from './config';
import {z} from 'zod';
let keys:ReturnType<typeof createRemoteJWKSet>|undefined;
export type Principal={tenant:string,actor:string,scopes:Set<string>};
export async function authenticate(request:Request,scope:string):Promise<Principal>{
 const header=request.headers.get('authorization');const token=header?.startsWith('Bearer ')?header.slice(7):sessionToken(request);if(!token)throw new HttpError(401,'Authentication required');
 keys??=createRemoteJWKSet(httpsUrl('OIDC_JWKS_URL'),{timeoutDuration:3000});
 try{const {payload}=await jwtVerify(token,keys,{issuer:required('OIDC_ISSUER'),audience:required('OIDC_AUDIENCE'),algorithms:['RS256','ES256'],requiredClaims:['exp','sub','tenant_id']});
 const tenant=z.uuid().parse(payload.tenant_id);const scopes=new Set(typeof payload.scope==='string'?payload.scope.split(' '):[]);
 if(!scopes.has(scope))throw new HttpError(403,'Permission denied');return {tenant,actor:payload.sub!,scopes};
 }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(401,'Invalid access token');}
}
export function origin(request:Request){const value=request.headers.get('origin');if(value&&value!==required('PUBLIC_ORIGIN'))throw new HttpError(403,'Origin rejected');}
