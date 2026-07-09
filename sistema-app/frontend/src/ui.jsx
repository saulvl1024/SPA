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
// width: ancho máximo en px (default 480). Útil para formularios densos.
export function Modal({ title, children, onClose, width }) {
  const [closing, setClosing] = useState(false);

  // Cierre con salida animada: dispara la animación inversa y desmonta al terminar
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 180); // coincide con la duración de salida en CSS
  };

  // Cerrar con Escape (craft esperado en cualquier modal)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closing]);

  return (
    <div className={'overlay' + (closing ? ' closing' : '')}
      onClick={e => { if (e.target.classList.contains('overlay')) close(); }}>
      <div className={'modal' + (closing ? ' closing' : '')} style={width ? { maxWidth: width } : undefined}>
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

// Excel CON DISEÑO (HTML→.xls · sin librerías): encabezado grafito con línea dorada, filas
// alternadas, columnas numéricas a la derecha y fila de títulos congelada. Es el método más
// compatible: Excel siempre muestra los datos.
// Acepta dos formatos de hoja:
//   { name, columns:[{label,num?}], rows:[[valor,...]] }          (columnas explícitas)
//   { name, rows:[[encabezado...],[fila...],...] }                (encabezado en la fila 0; infiere numéricas)
export function downloadStyledExcel(filename, sheets) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const isNum = v => typeof v === 'number' ? isFinite(v)
    : (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, '')));

  // Normaliza cada hoja a { name, columns:[{label,num}], rows:[[...]] }
  const norm = sheets.map(sh => {
    if (sh.columns) return { name: sh.name, columns: sh.columns, rows: sh.rows };
    const header = (sh.rows[0] || []).map(h => String(h == null ? '' : h));
    const data = sh.rows.slice(1);
    const columns = header.map((label, ci) => ({
      label,
      num: data.length > 0 && data.some(r => isNum(r[ci])) && data.every(r => { const v = r[ci]; return v === '' || v == null || isNum(v); }),
    }));
    return { name: sh.name, columns, rows: data };
  });

  const HEAD = 'background:#2A2A30;color:#FFFFFF;font-weight:bold;border:1px solid #C9A66B;border-bottom-width:2px;padding:8px 11px;font-family:Calibri,Arial,sans-serif;font-size:11pt;';
  const wsBlock = norm.map(sh => `<x:ExcelWorksheet><x:Name>${esc(sh.name).slice(0, 31)}</x:Name><x:WorksheetOptions><x:FreezePanes/><x:FrozenNoColor/><x:SplitHorizontal>1</x:SplitHorizontal><x:TopRowBottomPane>1</x:TopRowBottomPane><x:ActivePane>2</x:ActivePane></x:WorksheetOptions></x:ExcelWorksheet>`).join('');
  const tables = norm.map(sh => {
    const head = '<tr>' + sh.columns.map(c => `<th style="${HEAD}text-align:${c.num ? 'right' : 'left'};">${esc(c.label)}</th>`).join('') + '</tr>';
    const body = sh.rows.map((r, ri) => {
      const bg = ri % 2 ? 'background:#F7F3EC;' : 'background:#FFFFFF;';
      return '<tr>' + sh.columns.map((c, ci) => {
        const v = r[ci];
        const B = `border:1px solid #E7E1D8;padding:6px 11px;${bg}font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#23232A;`;
        if (c.num) return `<td style="${B}text-align:right;mso-number-format:'#,##0.##';">${esc(v)}</td>`;
        return `<td style="${B}mso-number-format:'\\@';">${esc(v)}</td>`;
      }).join('') + '</tr>';
    }).join('');
    return `<table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${head}${body}</table>`;
  }).join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>${wsBlock}</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>${tables}</body></html>`;
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename + '.xls';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  toast('Excel descargado', 'ok');
}

export const money = n => '$' + Math.round(n || 0).toLocaleString('es-MX');
export const initials = n => (n || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// Normaliza texto para búsquedas: minúsculas y SIN acentos (María → maria).
export const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
// ¿El texto contiene la consulta, ignorando acentos y mayúsculas?
export const matches = (text, query) => norm(text).includes(norm(query));