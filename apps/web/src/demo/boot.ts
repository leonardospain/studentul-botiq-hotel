// Solo se incluye en la compilación autónoma (vite.demo.config.ts). Sustituye fetch('/api/...') por un motor de datos en JavaScript
// puro (sin WebAssembly, porque las páginas de claude.ai lo bloquean). Ver mock-api.ts.
import { createMockApi } from './mock-api';

declare const __DEMO_PASSWORD__: string;

export async function bootDemo() {
  const handle = createMockApi(__DEMO_PASSWORD__);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
    if (!raw.startsWith('/api/')) return realFetch(input, init);
    const r = await handle({ method: init?.method ?? 'GET', url: raw, headers: {}, body: typeof init?.body === 'string' ? init.body : undefined });
    return new Response(r.body || null, { status: r.status, headers: r.headers });
  };
}
