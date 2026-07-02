import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { es } from 'react-day-picker/locale';
import 'react-day-picker/style.css';

/* Selector de fecha bonito (drop-in para <input type="date">).
   value y onChange usan cadena 'YYYY-MM-DD' (igual que el input nativo). */

const pad = n => String(n).padStart(2, '0');
const toStr = d => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
const fromStr = s => {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const label = s => {
  const d = fromStr(s);
  return d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
};

export default function DateField({ value, onChange, placeholder = 'Seleccionar fecha', style, fromYear = 1940, toYear, inline = false }) {
  const [open, setOpen] = useState(false);
  const [inModal, setInModal] = useState(false);
  const [alignRight, setAlignRight] = useState(false); // abrir hacia la izquierda si no cabe a la derecha
  const box = useRef(null);
  const selected = fromStr(value);
  const endYear = toYear || (new Date().getFullYear() + 2);
  // Dentro de un modal (.modal) el popover flotante se recorta → usar siempre inline ahí
  const useInline = inline || inModal;

  useEffect(() => {
    const onDoc = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Al abrir: detecta si el calendario (~300px) cabe a la derecha; si no, lo alinea por la derecha.
  function openCalendar() {
    const modal = !!box.current?.closest?.('.modal');
    setInModal(modal);
    if (!modal && box.current) {
      const r = box.current.getBoundingClientRect();
      setAlignRight(window.innerWidth - r.left < 320); // no cabe a la derecha → alinear derecha
    }
    setOpen(o => !o);
  }

  return (
    <div className="datefield" ref={box} style={{ position: 'relative', ...style }}>
      <input readOnly value={label(value)} placeholder={placeholder}
        onClick={openCalendar}
        style={{ cursor: 'pointer', width: '100%' }} />
      {open && (
        <div className={useInline ? 'datefield-inline' : 'card'} style={useInline
          ? { padding: 10, ...(alignRight ? { left: 'auto', right: 0 } : {}) }
          : { position: 'absolute', top: 48, ...(alignRight ? { right: 0 } : { left: 0 }), zIndex: 60, padding: 8, boxShadow: '0 18px 40px -16px rgba(46,42,40,.3)', width: 'max-content', maxWidth: '90vw' }}>
          <DayPicker
            mode="single"
            locale={es}
            selected={selected}
            defaultMonth={selected || new Date()}
            captionLayout="dropdown"
            startMonth={new Date(fromYear, 0)}
            endMonth={new Date(endYear, 11)}
            onSelect={d => { onChange(toStr(d)); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}
