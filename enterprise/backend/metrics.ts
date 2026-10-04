const buckets=new Map<string,{count:number,total:number,max:number}>();
const names=new Set(['semantic_parse','database_transaction','token_throughput','policy_mutation','leakage_rejection','pool_wait','pool_lease']);
export function observe(name:string,value:number){if(!names.has(name)||!Number.isFinite(value)||value<0)return;const b=buckets.get(name)??{count:0,total:0,max:0};b.count++;b.total+=value;b.max=Math.max(b.max,value);buckets.set(name,b);}
export async function timed<T>(name:string,fn:()=>Promise<T>):Promise<T>{const start=performance.now();try{return await fn();}finally{observe(name,performance.now()-start);}}
export function prometheus(){return [...buckets].map(([n,b])=>`custodia_${n}_count ${b.count}\ncustodia_${n}_sum ${b.total}\ncustodia_${n}_max ${b.max}`).join('\n')+'\n';}
const requests=new Map<number,number>();
export function recordResponse(response:Response){requests.set(response.status,(requests.get(response.status)??0)+1);return response;}
export function requestMetrics(){const release=process.env.CUSTODIA_RELEASE==='candidate'?'candidate':'stable';return [...requests].map(([status,count])=>`custodia_http_requests_total{release="${release}",status="${status}"} ${count}`).join('\n')+'\n';}
