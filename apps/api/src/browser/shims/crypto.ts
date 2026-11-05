// Sustituto de node:crypto en el navegador (solo lo que usa la API): randomBytes, createHash('sha256'), scrypt, timingSafeEqual.
import { sha256 } from '@noble/hashes/sha2.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

const toBuf = (u: Uint8Array): any => Object.assign(u as any, {
  toString(enc?: string) {
    if (enc === 'hex') return Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('');
    if (enc === 'base64' || enc === 'base64url') {
      let s = ''; u.forEach((b) => { s += String.fromCharCode(b); });
      const b64 = btoa(s);
      return enc === 'base64url' ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
    }
    return new TextDecoder().decode(u);
  },
});
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const Buffer = {
  from(v: string | Uint8Array, enc?: string) {
    if (typeof v === 'string') return toBuf(enc === 'base64' || enc === 'base64url' ? fromB64(v) : new TextEncoder().encode(v));
    return toBuf(Uint8Array.from(v));
  },
  alloc: (n: number) => toBuf(new Uint8Array(n)),
};
export const randomBytes = (n: number) => toBuf(crypto.getRandomValues(new Uint8Array(n)));
export const createHash = (_alg: string) => {
  let data: Uint8Array = new Uint8Array();
  const api = { update(s: string | Uint8Array) { data = typeof s === 'string' ? new TextEncoder().encode(s) : s; return api; }, digest: (enc?: string) => { const d = toBuf(sha256(data)); return enc ? d.toString(enc) : d; } };
  return api;
};
export const timingSafeEqual = (a: Uint8Array, b: Uint8Array) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
// Versión con callback para que promisify() funcione igual que en Node.
export function scrypt(password: string, salt: Uint8Array, keylen: number, opts: { N: number; r: number; p: number }, cb: (e: Error | null, k?: Uint8Array) => void) {
  scryptAsync(password, salt, { N: opts.N, r: opts.r, p: opts.p, dkLen: keylen, asyncTick: 10 }).then((k: Uint8Array) => cb(null, toBuf(k)), (e: Error) => cb(e));
}
export type ScryptOptions = { N: number; r: number; p: number };
export default { randomBytes, createHash, timingSafeEqual, scrypt };
