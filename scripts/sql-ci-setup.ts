import sql from 'mssql';
import { sqlConfig } from '../server/sql-config';
if(process.env.CI!=='true')throw new Error('CI fixture setup is not a production migration.');
let last:unknown;
for(let attempt=0;attempt<30;attempt++) {
 const p=new sql.ConnectionPool({...sqlConfig(),database:'master'});
 try {await p.connect();await p.request().batch("IF DB_ID(N'PharmaSHCenter') IS NULL CREATE DATABASE PharmaSHCenter;");await p.close();last=null;break;}
 catch(e){last=e;try{await p.close();}catch{} await new Promise(r=>setTimeout(r,2000));}
}
if(last)throw last;
