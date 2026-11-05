import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { PublicSite } from './public/Site';
import { AdminApp } from './admin/Admin';
import { useHash } from './util';

function App() {
  const path = useHash();
  return path.startsWith('/admin') ? <AdminApp path={path} /> : <PublicSite path={path} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
