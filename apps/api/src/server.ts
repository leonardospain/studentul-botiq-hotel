import { buildApp } from './app.js';
import { config } from './config.js';

const app = await buildApp();
await app.listen({ port: config.port, host: '127.0.0.1' }); // solo local; no se expone públicamente
console.log(`API escuchando en http://127.0.0.1:${config.port}`);
