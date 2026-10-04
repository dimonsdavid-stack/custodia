import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const environment=process.argv[2];
if(!['production','preview','development'].includes(environment))throw Error('Specify production, preview or development');
const list=spawnSync('vercel',['env','ls',environment],{encoding:'utf8'});if(list.status!==0)throw Error('Authenticated linked Vercel project required');
const generated={SESSION_ENCRYPTION_KEY:randomBytes(32).toString('hex'),LEDGER_HMAC_KEY:randomBytes(32).toString('hex'),CONNECTOR_ENCRYPTION_KEY:randomBytes(32).toString('hex'),DOCUMENT_ENCRYPTION_KEYS:JSON.stringify({v1:randomBytes(32).toString('hex')}),LEDGER_KEY_ID:'v1',DOCUMENT_KEY_ID:'v1',CUSTODIA_RELEASE:'stable'};
for(const[key,value]of Object.entries(generated)){if(new RegExp('\\b'+key+'\\b').test(list.stdout)){console.log(JSON.stringify({key,status:'existing_value_preserved'}));continue;}const result=spawnSync('vercel',['env','add',key,environment],{input:value,encoding:'utf8'});if(result.status!==0)throw Error('Failed to configure '+key);console.log(JSON.stringify({key,environment,status:'configured'}));}
