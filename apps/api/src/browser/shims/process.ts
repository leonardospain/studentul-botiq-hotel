// `process` y `Buffer` mínimos para el navegador; debe importarse ANTES que cualquier módulo de la API.
import { Buffer } from './crypto.js';
const g = globalThis as any;
g.process ??= { env: {}, argv: [], platform: 'browser', versions: {}, cwd: () => '/', nextTick: (f: () => void) => queueMicrotask(f) };
g.process.env ??= {};
g.__BOTIQ_ENV__ ??= g.process.env; // el empaquetador redirige `process.env` aquí
g.Buffer ??= Buffer;
export {};
