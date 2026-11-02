import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'release','PharmaSHCenter-Windows11-Server');
const checkOnly=process.argv.includes('--check-only');
if(process.platform!=='win32' && !checkOnly)throw new Error('Build the distributable on Windows x64; use the GitHub Windows package workflow.');
if(process.platform==='win32' && process.arch!=='x64')throw new Error('This package targets Windows 11 x64.');
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
const common={bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',logLevel:'info'};
await build({...common,entryPoints:[path.join(root,'server.ts')],outfile:path.join(out,'server.mjs')});
await build({...common,entryPoints:[path.join(root,'scripts/sql-admin.ts')],outfile:path.join(out,'sql-admin.mjs')});
await build({...common,entryPoints:[path.join(root,'scripts/windows-database.ts')],outfile:path.join(out,'database-setup.mjs')});
await fs.mkdir(path.join(out,'sqlserver'));
for(const name of ['01_schema.sql','03_validate.sql','04_auth.sql','05_plaintext_password.sql','mapping.json','README.md']) await fs.copyFile(path.join(root,'sqlserver',name),path.join(out,'sqlserver',name));
for(const file of await fs.readdir(path.join(root,'windows')))await fs.copyFile(path.join(root,'windows',file),path.join(out,file));
const dependencies={};
for(const name of ['@google/genai','dotenv','express','jspdf','mssql']) {
 const pkg=JSON.parse(await fs.readFile(path.join(root,'node_modules',name,'package.json'),'utf8'));
 dependencies[name]=pkg.version;
}
await fs.writeFile(path.join(out,'package.json'),JSON.stringify({name:'pharma-sh-center-server',private:true,type:'module',version:'1.0.0',dependencies},null,2));
await fs.writeFile(path.join(out,'BUILD.json'),JSON.stringify({commit:process.env.GITHUB_SHA || 'local',builtAt:new Date().toISOString(),platform:'win32-x64',runtime:process.version},null,2));
if(checkOnly){console.log('Production server/administration bundles compiled. Windows runtime was not packaged on this host.');process.exit(0);}
// Build UI cleanly so a previous dist cannot be shipped by accident.
await fs.rm(path.join(root,'dist'),{recursive:true,force:true});
let result=spawnSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build'],{cwd:root,stdio:'inherit',env:{...process.env,VITE_DATA_BACKEND:'sqlserver'}});
if(result.status!==0)throw new Error('UI build failed.');
await fs.cp(path.join(root,'dist'),path.join(out,'dist'),{recursive:true});
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Run this builder with npm run package:windows.');
result=spawnSync(process.execPath,[npm,'install','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:out,stdio:'inherit'});
if(result.status!==0)throw new Error('Installing production runtime dependencies failed.');
await fs.mkdir(path.join(out,'runtime'));
await fs.copyFile(process.execPath,path.join(out,'runtime','node.exe'));
await fs.copyFile(path.join(path.dirname(process.execPath),'LICENSE'),path.join(out,'runtime','NODE-LICENSE.txt'));
await fs.copyFile(path.join(root,'WINDOWS_CLIENT_AR.md'),path.join(out,'READ_ME_AR.md'));
console.log('Windows server package ready:',out);
