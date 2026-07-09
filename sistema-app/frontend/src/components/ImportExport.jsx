import { useRef, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, downloadStyledExcel } from '../ui.jsx';

/* ---------- utilidades ---------- */
const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const xmlEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Ancho de columna según el tipo de dato
function colWidth(key) {
  if (['note', 'notes', 'address', 'title', 'name', 'cliente', 'empresa'].includes(key)) return 180;
  if (['email'].includes(key)) return 165;
  if (['amount', 'embudo', 'tag'].includes(key)) return 90;
  return 120;
}

/* ---------- Excel con estilo (SpreadsheetML 2003, sin librerías) ---------- */
// Genera un .xls que Excel abre con encabezado de color, filas alternadas y fila fija.
function toExcel(rows, columns, sheet) {
  const styles = `
  <Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#2A2A30" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#C9A66B"/></Borders></Style>
  <Style ss:ID="cell"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7E1D8"/></Borders></Style>
  <Style ss:ID="alt"><Alignment ss:Vertical="Center"/><Interior ss:Color="#F7F3EC" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7E1D8"/></Borders></Style>
  <Style ss:ID="hnum"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#2A2A30" ss:Pattern="Solid"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#C9A66B"/></Borders></Style>
  <Style ss:ID="num"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7E1D8"/></Borders></Style>
  <Style ss:ID="numAlt"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="#,##0.00"/><Interior ss:Color="#F7F3EC" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7E1D8"/></Borders></Style>`;

  const cols = columns.map(c => `<Column ss:Width="${colWidth(c.key)}"/>`).join('');
  const header = '<Row ss:Height="24">' + columns.map(c =>
    `<Cell ss:StyleID="${c.key === 'amount' ? 'hnum' : 'hdr'}"><Data ss:Type="String">${xmlEsc(c.label)}</Data></Cell>`).join('') + '</Row>';

  const body = rows.map((r, ri) => {
    const alt = ri % 2 === 1;
    const cells = columns.map(c => {
      const v = r[c.key];
      if (c.key === 'amount') {
        return `<Cell ss:StyleID="${alt ? 'numAlt' : 'num'}"><Data ss:Type="Number">${Number(v) || 0}</Data></Cell>`;
      }
      return `<Cell ss:StyleID="${alt ? 'alt' : 'cell'}"><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`;
    }).join('');
    return '<Row>' + cells + '</Row>';
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">
 <Styles>${styles}
 </Styles>
 <Worksheet ss:Name="${xmlEsc(sheet || 'Datos')}">
  <Table>${cols}${header}${body}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/><FrozenNoColor/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

/* ---------- CSV (para la plantilla y para importar) ---------- */
function toCSV(rows, columns) {
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = columns.map(c => c.label).join(',');
  const body = rows.map(r => columns.map(c => esc(r[c.key])).join(',')).join('\r\n');
  return head + '\r\n' + body;
}

function parseCSV(text) {
  const t = text.replace(/^﻿/, '');
  const rows = []; let row = []; let field = ''; let inQ = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* el \n cierra la fila */ }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(c => (c || '').trim() !== ''))
    .map(r => { const o = {}; header.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); }); return o; });
}

// Parsea el Excel con estilo (SpreadsheetML) que exportamos, por si el usuario reimporta ese mismo archivo
function parseSpreadsheetML(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const rowEls = Array.from(doc.getElementsByTagName('Row'));
  const grid = rowEls.map(re => Array.from(re.getElementsByTagName('Cell')).map(ce => {
    const dataEl = ce.getElementsByTagName('Data')[0];
    return dataEl ? dataEl.textContent : '';
  }));
  if (!grid.length) return [];
  const header = grid[0].map(h => (h || '').trim());
  return grid.slice(1)
    .filter(r => r.some(c => (c || '').trim() !== ''))
    .map(r => { const o = {}; header.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); }); return o; });
}

// Traduce los encabezados del archivo (español o clave interna) a las claves internas que espera el backend
function remapRows(rows, columns) {
  const map = {};
  columns.forEach(c => { map[norm(c.label)] = c.key; map[norm(c.key)] = c.key; });
  return rows.map(r => {
    const o = {};
    for (const [h, v] of Object.entries(r)) { const key = map[norm(h)]; if (key) o[key] = v; }
    return o;
  });
}

