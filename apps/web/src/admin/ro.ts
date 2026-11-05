// Etichete în limba română pentru panoul administrativ.
export const STATUS: Record<string, string> = {
  pending: 'În așteptare', confirmed: 'Confirmată', checked_in: 'Cazat', checked_out: 'Check-out efectuat', cancelled: 'Anulată', no_show: 'Neprezentare',
};
export const HK: Record<string, string> = { clean: 'Curată', dirty: 'De curățat', in_progress: 'În curățare', inspected: 'Inspectată' };
export const ROOM_STATUS: Record<string, string> = { available: 'Disponibilă', out_of_service: 'Scoasă din uz' };
export const ROLE: Record<string, string> = {
  owner: 'Proprietar', manager: 'Manager', receptionist: 'Recepționer', housekeeping: 'Cameristă', maintenance: 'Mentenanță', accountant: 'Contabil',
};
export const SOURCE: Record<string, string> = { direct: 'Direct', web: 'Site web', phone: 'Telefon', walk_in: 'Walk-in', booking_com: 'Booking.com', airbnb: 'Airbnb', other: 'Altele' };
export const METHOD: Record<string, string> = { cash: 'Numerar', card_simulated: 'Card (simulat)', transfer: 'Transfer' };
export const EXTRA: Record<string, string> = { excursion: 'Excursie', transfer: 'Transfer', restaurant: 'Restaurant', other: 'Altele' };

export const ERR: Record<string, string> = {
  invalid_credentials: 'Email sau parolă incorecte.',
  too_many_attempts: 'Prea multe încercări. Așteaptă 15 minute.',
  too_many_requests: 'Prea multe cereri. Încearcă mai târziu.',
  forbidden: 'Nu ai permisiunea pentru această acțiune.',
  unauthenticated: 'Sesiunea a expirat. Autentifică-te din nou.',
  no_availability: 'Nu există camere disponibile pentru aceste date.',
  room_unavailable: 'Camera nu este disponibilă sau este de alt tip.',
  conflict: 'Camera este deja ocupată în perioada aleasă.',
  room_not_ready: 'Camera nu este pregătită (curățenie).',
  too_early: 'Încă nu este data de sosire.',
  stay_over: 'Șederea s-a încheiat.',
  balance_due: 'Există sold de plată. Încasează înainte de check-out.',
  overpayment: 'Plata depășește soldul.',
  refund_exceeds_paid: 'Rambursarea depășește suma plătită.',
  invalid_state: 'Starea rezervării nu permite această acțiune.',
  past_date: 'Data nu poate fi în trecut.',
  invalid_range: 'Interval de date invalid (1–60 nopți).',
  capacity_exceeded: 'Capacitatea camerei este depășită.',
  plan_limit_rooms: 'Limita de camere a planului a fost atinsă.',
  plan_limit_staff: 'Limita de personal a planului a fost atinsă.',
  last_owner: 'Nu poți elimina ultimul proprietar.',
  duplicate: 'Există deja o înregistrare cu aceste date.',
  validation: 'Date invalide. Verifică câmpurile.',
  room_has_reservations: 'Camera are rezervări active sau viitoare.',
};
export const errRo = (code?: string, fallback?: string) => ERR[code ?? ''] ?? fallback ?? 'A apărut o eroare.';
export const fmtD = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
export const usd = (c: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'USD' }).format(c / 100);
