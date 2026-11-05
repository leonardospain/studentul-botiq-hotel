import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, HOTEL_SLUG } from '../api';
import { DICTS, errText, fill, LANGS, LANG_NAMES, LOCALES, LangCtx, useLang, type Lang } from '../i18n/public';
import { addDays, fmtDate, getPath, go, money, moneyExact, nights, store, STANDALONE, useAsync } from '../util';

const S = `/api/public/${HOTEL_SLUG}`;
const ART = [['#2f8f83', '#9fd4b0'], ['#0f4c5c', '#3fa9b5'], ['#c98a3b', '#f0d9a5']];

function initialLang(): Lang {
  const saved = store('botiq_lang') as Lang | null;
  if (saved && LANGS.includes(saved)) return saved;
  const nav = (navigator.language || 'en').slice(0, 2) as Lang;
  return LANGS.includes(nav) ? nav : 'en';
}

export function PublicSite({ path }: { path: string }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = (l: Lang) => { setLangState(l); store('botiq_lang', l); };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = DICTS[lang];
  const route = path.split('?')[0];
  return (
    <LangCtx.Provider value={{ lang, t, setLang }}>
      <Header route={route} />
      <main>
        {route === '/' && <Home />}
        {route === '/rooms' && <RoomsPage />}
        {route === '/book' && <Book query={path.split('?')[1] ?? ''} />}
        {route === '/booking' && <Lookup />}
        {route === '/contact' && <Contact />}
      </main>
      <footer className="pub-foot"><div className="wrap">
        <div className="banner">{t.footer.demo}</div>
        {STANDALONE && <p className="muted" style={{ marginTop: 10, fontSize: '.85rem' }}>{t.footer.standalone}</p>}
        <p style={{ marginTop: 14 }}>© Zanzibar Boutique Hotel (demo) · <a href="#/admin">{t.footer.admin}</a></p>
      </div></footer>
    </LangCtx.Provider>
  );
}

function Header({ route }: { route: string }) {
  const { t, lang, setLang } = useLang();
  const items: [string, string][] = [['/', t.nav.home], ['/rooms', t.nav.rooms], ['/book', t.nav.book], ['/booking', t.nav.booking], ['/contact', t.nav.contact]];
  return (
    <header className="pub-head"><div className="wrap">
      <a className="brand" href="#/">Zanzibar Boutique Hotel<small>Paje · Zanzibar</small></a>
      <nav className="nav" aria-label="Main">
        {items.map(([p, label]) => <a key={p} href={`#${p}`} className={route === p ? 'on' : ''}>{label}</a>)}
        <select className="lang" aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
        </select>
      </nav>
    </div></header>
  );
}

function useHotel() { return useAsync(() => api.get(S), []); }

function RoomCard({ r, i }: { r: any; i: number }) {
  const { t, lang } = useLang();
  return (
    <article className="card">
      <div className="room-art" style={{ ['--c1' as any]: ART[i % 3][0], ['--c2' as any]: ART[i % 3][1] }} aria-hidden />
      <h3>{r.name}</h3>
      <p className="muted">{r.description_i18n?.[lang] ?? r.description_i18n?.en}</p>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{fill(t.rooms.up, { a: r.max_adults, c: r.max_children })}</p>
      <div className="opt">
        <div className="price"><small>{t.rooms.from} </small>{money(r.base_rate_cents, LOCALES[lang])}<small> / {t.rooms.night}</small></div>
        <a className="btn sm" href={`#/book?type=${r.id}`}>{t.rooms.book}</a>
      </div>
    </article>
  );
}