function download(filename, content, mime) {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

const Ic = ({ d }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

/**
 * Botones de Exportar (Excel con estilo) / Importar (CSV o el mismo Excel).
 * props: exportUrl, importUrl, filename (base sin extensión), columns [{key,label}], label (entidad), onDone()
 */
export default function ImportExport({ exportUrl, importUrl, filename, columns, label = 'registros', onDone }) {
  const fileRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);   // filas ya remapeadas a claves internas
  const [fname, setFname] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const sheetName = label.charAt(0).toUpperCase() + label.slice(1);

  async function doExport() {
    try {
      const data = await api.get(exportUrl);
      if (!data.length) return toast('No hay ' + label + ' para exportar', 'bad');
      const cols = columns.map(c => ({ label: c.label, num: c.key === 'amount' }));
      const rows = data.map(d => columns.map(c => d[c.key]));
      downloadStyledExcel(filename, [{ name: sheetName, columns: cols, rows }]);
      toast(`Exportados ${data.length} ${label}`, 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  function downloadTemplate() {
    const blank = Object.fromEntries(columns.map(c => [c.key, '']));
    download('plantilla_' + filename + '.csv', toCSV([blank], columns), 'text/csv;charset=utf-8;');
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFname(f.name); setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        if (text.startsWith('PK')) { toast('Ese es un Excel .xlsx. Ábrelo en Excel y usa "Guardar como CSV" para importarlo.', 'bad'); return; }
        const looksXml = /^\s*<\?xml|<Workbook|<Table/.test(text);
        const parsed = looksXml ? parseSpreadsheetML(text) : parseCSV(text);
        if (!parsed.length) { toast('El archivo no tiene filas', 'bad'); return; }
        const mapped = remapRows(parsed, columns).filter(r => Object.keys(r).length);
        if (!mapped.length) { toast('No se reconocieron las columnas. Usa la plantilla como referencia.', 'bad'); return; }
        setRows(mapped);
      } catch (err) { toast('No se pudo leer el archivo: ' + err.message, 'bad'); }
    };
    reader.readAsText(f);
    e.target.value = '';
  }

  async function doImport() {
    if (!rows?.length) return;
    setBusy(true);
    try {
      const r = await api.post(importUrl, { rows });
      setResult(r);
      const parts = [];
      if (r.created != null) parts.push(`${r.created} nuevos`);
      if (r.updated != null) parts.push(`${r.updated} actualizados`);
      if (r.skipped) parts.push(`${r.skipped} omitidos`);
      toast(`Importación lista · ${parts.join(', ')}`, 'ok');
      onDone?.();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }

  function close() { setOpen(false); setRows(null); setFname(''); setResult(null); }

  const labelsText = columns.map(c => c.label).join(', ');

  return (
    <>
      <div className="io-btns">
        <button className="btn ghost sm" onClick={doExport} title={`Descargar ${label} en Excel`}>
          <Ic d={<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>} /> Exportar
        </button>
        <button className="btn ghost sm" onClick={() => setOpen(true)} title={`Cargar ${label} desde archivo`}>
          <Ic d={<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 21h16" /></>} /> Importar
        </button>
      </div>

      {open && (
        <Modal title={`Importar ${label}`} onClose={close} width={520}>
          {!result ? (
            <>
              <p className="muted mb" style={{ fontSize: '.85rem' }}>
                Sube un archivo CSV (o el Excel que exportaste). Columnas: <b>{labelsText}</b>.
                {' '}<span className="link" onClick={downloadTemplate}>Descargar plantilla</span>
              </p>

              <div className="io-drop" onClick={() => fileRef.current?.click()}>
                <Ic d={<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 21h16" /></>} />
                <b>{fname || 'Elegir archivo'}</b>
                <small className="muted">{rows ? `${rows.length} filas detectadas` : 'CSV o Excel (.xls)'}</small>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xls,.xml,text/csv" onChange={onFile} style={{ display: 'none' }} />

              {rows && rows.length > 0 && (
                <div className="io-preview">
                  <div className="io-preview-head">Vista previa · primeras {Math.min(3, rows.length)}</div>
                  {rows.slice(0, 3).map((r, i) => (
                    <div key={i} className="io-preview-row">{columns.map(c => r[c.key]).filter(Boolean).slice(0, 4).join(' · ') || '—'}</div>
                  ))}
                </div>
              )}

              <div className="modal-actions">
                <button className="btn ghost" onClick={close}>Cancelar</button>
                <button className="btn" disabled={!rows?.length || busy} onClick={doImport}>
                  {busy ? 'Importando…' : `Importar ${rows?.length || 0}`}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="io-result">
                {result.created != null && <div className="io-stat"><b>{result.created}</b><span>nuevos</span></div>}
                {result.updated != null && <div className="io-stat"><b>{result.updated}</b><span>actualizados</span></div>}
                {result.skipped != null && <div className="io-stat"><b>{result.skipped}</b><span>omitidos</span></div>}
              </div>
              {result.errors?.length > 0 && (
                <div className="io-errors">
                  <b>{result.errors.length} con error:</b>
                  <ul>{result.errors.slice(0, 8).map((er, i) => <li key={i}>{er}</li>)}</ul>
                  {result.errors.length > 8 && <small className="muted">…y {result.errors.length - 8} más</small>}
                </div>
              )}
              <div className="modal-actions"><button className="btn" onClick={close}>Listo</button></div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
