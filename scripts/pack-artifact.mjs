// Prepara la demo autónoma (apps/web/dist-demo) para publicarla como página de claude.ai:
// esa plataforma solo sirve ciertas extensiones, así que .data y .gz se renombran a .wasm y se reescriben sus referencias.
// Uso: node scripts/pack-artifact.mjs <carpeta-de-salida>
import fs from 'node:fs';
import path from 'node:path';
const src = path.resolve('apps/web/dist-demo');
const out = path.resolve(process.argv[2] ?? 'artifact-pack');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
const assets = path.join(out, 'assets');
const renames = new Map();
for (const f of fs.readdirSync(assets)) if (/\.(data|gz)$/.test(f)) { renames.set(f, `${f}.wasm`); fs.renameSync(path.join(assets, f), path.join(assets, `${f}.wasm`)); }
for (const f of fs.readdirSync(assets).filter((x) => x.endsWith('.js'))) {
  let s = fs.readFileSync(path.join(assets, f), 'utf8'); let changed = false;
  for (const [from, to] of renames) if (s.includes(from) && !s.includes(to)) { s = s.split(from).join(to); changed = true; }
  if (changed) fs.writeFileSync(path.join(assets, f), s);
}
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
fs.writeFileSync(path.join(out, 'index.html'), `<title>Zanzibar Boutique Hotel</title>\n<link rel="stylesheet" href="${css}">\n<div id="root"></div>\n<noscript>Esta demostración necesita JavaScript.</noscript>\n<script type="module" src="${js}"></script>\n`);
const files = fs.readdirSync(assets).map((f) => ({ path: `assets/${f}` }));
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(files));
console.log(`Listo en ${out}: ${files.length} archivos; renombrados: ${[...renames.keys()].join(', ')}`);
