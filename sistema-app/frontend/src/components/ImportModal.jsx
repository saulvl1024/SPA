import { useState } from 'react';
import { api } from '../api.js';
import { Modal, toast } from '../ui.jsx';

// Modal de importación masiva reutilizable.
// props: title, endpoint ('clients'|'products'), columns (def. de plantilla), onDone
export default function ImportModal({ title, endpoint, columns, sample, onDone, onClose }) {
  const [rows, setRows] = useState(null);   // filas parseadas
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  // Descarga una plantilla con los encabezados y una fila de ejemplo
  function downloadTemplate() {
    if (!window.XLSX) return toast('No se pudo generar la plantilla', 'bad');
    const ws = window.XLSX.utils.aoa_to_sheet([columns, sample]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    window.XLSX.writeFile(wb, `plantilla_${endpoint}.xlsx`);
  }

  // Lee el archivo Excel/CSV y lo convierte en filas {columna: valor}
  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = window.XLSX.read(ev.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!json.length) return toast('El archivo está vacío', 'bad');
        setRows(json);
      } catch { toast('No se pudo leer el archivo', 'bad'); }
    };
    reader.readAsBinaryString(file);
  }

  async function doImport() {
    if (!rows?.length) return toast('Sube un archivo primero', 'bad');
    setBusy(true);
    try {
      const res = await api.post('/import/' + endpoint, { rows });
      setResult(res);
      toast(`${res.inserted} registro(s) importados`, 'ok');
      onDone?.();
    } catch (e) { toast(e.message, 'bad'); }
    setBusy(false);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <ol className="muted" style={{ fontSize: '.86rem', paddingLeft: 18, marginBottom: 12, lineHeight: 1.6 }}>
        <li>Descarga la plantilla y llénala (no cambies los encabezados).</li>
        <li>Guárdala y súbela aquí (Excel .xlsx o CSV).</li>
        <li>Revisa el resumen y confirma.</li>
      </ol>

      <button className="btn ghost" onClick={downloadTemplate} style={{ marginBottom: 12 }}>⬇ Descargar plantilla</button>

      <div className="field">
        <label>Archivo (.xlsx o .csv)</label>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} />
        {fileName && rows && <p className="muted" style={{ fontSize: '.8rem', marginTop: 4 }}>{fileName} · {rows.length} fila(s) detectada(s)</p>}
      </div>

      {result && (
        <div className="card" style={{ background: 'var(--cream)', marginTop: 8 }}>
          <div><b style={{ color: 'var(--ok)' }}>{result.inserted}</b> importados de {result.totalFilas} filas.</div>
          {result.errores?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div className="muted" style={{ fontSize: '.82rem' }}>{result.errores.length} fila(s) con error:</div>
              <ul style={{ paddingLeft: 18, fontSize: '.8rem', color: 'var(--bad)', maxHeight: 120, overflow: 'auto' }}>
                {result.errores.slice(0, 20).map((e, i) => <li key={i}>Fila {e.fila}: {e.error}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>Cerrar</button>
        <button className="btn" disabled={busy || !rows?.length} onClick={doImport}>{busy ? 'Importando…' : 'Importar'}</button>
      </div>
    </Modal>
  );
}
