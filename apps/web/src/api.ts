export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code); }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any; try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message);
  return data as T;
}

export const api = {
  get: <T = any>(u: string) => call<T>('GET', u),
  post: <T = any>(u: string, b: unknown = {}) => call<T>('POST', u, b),
  patch: <T = any>(u: string, b: unknown = {}) => call<T>('PATCH', u, b),
  del: <T = any>(u: string) => call<T>('DELETE', u),
};

export const HOTEL_SLUG = 'zanzibar-boutique';
