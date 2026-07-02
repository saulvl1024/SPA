import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth.jsx';
import { Toaster } from './ui.jsx';
import App from './App.jsx';
import './styles.css';

/* ---- Auto-capitalización: primera letra de cada palabra, al salir del campo ----
   Aplica a inputs de texto de una línea. Excluye email, teléfono, número, PIN,
   fecha/hora, búsquedas y notas largas (textarea) para no romper oraciones ni datos. */
const titleCase = s => s.replace(/(^|\s)([a-záéíóúñ])/g, (m, sp, ch) => sp + ch.toUpperCase());
function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
}
document.addEventListener('focusout', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return; // solo inputs de una línea
  const skip = ['email', 'tel', 'number', 'password', 'date', 'time', 'datetime-local', 'url', 'color', 'search'];
  if (skip.includes(el.type)) return;
  if (['numeric', 'decimal', 'tel', 'email'].includes(el.inputMode)) return;
  if (el.dataset.noCaps !== undefined) return; // permite excluir un campo con data-no-caps
  const v = el.value;
  const nv = titleCase(v);
  if (nv !== v) { setNativeValue(el, nv); el.dispatchEvent(new Event('input', { bubbles: true })); }
});

/* ---- Tope global para campos numéricos (montos y cantidades) ----
   Evita que se escriban números absurdos. Coincide con los límites del backend.
   Un input puede personalizar su tope con el atributo max="..." */
const NUM_MAX_DEFAULT = 999_999_999; // ~1,000 millones
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.type !== 'number') return;
  if (el.value === '' || el.value === '-') return;
  const max = el.max !== '' ? Number(el.max) : NUM_MAX_DEFAULT;
  // Solo se fuerza un mínimo si el input lo declara (ej. min="0").
  // Así no rompemos campos que admiten negativos (ajustes/devoluciones).
  const hasMin = el.min !== '';
  const min = hasMin ? Number(el.min) : -NUM_MAX_DEFAULT;
  let n = Number(el.value);
  if (!Number.isFinite(n)) return;
  let clamped = n;
  if (n > max) clamped = max;
  if (n < min) clamped = min;
  if (clamped !== n) {
    setNativeValue(el, String(clamped));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, true);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
