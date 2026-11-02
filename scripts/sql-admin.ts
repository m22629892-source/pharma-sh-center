import 'dotenv/config';
import sql from 'mssql';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pool, atomic } from '../server/sql-store';
import { savePassword, passwordMode } from '../server/credentials';
const command=process.argv[2], email=process.argv[3];
let db:sql.ConnectionPool | undefined;
try {
  db=await pool();
  if (command==='check') {
    const r=await db.request().query("SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS version,DB_NAME() AS databaseName,OBJECT_ID(N'dbo.ServerAuthSessions',N'U') AS authTable");
    console.log(r.recordset[0]);
    if (passwordMode()==='plaintext') {
      const column=await db.request().query("SELECT COL_LENGTH(N'dbo.Users',N'password') AS n");
      if (!column.recordset[0].n) throw new Error('Execute sqlserver/05_plaintext_password.sql first.');
    }
    if (!r.recordset[0].authTable) throw new Error('Execute sqlserver/04_auth.sql in SSMS first.');
  } else if (command==='password' && email) {
    const rows=(await db.request().input('email',sql.NVarChar(500),email.trim().toLowerCase()).query('SELECT TOP (2) Id FROM dbo.Users WHERE LOWER(LTRIM(RTRIM(email)))=@email')).recordset;
    if (rows.length!==1) throw new Error('Expected exactly one imported account with this email. No account changed.');
    let muted=false;
    const output=new Writable({write(chunk,_enc,done){if(!muted)process.stdout.write(chunk);done();}});
    const prompt=createInterface({input:process.stdin,output,terminal:true});
    async function secret(label:string) {process.stdout.write(label);muted=true;try{return await prompt.question('');}finally{muted=false;process.stdout.write('\n');}}
    let password:string;
    try {password=await secret('New password (hidden): ');const again=await secret('Confirm password: ');if(password!==again)throw new Error('Passwords do not match.');}finally{prompt.close();}
    await atomic(tx=>savePassword(rows[0].Id,password,tx));
    console.log('Password initialized. Existing sessions revoked. No password printed or saved in source files.');
  } else throw new Error('Usage: npm run sql:check OR npm run sql:password -- user@example.com');
} catch(e:any) {console.error(e.message);process.exitCode=1;}finally{if(db)await db.close();}
