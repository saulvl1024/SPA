import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { downloadStyledExcel, toast } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import Select from '../components/Select.jsx';

const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const firstOfMonth = () => { const d = new Date(); return localISO(new Date(d.getFullYear(), d.getMonth(), 1)); };

const MODULE_LABEL = {
  pos: 'Punto de venta', compras: 'Compras', inventario: 'Inventario', caja: 'Caja',
  gastos: 'Caja chica', personal: 'Personal', promociones: 'Promociones', agenda: 'Agenda', crm: 'CRM',
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
const SENSITIVE = new Set(['cancelacion', 'cancelar_cita', 'eliminar_gasto', 'eliminar_promo', 'cambio_permisos', 'desactivar_empleado', 'cambio_pin']);
const monogram = name => (name || '·').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const Ic = ({ d, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);
const MODULE_ICON = {
  pos: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  compras: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></>,
  inventario: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="M3 8l9 5 9-5" /></>,
  caja: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  gastos: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M9.5 10.5h3.2a1.8 1.8 0 0 1 0 3.5H9.5" /></>,
  personal: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  promociones: <><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" /></>,
  agenda: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  crm: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>,
};
const fmtTime = d => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const fmtDate = d => new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
function dayLabel(k) {
  const t = localISO(new Date());
  const y = localISO(new Date(Date.now() - 86400000));
  if (k === t) return 'Hoy';
  if (k === y) return 'Ayer';
  return new Date(k + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

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
    downloadStyledExcel(`Auditoria_${from}_a_${to}`, [{ name: 'Bitácora', rows: [header, ...body] }]);
  }

  // KPIs
  const sensitiveCount = rows.filter(r => SENSITIVE.has(r.action)).length;
  const actorsCount = new Set(rows.map(r => r.actorName).filter(Boolean)).size;
  const modulesCount = new Set(rows.map(r => r.module).filter(Boolean)).size;

  // Agrupar por día (preservando el orden que llega del servidor)
  const groups = [];
  let cur = null;
  rows.forEach(r => {
    const k = localISO(new Date(r.date));
    if (!cur || cur.k !== k) { cur = { k, items: [] }; groups.push(cur); }
    cur.items.push(r);
  });

  return (
    <>
      <div className="top">
        <div><h1>Auditoría</h1><div className="sub">Bitácora de movimientos · quién hizo qué y cuándo</div></div>
        <button className="btn ghost" onClick={exportXls} disabled={!rows.length}>
          <Ic s={15} d={<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>} /> Exportar
        </button>
      </div>

      <div className="inv-kpis">
        <div className="inv-kpi"><span className="inv-kpi-ic plum"><Ic s={18} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>} /></span><div><b>{rows.length}</b><span>Movimientos</span></div></div>
        <div className={'inv-kpi' + (sensitiveCount ? ' bad' : '')}><span className="inv-kpi-ic bad"><Ic s={18} d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v4M12 16h.01" /></>} /></span><div><b style={sensitiveCount ? { color: 'var(--bad)' } : undefined}>{sensitiveCount}</b><span>Acciones sensibles</span></div></div>
        <div className="inv-kpi"><span className="inv-kpi-ic plum"><Ic s={18} d={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>} /></span><div><b>{actorsCount}</b><span>Usuarios</span></div></div>
        <div className="inv-kpi"><span className="inv-kpi-ic gold"><Ic s={18} d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>} /></span><div><b>{modulesCount}</b><span>Módulos con actividad</span></div></div>
      </div>

      <div className="card audit-filters">
        <div className="field"><label className="field-lbl">Desde</label><DateField value={from} onChange={setFrom} /></div>
        <div className="field"><label className="field-lbl">Hasta</label><DateField value={to} onChange={setTo} /></div>
        <div className="field"><label className="field-lbl">Usuario</label>
          <Select value={actorId} onChange={setActorId} placeholder="Todos"
            options={[{ value: '', label: 'Todos' }, ...meta.actors.map(a => ({ value: a.id, label: a.name }))]} />
        </div>
        <div className="field"><label className="field-lbl">Módulo</label>
          <Select value={module} onChange={setModule} placeholder="Todos"
            options={[{ value: '', label: 'Todos' }, ...meta.modules.map(m => ({ value: m, label: modLabel(m) }))]} />
        </div>
        <div className="field audit-search"><label className="field-lbl">Buscar en detalle</label>
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Ej. nombre, folio, monto…" />
        </div>
        <button className="btn audit-apply" onClick={load}>
          <Ic s={15} d={<><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z" /></>} /> Filtrar
        </button>
      </div>

      {loading ? (
        <div className="card"><div className="empty">Cargando…</div></div>
      ) : !rows.length ? (
        <div className="empty-cal">
          <Ic s={28} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>} />
          <p>Sin movimientos en este periodo</p>
          <span className="muted">Ajusta el rango de fechas o los filtros.</span>
        </div>
      ) : (
        <div className="audit-feed">
          {groups.map(g => (
            <div key={g.k} className="audit-group">
              <div className="audit-day"><span>{dayLabel(g.k)}</span><i>{g.items.length} mov.</i></div>
              {g.items.map((r, i) => {
                const sens = SENSITIVE.has(r.action);
                return (
                  <div key={r.id} className={'audit-item' + (sens ? ' sensitive' : '')} style={{ '--i': Math.min(i, 12) }}>
                    <span className={'audit-mono' + (sens ? ' sens' : '')}>{sens
                      ? <Ic s={15} d={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>} />
                      : monogram(r.actorName)}</span>
                    <div className="audit-body">
                      <div className="audit-line">
                        <span className="audit-action">{actLabel(r.action)}</span>
                        <span className="audit-mod"><Ic s={12} d={MODULE_ICON[r.module] || <circle cx="12" cy="12" r="3" />} /> {modLabel(r.module)}</span>
                      </div>
                      <div className="audit-sum">{r.summary}</div>
                      <div className="audit-actor">{r.actorName}</div>
                    </div>
                    <span className="audit-time">{fmtTime(r.date)}</span>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="muted" style={{ fontSize: '.82rem', marginTop: 4 }}>{rows.length} movimiento(s) en total</div>
        </div>
      )}
    </>
  );
}
