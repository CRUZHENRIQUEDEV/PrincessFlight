// Versão: 1.0
import './style.css';
import 'leaflet/dist/leaflet.css';
import { startApp } from './presentation/app';

startApp().catch((error: unknown) => {
  const status = document.getElementById('status');
  const message = error instanceof Error ? error.message : 'Falha ao iniciar.';
  if (status) status.textContent = message;
});
