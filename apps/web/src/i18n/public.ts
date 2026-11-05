import { createContext, useContext } from 'react';

export const LANGS = ['ro', 'en', 'es', 'it', 'fr'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = { ro: 'Română', en: 'English', es: 'Español', it: 'Italiano', fr: 'Français' };
export const LOCALES: Record<Lang, string> = { ro: 'ro-RO', en: 'en-GB', es: 'es-ES', it: 'it-IT', fr: 'fr-FR' };

const en = {
  nav: { home: 'Home', rooms: 'Rooms', book: 'Book', booking: 'My booking', contact: 'Contact' },
  hero: { kicker: 'Paje · Zanzibar · Tanzania', title: 'Where the Indian Ocean slows time', cta: 'Check availability', more: 'Discover the rooms' },
  about: { title: 'A boutique retreat by the sea', text: 'Fifteen rooms between tropical gardens and the white sands of Paje. Unhurried mornings, local flavours and a team that knows every guest by name.' },
  highlights: [
    { t: 'Fifteen rooms', d: 'Garden rooms, ocean-view rooms and beach suites.' },
    { t: 'Restaurant', d: 'Swahili and international cuisine, served by the sea.' },
    { t: 'Excursions & transfers', d: 'We arrange airport transfers and island experiences.' },
  ],
  rooms: { title: 'Rooms & rates', sub: 'Rates in US dollars, per room per night.', from: 'from', night: 'night', up: 'Up to {a} adults, {c} children', book: 'Book this room' },
  book: {
    title: 'Book your stay', checkIn: 'Check-in', checkOut: 'Check-out', adults: 'Adults', children: 'Children', search: 'Search',
    results: 'Available rooms', none: 'No rooms available for these dates. Try different dates.', nightsN: '{n} nights', nightN: '1 night', left: 'Only {n} left',
    select: 'Select', total: 'Total', details: 'Guest details', name: 'Full name', email: 'Email', phone: 'Phone (optional)', country: 'Country (ISO code, optional)', notes: 'Notes (optional)',
    terms: 'I accept the booking conditions and understand this is a demonstration.', deposit: 'Deposit due now (30 %)', balance: 'Balance at the hotel',
    simulated: 'SIMULATED PAYMENT — no card is requested and no money is charged.', confirm: 'Confirm booking (simulated payment)', back: 'Back', processing: 'Processing…',
    summary: 'Your stay',
  },
  done: { title: 'Booking confirmed', text: 'Your reservation code is', save: 'Keep this code and the email you used to look up your booking.', simulated: 'The deposit shown is simulated: nothing was charged.', again: 'Make another booking', lookup: 'View booking' },
  lookup: { title: 'Find my booking', code: 'Booking code', email: 'Email used', find: 'Find', status: 'Status', paid: 'Paid', balance: 'Balance', notFound: 'No booking found with that code and email.' },
  status: { pending: 'Pending', confirmed: 'Confirmed', checked_in: 'Checked in', checked_out: 'Checked out', cancelled: 'Cancelled', no_show: 'No-show' },
  contact: { title: 'Contact & location', text: 'Paje, Zanzibar, Tanzania. Demonstration contact details — they are not real.' },
  err: { no_availability: 'Those rooms were just taken. Please search again.', past_date: 'The check-in date cannot be in the past.', capacity_exceeded: 'That room does not fit this many guests.', invalid_range: 'Please choose valid dates (1 to 60 nights).', too_many_requests: 'Too many attempts. Please try again later.', validation: 'Please check the highlighted fields.', generic: 'Something went wrong. Please try again.' },
  footer: { demo: 'DEMONSTRATION VERSION — fictional data and simulated payments. Not a real booking service.', admin: 'Staff access', standalone: 'This demo runs entirely in your browser: nothing is sent or stored on a server, and it resets when you reload.' },
  night: 'night', nights: 'nights',
};
export type Dict = typeof en;

const ro: Dict = {
  nav: { home: 'Acasă', rooms: 'Camere', book: 'Rezervă', booking: 'Rezervarea mea', contact: 'Contact' },
  hero: { kicker: 'Paje · Zanzibar · Tanzania', title: 'Unde Oceanul Indian încetinește timpul', cta: 'Verifică disponibilitatea', more: 'Descoperă camerele' },
  about: { title: 'Un refugiu boutique lângă mare', text: 'Cincisprezece camere între grădini tropicale și nisipul alb din Paje. Dimineți liniștite, arome locale și o echipă care își cunoaște oaspeții pe nume.' },
  highlights: [
    { t: 'Cincisprezece camere', d: 'Camere cu grădină, camere cu vedere la ocean și suite pe plajă.' },
    { t: 'Restaurant', d: 'Bucătărie swahili și internațională, servită lângă mare.' },
    { t: 'Excursii și transferuri', d: 'Organizăm transferuri din aeroport și experiențe pe insulă.' },
  ],
  rooms: { title: 'Camere și tarife', sub: 'Tarife în dolari SUA, pe cameră și noapte.', from: 'de la', night: 'noapte', up: 'Până la {a} adulți, {c} copii', book: 'Rezervă această cameră' },
  book: {
    title: 'Rezervă-ți șederea', checkIn: 'Sosire', checkOut: 'Plecare', adults: 'Adulți', children: 'Copii', search: 'Caută',
    results: 'Camere disponibile', none: 'Nu există camere disponibile pentru aceste date. Încearcă alte date.', nightsN: '{n} nopți', nightN: '1 noapte', left: 'Mai {n} disponibile',
    select: 'Alege', total: 'Total', details: 'Datele oaspetelui', name: 'Nume complet', email: 'Email', phone: 'Telefon (opțional)', country: 'Țara (cod ISO, opțional)', notes: 'Observații (opțional)',
    terms: 'Accept condițiile de rezervare și înțeleg că aceasta este o demonstrație.', deposit: 'Avans de plătit acum (30 %)', balance: 'Rest de plată la hotel',
    simulated: 'PLATĂ SIMULATĂ — nu se cere niciun card și nu se percepe nicio sumă.', confirm: 'Confirmă rezervarea (plată simulată)', back: 'Înapoi', processing: 'Se procesează…',
    summary: 'Șederea ta',
  },
  done: { title: 'Rezervare confirmată', text: 'Codul rezervării tale este', save: 'Păstrează acest cod și emailul folosit pentru a-ți consulta rezervarea.', simulated: 'Avansul afișat este simulat: nu s-a perceput nimic.', again: 'Fă o altă rezervare', lookup: 'Vezi rezervarea' },
  lookup: { title: 'Găsește rezervarea mea', code: 'Cod rezervare', email: 'Email folosit', find: 'Caută', status: 'Stare', paid: 'Plătit', balance: 'Rest', notFound: 'Nu s-a găsit nicio rezervare cu acest cod și email.' },
  status: { pending: 'În așteptare', confirmed: 'Confirmată', checked_in: 'Cazat', checked_out: 'Check-out efectuat', cancelled: 'Anulată', no_show: 'Neprezentare' },
  contact: { title: 'Contact și locație', text: 'Paje, Zanzibar, Tanzania. Date de contact de demonstrație — nu sunt reale.' },
  err: { no_availability: 'Camerele au fost tocmai ocupate. Te rugăm să cauți din nou.', past_date: 'Data sosirii nu poate fi în trecut.', capacity_exceeded: 'Camera nu are capacitate pentru atâția oaspeți.', invalid_range: 'Alege date valide (1 până la 60 de nopți).', too_many_requests: 'Prea multe încercări. Încearcă mai târziu.', validation: 'Verifică câmpurile completate.', generic: 'A apărut o eroare. Încearcă din nou.' },
  footer: { demo: 'VERSIUNE DE DEMONSTRAȚIE — date fictive și plăți simulate. Nu este un serviciu real de rezervări.', admin: 'Acces personal', standalone: 'Această demonstrație rulează integral în browserul tău: nu se trimite și nu se stochează nimic pe un server, iar la reîncărcare se resetează.' },
  night: 'noapte', nights: 'nopți',
};

const es: Dict = {
  nav: { home: 'Inicio', rooms: 'Habitaciones', book: 'Reservar', booking: 'Mi reserva', contact: 'Contacto' },
  hero: { kicker: 'Paje · Zanzíbar · Tanzania', title: 'Donde el océano Índico frena el tiempo', cta: 'Consultar disponibilidad', more: 'Descubrir las habitaciones' },
  about: { title: 'Un refugio boutique junto al mar', text: 'Quince habitaciones entre jardines tropicales y las arenas blancas de Paje. Mañanas sin prisa, sabores locales y un equipo que conoce a cada huésped por su nombre.' },
  highlights: [
    { t: 'Quince habitaciones', d: 'Habitaciones con jardín, con vistas al mar y suites frente a la playa.' },
    { t: 'Restaurante', d: 'Cocina suajili e internacional, servida junto al mar.' },
    { t: 'Excursiones y traslados', d: 'Organizamos traslados al aeropuerto y experiencias por la isla.' },
  ],
  rooms: { title: 'Habitaciones y tarifas', sub: 'Tarifas en dólares estadounidenses, por habitación y noche.', from: 'desde', night: 'noche', up: 'Hasta {a} adultos, {c} niños', book: 'Reservar esta habitación' },
  book: {
    title: 'Reserva tu estancia', checkIn: 'Entrada', checkOut: 'Salida', adults: 'Adultos', children: 'Niños', search: 'Buscar',
    results: 'Habitaciones disponibles', none: 'No hay habitaciones disponibles en esas fechas. Prueba otras fechas.', nightsN: '{n} noches', nightN: '1 noche', left: 'Solo quedan {n}',
    select: 'Elegir', total: 'Total', details: 'Datos del huésped', name: 'Nombre completo', email: 'Correo electrónico', phone: 'Teléfono (opcional)', country: 'País (código ISO, opcional)', notes: 'Notas (opcional)',
    terms: 'Acepto las condiciones de reserva y entiendo que es una demostración.', deposit: 'Depósito a pagar ahora (30 %)', balance: 'Saldo en el hotel',
    simulated: 'PAGO SIMULADO — no se pide ninguna tarjeta ni se cobra dinero.', confirm: 'Confirmar reserva (pago simulado)', back: 'Atrás', processing: 'Procesando…',
    summary: 'Tu estancia',
  },
  done: { title: 'Reserva confirmada', text: 'El código de tu reserva es', save: 'Guarda este código y el correo usado para consultar tu reserva.', simulated: 'El depósito mostrado es simulado: no se ha cobrado nada.', again: 'Hacer otra reserva', lookup: 'Ver reserva' },
  lookup: { title: 'Buscar mi reserva', code: 'Código de reserva', email: 'Correo usado', find: 'Buscar', status: 'Estado', paid: 'Pagado', balance: 'Saldo', notFound: 'No se encontró ninguna reserva con ese código y correo.' },
  status: { pending: 'Pendiente', confirmed: 'Confirmada', checked_in: 'Alojado', checked_out: 'Salida registrada', cancelled: 'Cancelada', no_show: 'No presentado' },
  contact: { title: 'Contacto y ubicación', text: 'Paje, Zanzíbar, Tanzania. Datos de contacto de demostración: no son reales.' },
  err: { no_availability: 'Esas habitaciones acaban de ocuparse. Vuelve a buscar.', past_date: 'La fecha de entrada no puede ser anterior a hoy.', capacity_exceeded: 'La habitación no admite tantos huéspedes.', invalid_range: 'Elige fechas válidas (de 1 a 60 noches).', too_many_requests: 'Demasiados intentos. Inténtalo más tarde.', validation: 'Revisa los campos marcados.', generic: 'Ha ocurrido un error. Inténtalo de nuevo.' },
  footer: { demo: 'VERSIÓN DE DEMOSTRACIÓN — datos ficticios y pagos simulados. No es un servicio real de reservas.', admin: 'Acceso personal', standalone: 'Esta demostración se ejecuta íntegramente en tu navegador: no se envía ni guarda nada en un servidor, y se reinicia al recargar.' },
  night: 'noche', nights: 'noches',
};

const it: Dict = {
  nav: { home: 'Home', rooms: 'Camere', book: 'Prenota', booking: 'La mia prenotazione', contact: 'Contatti' },
  hero: { kicker: 'Paje · Zanzibar · Tanzania', title: "Dove l'Oceano Indiano rallenta il tempo", cta: 'Verifica la disponibilità', more: 'Scopri le camere' },
  about: { title: 'Un rifugio boutique sul mare', text: 'Quindici camere tra giardini tropicali e le sabbie bianche di Paje. Mattine senza fretta, sapori locali e un team che conosce ogni ospite per nome.' },
  highlights: [
    { t: 'Quindici camere', d: 'Camere sul giardino, con vista sul mare e suite fronte spiaggia.' },
    { t: 'Ristorante', d: 'Cucina swahili e internazionale, servita sul mare.' },
    { t: 'Escursioni e transfer', d: "Organizziamo transfer dall'aeroporto ed esperienze sull'isola." },
  ],
  rooms: { title: 'Camere e tariffe', sub: 'Tariffe in dollari statunitensi, per camera a notte.', from: 'da', night: 'notte', up: 'Fino a {a} adulti, {c} bambini', book: 'Prenota questa camera' },
  book: {
    title: 'Prenota il tuo soggiorno', checkIn: 'Arrivo', checkOut: 'Partenza', adults: 'Adulti', children: 'Bambini', search: 'Cerca',
    results: 'Camere disponibili', none: 'Nessuna camera disponibile per queste date. Prova altre date.', nightsN: '{n} notti', nightN: '1 notte', left: 'Ne restano {n}',
    select: 'Scegli', total: 'Totale', details: "Dati dell'ospite", name: 'Nome e cognome', email: 'Email', phone: 'Telefono (facoltativo)', country: 'Paese (codice ISO, facoltativo)', notes: 'Note (facoltative)',
    terms: 'Accetto le condizioni di prenotazione e capisco che si tratta di una dimostrazione.', deposit: 'Caparra da versare ora (30 %)', balance: "Saldo in hotel",
    simulated: 'PAGAMENTO SIMULATO — nessuna carta richiesta e nessun addebito.', confirm: 'Conferma la prenotazione (pagamento simulato)', back: 'Indietro', processing: 'Elaborazione…',
    summary: 'Il tuo soggiorno',
  },
  done: { title: 'Prenotazione confermata', text: 'Il codice della tua prenotazione è', save: 'Conserva questo codice e l’email usata per consultare la prenotazione.', simulated: 'La caparra indicata è simulata: non è stato addebitato nulla.', again: 'Fai un’altra prenotazione', lookup: 'Vedi prenotazione' },
  lookup: { title: 'Trova la mia prenotazione', code: 'Codice prenotazione', email: 'Email usata', find: 'Cerca', status: 'Stato', paid: 'Pagato', balance: 'Saldo', notFound: 'Nessuna prenotazione trovata con questo codice e questa email.' },
  status: { pending: 'In attesa', confirmed: 'Confermata', checked_in: 'Alloggiato', checked_out: 'Check-out effettuato', cancelled: 'Annullata', no_show: 'Mancata presentazione' },
  contact: { title: 'Contatti e posizione', text: 'Paje, Zanzibar, Tanzania. Recapiti di dimostrazione: non sono reali.' },
  err: { no_availability: 'Quelle camere sono appena state occupate. Cerca di nuovo.', past_date: 'La data di arrivo non può essere nel passato.', capacity_exceeded: 'La camera non ospita così tante persone.', invalid_range: 'Scegli date valide (da 1 a 60 notti).', too_many_requests: 'Troppi tentativi. Riprova più tardi.', validation: 'Controlla i campi evidenziati.', generic: 'Si è verificato un errore. Riprova.' },
  footer: { demo: 'VERSIONE DIMOSTRATIVA — dati fittizi e pagamenti simulati. Non è un vero servizio di prenotazione.', admin: 'Accesso personale', standalone: 'Questa dimostrazione funziona interamente nel tuo browser: nulla viene inviato o salvato su un server e si azzera ricaricando la pagina.' },
  night: 'notte', nights: 'notti',
};

const fr: Dict = {
  nav: { home: 'Accueil', rooms: 'Chambres', book: 'Réserver', booking: 'Ma réservation', contact: 'Contact' },
  hero: { kicker: 'Paje · Zanzibar · Tanzanie', title: "Là où l'océan Indien ralentit le temps", cta: 'Vérifier la disponibilité', more: 'Découvrir les chambres' },
  about: { title: 'Une retraite boutique au bord de la mer', text: 'Quinze chambres entre jardins tropicaux et sable blanc de Paje. Des matins sans hâte, des saveurs locales et une équipe qui connaît chaque hôte par son prénom.' },
  highlights: [
    { t: 'Quinze chambres', d: 'Chambres sur jardin, vue mer et suites en bord de plage.' },
    { t: 'Restaurant', d: 'Cuisine swahilie et internationale, servie face à la mer.' },
    { t: 'Excursions et transferts', d: "Nous organisons les transferts depuis l'aéroport et des expériences sur l'île." },
  ],
  rooms: { title: 'Chambres et tarifs', sub: 'Tarifs en dollars américains, par chambre et par nuit.', from: 'dès', night: 'nuit', up: "Jusqu'à {a} adultes, {c} enfants", book: 'Réserver cette chambre' },
  book: {
    title: 'Réservez votre séjour', checkIn: 'Arrivée', checkOut: 'Départ', adults: 'Adultes', children: 'Enfants', search: 'Rechercher',
    results: 'Chambres disponibles', none: "Aucune chambre disponible à ces dates. Essayez d'autres dates.", nightsN: '{n} nuits', nightN: '1 nuit', left: 'Plus que {n}',
    select: 'Choisir', total: 'Total', details: "Informations sur l'hôte", name: 'Nom complet', email: 'E-mail', phone: 'Téléphone (facultatif)', country: 'Pays (code ISO, facultatif)', notes: 'Remarques (facultatif)',
    terms: "J'accepte les conditions de réservation et je comprends qu'il s'agit d'une démonstration.", deposit: 'Acompte à régler maintenant (30 %)', balance: "Solde à l'hôtel",
    simulated: "PAIEMENT SIMULÉ — aucune carte n'est demandée et rien n'est débité.", confirm: 'Confirmer la réservation (paiement simulé)', back: 'Retour', processing: 'Traitement…',
    summary: 'Votre séjour',
  },
  done: { title: 'Réservation confirmée', text: 'Le code de votre réservation est', save: "Conservez ce code et l'e-mail utilisé pour consulter votre réservation.", simulated: "L'acompte affiché est simulé : rien n'a été débité.", again: 'Faire une autre réservation', lookup: 'Voir la réservation' },
  lookup: { title: 'Retrouver ma réservation', code: 'Code de réservation', email: 'E-mail utilisé', find: 'Rechercher', status: 'Statut', paid: 'Payé', balance: 'Solde', notFound: 'Aucune réservation trouvée avec ce code et cet e-mail.' },
  status: { pending: 'En attente', confirmed: 'Confirmée', checked_in: 'Installé', checked_out: 'Départ enregistré', cancelled: 'Annulée', no_show: 'Non présenté' },
  contact: { title: 'Contact et localisation', text: 'Paje, Zanzibar, Tanzanie. Coordonnées de démonstration : elles ne sont pas réelles.' },
  err: { no_availability: 'Ces chambres viennent d’être prises. Relancez la recherche.', past_date: "La date d'arrivée ne peut pas être passée.", capacity_exceeded: 'La chambre ne peut pas accueillir autant de personnes.', invalid_range: 'Choisissez des dates valides (1 à 60 nuits).', too_many_requests: 'Trop de tentatives. Réessayez plus tard.', validation: 'Vérifiez les champs signalés.', generic: 'Une erreur est survenue. Réessayez.' },
  footer: { demo: "VERSION DE DÉMONSTRATION — données fictives et paiements simulés. Ce n'est pas un vrai service de réservation.", admin: 'Accès personnel', standalone: "Cette démonstration s'exécute entièrement dans votre navigateur : rien n'est envoyé ni enregistré sur un serveur, et elle se réinitialise au rechargement." },
  night: 'nuit', nights: 'nuits',
};

export const DICTS: Record<Lang, Dict> = { en, ro, es, it, fr };

export const LangCtx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({ lang: 'en', t: en, setLang: () => {} });
export const useLang = () => useContext(LangCtx);
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
export const errText = (t: Dict, code?: string) => (t.err as Record<string, string>)[code ?? ''] ?? t.err.generic;