function Home() {
  const { t } = useLang();
  const { data } = useHotel();
  return (<>
    <section className="hero">
      <div className="wrap">
        <p className="kicker">{t.hero.kicker}</p>
        <h1>{t.hero.title}</h1>
        <div className="row"><a className="btn sun" href="#/book">{t.hero.cta}</a><a className="btn ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} href="#/rooms">{t.hero.more}</a></div>
      </div>
      <svg viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden><path d="M0 50c240-60 480 50 720 10s480-60 720 0v30H0z" fill="var(--sand)" /></svg>
    </section>
    <section className="section"><div className="wrap">
      <h2>{t.about.title}</h2><p className="muted" style={{ maxWidth: 680 }}>{t.about.text}</p>
      <div className="grid g3" style={{ marginTop: 24 }}>
        {t.highlights.map((h) => <div key={h.t} className="card"><h3>{h.t}</h3><p className="muted" style={{ margin: 0 }}>{h.d}</p></div>)}
      </div>
    </div></section>
    <section className="section alt"><div className="wrap">
      <h2>{t.rooms.title}</h2><p className="muted">{t.rooms.sub}</p>
      <div className="grid g3">{data?.room_types.map((r: any, i: number) => <RoomCard key={r.id} r={r} i={i} />)}</div>
    </div></section>
  </>);
}

function RoomsPage() {
  const { t } = useLang();
  const { data } = useHotel();
  return <section className="section"><div className="wrap">
    <h2>{t.rooms.title}</h2><p className="muted">{t.rooms.sub}</p>
    <div className="grid g3">{data?.room_types.map((r: any, i: number) => <RoomCard key={r.id} r={r} i={i} />)}</div>
  </div></section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label>{label}{children}</label>; }

function Book({ query }: { query: string }) {
  const hotel = useHotel();
  if (!hotel.data) return <section className="section"><div className="wrap">…</div></section>;
  return <BookInner query={query} today={hotel.data.today} />;
}

