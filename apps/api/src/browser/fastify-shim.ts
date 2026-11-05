// Adaptador mínimo con la parte de la API de Fastify que usan las rutas, para ejecutarlas en el navegador
// (demo estática sin servidor). Misma lógica de negocio y mismas consultas SQL que el servidor real.
type Hook = (req: any, reply: any) => unknown;
type Handler = (req: any, reply: any) => unknown;
interface Scope { parent?: Scope; prefix: string; hooks: { onRequest: Hook[]; preHandler: Hook[]; onSend: Hook[] } }
interface Route { method: string; re: RegExp; keys: string[]; scope: Scope; pre: Hook[]; handler: Handler }
export interface ShimRequest { method: string; url: string; headers: Record<string, string>; body?: string }
export interface ShimResponse { status: number; headers: Record<string, string>; body: string; cookies: { name: string; value: string; clear: boolean }[] }

const compile = (path: string) => {
  const keys: string[] = [];
  const src = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?:(\w+)/g, (_m, k) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp(`^${src}/?$`), keys };
};

export function createShimApp() {
  const routes: Route[] = [];
  const root: Scope = { prefix: '', hooks: { onRequest: [], preHandler: [], onSend: [] } };
  let errorHandler: (err: any, req: any, reply: any) => unknown = (err, _r, reply) => reply.status(500).send({ error: 'internal', message: String(err) });

  const facade = (scope: Scope): any => {
    const add = (method: string) => (path: string, a: any, b?: any) => {
      const opts = typeof a === 'function' ? {} : a ?? {};
      const handler: Handler = typeof a === 'function' ? a : b;
      const pre: Hook[] = ([] as Hook[]).concat(opts.preHandler ?? []);
      const { re, keys } = compile(scope.prefix + path);
      routes.push({ method, re, keys, scope, pre, handler });
    };
    return {
      decorateRequest() { /* las propiedades se asignan directamente */ },
      addHook(name: keyof Scope['hooks'], fn: Hook) { scope.hooks[name].push(fn); },
      setErrorHandler(fn: typeof errorHandler) { errorHandler = fn; },
      async register(plugin: (app: any, opts: any) => unknown, opts: { prefix?: string } = {}) {
        const child: Scope = { parent: scope, prefix: scope.prefix + (opts.prefix ?? ''), hooks: { onRequest: [], preHandler: [], onSend: [] } };
        await plugin(facade(child), opts);
      },
      get: add('GET'), post: add('POST'), patch: add('PATCH'), put: add('PUT'), delete: add('DELETE'),
    };
  };

  const chain = (s: Scope): Scope[] => (s.parent ? [...chain(s.parent), s] : [s]);

  async function handle(r: ShimRequest): Promise<ShimResponse> {
    const u = new URL(r.url, 'http://local');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.headers)) headers[k.toLowerCase()] = v;
    const cookies: Record<string, string> = {};
    for (const part of (headers.cookie ?? '').split(';')) { const i = part.indexOf('='); if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
    const query: Record<string, string> = {};
    u.searchParams.forEach((v, k) => { query[k] = v; });
    let body: unknown = r.body;
    if (typeof r.body === 'string' && r.body) { try { body = JSON.parse(r.body); } catch { body = undefined; } }

    const out = { status: 200, headers: {} as Record<string, string>, payload: undefined as unknown, sent: false, cookies: [] as ShimResponse['cookies'] };
    const reply: any = {
      status(n: number) { out.status = n; return reply; },
      code(n: number) { out.status = n; return reply; },
      header(k: string, v: string) { out.headers[k.toLowerCase()] = v; return reply; },
      send(p?: unknown) { out.payload = p; out.sent = true; return reply; },
      setCookie(name: string, value: string) { out.cookies.push({ name, value, clear: false }); return reply; },
      clearCookie(name: string) { out.cookies.push({ name, value: '', clear: true }); return reply; },
    };
    const req: any = { method: r.method.toUpperCase(), url: r.url, headers, query, body, cookies, params: {}, ip: '127.0.0.1', user: null, hotel: null };

    const route = routes.find((rt) => {
      if (rt.method !== req.method) return false;
      const m = rt.re.exec(u.pathname);
      if (!m) return false;
      rt.keys.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); });
      return true;
    });
    const scopes = route ? chain(route.scope) : [root];

    try {
      if (!route) { reply.status(404).send({ error: 'not_found' }); }
      else {
        for (const s of scopes) { for (const h of s.hooks.onRequest) { await h(req, reply); if (out.sent) break; } if (out.sent) break; }
        if (!out.sent) for (const s of scopes) { for (const h of s.hooks.preHandler) { await h(req, reply); if (out.sent) break; } if (out.sent) break; }
        if (!out.sent) for (const h of route.pre) { await h(req, reply); if (out.sent) break; }
        if (!out.sent) { const v = await route.handler(req, reply); if (!out.sent) { out.payload = v; out.sent = true; } }
      }
    } catch (err) {
      out.sent = false; out.payload = undefined; out.cookies = [];
      await errorHandler(err, req, reply);
    }
    for (const s of scopes) for (const h of s.hooks.onSend) await h(req, reply);
    out.headers['content-type'] = 'application/json; charset=utf-8';
    return { status: out.status, headers: out.headers, body: out.payload === undefined ? '' : JSON.stringify(out.payload), cookies: out.cookies };
  }

  return Object.assign(facade(root), { handle });
}
