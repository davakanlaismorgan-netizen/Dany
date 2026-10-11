import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initMonitoring, installGlobalHandlers } from './lib/monitoring';
import { reportError } from './lib/report';

initMonitoring({ endpoint: import.meta.env.VITE_ERROR_ENDPOINT });
installGlobalHandlers(reportError);

const root = createRoot(document.getElementById('root')!);

// Sans ces deux variables, le client Supabase lève une exception au chargement du module et la page
// reste blanche. On affiche à la place une consigne claire, puis on charge l'application seulement si
// la configuration est complète.
const missing = [
  ['VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL],
  ['VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  root.render(
    <div role="alert" style={{ maxWidth: 560, margin: '15vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Configuration incomplète / Missing configuration</h1>
      <p>
        Variable(s) d&apos;environnement manquante(s) : <strong>{missing.join(', ')}</strong>. Ajoutez-les dans Vercel
        (Settings → Environment Variables, environnement Preview et Production), puis redéployez.
      </p>
      <p>
        Missing environment variable(s): <strong>{missing.join(', ')}</strong>. Add them in Vercel, then redeploy.
      </p>
    </div>,
  );
} else {
  import('./App.tsx').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}