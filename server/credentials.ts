import { createHash, timingSafeEqual } from 'node:crypto';
import sql from 'mssql';
import { passwordHash, passwordMatches } from './passwords';
import { req, fail } from './sql-store';
export function passwordMode(value = process.env.DB_PASSWORD_MODE || 'hashed') {
  if (value !== 'plaintext' && value !== 'hashed') throw new Error('DB_PASSWORD_MODE must be plaintext or hashed.');
  return value;
}
export async function credentialMatches(input: unknown, row: any, mode = passwordMode()) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 200 || !row) return false;
  if (mode === 'plaintext') {
    const stored = Object.entries(row).find(([key]) => key.toLowerCase() === 'password')?.[1];
    if (typeof stored !== 'string' || !stored.length) return false;
    // Exact case/whitespace-sensitive comparison; do not use SQL collation or trim().
    const digest=(s:string)=>createHash('sha256').update(s,'utf8').digest();
    return timingSafeEqual(digest(input),digest(stored));
  }
  return !row.RequiresPasswordReset && passwordMatches(input,row.PasswordHash);
}
export async function savePassword(id:string, password:unknown, tx:sql.Transaction) {
  const mode=passwordMode();
  const min=mode==='plaintext'?1:10;
  if (typeof password !== 'string' || password.length<min || password.length>200) fail(`كلمة المرور يجب أن تكون بين ${min} و200 حرف.`);
  const r=(await req(tx)).input('id',sql.NVarChar(450),id);
  if (mode==='plaintext') {
    r.input('password',sql.NVarChar(200),password);
    await r.query('UPDATE dbo.Users SET [password]=@password,PasswordHash=NULL,RequiresPasswordReset=0 WHERE Id=@id; DELETE dbo.ServerAuthSessions WHERE UserId=@id;');
  } else {
    r.input('hash',sql.NVarChar(512),await passwordHash(password as string));
    await r.query('UPDATE dbo.Users SET PasswordHash=@hash,RequiresPasswordReset=0 WHERE Id=@id; DELETE dbo.ServerAuthSessions WHERE UserId=@id;');
  }
}
