import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { PublicSite } from './public/Site';
import { AdminApp } from './admin/Admin';
import { STANDALONE, useHash } from './util';

function App() {
  const path = useHash();
  return path.startsWith('/admin') ? <AdminApp path={path} /> : <PublicSite path={path} />;
}

async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (STANDALONE) {
    // Demo autónoma: la API y la base de datos se ejecutan en el propio navegador.
    root.render(<div className="login"><div className="card">Preparando la demostración… (unos segundos)</div></div>);
    try {
      const { bootDemo } = await import('virtual:botiq-demo');
      await bootDemo();
    } catch (e) {
      console.error('Fallo al iniciar la demo', e);
      root.render(<div className="login"><div className="card"><b>No se pudo iniciar la demostración en este navegador.</b><p className="muted">{String((e as Error)?.message ?? e)}</p></div></div>);
      return;
    }
  }
  root.render(<StrictMode><App /></StrictMode>);
}
void start();
