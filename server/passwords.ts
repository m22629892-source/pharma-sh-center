import { randomBytes, scrypt as rawScrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(rawScrypt);
export async function passwordHash(password: string) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new Error('Password must contain 10–200 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function passwordMatches(password: string, encoded: string) {
  if (typeof password !== 'string' || password.length > 200 || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded || '')) return false;
  const [, salt, expected] = encoded.split('$');
  const key = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
export const tokenHash = (s: string) => createHash('sha256').update(s).digest('hex');