function BookInner({ query, today }: { query: string; today: string }) {
  const { t, lang } = useLang();
  const loc = LOCALES[lang];
  const preType = new URLSearchParams(query).get('type');
  const [ci, setCi] = useState(addDays(today, 14));
  const [co, setCo] = useState(addDays(today, 17));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [res, setRes] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<any>(null);
  const [g, setG] = useState({ full_name: '', email: '', phone: '', country: '', notes: '', terms: false, website: '' });
  const nn = nights(ci, co);

  async function search(e?: FormEvent) {
    e?.preventDefault(); setError(''); setBusy(true); setSel(null);
    try {
      setRes(await api.get(`${S}/availability?check_in=${ci}&check_out=${co}&adults=${adults}&children=${children}`));
      setStep(1);
    } catch (err) { setError(errText(t, err instanceof ApiError ? err.code : undefined)); setRes(null); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (preType) void search(); /* eslint-disable-next-line */ }, []);

  async function confirm(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      setDone(await api.post(`${S}/bookings`, {
        room_type_id: sel.room_type_id, check_in: ci, check_out: co, adults, children, language: lang,
        guest: { full_name: g.full_name, email: g.email, ...(g.phone ? { phone: g.phone } : {}), ...(g.country ? { country: g.country.toUpperCase() } : {}) },
        ...(g.notes ? { notes: g.notes } : {}), accept_terms: g.terms, website: g.website,
      }));
      setStep(3);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(errText(t, code));
      if (code === 'no_availability') { setStep(1); void search(); }
    } finally { setBusy(false); }
  }

  const steps = [t.book.search, t.book.details, t.done.title];
  return <section className="section"><div className="wrap" style={{ maxWidth: 820 }}>
    <h2>{t.book.title}</h2>
    <div className="steps">{steps.map((s, i) => <span key={s} className={step === i + 1 ? 'on' : ''}>{i + 1} · {s}</span>)}</div>
    <div className="banner" style={{ marginBottom: 16 }}>{t.book.simulated}</div>

    {step === 1 && <>
      <form className="card grid g2" onSubmit={search}>
        <Field label={t.book.checkIn}><input type="date" required min={today} value={ci} onChange={(e) => { setCi(e.target.value); if (e.target.value >= co) setCo(addDays(e.target.value, 1)); }} /></Field>
        <Field label={t.book.checkOut}><input type="date" required min={addDays(ci, 1)} value={co} onChange={(e) => setCo(e.target.value)} /></Field>
        <Field label={t.book.adults}><input type="number" min={1} max={6} value={adults} onChange={(e) => setAdults(+e.target.value)} /></Field>
        <Field label={t.book.children}><input type="number" min={0} max={4} value={children} onChange={(e) => setChildren(+e.target.value)} /></Field>
        <div style={{ alignSelf: 'end' }}><button className="btn" disabled={busy}>{busy ? t.book.processing : t.book.search}</button></div>
      </form>
      {error && <p className="err" role="alert">{error}</p>}
      {res && <div style={{ marginTop: 22 }}>
        <h3>{t.book.results}</h3>
        {res.room_types.length === 0 && <p className="muted">{t.book.none}</p>}
        <div className="grid">{res.room_types.map((r: any) => (
          <div key={r.room_type_id} className="card opt" style={r.room_type_id === preType ? { borderColor: 'var(--sea)' } : undefined}>
            <div><h3 style={{ margin: 0 }}>{r.name}</h3>
              <span className="muted">{r.nights === 1 ? t.book.nightN : fill(t.book.nightsN, { n: r.nights })}</span>
              {r.rooms_left < 3 && <div className="err" style={{ fontSize: '.85rem' }}>{fill(t.book.left, { n: r.rooms_left })}</div>}
            </div>
            <div className="row"><div className="price">{money(r.total_cents, loc)}</div>
              <button className="btn sm" onClick={() => { setSel(r); setStep(2); setError(''); }}>{t.book.select}</button></div>
          </div>))}
        </div>
      </div>}
    </>}

    {step === 2 && sel && <form className="card grid" onSubmit={confirm}>
      <h3>{t.book.summary}</h3>
      <dl className="kv"><dt>{sel.name}</dt><dd>{fmtDate(ci, loc)} → {fmtDate(co, loc)} · {nn} {nn === 1 ? t.night : t.nights}</dd>
        <dt>{t.book.total}</dt><dd>{moneyExact(sel.total_cents, loc)}</dd>
        <dt>{t.book.deposit}</dt><dd>{moneyExact(Math.ceil(sel.total_cents * 0.3), loc)}</dd>
        <dt>{t.book.balance}</dt><dd>{moneyExact(sel.total_cents - Math.ceil(sel.total_cents * 0.3), loc)}</dd></dl>
      <h3 style={{ marginTop: 10 }}>{t.book.details}</h3>
      <div className="grid g2">
        <Field label={t.book.name}><input required minLength={2} maxLength={120} autoComplete="name" value={g.full_name} onChange={(e) => setG({ ...g, full_name: e.target.value })} /></Field>
        <Field label={t.book.email}><input required type="email" autoComplete="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></Field>
        <Field label={t.book.phone}><input type="tel" autoComplete="tel" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} /></Field>
        <Field label={t.book.country}><input maxLength={2} autoComplete="country" value={g.country} onChange={(e) => setG({ ...g, country: e.target.value })} /></Field>
      </div>
      <Field label={t.book.notes}><textarea maxLength={500} value={g.notes} onChange={(e) => setG({ ...g, notes: e.target.value })} /></Field>
      <input className="sr" tabIndex={-1} autoComplete="off" aria-hidden name="website" value={g.website} onChange={(e) => setG({ ...g, website: e.target.value })} />
      <label className="check"><input type="checkbox" required checked={g.terms} onChange={(e) => setG({ ...g, terms: e.target.checked })} /><span>{t.book.terms}</span></label>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row"><button type="button" className="btn ghost" onClick={() => setStep(1)}>{t.book.back}</button><button className="btn sun" disabled={busy}>{busy ? t.book.processing : t.book.confirm}</button></div>
    </form>}

    {step === 3 && done && <div className="card grid">
      <h3>{t.done.title}</h3>
      <p style={{ margin: 0 }}>{t.done.text}</p>
      <div><span className="code" data-testid="code">{done.code}</span></div>
      <dl className="kv"><dt>{done.room_type}</dt><dd>{fmtDate(done.check_in, loc)} → {fmtDate(done.check_out, loc)}</dd>
        <dt>{t.book.total}</dt><dd>{moneyExact(done.total_cents, loc)}</dd>
        <dt>{t.book.deposit}</dt><dd>{moneyExact(done.deposit_cents, loc)}</dd>
        <dt>{t.book.balance}</dt><dd>{moneyExact(done.balance_cents, loc)}</dd></dl>
      <p className="muted">{t.done.save}</p><div className="banner">{t.done.simulated}</div>
      <div className="row"><a className="btn" href={`#/booking?code=${done.code}&email=${encodeURIComponent(g.email)}`}>{t.done.lookup}</a>
        <button className="btn ghost" onClick={() => { setDone(null); setStep(1); setRes(null); setG({ full_name: '', email: '', phone: '', country: '', notes: '', terms: false, website: '' }); }}>{t.done.again}</button></div>
    </div>}
  </div></section>;
}

