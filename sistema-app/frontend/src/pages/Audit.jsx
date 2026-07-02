import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { downloadExcel, toast } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import Select from '../components/Select.jsx';

const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const firstOfMonth = () => { const d = new Date(); return localISO(new Date(d.getFullYear(), d.getMonth(), 1)); };

// Etiquetas legibles
const MODULE_LABEL = {
  pos: 'Punto de venta', compras: 'Compras', inventario: 'Inventario', caja: 'Caja',
  gastos: 'Caja chica', personal: 'Personal', promociones: 'Promociones', agenda: 'Agenda',
};
const ACTION_LABEL = {
  venta: 'Venta', cancelacion: 'Cancelación', compra: 'Compra',
  alta_insumo: 'Alta de insumo', alta_producto: 'Alta de producto', ajuste_stock: 'Ajuste de stock',
  cambio_minimo: 'Cambio de mínimo', cambio_receta: 'Cambio de receta',
  abrir_caja: 'Apertura de caja', corte: 'Corte de caja', salida_efectivo: 'Salida de efectivo',
  gasto: 'Gasto', eliminar_gasto: 'Eliminó gasto',
  alta_empleado: 'Alta de empleado', editar_empleado: 'Editó empleado', cambio_permisos: 'Cambio de permisos',
  cambio_pin: 'Cambió PIN', reactivar_empleado: 'Reactivó empleado', desactivar_empleado: 'Desactivó empleado',
  crear_promo: 'Creó promoción', editar_promo: 'Editó promoción', eliminar_promo: 'Eliminó promoción',
  agendar_cita: 'Agendó cita', cancelar_cita: 'Canceló cita', cambio_estado_cita: 'Cambió estado de cita',
};
const modLabel = m => MODULE_LABEL[m] || m;
const actLabel = a => ACTION_LABEL[a] || a;

// Acciones sensibles que conviene resaltar
const SENSITIVE = new Set(['cancelacion', 'cancelar_cita', 'eliminar_gasto', 'eliminar_promo', 'cambio_permisos', 'desactivar_empleado', 'cambio_pin']);

const fmtDate = d => new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export default function Audit() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(localISO(new Date()));
  const [actorId, setActorId] = useState('');
  const [module, setModule] = useState('');
  const [q, setQ] = useState('');
  const [meta, setMeta] = useState({ actors: [], modules: [] });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get('/audit/meta').then(setMeta).catch(() => {}); }, []);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (actorId) params.set('actorId', actorId);
      if (module) params.set('module', module);
      if (q.trim()) params.set('q', q.trim());
      setRows(await api.get('/audit?' + params.toString()));
    } catch (e) { toast(e.message, 'bad'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  function exportXls() {
    const header = ['Fecha y hora', 'Usuario', 'Módulo', 'Acción', 'Detalle'];
    const body = rows.map(r => [fmtDate(r.date), r.actorName, modLabel(r.module), actLabel(r.action), r.summary]);
    downloadExcel(`Auditoria_${from}_a_${to}`, [{ name: 'Bitácora', rows: [header, ...body] }]);
  }

  return (
    <>
      <div className="top">
        <div><h1>Auditoría</h1><div className="sub">Bitácora de movimientos · quién hizo qué y cuándo</div></div>
        <button className="btn ghost" onClick={exportXls} disabled={!rows.length}>⬇ Exportar a Excel</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0 }}><label>Desde</label><DateField style={{ width: 150 }} value={from} onChange={setFrom} /></div>
          <div className="field" style={{ margin: 0 }}><label>Hasta</label><DateField style={{ width: 150 }} value={to} onChange={setTo} /></div>
          <div className="field" style={{ margin: 0 }}><label>Usuario</label>
            <Select value={actorId} onChange={setActorId} style={{ width: 180 }} placeholder="Todos"
              options={[{ value: '', label: 'Todos' }, ...meta.actors.map(a => ({ value: a.id, label: a.name }))]} />
          </div>
          <div className="field" style={{ margin: 0 }}><label>Módulo</label>
            <Select value={module} onChange={setModule} style={{ width: 170 }} placeholder="Todos"
              options={[{ value: '', label: 'Todos' }, ...meta.modules.map(m => ({ value: m, label: modLabel(m) }))]} />
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}><label>Buscar en detalle</label>
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Ej. nombre, folio, monto..." />
          </div>
          <button className="btn" onClick={load}>Filtrar</button>
        </div>
      </div>

      <div className="card">
        {loading ? <div className="empty">Cargando…</div> : !rows.length ? <div className="empty">Sin movimientos en este periodo</div> : (
          <table style={{ width: '100%' }}>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={SENSITIVE.has(r.action) ? { background: 'rgba(190,80,90,.06)' } : undefined}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '.82rem' }}>{fmtDate(r.date)}</td>
                  <td>{r.actorName}</td>
                  <td><span className="badge" style={{ background: 'var(--line)', color: 'var(--ink)' }}>{modLabel(r.module)}</span></td>
                  <td>{SENSITIVE.has(r.action) ? <b style={{ color: 'var(--bad)' }}>{actLabel(r.action)}</b> : actLabel(r.action)}</td>
                  <td className="muted">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 0 && <div className="muted" style={{ marginTop: 12, fontSize: '.82rem' }}>{rows.length} movimiento(s)</div>}
      </div>
    </>
  );
}
