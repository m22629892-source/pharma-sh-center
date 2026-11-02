import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialMatches, passwordMode } from '../server/credentials';
import { passwordHash } from '../server/passwords';
import { safeUser } from '../server/sql-store';
test('plaintext reads password literally, ignores hash/reset state and has no hash fallback',async()=>{
 const row={password:'Ab c ',PasswordHash:await passwordHash('HashedPassword2026'),RequiresPasswordReset:1};
 assert.equal(await credentialMatches('Ab c ',row,'plaintext'),true);
 for(const wrong of ['ab c ','Ab c','HashedPassword2026',''])assert.equal(await credentialMatches(wrong,row,'plaintext'),false);
 assert.equal(await credentialMatches('123',{password:'123'},'plaintext'),true);
 assert.equal(await credentialMatches('123',{Password:'123'},'plaintext'),true);
 assert.equal(await credentialMatches('x',{PasswordHash:'x'},'plaintext'),false);
 assert.equal(await credentialMatches('x',{password:''},'plaintext'),false);
});
test('plaintext password never appears in public user responses',()=>{
 const result=safeUser({Id:'u',password:'private',PasswordHash:'hash',Password:'private',SourceJson:'private',name:'Name'});
 assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!('password' in result));
 assert.throws(()=>passwordMode('unknown'));
});
