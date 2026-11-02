import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const folder=path.resolve('release/PharmaSHCenter-Windows11-Server');
const port=31874;
const child=spawn(path.join(folder,'runtime','node.exe'),['server.mjs'],{cwd:folder,env:{...process.env,NODE_ENV:'production',DATA_BACKEND:'sqlserver',VITE_DATA_BACKEND:'sqlserver',HOST:'127.0.0.1',PORT:String(port),DB_SERVER:'127.0.0.1',DB_PORT:'65432',DB_INSTANCE:'',DB_DATABASE:'PharmaSHCenter',DB_USER:'smoke-only',DB_PASSWORD:'synthetic-only'},stdio:'pipe'});
let errors='';child.stderr.on('data',x=>{errors+=x});
try {
 let ok=false;
 for(let i=0;i<60;i++) {
  if(child.exitCode!==null)throw new Error('Packaged server exited early: '+errors);
  try {const r=await fetch(`http://127.0.0.1:${port}/`);if(r.ok && (await r.text()).includes('<html')){ok=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!ok)throw new Error('Packaged server did not serve its production frontend: '+errors);
 const me=await fetch(`http://127.0.0.1:${port}/api/sql/me`);
 if(me.status!==401)throw new Error('Unauthenticated packaged API must reject access.');
 const forbidden=['.env','.sessions_cache.json','firestore-backup.json'];
 for(const f of forbidden){try{await fs.access(path.join(folder,f));throw new Error('Private file in package: '+f);}catch(e){if(e.code!=='ENOENT')throw e;}}
 console.log('Windows packaged runtime starts, serves production HTML and rejects unauthenticated API access.');
}finally{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}}
