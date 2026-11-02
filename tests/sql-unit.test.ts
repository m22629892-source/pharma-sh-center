import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordHash, passwordMatches } from '../server/passwords';
import { sqlConfig } from '../server/sql-config';
import { dispenseValues } from '../server/sql-actions';
import { validateValue, safeUser } from '../server/sql-store';
const actor={id:'u',uid:'u',name:'Tester',email:'test@example.test',role:'pharmacist'};
test('local named instance selects SQL 2008 TDS without embedding credentials in URL',()=>{
 const c=sqlConfig({DB_SERVER:'HOST',DB_INSTANCE:'INSTANCE',DB_DATABASE:'db',DB_USER:'login',DB_PASSWORD:'a;special@password'});
 assert.equal(c.server,'HOST');assert.equal(c.options.instanceName,'INSTANCE');assert.equal(c.options.tdsVersion,'7_3_A');
 assert.throws(()=>sqlConfig({DB_SERVER:'HOST\\INSTANCE'}));
 assert.throws(()=>sqlConfig({DB_SERVER:'HOST',DB_INSTANCE:'I',DB_PORT:'1433',DB_DATABASE:'db',DB_USER:'u',DB_PASSWORD:'p'}));
});
test('salted password hashes, wrong password rejection, no plaintext in returned users',async()=>{
 const password='A-strong-test-password'; const a=await passwordHash(password),b=await passwordHash(password);
 assert.notEqual(a,b); assert.ok(await passwordMatches(password,a));assert.equal(await passwordMatches('incorrect',a),false);
 assert.equal(await passwordMatches(password,'invalid'),false); await assert.rejects(passwordHash('short'));
 const clean=safeUser({Id:'u',password,PasswordHash:a,SourceJson:'{"password":"secret"}',role:'admin'});
 assert.ok(!('password' in clean));assert.ok(!('PasswordHash' in clean));assert.ok(!('SourceJson' in clean));assert.equal(clean.uid,'u');
});
test('dispense protects stock, expiry, controlled drugs and derives price',()=>{
 const med={quantity:3,price:1.25,expiryDate:'2099-12-31',isControlled:false};
 assert.deepEqual(dispenseValues(med,{quantityDispensed:2,actualQuantityDispensed:2,totalPrice:0},actor),{actual:2,after:1,total:2.5});
 assert.throws(()=>dispenseValues(med,{quantityDispensed:4,actualQuantityDispensed:4},actor));
 assert.throws(()=>dispenseValues(med,{quantityDispensed:1,actualQuantityDispensed:-1},actor));
 assert.throws(()=>dispenseValues({...med,isControlled:true},{quantityDispensed:1,actualQuantityDispensed:1},{...actor,role:'technician'}));
 assert.throws(()=>dispenseValues({...med,expiryDate:'2000-01-01'},{quantityDispensed:1,actualQuantityDispensed:1},actor));
});
test('invalid typed input rejected, valid Arabic Unicode preserved',()=>{
 assert.throws(()=>validateValue('2026-02-30','date','expiryDate'));
 assert.throws(()=>validateValue({value:'x'},'nvarchar(500)','name'));
 assert.throws(()=>validateValue(0.12345,'decimal(19,4)','quantity'));
 assert.equal(validateValue('دواء عربي','nvarchar(500)','name'),'دواء عربي');
});
