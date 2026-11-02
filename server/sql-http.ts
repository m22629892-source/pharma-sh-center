import express, { type RequestHandler } from 'express';
import sql from 'mssql';
import { randomBytes } from 'node:crypto';
import { action } from './sql-actions';
import { AppError, Actor, atomic, pool, req, roles, safeUser, fail } from './sql-store';
import { passwordMatches, passwordHash, tokenHash } from './passwords';
const COOKIE='pharma_sql_session';
const hours=12;
const tokenFrom=(header='')=>header.split(';').map(x=>x.trim().split('=')).find(x=>x[0]===COOKIE)?.[1] || '';
const wrap=(fn:any):RequestHandler=>(r,s,n)=>Promise.resolve(fn(r,s,n)).catch(n);
export async function authenticate(token: string): Promise<Actor | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const result=await (await pool()).request().input('hash',sql.VarChar(64),tokenHash(token)).query(`SELECT u.Id,u.name,u.email,u.role,u.RequiresPasswordReset FROM dbo.ServerAuthSessions s JOIN dbo.Users u ON u.Id=s.UserId WHERE s.TokenHash=@hash AND s.ExpiresAt>SYSUTCDATETIME()`);
  const u=result.recordset[0];if (!u || u.RequiresPasswordReset || !roles.includes(u.role)) return null;
  return {id:u.Id,uid:u.Id,name:u.name,email:u.email,role:u.role};
}
export const requireSQLAuth:RequestHandler=wrap(async (r:any,s:any,n:any)=>{
  const a=await authenticate(tokenFrom(r.headers.cookie));
  if (!a) return s.status(401).json({error:'انتهت الجلسة؛ سجّل الدخول مرة أخرى.'});
  s.locals.actor=a;n();
});
export const sqlErrorHandler: express.ErrorRequestHandler=(error,_r,s,_n)=>{
  if (error instanceof AppError) return void s.status(error.status).json({error:error.message});
  console.error('SQL operation failed:',error?.code || error?.name || 'unknown');
  s.status(503).json({error:'تعذّر تنفيذ العملية على قاعدة SQL. تحقق من اتصال الخادم والإعدادات ثم أعد المحاولة.'});
};
export function sqlRouter() {
  const router=express.Router();
  router.use((_r,s,n)=>{s.setHeader('Cache-Control','no-store');n();});
  router.use((r,s,n)=>{
    if (!['GET','HEAD','OPTIONS'].includes(r.method)) {
      if (!r.is('application/json')) return s.status(415).json({error:'JSON required.'});
      if (r.headers.origin) {
        let host:string;try{host=new URL(r.headers.origin).host;}catch{return s.sendStatus(403);}
        if (host!==r.headers.host) return s.sendStatus(403);
      }
    }
    n();
  });
  router.get('/health',wrap(async (_r:any,s:any)=>{await (await pool()).request().query('SELECT 1 AS ready');s.json({ok:true,backend:'sqlserver'});}));
  const attempts=new Map<string,{count:number;until:number}>();
  const sweep=setInterval(()=>{for(const [k,v] of attempts)if(v.until<Date.now())attempts.delete(k);},60000);sweep.unref();
  router.post('/login',wrap(async (r:any,s:any)=>{
    const {email,password}=r.body || {};
    if (typeof email!=='string' || email.length>500 || typeof password!=='string' || password.length>200) fail('بيانات الدخول غير صالحة.');
    // Socket address only: untrusted X-Forwarded-For cannot reset the throttle.
    const key=r.socket.remoteAddress || 'local';
    let limit=attempts.get(key);if(!limit || limit.until<Date.now())limit={count:0,until:Date.now()+900000};
    if(limit.count>=15)return s.status(429).json({error:'محاولات كثيرة. انتظر 15 دقيقة.'});
    limit.count++;attempts.set(key,limit);
    const rows=(await (await pool()).request().input('email',sql.NVarChar(500),email.trim().toLowerCase()).query('SELECT TOP (2) * FROM dbo.Users WHERE LOWER(LTRIM(RTRIM(email)))=@email')).recordset;
    const u=rows.length===1?rows[0]:null;
    if (!u || !roles.includes(u.role) || u.RequiresPasswordReset || !await passwordMatches(password,u.PasswordHash)) return s.status(401).json({error:'بيانات الدخول غير صحيحة أو الحساب يحتاج تهيئة كلمة المرور من مسؤول النظام.'});
    const token=randomBytes(32).toString('hex');
    await atomic(async tx=>{
      await (await req(tx)).input('id',sql.NVarChar(450),u.Id).input('hash',sql.VarChar(64),tokenHash(token)).query(`DELETE dbo.ServerAuthSessions WHERE UserId=@id; INSERT dbo.ServerAuthSessions (UserId,TokenHash,ExpiresAt) VALUES (@id,@hash,DATEADD(hour,${hours},SYSUTCDATETIME()));`);
    });
    attempts.delete(key);
    s.cookie(COOKIE,token,{httpOnly:true,sameSite:'strict',secure:process.env.SESSION_COOKIE_SECURE==='true',path:'/',...(r.body.rememberMe?{maxAge:hours*3600000}:{})});
    s.json(safeUser(u));
  }));
  router.use(requireSQLAuth);
  router.get('/me',(_r,s)=>s.json(s.locals.actor));
  router.post('/logout',wrap(async(r:any,s:any)=>{
    await (await pool()).request().input('hash',sql.VarChar(64),tokenHash(tokenFrom(r.headers.cookie))).query('DELETE dbo.ServerAuthSessions WHERE TokenHash=@hash');
    s.clearCookie(COOKIE,{path:'/'});s.json({ok:true});
  }));
  router.post('/password',wrap(async(r:any,s:any)=>{
    const a=s.locals.actor as Actor;
    const row=(await (await pool()).request().input('id',sql.NVarChar(450),a.id).query('SELECT PasswordHash FROM dbo.Users WHERE Id=@id')).recordset[0];
    if (!await passwordMatches(r.body.currentPassword,row?.PasswordHash)) fail('كلمة المرور الحالية غير صحيحة.',403);
    const hash=await passwordHash(r.body.newPassword);
    await atomic(async tx=>{
      await (await req(tx)).input('id',sql.NVarChar(450),a.id).input('hash',sql.NVarChar(512),hash).query('UPDATE dbo.Users SET PasswordHash=@hash,RequiresPasswordReset=0 WHERE Id=@id; DELETE dbo.ServerAuthSessions WHERE UserId=@id;');
    });
    s.clearCookie(COOKIE,{path:'/'});s.json({ok:true});
  }));
  router.post('/action/:method',wrap(async(r:any,s:any)=>{
    if (r.params.method==='heartbeatActiveSession' || r.params.method==='claimActiveSession') {
      await (await pool()).request().input('hash',sql.VarChar(64),tokenHash(tokenFrom(r.headers.cookie))).query('UPDATE dbo.ServerAuthSessions SET LastSeenAt=SYSUTCDATETIME() WHERE TokenHash=@hash');
      return s.json(r.params.method==='claimActiveSession'?{success:true}:{active:true});
    }
    s.json(await action(r.params.method,r.body.args,s.locals.actor));
  }));
  router.use(sqlErrorHandler);
  return router;
}
