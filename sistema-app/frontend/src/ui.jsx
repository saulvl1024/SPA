import { useEffect, useState } from 'react';

/* ---- Toast (notificaciones) ---- */
let pushToast = () => {};
export function toast(msg, type = '') { pushToast(msg, type); }

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    pushToast = (msg, type) => {
      const id = Math.random();
      setItems(s => [...s, { id, msg, type }]);
      setTimeout(() => setItems(s => s.filter(i => i.id !== id)), 3000);
    };
  }, []);
  return (
    <div className="toasts">
      {items.map(i => <div key={i.id} className={'toast ' + i.type}>{i.msg}</div>)}
    </div>
  );
}

/* ---- Modal ---- */
export function Modal({ title, children, onClose }) {
  return (
    <div className="overlay" onClick={e => { if (e.target.classList.contains('overlay')) onClose(); }}>
      <div className="modal">
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/* ---- Descarga a Excel (SheetJS) con respaldo CSV ---- */
export function downloadExcel(filename, sheets) {
  if (window.XLSX) {
    const wb = window.XLSX.utils.book_new();
    sheets.forEach(s => {
      const ws = window.XLSX.utils.aoa_to_sheet(s.rows);
      window.XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    });
    window.XLSX.writeFile(wb, filename + '.xlsx');
    toast('Excel descargado', 'ok');
  } else {
    const rows = sheets[0].rows.map(r => r.map(c => `"${('' + c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const b = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = filename + '.csv'; a.click();
    toast('CSV descargado', 'ok');
  }
}

export const money = n => '$' + Math.round(n || 0).toLocaleString('es-MX');
export const initials = n => (n || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
