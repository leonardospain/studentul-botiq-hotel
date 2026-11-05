// node:fs / node:path / node:url: solo se importan para la ejecución por línea de comandos, que aquí nunca se usa.
export const fileURLToPath = (u: string) => u;
export const resolve = (...p: string[]) => p.join('/');
export const join = (...p: string[]) => p.join('/');
export const dirname = (p: string) => p;
export const existsSync = () => false;
export const readFileSync = () => '';
export const readdirSync = () => [] as string[];
export default { fileURLToPath, resolve, join, dirname, existsSync, readFileSync, readdirSync };
