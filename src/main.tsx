import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { cellDebug, installCellDebug } from './app/debug';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

// Expose the measurement bridge before the first frame so the harness can read
// firstRenderAt even when it attaches late.
installCellDebug(cellDebug, window);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
