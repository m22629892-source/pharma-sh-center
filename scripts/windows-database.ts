import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { sqlConfig } from '../server/sql-config';
import { atomic, pool, put, req } from '../server/sql-store';
import { savePassword } from '../server/credentials';
const command=process.argv[2];
let db:sql.ConnectionPool | undefined;
try {
 if(command==='initialize') {
  const name=process.env.DB_DATABASE || '';
  if(!/^[A-Za-z0-9_]{1,128}$/.test(name))throw new Error('Database name must use letters, digits or underscore for initialization.');
  const master=new sql.ConnectionPool({...sqlConfig(),database:'master'});
  try{await master.connect();await master.request().batch(`IF DB_ID(N'${name}') IS NULL CREATE DATABASE [${name}];`);}finally{await master.close();}
  db=await pool();
  const tables=await db.request().query('SELECT COUNT(*) AS n FROM sys.tables WHERE is_ms_shipped=0');
  if(tables.recordset[0].n!==0)throw new Error('Initialization refused: this database already has tables. Use existing-database mode instead.');
  for(const file of ['01_schema.sql','04_auth.sql','05_plaintext_password.sql']) {
   const source=(await fs.readFile(path.join(process.cwd(),'sqlserver',file),'utf8')).replace(/^\uFEFF/,'').replaceAll('PharmaSHCenter',name);
   for(const batch of source.split(/^GO\s*$/mi).filter(s=>s.trim()))await db.request().batch(batch);
  }
  console.log('Empty database schema created. No example patients or medicines added.');
 } else if(command==='check') {
  db=await pool();
  const result=await db.request().query("SELECT OBJECT_ID(N'dbo.Users',N'U') AS usersTable,OBJECT_ID(N'dbo.Medicines',N'U') AS medicinesTable,OBJECT_ID(N'dbo.ServerAuthSessions',N'U') AS sessionsTable");
  const row=result.recordset[0];if(!row.usersTable||!row.medicinesTable||!row.sessionsTable)throw new Error('Required database tables are missing. Run the SQL setup scripts for the selected database.');
  if(process.env.DB_PASSWORD_MODE==='plaintext') {
   const result=await db.request().query("SELECT COL_LENGTH(N'dbo.Users',N'password') AS n");if(!result.recordset[0].n)throw new Error('Execute 05_plaintext_password.sql first.');
  }
  console.log('Database connection and required tables: OK.');
 } else if(command==='bootstrap') {
  // The initial password is read from stdin, never from command arguments or a file.
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>10000)throw new Error('Input too large.');}
  const data=JSON.parse(input.replace(/^\uFEFF/,''));
  if(typeof data.email!=='string'||!data.email.includes('@')||data.email.length>200||typeof data.name!=='string'||!data.name.trim())throw new Error('Invalid initial account details.');
  db=await pool();
  await atomic(async tx=>{
   const result=await (await req(tx)).query('SELECT TOP(1) Id FROM dbo.Users WITH (UPDLOCK,HOLDLOCK)');
   if(result.recordset.length)throw new Error('Initial account creation refused: users already exist.');
   const id='initial-owner';await put('users',{id,uid:id,name:data.name,email:data.email.trim().toLowerCase(),role:'developer'},tx);
   await savePassword(id,data.password,tx);
  });
  console.log('Initial owner account created.');
 } else throw new Error('Unknown setup command.');
} catch(e:any){console.error(e.message);process.exitCode=1;}finally{if(db)await db.close();}
