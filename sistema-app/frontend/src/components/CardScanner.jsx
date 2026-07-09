import { useRef, useState } from 'react';
import { Modal, toast } from '../ui.jsx';

// Carga Tesseract.js (OCR) una sola vez desde CDN
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('El lector no se inicializó'));
    s.onerror = () => reject(new Error('No se pudo descargar el lector (revisa tu internet)'));
    document.head.appendChild(s);
  });
}

// Preprocesa la foto para que el OCR lea mejor: la agranda y la pasa a escala de grises con contraste
async function preprocess(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(2.5, Math.max(1, 1600 / Math.max(img.width, img.height)));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const d = ctx.getImageData(0, 0, w, h);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      let g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      g = (g - 128) * 1.35 + 128;                 // sube contraste
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      p[i] = p[i + 1] = p[i + 2] = g;
    }
    ctx.putImageData(d, 0, 0);
  } catch { /* si el canvas está "tainted" seguimos con la imagen a color */ }
  return canvas;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}/;
const COMPANY_RE = /(S\.?A\.?\s*de\s*C\.?V\.?|S\.? de R\.?L\.?|S\.?A\.?S\.?|S\.?A\.?|LLC|Inc\.?|Corp\.?|Compañ|Grupo|Studio|Spa|Boutique|Cl[ií]nica|Cía|&)/i;

// Extrae los mejores candidatos a teléfono de un texto
function findPhone(text) {
  // Junta secuencias de dígitos y separadores; elige la que tenga 10 dígitos (México) o más
  const cands = (text.match(/[\d()+\-.\s]{8,}/g) || [])
    .map(s => s.replace(/[^\d+]/g, ''))
    .filter(s => s.replace(/\D/g, '').length >= 8 && s.replace(/\D/g, '').length <= 15);
  // Prioriza 10 dígitos
  cands.sort((a, b) => Math.abs(a.replace(/\D/g, '').length - 10) - Math.abs(b.replace(/\D/g, '').length - 10));
  return cands[0] || '';
}

function parseCard(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  let email = '', phone = '', name = '', company = '';

  const em = text.match(EMAIL_RE); if (em) email = em[0].replace(/\s+/g, '').toLowerCase();
  phone = findPhone(text);

  for (const l of lines) { if (COMPANY_RE.test(l) && !EMAIL_RE.test(l)) { company = l; break; } }
  if (!company) {
    for (const l of lines) {
      if (EMAIL_RE.test(l) || /\d{3,}/.test(l)) continue;
      if (l.length > 3 && l === l.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(l)) { company = l; break; }
    }
  }
  // Excluye líneas que NO suelen ser un nombre de persona: web, dirección, puesto/rol
  const BAD_NAME_RE = /(www\.|https?:|\.com|\.mx|calle|avenida|\bav\b|\bcol\b|c\.?p\.?|\bno\.|#|director|gerent|ejecutiv|asesor|ventas|coordinad|propietari|founder|owner|manager|\bceo\b|\bcfo\b|\bcto\b|market|contad|recursos|represent)/i;
  for (const l of lines) {
    if (l === company || EMAIL_RE.test(l) || /@/.test(l) || /\d{2,}/.test(l) || BAD_NAME_RE.test(l)) continue;
    const words = l.split(/\s+/).filter(w => w.length > 1);
    const caps = words.filter(w => /^[A-ZÁÉÍÓÚÑ]/.test(w)).length; // palabras que empiezan con mayúscula
    if (words.length >= 2 && words.length <= 4 && caps >= 2 && l.length <= 42) { name = l.replace(/\s+/g, ' '); break; }
  }
  return { name, phone, email, company, lines };
}

export default function CardScanner({ onData, label = 'Escanear tarjeta' }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [review, setReview] = useState(null); // { name, phone, email, company, raw }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setBusy(true); setProg(0);
    try {
      const T = await loadTesseract();
      const canvas = await preprocess(file);
      const { data } = await T.recognize(canvas, 'eng+spa', {
        logger: m => { if (m.status === 'recognizing text') setProg(Math.round(m.progress * 100)); },
      });
      const raw = (data.text || '').trim();
      const parsed = parseCard(raw);
      setReview({ ...parsed, raw });
      const found = ['name', 'phone', 'email', 'company'].filter(k => parsed[k]);
      if (!found.length) toast('No se detectaron datos claros; revisa el texto leído y captúralos.', 'bad');
    } catch (err) {
      toast(err.message || 'No se pudo leer la imagen', 'bad');
    } finally {
      setBusy(false); setProg(0);
    }
  }

  function apply() {
    onData({ name: review.name, phone: review.phone, email: review.email, company: review.company });
    setReview(null);
    toast('Datos aplicados al formulario', 'ok');
  }

  return (
    <>
      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: '-3px' }}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
        </svg>
        {busy ? (prog ? `Leyendo… ${prog}%` : 'Cargando lector…') : label}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onFile} />

      {review && (
        <Modal title="Revisar datos de la tarjeta" onClose={() => setReview(null)} width={460}>
          <p className="muted mb" style={{ fontSize: '.82rem' }}>Esto detecté. Corrige lo que haga falta y aplícalo al formulario.</p>
          <div className="field"><label>Nombre</label><input value={review.name} onChange={e => setReview({ ...review, name: e.target.value })} /></div>
          {review.lines?.length > 0 && (
            <div style={{ margin: '-4px 0 12px' }}>
              <span className="muted" style={{ fontSize: '.74rem' }}>¿El nombre no es el correcto? Toca la línea correcta:</span>
              <div className="proj-members" style={{ marginTop: 5 }}>
                {review.lines.filter(l => !/@/.test(l) && l.length <= 42).slice(0, 8).map((l, i) => (
                  <button key={i} type="button" className={'proj-member-chip' + (review.name === l ? ' on' : '')} onClick={() => setReview({ ...review, name: l })}>{l}</button>
                ))}
              </div>
            </div>
          )}
          <div className="row2">
            <div className="field"><label>Teléfono</label><input value={review.phone} onChange={e => setReview({ ...review, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={review.email} onChange={e => setReview({ ...review, email: e.target.value })} /></div>
          </div>
          <div className="field"><label>Empresa</label><input value={review.company} onChange={e => setReview({ ...review, company: e.target.value })} /></div>
          <details style={{ marginBottom: 12 }}>
            <summary className="muted" style={{ fontSize: '.8rem', cursor: 'pointer' }}>Ver texto leído</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.76rem', background: 'var(--cream)', borderRadius: 10, padding: 10, marginTop: 6, maxHeight: 160, overflow: 'auto' }}>{review.raw || '(sin texto)'}</pre>
          </details>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setReview(null)}>Cancelar</button>
            <button className="btn" onClick={apply}>Usar estos datos</button>
          </div>
        </Modal>
      )}
    </>
  );
}
