// Solo se incluye en la compilación autónoma (vite.demo.config.ts). Sustituye fetch('/api/...') por la API embebida.
import { bootBrowserApi } from '../../../api/src/browser/boot';

declare const __DEMO_PASSWORD__: string;

export async function bootDemo() {
  const handle = await bootBrowserApi(__DEMO_PASSWORD__);
  const jar = new Map<string, string>();
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
    if (!raw.startsWith('/api/')) return realFetch(input, init);
    const headers: Record<string, string> = { origin: location.origin, host: location.host };
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    const r = await handle({ method: init?.method ?? 'GET', url: raw, headers, body: typeof init?.body === 'string' ? init.body : undefined });
    for (const c of r.cookies) { if (c.clear) jar.delete(c.name); else jar.set(c.name, c.value); }
    return new Response(r.body || null, { status: r.status, headers: r.headers });
  };
}
