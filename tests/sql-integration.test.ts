import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import sql from 'mssql';
import { pool, atomic, put, list, req } from '../server/sql-store';
import { passwordHash } from '../server/passwords';
import { sqlRouter } from '../server/sql-http';
const enabled=process.env.SQL_INTEGRATION==='1';
// CI uses only synthetic records in a dedicated disposable database.
test('SQL HTTP: authentication, atomic concurrent dispense, idempotency, dose lock, role enforcement, backup', {skip:!enabled},async()=>{
 const db=await pool();
 for (const name of ['01_schema.sql','04_auth.sql','05_plaintext_password.sql']) {
  const text=(await fs.readFile(new URL('../sqlserver/'+name,import.meta.url),'utf8')).replace(/^\uFEFF/,'');
  for(const batch of text.split(/^GO\s*$/mi).filter(x=>x.trim()))await db.request().batch(batch);
 }
 const hash=await passwordHash('Test-only-password-2026');
 await atomic(async tx=>{
  for(const [id,role] of [['test-admin','developer'],['test-tech','technician']]) {
   await put('users',{id,uid:id,email:id+'@example.test',name:id,role},tx);
   await (await req(tx)).input('id',sql.NVarChar(450),id).input('hash',sql.NVarChar(512),hash).query('UPDATE dbo.Users SET PasswordHash=@hash,RequiresPasswordReset=0 WHERE Id=@id');
  }
  await put('medicines',{id:'test-med',commercialName:'دواء اختبار',quantity:3,price:2,unit:'حبة',expiryDate:'2099-12-31'},tx);
  await put('residents',{id:'test-res',name:'اختبار',dosageSchedule:[{id:'dose1',medicineId:'test-med',quantity:1}]},tx);
 });
 const app=express();app.use(express.json());app.use('/api/sql',sqlRouter());
 const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
 const port=(server.address() as any).port,base=`http://127.0.0.1:${port}/api/sql`;
 async function api(path:string,body?:any,cookie?:string) {
  const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 try {
  assert.equal((await api('/action/fetchMedicines',{args:[]})).status,401);
  assert.equal((await api('/login',{email:'test-admin@example.test',password:'wrong'})).status,401);
  const login=await api('/login',{email:'test-admin@example.test',password:'Test-only-password-2026'});assert.equal(login.status,200);const cookie=login.cookie!;
  assert.ok(!JSON.stringify(login.data).includes('PasswordHash'));
  const dispense=(qty:number,key:string,extra:any={})=>api('/action/addDispenseRecord',{args:[{medicineId:'test-med',residentId:'test-res',residentName:'اختبار',quantityDispensed:qty,actualQuantityDispensed:qty,requestId:key,...extra}]},cookie);
  const results=await Promise.all([dispense(2,'00000000-0000-0000-0000-000000000001'),dispense(2,'00000000-0000-0000-0000-000000000002')]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  const winningKey=results[0].status===200?'00000000-0000-0000-0000-000000000001':'00000000-0000-0000-0000-000000000002';
  assert.equal((await dispense(2,winningKey)).status,200);
  const records=await list('dispense_records');assert.equal(records.length,1);assert.equal((await list('medicines'))[0].quantity,1);assert.equal((await list('stock_audit_logs')).length,1);
  assert.equal((await dispense(1,'00000000-0000-0000-0000-000000000003',{doseId:'dose1'})).status,200);
  // Refill for checking daily dose rejection, independently of insufficient stock.
  await atomic(async tx=>{const meds=await list('medicines',tx);await put('medicines',{...meds[0],quantity:2},tx);});
  assert.equal((await dispense(1,'00000000-0000-0000-0000-000000000004',{doseId:'dose1'})).status,409);
  assert.equal((await list('dispense_records')).length,2);
  const tech=await api('/login',{email:'test-tech@example.test',password:'Test-only-password-2026'});
  assert.equal((await api('/action/updateUser',{args:[{uid:'test-tech',role:'developer'}]},tech.cookie)).status,403);
  assert.equal((await api('/action/fetchCollectionRaw',{args:['users']},tech.cookie)).status,403);
  assert.equal((await api('/action/deleteMedicine',{args:['test-med']},tech.cookie)).status,403);
  const backup=await api('/action/createFullBackup',{args:[]},cookie);
  assert.equal(backup.status,200);assert.ok(backup.data.collections.doctors);assert.equal(backup.data.collections.users.length,2);
  assert.ok(backup.data.collections.users.every((u:any)=>!u.password && !u.PasswordHash));
  await api('/logout',{},cookie);assert.equal((await api('/me',undefined,cookie)).status,401);
  // Explicit plaintext mode exercises the actual API and database column.
  process.env.DB_PASSWORD_MODE='plaintext';
  await atomic(async tx=>{
    const { savePassword }=await import('../server/credentials');
    await savePassword('test-admin','Plain Text 123 ',tx);
    await (await req(tx)).query("UPDATE dbo.Users SET RequiresPasswordReset=1 WHERE Id=N'test-admin'");
  });
  const plainLogin=await api('/login',{email:'test-admin@example.test',password:'Plain Text 123 '});
  assert.equal(plainLogin.status,200);assert.ok(!JSON.stringify(plainLogin.data).includes('Plain Text'));
  assert.equal((await api('/me',undefined,plainLogin.cookie)).status,200);
  assert.equal((await api('/login',{email:'test-admin@example.test',password:'Plain Text 123'})).status,401);
  const changed=await api('/password',{currentPassword:'Plain Text 123 ',newPassword:'Changed 123'},plainLogin.cookie);
  assert.equal(changed.status,200);assert.equal((await api('/me',undefined,plainLogin.cookie)).status,401);
  assert.equal((await api('/login',{email:'test-admin@example.test',password:'Changed 123'})).status,200);
  assert.equal((await db.request().query("SELECT [password] FROM dbo.Users WHERE Id=N'test-admin'")).recordset[0].password,'Changed 123');
  delete process.env.DB_PASSWORD_MODE;
 } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await db.close();}
});
