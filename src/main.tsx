import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './lib/theme';
import 'leaflet/dist/leaflet.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

applyTheme();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
