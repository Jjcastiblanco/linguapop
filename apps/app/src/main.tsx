import { PACKAGE_NAME as CONTENT } from '@linguapop/content';
import { PACKAGE_NAME as DOMAIN } from '@linguapop/domain';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

createRoot(root).render(
  <StrictMode>
    <h1>LinguaPop</h1>
    <p>En construcción.</p>
    <small>
      {DOMAIN} · {CONTENT}
    </small>
  </StrictMode>,
);
