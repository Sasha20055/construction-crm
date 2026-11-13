import { installErrorReporting } from '@/shared/monitoring';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Application } from './application';
installErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Application />
  </StrictMode>,
);
