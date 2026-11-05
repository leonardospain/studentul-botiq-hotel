import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api';
import { addDays, go, nights, STANDALONE, useAsync } from '../util';
declare const __DEMO_PASSWORD__: string;
import { errRo, ERR, EXTRA, fmtD, HK, METHOD, ROLE, ROOM_STATUS, SOURCE, STATUS, usd } from './ro';

type Ctx = { hid: string; me: any; can: (p: string) => boolean; toast: (m: string, bad?: boolean) => void; h: (p: string) => string };
const HotelCtx = createContext<Ctx>(null as any);
const useH = () => useContext(HotelCtx);
const msg = (e: unknown) => (e instanceof ApiError ? errRo(e.code, e.message) : 'A apărut o eroare.');

export function AdminApp({ path }: { path: string }) {
  const session = useAsync(() => api.get('/api/auth/me').catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e; }), []);
  if (session.loading) return <div className="login"><div className="card">Se încarcă…</div></div>;
  if (!session.data) return <Login onDone={session.reload} />;
  return <Shell path={path} session={session.data} reload={session.reload} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.post('/api/auth/login', { email, password }); onDone(); } catch (err) { setError(msg(err)); } finally { setBusy(false); }
  }
  return <div className="login"><form className="card grid" onSubmit={submit}>
    <div><div className="brand" style={{ color: 'var(--ink)' }}>Zanzibar Boutique Hotel<small>Panou de administrare</small></div></div>
    <div className="banner">Versiune demo: date fictive, plăți simulate.</div>
    <label>Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
    <label>Parolă<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    {error && <div className="err" role="alert">{error}</div>}
    <button className="btn" disabled={busy}>{busy ? 'Se verifică…' : 'Autentificare'}</button>
    {STANDALONE && <div className="grid" style={{ gap: 8 }}>
      <b style={{ fontSize: '.85rem' }}>Acces rapid (demo)</b>
      {([['owner@zanzibar.test', 'Proprietar'], ['manager@zanzibar.test', 'Manager'], ['reception@zanzibar.test', 'Recepție'], ['housekeeping@zanzibar.test', 'Cameristă'], ['accounting@zanzibar.test', 'Contabil'], ['platform@botiq.test', 'Administrator platformă']] as const).map(([em, label]) =>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api.post('/api/auth/login', { email: em, password: __DEMO_PASSWORD__ }); onDone(); } catch (err) { setError(msg(err)); } finally { setBusy(false); } }}>{label} · {em}</button>)}
    </div>}
    <a href="#/" className="muted" style={{ textAlign: 'center' }}>← Înapoi la site</a>
  </form></div>;
}

const NAV: [string, string, string][] = [
  ['/admin', 'Panou', 'reservations:read'], ['/admin/reservations', 'Rezervări', 'reservations:read'], ['/admin/rooms', 'Camere', 'rooms:read'],
  ['/admin/guests', 'Oaspeți', 'guests:read'], ['/admin/payments', 'Plăți', 'payments:read'], ['/admin/rates', 'Tarife', 'rooms:read'],
  ['/admin/reports', 'Rapoarte', 'reports:read'], ['/admin/staff', 'Personal', 'staff:manage'],
];
const SOON = ['Contabilitate', 'Personal și ture', 'Curățenie (sarcini)', 'Stocuri'];

