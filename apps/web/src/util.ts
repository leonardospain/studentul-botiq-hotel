import { useEffect, useState, useSyncExternalStore } from 'react';

export const money = (cents: number, locale = 'en') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

export const moneyExact = (cents: number, locale = 'en') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);

export const fmtDate = (iso: string, locale = 'en', opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const nights = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function store(key: string, value?: string): string | null {
  try { if (value !== undefined) localStorage.setItem(key, value); return localStorage.getItem(key); } catch { return null; }
}

/** Router mínimo. Ruta interna sincronizada con #/ruta; en la demo autónoma no depende del hash del navegador. */
declare const __STANDALONE__: boolean;
export const STANDALONE = typeof __STANDALONE__ !== 'undefined' && __STANDALONE__;

const fromHash = () => (location.hash.startsWith('#/') ? location.hash.slice(1) : '/');
let current = typeof location !== 'undefined' ? fromHash() : '/';
const listeners = new Set<() => void>();
function setPath(p: string) {
  if (p === current) return;
  current = p;
  listeners.forEach((f) => f());
  window.scrollTo(0, 0);
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => setPath(fromHash()));
  if (STANDALONE) {
    // Sin depender del hash: los enlaces internos (#/ruta) cambian la ruta interna.
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
      if (a && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setPath(a.getAttribute('href')!.slice(1)); }
    }, true);
  }
}
export const getPath = () => current;
export function useHash(): string {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current);
}
export const go = (path: string) => { if (STANDALONE) setPath(path); else location.hash = path; };

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, set] = useState<{ data?: T; error?: any; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true }));
    fn().then((data) => alive && set({ data, loading: false })).catch((error) => alive && set({ error, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
