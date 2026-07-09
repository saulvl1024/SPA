import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, money, initials, matches } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import Select from '../components/Select.jsx';
import { setting } from '../permissions.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']];
const defaultSchedule = () => ({ 1: { on: true, from: '09:00', to: '20:00' }, 2: { on: true, from: '09:00', to: '20:00' }, 3: { on: true, from: '09:00', to: '20:00' }, 4: { on: true, from: '09:00', to: '20:00' }, 5: { on: true, from: '09:00', to: '20:00' }, 6: { on: true, from: '09:00', to: '18:00' }, 0: { on: false, from: '09:00', to: '14:00' } });
const empty = { name: '', pin: '', email: '', password: '', role: 'empleada', specialty: '', commissionRate: 0.10, phone: '', position: '', hireDate: '', permissions: [], schedule: null };

const Ic = ({ d, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);
const I = {
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
  pct: <><circle cx="12" cy="12" r="9" /><path d="M8.5 8.5 15.5 15.5M9 9h.01M15 15h.01" /></>,
  cal: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" />,
  chart: <><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-5" /></>,
  folder: <><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9l-1.7-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  power: <><path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0" /></>,
  check: <><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="M22 4 12 14l-3-3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

export default function Staff() {
  const [list, setList] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [perf, setPerf] = useState(null);
  const [modules, setModules] = useState([]);
  const [defaultEmp, setDefaultEmp] = useState([]);
  const [confirmOff, setConfirmOff] = useState(null);
  const [docsFor, setDocsFor] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const usaAlmacenes = setting('usarAlmacenes', false);

  const load = () => api.get('/staff?all=true').then(setList);
  useEffect(() => {
    load();
    api.get('/catalog/modules').then(d => { setModules(d.modules); setDefaultEmp(d.defaultEmployee); }).catch(() => {});
    if (usaAlmacenes) api.get('/warehouses').then(setWarehouses).catch(() => {});
  }, []); // eslint-disable-line

  const togglePerm = k => setForm(f => {
    const has = (f.permissions || []).includes(k);
    return { ...f, permissions: has ? f.permissions.filter(x => x !== k) : [...(f.permissions || []), k] };
  });

  const activos = list.filter(s => s.active);
  const inactivos = list.filter(s => !s.active);
  const especialistas = activos.filter(s => s.specialty).length;
  const admins = activos.filter(s => s.role === 'admin').length;
  const visible = list
    .filter(s => showInactive ? true : s.active)
    .filter(s => !q.trim() || matches(s.name || '', q) || matches(s.position || '', q) || matches(s.specialty || '', q) || matches(s.email || '', q));

  async function save() {
    try {
      if (!form.name) return toast('El nombre es obligatorio', 'bad');
      if (!form.id && (!form.email || !form.password)) return toast('Correo y contraseña son obligatorios', 'bad');
      if (form.id) await api.put('/staff/' + form.id, form);
      else await api.post('/staff', form);
      setForm(null); load(); toast('Empleado guardado', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function deactivate(s) {
    try { await api.del('/staff/' + s.id); setConfirmOff(null); load(); toast('Empleado desactivado', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  }
  async function activate(s) {
    try { await api.patch('/staff/' + s.id + '/activate'); load(); toast('Empleado reactivado', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  }
  async function openPerf(s) {
    try { const data = await api.get(`/staff/${s.id}/performance`); setPerf({ staff: s, data }); } catch (e) { toast(e.message, 'bad'); }
  }
  function openEdit(s) {
    setForm({ id: s.id, name: s.name, role: s.role, specialty: s.specialty || '', commissionRate: s.commissionRate, phone: s.phone || '', email: s.email || '', password: '', position: s.position || '', hireDate: s.hireDate ? s.hireDate.slice(0, 10) : '', pin: '', permissions: s.permissions || [], schedule: s.schedule || null, warehouseId: s.warehouseId || '' });
  }
  const roleLabel = s => s.role === 'admin' ? 'Administrador' : 'Empleado';

  return (
    <>
      <div className="top">
        <div><h1>Personal</h1><div className="sub">{activos.length} activos{inactivos.length ? ` · ${inactivos.length} inactivos` : ''}</div></div>
        <button className="btn" onClick={() => setForm({ ...empty })}><Ic s={15} d={<><path d="M12 5v14M5 12h14" /></>} /> Nuevo empleado</button>
      </div>

      <div className="inv-kpis">
        <div className="inv-kpi"><span className="inv-kpi-ic plum"><Ic s={18} d={I.user} /></span><div><b>{activos.length}</b><span>Empleados activos</span></div></div>
        <div className="inv-kpi"><span className="inv-kpi-ic gold"><Ic s={18} d={<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.9 6.9a2.12 2.12 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" /></>} /></span><div><b>{especialistas}</b><span>Especialistas</span></div></div>
        <div className="inv-kpi"><span className="inv-kpi-ic plum"><Ic s={18} d={I.shield} /></span><div><b>{admins}</b><span>Administradores</span></div></div>
        <div className="inv-kpi"><span className="inv-kpi-ic gold"><Ic s={18} d={I.folder} /></span><div><b>{list.length}</b><span>Total en plantilla</span></div></div>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search">
          <Ic s={16} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />
          <input placeholder="Buscar por nombre, puesto o especialidad…" value={q} onChange={e => setQ(e.target.value)} />
          {q && <button className="inv-search-x" onClick={() => setQ('')} title="Limpiar"><Ic s={14} d={<><path d="M18 6 6 18M6 6l12 12" /></>} /></button>}
        </div>
        {inactivos.length > 0 && (
          <button className={'inv-filter-chip' + (showInactive ? ' on' : '')} onClick={() => setShowInactive(v => !v)}>
            <Ic s={14} d={I.user} /> Ver inactivos
          </button>
        )}
        <span className="inv-count">{visible.length} de {list.length}</span>
      </div>

      {visible.length === 0 ? (
        <div className="empty-cal">
          <Ic s={28} d={I.user} />
          <p>{list.length ? 'Nadie coincide con la búsqueda' : 'Sin empleados'}</p>
          <span className="muted">Agrega a tu equipo con "Nuevo empleado".</span>
        </div>
      ) : (
        <div className="staff-grid">
          {visible.map((s, i) => (
            <div key={s.id} className={'staff-card' + (s.active ? '' : ' off')} style={{ '--i': i }}>
              <div className="staff-card-top">
                <span className={'staff-av' + (s.role === 'admin' ? ' admin' : '')}>{initials(s.name)}</span>
                <div className="staff-id">
                  <div className="staff-name">{s.name}<span className={'staff-dot' + (s.active ? ' on' : '')} title={s.active ? 'Activo' : 'Inactivo'} /></div>
                  <div className="staff-pos">{s.position || roleLabel(s)}{s.specialty ? ` · ${s.specialty}` : ''}</div>
                </div>
                {s.role === 'admin' && <span className="staff-tag">Admin</span>}
              </div>

              <div className="staff-meta">
                <span>Comisión {Math.round((s.commissionRate || 0) * 100)}%</span>
                {s.hireDate && <><i /><span>Desde {new Date(s.hireDate).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}</span></>}
                {s.phone && <><i /><span>{s.phone}</span></>}
              </div>

              <div className="staff-foot">
                <div className="staff-foot-btns">
                  <button className="icon-btn" title="Editar" onClick={() => openEdit(s)}><Ic s={15} d={I.edit} /></button>
                  <button className="icon-btn" title="Desempeño" onClick={() => openPerf(s)}><Ic s={15} d={I.chart} /></button>
                  <button className="icon-btn" title="Documentos" onClick={() => setDocsFor(s)}><Ic s={15} d={I.folder} /></button>
                </div>
                {s.active
                  ? <button className="icon-btn danger" title="Desactivar" onClick={() => setConfirmOff(s)}><Ic s={15} d={I.power} /></button>
                  : <button className="staff-reactivate" onClick={() => activate(s)}><Ic s={14} d={I.check} /> Reactivar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Editar empleado' : 'Nuevo empleado'} onClose={() => setForm(null)} width={720}>
          <div className="exp-form">
            <section className="form-sec">
              <div className="form-sec-head"><span className="form-sec-ic"><Ic s={15} d={I.user} /></span>Datos del empleado</div>
              <div className="field"><label className="field-lbl">Nombre completo *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="row2">
                <div className="field"><label className="field-lbl">Puesto</label><input value={form.position} placeholder="Recepción, Esteticista…" onChange={e => setForm({ ...form, position: e.target.value })} /></div>
                <div className="field"><label className="field-lbl">Rol</label><Select value={form.role} onChange={v => setForm({ ...form, role: v })} options={[{ value: 'empleada', label: 'Empleado' }, { value: 'admin', label: 'Administrador' }]} /></div>
              </div>
              <div className="row2">
                <div className="field"><label className="field-lbl">Teléfono</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="field"><label className="field-lbl">Fecha de ingreso</label><DateField value={form.hireDate} onChange={v => setForm({ ...form, hireDate: v })} inline /></div>
              </div>
              <div className="row2">
                <div className="field"><label className="field-lbl">Especialidad (si atiende)</label><input value={form.specialty} placeholder="Faciales, Masajes…" onChange={e => setForm({ ...form, specialty: e.target.value })} /></div>
                <div className="field"><label className="field-lbl">Comisión (%)</label><input type="number" value={Math.round((form.commissionRate || 0) * 100)} onChange={e => setForm({ ...form, commissionRate: (+e.target.value || 0) / 100 })} /></div>
              </div>
              {usaAlmacenes && warehouses.length > 0 && (
                <div className="field" style={{ marginBottom: 0 }}><label className="field-lbl">Sucursal asignada</label>
                  <Select value={form.warehouseId || ''} onChange={v => setForm({ ...form, warehouseId: v })} placeholder="Sin sucursal asignada"
                    options={[{ value: '', label: 'Sin sucursal asignada' }, ...warehouses.map(w => ({ value: w.id, label: w.name + (w.isDefault ? ' · principal' : '') }))]} />
                </div>
              )}
            </section>

            <section className="form-sec">
              <div className="form-sec-head"><span className="form-sec-ic"><Ic s={15} d={I.shield} /></span>Acceso al sistema</div>
              <div className="row2">
                <div className="field"><label className="field-lbl">Correo (acceso) {!form.id && '*'}</label><input type="email" value={form.email} placeholder="correo@negocio.com" onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div className="field"><label className="field-lbl">{form.id ? 'Nueva contraseña' : 'Contraseña *'}</label><input type="password" value={form.password || ''} placeholder={form.id ? 'dejar vacío = no cambia' : 'mín. 6 caracteres'} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label className="field-lbl">PIN para el POS <span className="field-opt">opcional · 4–6 dígitos</span></label>
                <input inputMode="numeric" maxLength={6} style={{ maxWidth: 200 }} value={form.pin} placeholder={form.id ? 'dejar vacío = no cambia' : 'solo si cobra en caja'} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
                <p className="muted" style={{ fontSize: '.76rem', marginTop: 5 }}>El PIN identifica a la cajera en el Punto de venta. Para entrar al sistema se usa correo y contraseña.</p>
              </div>
            </section>

            {form.role === 'admin' ? (
              <section className="form-sec">
                <div className="form-sec-head"><span className="form-sec-ic"><Ic s={15} d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>} /></span>Módulos</div>
                <p className="muted" style={{ fontSize: '.84rem', margin: 0 }}>El administrador tiene acceso a todos los módulos.</p>
              </section>
            ) : (
              <section className="form-sec">
                <div className="form-sec-head"><span className="form-sec-ic"><Ic s={15} d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>} /></span>Módulos a los que tiene acceso</div>
                <p className="muted" style={{ fontSize: '.78rem', margin: '0 0 10px' }}>Toca para activar. Si no marcas ninguno, usará el acceso por defecto de empleado.</p>
                <div className="perm-chips">
                  {modules.map(m => {
                    const on = (form.permissions || []).includes(m.key);
                    return (
                      <button key={m.key} type="button" className={'perm-chip' + (on ? ' on' : '')} onClick={() => togglePerm(m.key)}>
                        {on && <Ic s={12} d={<path d="M20 6 9 17l-5-5" />} />}{m.label}{m.adminOnly ? ' ·' : ''}
                      </button>
                    );
                  })}
                </div>
                <div className="row" style={{ gap: 14, marginTop: 10 }}>
                  <span className="link" onClick={() => setForm({ ...form, permissions: [...defaultEmp] })}>Acceso por defecto</span>
                  <span className="link" onClick={() => setForm({ ...form, permissions: modules.map(m => m.key) })}>Todo</span>
                  <span className="link" onClick={() => setForm({ ...form, permissions: [] })}>Ninguno</span>
                </div>
              </section>
            )}

            <section className="form-sec">
              <div className="form-sec-head"><span className="form-sec-ic"><Ic s={15} d={I.clock} /></span>Horario de trabajo</div>
              {!form.schedule ? (
                <p className="muted" style={{ fontSize: '.84rem', margin: 0 }}>Sin horario definido (se puede agendar a cualquier hora). <span className="link" onClick={() => setForm({ ...form, schedule: defaultSchedule() })}>Definir horario</span></p>
              ) : (
                <>
                  <div className="staff-days">
                    {DAYS.map(([k, name]) => {
                      const d = form.schedule[k] || { on: false, from: '09:00', to: '18:00' };
                      const setDay = patch => setForm(f => ({ ...f, schedule: { ...f.schedule, [k]: { ...d, ...patch } } }));
                      return (
                        <div key={k} className={'staff-day' + (d.on ? '' : ' off')}>
                          <button type="button" className={'set-switch' + (d.on ? ' on' : '')} onClick={() => setDay({ on: !d.on })} aria-pressed={d.on} />
                          <span className="staff-day-name">{name}</span>
                          {d.on ? (
                            <div className="staff-day-times">
                              <input type="time" value={d.from} onChange={e => setDay({ from: e.target.value })} />
                              <span className="muted">a</span>
                              <input type="time" value={d.to} onChange={e => setDay({ to: e.target.value })} />
                            </div>
                          ) : <span className="muted staff-day-rest">Descanso</span>}
                        </div>
                      );
                    })}
                  </div>
                  <span className="link" style={{ display: 'inline-block', marginTop: 10 }} onClick={() => setForm({ ...form, schedule: null })}>Quitar horario</span>
                </>
              )}
            </section>
          </div>

          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}

      {confirmOff && (
        <Modal title="Desactivar empleado" onClose={() => setConfirmOff(null)}>
          <div className="exp-alert" style={{ marginBottom: 14 }}>
            <Ic s={19} d={<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>} />
            <div><b>Vas a desactivar a {confirmOff.name}</b>
              <div className="exp-alert-body"><span>No podrá iniciar sesión ni aparecer en agenda/POS, pero su historial de ventas y comisiones se conserva. Podrás reactivarlo después.</span></div>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setConfirmOff(null)}>Cancelar</button>
            <button className="btn" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={() => deactivate(confirmOff)}>Sí, desactivar</button>
          </div>
        </Modal>
      )}

      {perf && (
        <Modal title={`Desempeño · ${perf.staff.name}`} onClose={() => setPerf(null)} width={580}>
          <div className="sec-title" style={{ marginTop: 0 }}>Ventas del mes</div>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: -6, marginBottom: 12 }}>{MONTHS[perf.data.month]} {perf.data.year} · servicios cobrados en el punto de venta</p>
          <div className="perf-grid">
            <div className="perf-stat"><b>{money(perf.data.ventas)}</b><span>Ventas</span></div>
            <div className="perf-stat"><b>{perf.data.servicios}</b><span>Servicios</span></div>
            <div className="perf-stat"><b>{money(perf.data.comision)}</b><span>Comisión</span></div>
          </div>
          <p className="muted" style={{ fontSize: '.8rem' }}>El detalle por servicio está en el módulo de Comisiones.</p>

          {perf.data.pipeline && (perf.data.pipeline.open > 0 || perf.data.pipeline.won > 0 || perf.data.pipeline.tasksPending > 0) && (
            <>
              <div className="sec-title" style={{ marginTop: 18 }}>Embudo de ventas</div>
              <p className="muted" style={{ fontSize: '.8rem', marginTop: -6, marginBottom: 12 }}>Oportunidades en curso y seguimiento (no cobrado aún)</p>
              <div className="perf-grid">
                <div className="perf-stat"><b>{perf.data.pipeline.open}</b><span>Oportunidades abiertas</span></div>
                <div className="perf-stat"><b>{money(perf.data.pipeline.value)}</b><span>Valor embudo</span></div>
                <div className="perf-stat"><b>{perf.data.pipeline.winRate}%</b><span>Conversión</span></div>
              </div>
              <p className="muted" style={{ fontSize: '.82rem' }}>
                {perf.data.pipeline.won} ganados · {perf.data.pipeline.lost} perdidos · {perf.data.pipeline.tasksPending} tarea(s) pendiente(s)
                {perf.data.pipeline.tasksOverdue > 0 && <span style={{ color: 'var(--bad)' }}> ({perf.data.pipeline.tasksOverdue} vencidas)</span>}
              </p>
            </>
          )}

          <div className="modal-actions"><button className="btn" onClick={() => setPerf(null)}>Cerrar</button></div>
        </Modal>
      )}

      {docsFor && <DocsModal staff={docsFor} onClose={() => setDocsFor(null)} />}
    </>
  );
}

const CATS = ['Contrato', 'Identificación', 'Certificación', 'Otro'];
function fileSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB'; }

function DocsModal({ staff, onClose }) {
  const [docs, setDocs] = useState([]);
  const [up, setUp] = useState({ category: 'Contrato', name: '', file: null });
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/staff/${staff.id}/documents`).then(setDocs);
  useEffect(() => { load(); }, []); // eslint-disable-line

  function pickFile(f) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast('El archivo supera 5 MB', 'bad');
    const reader = new FileReader();
    reader.onload = () => setUp(u => ({ ...u, file: { name: f.name, type: f.type, data: reader.result }, name: u.name || f.name }));
    reader.readAsDataURL(f);
  }
  async function upload() {
    if (!up.file) return toast('Elige un archivo', 'bad');
    setBusy(true);
    try {
      await api.post(`/staff/${staff.id}/documents`, { category: up.category, name: up.name, fileName: up.file.name, mimeType: up.file.type, data: up.file.data });
      setUp({ category: 'Contrato', name: '', file: null }); load(); toast('Documento subido', 'ok');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  async function open(id) {
    try { const d = await api.get('/staff/documents/' + id); const w = window.open(); if (w) w.document.write(`<iframe src="${d.data}" style="width:100%;height:100%;border:0"></iframe>`); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function remove(id) { try { await api.del('/staff/documents/' + id); load(); toast('Documento eliminado', 'ok'); } catch (e) { toast(e.message, 'bad'); } }

  return (
    <Modal title={`Documentos · ${staff.name}`} onClose={onClose} width={560}>
      <div className="card" style={{ marginBottom: 14, background: 'var(--cream)', border: '1px solid var(--line)' }}>
        <div className="row2">
          <div className="field"><label className="field-lbl">Categoría</label><Select value={up.category} onChange={v => setUp({ ...up, category: v })} options={CATS.map(c => ({ value: c, label: c }))} /></div>
          <div className="field"><label className="field-lbl">Nombre / etiqueta</label><input value={up.name} placeholder="Ej. Contrato 2026" onChange={e => setUp({ ...up, name: e.target.value })} /></div>
        </div>
        <div className="field" style={{ marginBottom: 10 }}><label className="field-lbl">Archivo <span className="field-opt">PDF o imagen · máx. 5 MB</span></label>
          <label className="exp-drop-file">
            <Ic s={17} d={<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 21h16" /></>} />
            <span>{up.file ? up.file.name : 'Elegir archivo'}</span>
            <input type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => pickFile(e.target.files[0])} />
          </label>
        </div>
        <button className="btn" disabled={busy || !up.file} onClick={upload}>{busy ? 'Subiendo…' : 'Subir documento'}</button>
      </div>

      {docs.length === 0 ? (
        <div className="empty">Sin documentos</div>
      ) : (
        <div className="staff-docs">
          {docs.map(d => (
            <div key={d.id} className="staff-doc">
              <span className="staff-doc-ic"><Ic s={17} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>} /></span>
              <div className="staff-doc-txt">
                <div className="staff-doc-name">{d.name}</div>
                <div className="staff-doc-meta"><span className="loy-badge" style={{ background: 'var(--plum)' }}>{d.category}</span> {fileSize(d.size)} · {new Date(d.createdAt).toLocaleDateString('es-MX')}</div>
              </div>
              <button className="icon-btn" title="Ver" onClick={() => open(d.id)}><Ic s={15} d={<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>} /></button>
              <button className="icon-btn danger" title="Eliminar" onClick={() => remove(d.id)}><Ic s={15} d={<><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