function Shell({ path, session, reload }: { path: string; session: any; reload: () => void }) {
  const route = path.split('?')[0];
  const memberships: any[] = session.memberships;
  const [hid, setHid] = useState<string>(memberships[0]?.hotel_id ?? '');
  const [open, setOpen] = useState(false);
  const [toastMsg, setToast] = useState<{ m: string; bad?: boolean } | null>(null);
  const toast = (m: string, bad?: boolean) => { setToast({ m, bad }); setTimeout(() => setToast(null), 3500); };
  const platform = session.user.isPlatformAdmin;
  const hotels = useAsync(() => (platform ? api.get('/api/platform/hotels') : Promise.resolve([])), []);
  useEffect(() => { if (!hid && hotels.data?.length) setHid(hotels.data[0].id); }, [hotels.data, hid]);
  useEffect(() => setOpen(false), [route]);
  const me = useAsync(() => (hid ? api.get(`/api/h/${hid}/me`) : Promise.resolve(null)), [hid]);

  async function logout() { await api.post('/api/auth/logout'); reload(); go('/admin'); }
  const perms: string[] = me.data?.permissions ?? [];
  const ctx: Ctx = { hid, me: me.data, can: (p) => perms.includes(p), toast, h: (p) => `/api/h/${hid}${p}` };
  const options = platform ? (hotels.data ?? []).map((x: any) => ({ id: x.id, name: x.name })) : memberships.map((m) => ({ id: m.hotel_id, name: m.name }));

  return <HotelCtx.Provider value={ctx}><div className="adm">
    <aside className={`side ${open ? 'open' : ''}`}>
      <a className="brand" href="#/admin">Zanzibar Boutique<small>Back office · RO</small></a>
      {NAV.filter(([, , p]) => ctx.can(p)).map(([to, label]) => <a key={to} href={`#${to}`} className={route === to ? 'on' : ''}>{label}</a>)}
      {platform && <><h4>Platformă</h4><a href="#/admin/platform" className={route === '/admin/platform' ? 'on' : ''}>Hoteluri și planuri</a></>}
      <h4>În curând</h4>{SOON.map((s) => <div key={s} className="soon">{s}<i>în curând</i></div>)}
      <h4>Cont</h4><a href="#/" >Site public</a><a href="#/admin" onClick={(e) => { e.preventDefault(); void logout(); }}>Ieșire</a>
    </aside>
    <div className="main">
      <div className="topbar">
        <div className="row"><button className="btn ghost sm menu-btn" onClick={() => setOpen(!open)} aria-label="Meniu">☰</button>
          <select aria-label="Hotel" value={hid} onChange={(e) => setHid(e.target.value)} style={{ width: 'auto' }}>
            {options.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          {me.data && <span className="badge">{ROLE[me.data.role] ?? me.data.role}{platform ? ' · platformă' : ''}</span>}</div>
        <span className="muted">{session.user.fullName}</span>
      </div>
      {me.error && <p className="err">{msg(me.error)}</p>}
      {!hid && !platform && <p>Nu ai acces la niciun hotel.</p>}
      {me.data && <Page route={route} key={hid} />}
      {route === '/admin/platform' && platform && <Platform />}
    </div>
    {toastMsg && <div className={`toast ${toastMsg.bad ? 'bad' : ''}`} role="status">{toastMsg.m}</div>}
  </div></HotelCtx.Provider>;
}

function Page({ route }: { route: string }) {
  const { can } = useH();
  switch (route) {
    case '/admin': return can('reservations:read') ? <Dashboard /> : <p>Bun venit.</p>;
    case '/admin/reservations': return <Reservations />;
    case '/admin/rooms': return <Rooms />;
    case '/admin/guests': return <Guests />;
    case '/admin/payments': return <Payments />;
    case '/admin/rates': return <Rates />;
    case '/admin/reports': return <Reports />;
    case '/admin/staff': return <Staff />;
    default: return null;
  }
}

const Title = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="topbar"><h1>{children}</h1><div className="row">{right}</div></div>;
const Badge = ({ k, map }: { k: string; map: Record<string, string> }) => <span className={`badge ${k}`}>{map[k] ?? k}</span>;
const Table = ({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) => (
  <div className="tbl-wrap"><table><thead><tr>{head.map((h, i) => <th key={i} className={h.startsWith('#') ? 'num' : ''}>{h.replace(/^#/, '')}</th>)}</tr></thead><tbody>{children}</tbody></table>{empty && <p className="muted" style={{ padding: 14, margin: 0 }}>Nu există înregistrări.</p>}</div>
);

/* ---------- Panou ---------- */
function Dashboard() {
  const { h, can, toast, me } = useH();
  const fd = useAsync(() => api.get(h('/frontdesk')), []);
  const today = fd.data?.today ?? me.hotel.today;
  const occ = useAsync(() => (can('reports:read') ? api.get(h(`/reports/occupancy?from=${today}&to=${addDays(today, 7)}`)) : Promise.resolve(null)), [today]);
  const rev = useAsync(() => (can('reports:read') ? api.get(h(`/reports/revenue?from=${today}&to=${today}`)) : Promise.resolve(null)), [today]);
  const [open, setOpen] = useState<string | null>(null);
  async function act(id: string, what: 'check-in' | 'check-out') {
    try { await api.post(h(`/reservations/${id}/${what}`)); toast(what === 'check-in' ? 'Check-in efectuat' : 'Check-out efectuat'); fd.reload(); }
    catch (e) { toast(msg(e), true); }
  }
  if (!fd.data) return <p>Se încarcă…</p>;
  const d = fd.data;
  return <>
    <Title>Panou de control</Title>
    <div className="stats">
      <div className="stat"><b>{d.arrivals.length}</b><span>Sosiri azi</span></div>
      <div className="stat"><b>{d.departures.length}</b><span>Plecări azi</span></div>
      <div className="stat"><b>{d.in_house.length}</b><span>Oaspeți cazați</span></div>
      {occ.data && <div className="stat"><b>{occ.data.days[0]?.occupancy_pct ?? 0}%</b><span>Ocupare azi ({occ.data.days[0]?.occupied}/{occ.data.days[0]?.rooms})</span></div>}
      {rev.data && <div className="stat"><b>{usd(rev.data.collected_cents)}</b><span>Încasat azi (simulat)</span></div>}
    </div>
    <div className="grid g2">
      <div><h3>Sosiri · {fmtD(d.today)}</h3><Table head={['Cod', 'Oaspete', 'Cameră', '']} empty={!d.arrivals.length}>
        {d.arrivals.map((r: any) => <tr key={r.id}><td><a href="#/admin/reservations" onClick={() => setOpen(r.id)}>{r.code}</a></td><td>{r.guest_name}</td><td>{r.room_number}</td>
          <td>{can('reservations:write') && <button className="btn sm" onClick={() => act(r.id, 'check-in')}>Check-in</button>}</td></tr>)}</Table></div>
      <div><h3>Plecări</h3><Table head={['Cod', 'Oaspete', 'Cameră', '#Sold', '']} empty={!d.departures.length}>
        {d.departures.map((r: any) => <tr key={r.id}><td><a href="#/admin/reservations" onClick={() => setOpen(r.id)}>{r.code}</a></td><td>{r.guest_name}</td><td>{r.room_number}</td><td className="num">{usd(r.total_cents + r.extras_cents - r.paid_cents)}</td>
          <td>{can('reservations:write') && <button className="btn sm" onClick={() => act(r.id, 'check-out')}>Check-out</button>}</td></tr>)}</Table></div>
    </div>
    <h3 style={{ marginTop: 22 }}>Cazați acum</h3>
    <Table head={['Cod', 'Oaspete', 'Cameră', 'Plecare']} empty={!d.in_house.length}>
      {d.in_house.map((r: any) => <tr key={r.id}><td>{r.code}</td><td>{r.guest_name}</td><td>{r.room_number}</td><td>{fmtD(r.check_out)}</td></tr>)}</Table>
    {open && <Detail id={open} onClose={() => { setOpen(null); fd.reload(); }} />}
  </>;
}

/* ---------- Rezervări ---------- */
function Reservations() {
  const { h, can } = useH();
  const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const list = useAsync(() => api.get(h(`/reservations?${status ? `status=${status}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`)), [status, q]);
  const [open, setOpen] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  return <>
    <Title right={can('reservations:write') && <button className="btn" onClick={() => setCreating(true)}>+ Rezervare nouă</button>}>Rezervări</Title>
    <div className="row" style={{ marginBottom: 12 }}>
      <input style={{ maxWidth: 260 }} placeholder="Caută cod sau oaspete" value={q} onChange={(e) => setQ(e.target.value)} />
      <select style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stare">
        <option value="">Toate stările</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    </div>
    <Table head={['Cod', 'Oaspete', 'Cameră', 'Sosire', 'Plecare', 'Stare', 'Sursă', '#Total', '#Sold']} empty={list.data && !list.data.length}>
      {list.data?.map((r: any) => <tr key={r.id} className="click" onClick={() => setOpen(r.id)}>
        <td><b>{r.code}</b></td><td>{r.guest_name}</td><td>{r.room_number} · {r.room_type_name}</td><td>{fmtD(r.check_in)}</td><td>{fmtD(r.check_out)}</td>
        <td><Badge k={r.status} map={STATUS} /></td><td>{SOURCE[r.source]}</td><td className="num">{usd(r.total_cents + r.extras_cents)}</td><td className="num">{usd(r.total_cents + r.extras_cents - r.paid_cents)}</td></tr>)}</Table>
    {open && <Detail id={open} onClose={() => { setOpen(null); list.reload(); }} />}
    {creating && <NewReservation onClose={(id) => { setCreating(false); list.reload(); if (id) setOpen(id); }} />}
  </>;
}

function Drawer({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="drawer-bg" onClick={(e) => e.target === e.currentTarget && onClose()}><aside className="drawer" role="dialog" aria-modal>
    <div className="topbar"><h2 style={{ margin: 0 }}>{title}</h2><button className="btn ghost sm" onClick={onClose}>Închide</button></div>{children}</aside></div>;
}

function NewReservation({ onClose }: { onClose: (id?: string) => void }) {
  const { h, toast, me } = useH(); const todayIso = () => me.hotel.today as string;
  const types = useAsync(() => api.get(h('/room-types')), []);
  const [f, setF] = useState({ full_name: '', email: '', phone: '', room_type_id: '', check_in: addDays(todayIso(), 1), check_out: addDays(todayIso(), 3), adults: 2, children: 0, source: 'direct', notes: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api.post(h('/reservations'), { guest: { full_name: f.full_name, ...(f.email ? { email: f.email } : {}), ...(f.phone ? { phone: f.phone } : {}) },
        room_type_id: f.room_type_id || types.data[0].id, check_in: f.check_in, check_out: f.check_out, adults: f.adults, children: f.children, source: f.source, ...(f.notes ? { notes: f.notes } : {}) });
      toast(`Rezervare ${r.code} creată`); onClose(r.id);
    } catch (err) { setError(msg(err)); } finally { setBusy(false); }
  }
  return <Drawer title="Rezervare nouă" onClose={() => onClose()}><form className="grid" onSubmit={submit}>
    <label>Nume oaspete<input required minLength={2} value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></label>
    <div className="grid g2"><label>Email<input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label><label>Telefon<input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label></div>
    <label>Tip cameră<select value={f.room_type_id || types.data?.[0]?.id || ''} onChange={(e) => set('room_type_id', e.target.value)}>{types.data?.map((t: any) => <option key={t.id} value={t.id}>{t.name} — {usd(t.base_rate_cents)}/noapte</option>)}</select></label>
    <div className="grid g2"><label>Sosire<input type="date" required min={todayIso()} value={f.check_in} onChange={(e) => set('check_in', e.target.value)} /></label><label>Plecare<input type="date" required min={addDays(f.check_in, 1)} value={f.check_out} onChange={(e) => set('check_out', e.target.value)} /></label></div>
    <div className="grid g2"><label>Adulți<input type="number" min={1} max={6} value={f.adults} onChange={(e) => set('adults', +e.target.value)} /></label><label>Copii<input type="number" min={0} max={4} value={f.children} onChange={(e) => set('children', +e.target.value)} /></label></div>
    <label>Sursă<select value={f.source} onChange={(e) => set('source', e.target.value)}>{Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>Observații<textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></label>
    {error && <div className="err" role="alert">{error}</div>}
    <button className="btn" disabled={busy}>{busy ? 'Se creează…' : 'Creează rezervarea'}</button>
  </form></Drawer>;
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { h, can, toast, me } = useH();
  const r = useAsync(() => api.get(h(`/reservations/${id}`)), [id]);
  const [dates, setDates] = useState<{ ci: string; co: string } | null>(null);
  const [pay, setPay] = useState({ amount: '', method: 'cash', kind: 'payment' });
  const [extra, setExtra] = useState({ kind: 'excursion', description: '', quantity: 1, price: '' });
  const [allow, setAllow] = useState(false);
  const [freeRooms, setFreeRooms] = useState<any[] | null>(null);
  const d = r.data;
  async function run(fn: () => Promise<any>, ok: string) { try { await fn(); toast(ok); r.reload(); } catch (e) { toast(msg(e), true); } }
  const post = (p: string, b?: unknown) => api.post(h(`/reservations/${id}${p}`), b ?? {});
  if (!d) return <Drawer title="Rezervare" onClose={onClose}>{r.error ? <p className="err">{msg(r.error)}</p> : <p>Se încarcă…</p>}</Drawer>;
  const canW = can('reservations:write'); const editable = ['pending', 'confirmed'].includes(d.status);
  const toCents = (v: string) => Math.round(parseFloat(v.replace(',', '.')) * 100);
  async function loadRooms() {
    const a = await api.get(h(`/availability?check_in=${d.check_in}&check_out=${d.check_out}&adults=1`));
    setFreeRooms(a.room_types.find((t: any) => t.room_type_id === d.room_type_id)?.rooms ?? []);
  }
  return <Drawer title={<>{d.code} <Badge k={d.status} map={STATUS} /></>} onClose={onClose}>
    <dl className="kv">
      <dt>Oaspete</dt><dd>{d.guest_name}</dd><dt>Contact</dt><dd>{d.guest_email ?? d.guest_phone ?? '—'}</dd>
      <dt>Cameră</dt><dd>{d.room_number} · {d.room_type_name}</dd>
      <dt>Perioadă</dt><dd>{fmtD(d.check_in)} → {fmtD(d.check_out)} ({nights(d.check_in, d.check_out)} nopți)</dd>
      <dt>Persoane</dt><dd>{d.adults} adulți, {d.children} copii</dd><dt>Sursă</dt><dd>{SOURCE[d.source]}</dd>
      <dt>Cazare</dt><dd>{usd(d.total_cents)}</dd><dt>Extra</dt><dd>{usd(d.extras_cents)}</dd><dt>Plătit (simulat)</dt><dd>{usd(d.paid_cents)}</dd><dt>Sold</dt><dd style={{ color: d.balance_cents > 0 ? 'var(--bad)' : 'var(--ok)' }}>{usd(d.balance_cents)}</dd>
    </dl>
    {d.notes && <p className="muted">Notă: {d.notes}</p>}

    {canW && <div className="row" style={{ margin: '14px 0' }}>
      {d.status === 'confirmed' && <button className="btn" onClick={() => run(() => post('/check-in'), 'Check-in efectuat')}>Check-in</button>}
      {d.status === 'checked_in' && <><button className="btn" onClick={() => run(() => post('/check-out', { allow_balance: allow }), 'Check-out efectuat')}>Check-out</button>
        {can('reservations:override') && d.balance_cents > 0 && <label className="check"><input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />Permite sold</label>}</>}
      {editable && <button className="btn danger" onClick={() => confirm('Anulezi rezervarea?') && run(() => post('/cancel', {}), 'Rezervare anulată')}>Anulează</button>}
    </div>}

    {canW && (editable || d.status === 'checked_in') && <details style={{ marginBottom: 12 }}><summary><b>Schimbă datele</b></summary>
      <div className="row" style={{ marginTop: 8 }}>
        <input type="date" disabled={d.status === 'checked_in'} value={dates?.ci ?? d.check_in} onChange={(e) => setDates({ ci: e.target.value, co: dates?.co ?? d.check_out })} style={{ width: 'auto' }} />
        <input type="date" value={dates?.co ?? d.check_out} onChange={(e) => setDates({ ci: dates?.ci ?? d.check_in, co: e.target.value })} style={{ width: 'auto' }} />
        <button className="btn sm" onClick={() => run(() => api.patch(h(`/reservations/${id}`), { check_in: dates?.ci ?? d.check_in, check_out: dates?.co ?? d.check_out }), 'Date actualizate')}>Salvează</button></div></details>}

    {canW && editable && <details style={{ marginBottom: 12 }} onToggle={(e) => (e.target as HTMLDetailsElement).open && loadRooms()}><summary><b>Alocă altă cameră</b></summary>
      <div className="row" style={{ marginTop: 8 }}>{freeRooms === null ? 'Se încarcă…' : freeRooms.length === 0 ? <span className="muted">Nu există alte camere libere de acest tip.</span> :
        freeRooms.map((x) => <button key={x.id} className="btn sm ghost" onClick={() => run(() => post('/assign-room', { room_id: x.id }), `Mutată în camera ${x.number}`)}>{x.number}</button>)}</div></details>}

    {can('payments:write') && d.status !== 'cancelled' && <form className="card grid" style={{ boxShadow: 'none', marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); void run(() => post('/payments', { amount_cents: toCents(pay.amount), method: pay.method, kind: pay.kind }), 'Plată simulată înregistrată').then(() => setPay({ ...pay, amount: '' })); }}>
      <b>Înregistrează plată (SIMULATĂ)</b>
      <div className="grid g2"><label>Sumă (USD)<input required inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
        <label>Metodă<select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <div className="row"><select style={{ width: 'auto' }} value={pay.kind} onChange={(e) => setPay({ ...pay, kind: e.target.value })}><option value="payment">Încasare</option><option value="refund">Rambursare</option></select><button className="btn sm">Înregistrează</button></div></form>}

    {can('extras:write') && ['pending', 'confirmed', 'checked_in'].includes(d.status) && <form className="card grid" style={{ boxShadow: 'none', marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); void run(() => post('/extras', { kind: extra.kind, description: extra.description, quantity: extra.quantity, unit_price_cents: toCents(extra.price) }), 'Extra adăugat').then(() => setExtra({ ...extra, description: '', price: '' })); }}>
      <b>Excursii, transferuri și extra</b>
      <div className="grid g2"><label>Tip<select value={extra.kind} onChange={(e) => setExtra({ ...extra, kind: e.target.value })}>{Object.entries(EXTRA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Descriere<input required minLength={2} value={extra.description} onChange={(e) => setExtra({ ...extra, description: e.target.value })} /></label></div>
      <div className="grid g2"><label>Cantitate<input type="number" min={1} value={extra.quantity} onChange={(e) => setExtra({ ...extra, quantity: +e.target.value })} /></label><label>Preț unitar (USD)<input required inputMode="decimal" value={extra.price} onChange={(e) => setExtra({ ...extra, price: e.target.value })} /></label></div>
      <button className="btn sm">Adaugă</button></form>}

    {d.extras.length > 0 && <><h3>Extra</h3><Table head={['Tip', 'Descriere', '#Cant.', '#Total']}>{d.extras.map((x: any) => <tr key={x.id}><td>{EXTRA[x.kind]}</td><td>{x.description}</td><td className="num">{x.quantity}</td><td className="num">{usd(x.quantity * x.unit_price_cents)}</td></tr>)}</Table></>}
    {d.payments.length > 0 && <><h3 style={{ marginTop: 14 }}>Plăți</h3><Table head={['Tip', 'Metodă', '#Sumă']}>{d.payments.map((x: any) => <tr key={x.id}><td>{x.kind === 'refund' ? 'Rambursare' : 'Încasare'}{x.simulated ? ' (sim.)' : ''}</td><td>{METHOD[x.method]}</td><td className="num">{usd(x.amount_cents)}</td></tr>)}</Table></>}
    <p className="muted" style={{ fontSize: '.8rem' }}>Rol: {ROLE[me.role]}</p>
  </Drawer>;
}

/* ---------- Camere ---------- */
function Rooms() {
  const { h, can, toast } = useH();
  const rooms = useAsync(() => api.get(h('/rooms')), []);
  async function setHk(id: string, status: string) { try { await api.patch(h(`/rooms/${id}/housekeeping`), { status }); rooms.reload(); } catch (e) { toast(msg(e), true); } }
  async function setStatus(id: string, status: string) { try { await api.patch(h(`/rooms/${id}`), { status }); rooms.reload(); } catch (e) { toast(msg(e), true); } }
  if (!rooms.data) return <p>Se încarcă…</p>;
  const c = (k: string) => rooms.data.filter((r: any) => r.housekeeping_status === k).length;
  return <>
    <Title>Camere și curățenie</Title>
    <div className="stats"><div className="stat"><b>{rooms.data.length}</b><span>Camere</span></div><div className="stat"><b>{c('dirty')}</b><span>De curățat</span></div>
      <div className="stat"><b>{c('in_progress')}</b><span>În curățare</span></div><div className="stat"><b>{c('clean') + c('inspected')}</b><span>Pregătite</span></div></div>
    <div className="rooms-grid">{rooms.data.map((r: any) => <div key={r.id} className={`room ${r.in_house_code ? 'occ' : ''}`}>
      <b>{r.number}</b><span className="muted" style={{ fontSize: '.82rem' }}>{r.room_type_name}</span>
      <Badge k={r.housekeeping_status} map={HK} />{r.status !== 'available' && <Badge k={r.status} map={ROOM_STATUS} />}
      {r.in_house_guest && <span style={{ fontSize: '.82rem' }}>👤 {r.in_house_guest}</span>}
      {can('housekeeping:write') && <select aria-label={`Curățenie ${r.number}`} value={r.housekeeping_status} onChange={(e) => setHk(r.id, e.target.value)}>{Object.entries(HK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      {can('rooms:write') && !r.in_house_code && <button className="btn ghost sm" onClick={() => setStatus(r.id, r.status === 'available' ? 'out_of_service' : 'available')}>{r.status === 'available' ? 'Scoate din uz' : 'Repune în uz'}</button>}
    </div>)}</div>
  </>;
}

/* ---------- Oaspeți / Plăți ---------- */
function Guests() {
  const { h } = useH(); const [q, setQ] = useState('');
  const g = useAsync(() => api.get(h(`/guests${q ? `?q=${encodeURIComponent(q)}` : ''}`)), [q]);
  return <><Title>Oaspeți</Title><input style={{ maxWidth: 280, marginBottom: 12 }} placeholder="Caută nume sau email" value={q} onChange={(e) => setQ(e.target.value)} />
    <Table head={['Nume', 'Email', 'Telefon', 'Țara']} empty={g.data && !g.data.length}>{g.data?.map((x: any) => <tr key={x.id}><td>{x.full_name}</td><td>{x.email ?? '—'}</td><td>{x.phone ?? '—'}</td><td>{x.country ?? '—'}</td></tr>)}</Table></>;
}
function Payments() {
  const { h } = useH(); const p = useAsync(() => api.get(h('/payments')), []);
  return <><Title>Plăți</Title><div className="banner" style={{ marginBottom: 12 }}>Toate plățile sunt SIMULATE. Nu există procesator de plăți conectat.</div>
    <Table head={['Data', 'Cod', 'Oaspete', 'Tip', 'Metodă', '#Sumă']} empty={p.data && !p.data.length}>{p.data?.map((x: any) => <tr key={x.id}>
      <td>{new Date(x.created_at).toLocaleString('ro-RO')}</td><td>{x.code}</td><td>{x.guest_name}</td><td>{x.kind === 'refund' ? 'Rambursare' : 'Încasare'}</td><td>{METHOD[x.method]}</td>
      <td className="num" style={{ color: x.kind === 'refund' ? 'var(--bad)' : undefined }}>{x.kind === 'refund' ? '−' : ''}{usd(x.amount_cents)}</td></tr>)}</Table></>;
}

/* ---------- Tarife ---------- */
function Rates() {
  const { h, can, toast, me } = useH(); const todayIso = () => me.hotel.today as string;
  const types = useAsync(() => api.get(h('/room-types')), []); const rates = useAsync(() => api.get(h('/rates')), []);
  const [f, setF] = useState({ room_type_id: '', name: '', start_date: addDays(todayIso(), 30), end_date: addDays(todayIso(), 60), price: '' });
  async function add(e: FormEvent) {
    e.preventDefault();
    try { await api.post(h('/rates'), { room_type_id: f.room_type_id || types.data[0].id, name: f.name, start_date: f.start_date, end_date: f.end_date, price_cents: Math.round(parseFloat(f.price.replace(',', '.')) * 100) }); toast('Perioadă de tarif adăugată'); rates.reload(); setF({ ...f, name: '', price: '' }); }
    catch (err) { toast(err instanceof ApiError && err.code === 'conflict' ? 'Perioada se suprapune cu alta existentă.' : msg(err), true); }
  }
  const tn = (id: string) => types.data?.find((t: any) => t.id === id)?.name;
  return <><Title>Tarife</Title><div className="banner" style={{ marginBottom: 12 }}>Tarife în USD pe noapte. Conversia în TZS nu este încă implementată.</div>
    <h3>Tarife de bază</h3><Table head={['Tip cameră', 'Capacitate', '#Preț/noapte']}>{types.data?.map((t: any) => <tr key={t.id}><td>{t.name}</td><td>{t.max_adults} adulți + {t.max_children} copii</td><td className="num">{usd(t.base_rate_cents)}</td></tr>)}</Table>
    <h3 style={{ marginTop: 20 }}>Perioade sezoniere</h3>
    <Table head={['Perioadă', 'Tip', 'De la', 'Până la (exclusiv)', '#Preț/noapte', '']} empty={rates.data && !rates.data.length}>{rates.data?.map((x: any) => <tr key={x.id}><td>{x.name}</td><td>{tn(x.room_type_id)}</td><td>{fmtD(x.start_date)}</td><td>{fmtD(x.end_date)}</td><td className="num">{usd(x.price_cents)}</td>
      <td>{can('rooms:write') && <button className="btn ghost sm" onClick={async () => { await api.del(h(`/rates/${x.id}`)); rates.reload(); }}>Șterge</button>}</td></tr>)}</Table>
    {can('rooms:write') && <form className="card grid" style={{ marginTop: 16 }} onSubmit={add}><b>Adaugă perioadă</b>
      <div className="grid g2"><label>Tip cameră<select value={f.room_type_id || types.data?.[0]?.id || ''} onChange={(e) => setF({ ...f, room_type_id: e.target.value })}>{types.data?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Denumire<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>De la<input type="date" required value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></label><label>Până la (exclusiv)<input type="date" required value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></label>
        <label>Preț/noapte (USD)<input required inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label></div>
      <button className="btn">Adaugă</button></form>}</>;
}

/* ---------- Rapoarte ---------- */
function Reports() {
  const { h, me } = useH(); const todayIso = () => me.hotel.today as string;
  const [from, setFrom] = useState(todayIso()); const [to, setTo] = useState(addDays(todayIso(), 14));
  const occ = useAsync(() => api.get(h(`/reports/occupancy?from=${from}&to=${to}`)), [from, to]);
  const rev = useAsync(() => api.get(h(`/reports/revenue?from=${from}&to=${to}`)), [from, to]);
  return <><Title>Rapoarte</Title>
    <div className="row" style={{ marginBottom: 14 }}><label>De la<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Până la<input type="date" min={addDays(from, 1)} value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
    {rev.data && <div className="stats"><div className="stat"><b>{usd(rev.data.booked_cents)}</b><span>Venit rezervat (cazare + extra)</span></div><div className="stat"><b>{usd(rev.data.lodging_cents)}</b><span>Cazare</span></div>
      <div className="stat"><b>{usd(rev.data.extras_cents)}</b><span>Extra</span></div><div className="stat"><b>{usd(rev.data.collected_cents)}</b><span>Încasat (plăți simulate)</span></div>
      {occ.data && <div className="stat"><b>{occ.data.occupancy_pct}%</b><span>Ocupare medie</span></div>}</div>}
    <h3>Ocupare pe zile</h3>
    <div className="tbl-wrap"><table><tbody>{occ.data?.days.map((d: any) => <tr key={d.date}><td style={{ width: 120 }}>{fmtD(d.date)}</td><td style={{ width: '100%', minWidth: 120 }}><div className="bar"><i style={{ width: `${d.occupancy_pct}%` }} /></div></td><td className="num">{d.occupied}/{d.rooms} · {d.occupancy_pct}%</td></tr>)}</tbody></table></div></>;
}

/* ---------- Personal ---------- */
function Staff() {
  const { h, toast } = useH(); const s = useAsync(() => api.get(h('/staff')), []);
  const [f, setF] = useState({ email: '', full_name: '', role: 'receptionist', password: '' });
  async function add(e: FormEvent) {
    e.preventDefault();
    try { await api.post(h('/staff'), f); toast('Membru adăugat'); setF({ ...f, email: '', full_name: '', password: '' }); s.reload(); } catch (err) { toast(msg(err), true); }
  }
  async function upd(id: string, body: object) { try { await api.patch(h(`/staff/${id}`), body); s.reload(); } catch (err) { toast(msg(err), true); } }
  return <><Title>Personal și acces</Title>
    <Table head={['Nume', 'Email', 'Rol', 'Activ']}>{s.data?.map((m: any) => <tr key={m.id}><td>{m.full_name}</td><td>{m.email}</td>
      <td><select value={m.role} onChange={(e) => upd(m.id, { role: e.target.value })} style={{ width: 'auto' }}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
      <td><label className="check"><input type="checkbox" checked={m.active} onChange={(e) => upd(m.id, { active: e.target.checked })} />{m.active ? 'Da' : 'Nu'}</label></td></tr>)}</Table>
    <form className="card grid" style={{ marginTop: 16 }} onSubmit={add}><b>Adaugă membru</b>
      <div className="grid g2"><label>Nume<input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label><label>Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Rol<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Parolă inițială (min. 12 caractere)<input type="password" required minLength={12} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label></div>
      <button className="btn">Adaugă</button></form>
    <p className="muted">Nu se trimit emailuri de invitație în această versiune.</p></>;
}

/* ---------- Platformă ---------- */
function Platform() {
  const hotels = useAsync(() => api.get('/api/platform/hotels'), []); const plans = useAsync(() => api.get('/api/platform/plans'), []);
  const [f, setF] = useState({ name: '', slug: '', plan_code: 'starter', email: '', full_name: '', password: '' }); const [error, setError] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault(); setError('');
    try { await api.post('/api/platform/hotels', { name: f.name, slug: f.slug, plan_code: f.plan_code, owner: { email: f.email, full_name: f.full_name, password: f.password } }); hotels.reload(); setF({ ...f, name: '', slug: '', email: '', full_name: '', password: '' }); }
    catch (err) { setError(msg(err)); }
  }
  return <><Title>Platformă SaaS</Title><div className="banner" style={{ marginBottom: 12 }}>Abonamentele sunt SIMULATE: nu există facturare sau procesator de plăți.</div>
    <h3>Planuri (valori de demonstrație)</h3><Table head={['Plan', '#Preț/lună', '#Camere max.', '#Personal max.']}>{plans.data?.map((p: any) => <tr key={p.id}><td>{p.name}</td><td className="num">{usd(p.price_usd_cents_month)}</td><td className="num">{p.max_rooms}</td><td className="num">{p.max_staff}</td></tr>)}</Table>
    <h3 style={{ marginTop: 20 }}>Hoteluri</h3><Table head={['Hotel', 'Slug', 'Plan', 'Stare', '#Camere', '#Personal']}>{hotels.data?.map((x: any) => <tr key={x.id}><td>{x.name}</td><td>{x.slug}</td><td>{x.plan}</td><td><span className="badge">{x.status}</span></td><td className="num">{x.rooms}</td><td className="num">{x.staff}</td></tr>)}</Table>
    <form className="card grid" style={{ marginTop: 16 }} onSubmit={add}><b>Hotel nou</b>
      <div className="grid g2"><label>Nume<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label><label>Slug (a-z, 0-9, -)<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></label>
        <label>Plan<select value={f.plan_code} onChange={(e) => setF({ ...f, plan_code: e.target.value })}>{plans.data?.map((p: any) => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
        <label>Nume proprietar<input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label><label>Email proprietar<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Parolă inițială (min. 12)<input type="password" required minLength={12} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label></div>
      {error && <div className="err">{error}</div>}<button className="btn">Creează hotelul</button></form></>;
}

export { ERR };
