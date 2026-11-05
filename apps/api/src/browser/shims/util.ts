export const promisify = (fn: (...a: any[]) => void) => (...args: any[]) =>
  new Promise((resolve, reject) => fn(...args, (e: unknown, v: unknown) => (e ? reject(e) : resolve(v))));
export default { promisify };
