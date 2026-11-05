// Genera apps/api/src/migrations.generated.ts a partir de apps/api/migrations/*.sql.
// Las migraciones quedan incrustadas en el código: no dependen de leer archivos en ejecución (serverless).
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(root, 'apps/api/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const body = files.map((f) => `  { name: ${JSON.stringify(f)}, sql: ${JSON.stringify(fs.readFileSync(path.join(dir, f), 'utf8'))} },`).join('\n');
const out = `// GENERADO por scripts/gen-migrations.mjs — no editar a mano (npm run migrations:gen).\nexport const MIGRATIONS: { name: string; sql: string }[] = [\n${body}\n];\n`;
const target = path.join(root, 'apps/api/src/migrations.generated.ts');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== out) { console.error('migrations.generated.ts desactualizado: ejecuta npm run migrations:gen'); process.exit(1); }
  console.log('migrations.generated.ts al día'); process.exit(0);
}
fs.writeFileSync(target, out);
console.log(`Generado con ${files.length} migraciones`);