function Lookup() {
  const { t, lang } = useLang();
  const loc = LOCALES[lang];
  const qs = new URLSearchParams(getPath().split('?')[1] ?? '');
  const [code, setCode] = useState(qs.get('code') ?? '');
  const [email, setEmail] = useState(qs.get('email') ?? '');
  const [r, setR] = useState<any>(null);
  const [error, setError] = useState('');
  async function find(e?: FormEvent) {
    e?.preventDefault(); setError(''); setR(null);
    try { setR(await api.get(`${S}/bookings/${encodeURIComponent(code.trim().toUpperCase())}?email=${encodeURIComponent(email.trim())}`)); }
    catch (err) { setError(err instanceof ApiError && err.status === 404 ? t.lookup.notFound : errText(t, err instanceof ApiError ? err.code : undefined)); }
  }
  useEffect(() => { if (qs.get('code') && qs.get('email')) void find(); /* eslint-disable-next-line */ }, []);
  return <section className="section"><div className="wrap" style={{ maxWidth: 640 }}>
    <h2>{t.lookup.title}</h2>
    <form className="card grid" onSubmit={find}>
      <Field label={t.lookup.code}><input required placeholder="BH-XXXXXX" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
      <Field label={t.lookup.email}><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <button className="btn">{t.lookup.find}</button>
    </form>
    {error && <p className="err" role="alert">{error}</p>}
    {r && <div className="card" style={{ marginTop: 16 }}><dl className="kv">
      <dt>{t.lookup.code}</dt><dd>{r.code}</dd><dt>{t.lookup.status}</dt><dd>{(t.status as any)[r.status]}</dd>
      <dt>{r.room_type}</dt><dd>{fmtDate(r.check_in, loc)} → {fmtDate(r.check_out, loc)}</dd>
      <dt>{t.book.total}</dt><dd>{moneyExact(r.total_cents, loc)}</dd><dt>{t.lookup.paid}</dt><dd>{moneyExact(r.paid_cents, loc)}</dd><dt>{t.lookup.balance}</dt><dd>{moneyExact(r.balance_cents, loc)}</dd>
    </dl></div>}
  </div></section>;
}

function Contact() {
  const { t } = useLang();
  const { data } = useHotel();
  return <section className="section"><div className="wrap" style={{ maxWidth: 680 }}>
    <h2>{t.contact.title}</h2><div className="card"><p>{t.contact.text}</p>
      <dl className="kv"><dt>Location</dt><dd>{data?.info?.location}</dd><dt>Email</dt><dd>{data?.info?.email}</dd><dt>Tel</dt><dd>{data?.info?.phone}</dd></dl></div>
  </div></section>;
}

export { go };
