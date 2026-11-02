import sql from 'mssql';
import mapping from '../sqlserver/mapping.json';
import { sqlConfig } from './sql-config';
export type Actor = { id: string; uid: string; name: string; email: string; role: string };
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export const fail = (message: string, status = 400): never => { throw new AppError(status, message); };
export const roles = ['developer', 'admin', 'pharmacist', 'technician'];
export const models = mapping as Record<string, { table: string; fields: Record<string, string> }>;
let connected: Promise<sql.ConnectionPool> | undefined;
export function pool() {
  if (!connected) {
    const p = new sql.ConnectionPool(sqlConfig());
    p.on('error', () => { connected = undefined; });
    connected = p.connect().catch(e => { connected = undefined; throw e; });
  }
  return connected;
}
export async function atomic<T>(fn: (tx: sql.Transaction) => Promise<T>) {
  const tx = new sql.Transaction(await pool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try { const result = await fn(tx); await tx.commit(); return result; }
  catch (e) { try { await tx.rollback(); } catch {} throw e; }
}
function request(tx?: sql.Transaction) { return tx ? new sql.Request(tx) : new sql.Request(); }
export async function req(tx?: sql.Transaction) { return tx ? request(tx) : (await pool()).request(); }
export function safeUser(o: any) {
  const { password, PasswordHash, RequiresPasswordReset, SourceJson, ImportedAt, ...rest } = o;
  return { ...rest, id: o.Id || o.id || o.uid, uid: o.Id || o.id || o.uid };
}
function record(row: any, col: string) {
  let original: any;
  try { original = JSON.parse(row.SourceJson); } catch { fail('Invalid stored source JSON; repair this record before use.', 500); }
  const output = { ...original, id: row.Id };
  for (const key of Object.keys(models[col].fields)) {
    const value = row[key];
    if (value !== null && value !== undefined) output[key] = value instanceof Date ? (models[col].fields[key] === 'date' ? value.toISOString().slice(0,10) : value.toISOString()) : value;
  }
  return col === 'users' ? safeUser(output) : output;
}
export async function list(col: string, tx?: sql.Transaction) {
  const model = models[col]; if (!model) fail('Unknown collection.');
  return (await (await req(tx)).query(`SELECT * FROM dbo.[${model.table}]`)).recordset.map(r => record(r, col));
}
export async function get(col: string, id: string, tx?: sql.Transaction, lock = false) {
  const m = models[col]; if (!m) fail('Unknown collection.');
  const rows = (await (await req(tx)).input('id', sql.NVarChar(450), id).query(`SELECT * FROM dbo.[${m.table}] ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} WHERE Id=@id`)).recordset;
  return rows[0] ? record(rows[0], col) : null;
}
export function validateValue(value: any, type: string, name: string) {
  if (value == null || value === '') return null;
  if (type === 'bit') { if (typeof value !== 'boolean' && value !== 0 && value !== 1) fail(`Invalid ${name}.`); return Boolean(value); }
  if (type === 'int' || type.startsWith('decimal')) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= 1e15 || (type === 'int' ? (!Number.isSafeInteger(value) || Math.abs(value) > 2147483647) : Math.abs(value * 1e4 - Math.round(value * 1e4)) > 0.02)) fail(`Invalid ${name}.`);
    return value;
  }
  if (type === 'date' || type.startsWith('datetimeoffset')) {
    if (typeof value !== 'string' || (type === 'date' ? !/^\d{4}-\d{2}-\d{2}$/.test(value) : !/(Z|[+-]\d{2}:\d{2})$/.test(value)) || !Number.isFinite(Date.parse(value))) fail(`Invalid ${name}.`);
    const d = new Date(value);
    if (type === 'date' && d.toISOString().slice(0,10) !== value) fail(`Invalid ${name}.`);
    return d;
  }
  if (typeof value !== 'string') fail(`Invalid ${name}.`);
  const max = type === 'nvarchar(max)' ? 1_000_000 : Number(type.match(/\d+/)?.[0]);
  if (value.length > max) fail(`${name} is too long.`);
  return value;
}
function sqlType(t: string) {
  if (t === 'bit') return sql.Bit;
  if (t === 'int') return sql.Int;
  if (t === 'date') return sql.Date;
  if (t.startsWith('datetimeoffset')) return sql.DateTimeOffset(3);
  if (t.startsWith('decimal')) return sql.Decimal(19,4);
  return sql.NVarChar(t === 'nvarchar(max)' ? sql.MAX : Number(t.match(/\d+/)![0]));
}
export async function put(col: string, data: any, tx: sql.Transaction) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Invalid record.');
  const m = models[col]; if (!m) fail('Unknown collection.');
  const id = data.id || data.uid;
  if (typeof id !== 'string' || !id || id.length > 450) fail('Invalid record ID.');
  const clean = { ...data, id };
  if (col === 'users') { for (const k of Object.keys(clean)) if (/password|token|secret/i.test(k)) delete clean[k]; }
  const r = await req(tx); r.input('id', sql.NVarChar(450), id).input('json', sql.NVarChar(sql.MAX), JSON.stringify(clean));
  const fields = Object.entries(m.fields);
  fields.forEach(([k,t], i) => r.input(`p${i}`, sqlType(t), validateValue(clean[k], t, k)));
  const columns = fields.map(([k]) => `[${k}]`), values = fields.map((_,i) => `@p${i}`);
  await r.query(`UPDATE dbo.[${m.table}] WITH (UPDLOCK,HOLDLOCK) SET SourceJson=@json${columns.length ? ', '+columns.map((k,i)=>`${k}=${values[i]}`).join(',') : ''} WHERE Id=@id;
IF @@ROWCOUNT=0 INSERT dbo.[${m.table}] (Id,SourceJson${columns.length ? ','+columns.join(',') : ''}) VALUES (@id,@json${values.length ? ','+values.join(',') : ''});`);
  if (col === 'residents') {
    if (clean.dosageSchedule != null && !Array.isArray(clean.dosageSchedule)) fail('Invalid dosage schedule.');
    await (await req(tx)).input('id',sql.NVarChar(450),id).query('DELETE dbo.ResidentDosageSchedule WHERE ResidentId=@id');
    const seen = new Set();
    for (const d of clean.dosageSchedule || []) {
      if (!d || typeof d.id !== 'string' || !d.id || seen.has(d.id) || (id.length+d.id.length)*2>900) fail('Invalid or duplicate dose ID.');
      seen.add(d.id);
      const keys = { medicineId:'nvarchar(500)', medicineName:'nvarchar(500)', timeSlot:'nvarchar(50)', dosage:'nvarchar(max)', quantity:'decimal(19,4)', checkedToday:'bit', checkedBy:'nvarchar(500)', checkedAt:'datetimeoffset(3)' };
      const q = (await req(tx)).input('parent',sql.NVarChar(450),id).input('dose',sql.NVarChar(450),d.id).input('json',sql.NVarChar(sql.MAX),JSON.stringify(d));
      Object.entries(keys).forEach(([k,t],i)=>q.input(`d${i}`,sqlType(t),validateValue(d[k],t,k)));
      await q.query(`INSERT dbo.ResidentDosageSchedule (ResidentId,Id,SourceJson,${Object.keys(keys).map(k=>'['+k+']').join(',')}) VALUES (@parent,@dose,@json,${Object.keys(keys).map((_,i)=>'@d'+i).join(',')})`);
    }
  }
  if (col === 'behavior_logs') {
    await (await req(tx)).input('id',sql.NVarChar(450),id).query('DELETE dbo.BehaviorLogSideEffects WHERE BehaviorLogId=@id');
    if (!Array.isArray(clean.sideEffects || [])) fail('Invalid side effects.');
    for (const [i,e] of (clean.sideEffects || []).entries()) {
      if (id.length*2+4>900) fail('Side effect key too long.');
      await (await req(tx)).input('id',sql.NVarChar(450),id).input('n',sql.Int,i).input('e',sql.NVarChar(500),validateValue(e,'nvarchar(500)','sideEffect')).query('INSERT dbo.BehaviorLogSideEffects (BehaviorLogId,Ordinal,EffectKey) VALUES (@id,@n,@e)');
    }
  }
  return col === 'users' ? safeUser(clean) : clean;
}
export async function remove(col: string, id: string, tx: sql.Transaction) {
  if (!models[col]) fail('Unknown collection.');
  if (col === 'residents') await (await req(tx)).input('id',sql.NVarChar(450),id).query('DELETE dbo.ResidentDosageSchedule WHERE ResidentId=@id');
  if (col === 'behavior_logs') await (await req(tx)).input('id',sql.NVarChar(450),id).query('DELETE dbo.BehaviorLogSideEffects WHERE BehaviorLogId=@id');
  await (await req(tx)).input('id',sql.NVarChar(450),id).query(`DELETE dbo.[${models[col].table}] WHERE Id=@id`);
}
