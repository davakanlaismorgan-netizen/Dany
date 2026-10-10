import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initMonitoring, installGlobalHandlers } from './lib/monitoring';
import { reportError } from './lib/report';

initMonitoring({ endpoint: import.meta.env.VITE_ERROR_ENDPOINT });
installGlobalHandlers(reportError);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
