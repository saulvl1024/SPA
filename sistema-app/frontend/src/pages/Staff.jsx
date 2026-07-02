import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, money, initials } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import Select from '../components/Select.jsx';
import { setting } from '../permissions.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']];
const defaultSchedule = () => ({ 1: { on: true, from: '09:00', to: '20:00' }, 2: { on: true, from: '09:00', to: '20:00' }, 3: { on: true, from: '09:00', to: '20:00' }, 4: { on: true, from: '09:00', to: '20:00' }, 5: { on: true, from: '09:00', to: '20:00' }, 6: { on: true, from: '09:00', to: '18:00' }, 0: { on: false, from: '09:00', to: '14:00' } });
const empty = { name: '', pin: '', email: '', password: '', role: 'empleada', specialty: '', commissionRate: 0.10, phone: '', position: '', hireDate: '', permissions: [], schedule: null };

export default function Staff() {
  const [list, setList] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null);
  const [perf, setPerf] = useState(null); // {staff, data}
  const [modules, setModules] = useState([]);
  const [defaultEmp, setDefaultEmp] = useState([]);
  const [confirmOff, setConfirmOff] = useState(null); // empleado a desactivar
  const [docsFor, setDocsFor] = useState(null); // empleado cuyos documentos se gestionan
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

  const visible = list.filter(s => showInactive ? true : s.active);

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

  return (
    <>
      <div className="top">
        <div><h1>Personal</h1><div className="sub">{list.filter(s => s.active).length} activos{list.some(s => !s.active) ? ` · ${list.filter(s => !s.active).length} inactivos` : ''}</div></div>
        <div className="row">
          <label className="row" style={{ gap: 7, fontSize: '.85rem', cursor: 'pointer', flex: '0 0 auto', whiteSpace: 'nowrap' }}><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Ver inactivos</label>
          <button className="btn" onClick={() => setForm({ ...empty })}>Nuevo empleado</button>
        </div>
      </div>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Empleado</th><th className="col-sm-hide">Puesto / Rol</th><th className="col-sm-hide">Contacto</th><th className="col-sm-hide">Ingreso</th><th className="col-sm-hide">Comisión</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {visible.map(s => (
              <tr key={s.id} style={{ opacity: s.active ? 1 : 0.55 }}>
                <td><div className="client-cell"><span className="client-avatar">{initials(s.name)}</span><div><div>{s.name}</div>{s.specialty && <small className="muted">{s.specialty}</small>}</div></div></td>
                <td className="col-sm-hide">{s.position || (s.role === 'admin' ? 'Administrador' : 'Empleado')}<br /><small className="muted">{s.role === 'admin' ? 'admin' : 'empleado'}</small></td>
                <td className="col-sm-hide"><small>{s.phone || '—'}<br />{s.email || ''}</small></td>
                <td className="col-sm-hide"><small>{s.hireDate ? new Date(s.hireDate).toLocaleDateString('es-MX') : '—'}</small></td>
                <td className="col-sm-hide">{Math.round((s.commissionRate || 0) * 100)}%</td>
                <td><span className={'badge ' + (s.active ? 'bg-ok' : '')}>{s.active ? 'Activo' : 'Inactivo'}</span></td>
                <td className="right">
                  <div className="staff-actions">
                    <button className="btn ghost sm" onClick={() => openPerf(s)}>Desempeño</button>
                    <button className="btn ghost sm" onClick={() => setDocsFor(s)}>Documentos</button>
                    <button className="btn ghost sm" onClick={() => setForm({ id: s.id, name: s.name, role: s.role, specialty: s.specialty || '', commissionRate: s.commissionRate, phone: s.phone || '', email: s.email || '', password: '', position: s.position || '', hireDate: s.hireDate ? s.hireDate.slice(0, 10) : '', pin: '', permissions: s.permissions || [], schedule: s.schedule || null, warehouseId: s.warehouseId || '' })}>Editar</button>
                    {s.active
                      ? <button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => setConfirmOff(s)}>Desactivar</button>
                      : <button className="btn ghost sm" style={{ color: 'var(--ok)' }} onClick={() => activate(s)}>Reactivar</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan="7" className="empty">Sin empleados</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar empleado' : 'Nuevo empleado'} onClose={() => setForm(null)} width={720}>
          <div className="field"><label>Nombre completo *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row2">
            <div className="field"><label>Puesto</label><input value={form.position} placeholder="Recepción, Esteticista..." onChange={e => setForm({ ...form, position: e.target.value })} /></div>
            <div className="field"><label>Rol</label><Select value={form.role} onChange={v => setForm({ ...form, role: v })} options={[{ value: 'empleada', label: 'Empleado' }, { value: 'admin', label: 'Administrador' }]} /></div>
          </div>
          {usaAlmacenes && warehouses.length > 0 && (
            <div className="field"><label>Sucursal asignada</label>
              <Select value={form.warehouseId || ''} onChange={v => setForm({ ...form, warehouseId: v })} placeholder="Sin sucursal asignada"
                options={[{ value: '', label: 'Sin sucursal asignada' }, ...warehouses.map(w => ({ value: w.id, label: w.name + (w.isDefault ? ' · principal' : '') }))]} />
            </div>
          )}
          {/* Credenciales de acceso al sistema */}
          <div className="row2">
            <div className="field"><label>Correo (acceso al sistema) {!form.id && '*'}</label><input type="email" value={form.email} placeholder="correo@negocio.com" onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>{form.id ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label><input type="password" value={form.password || ''} placeholder={form.id ? 'dejar vacío = no cambia' : 'mín. 6 caracteres'} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Teléfono</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Fecha de ingreso</label><DateField value={form.hireDate} onChange={v => setForm({ ...form, hireDate: v })} inline /></div>
          </div>
          <div className="field"><label>PIN para el POS (opcional, 4–6 dígitos)</label><input inputMode="numeric" maxLength={6} value={form.pin} placeholder={form.id ? 'dejar vacío = no cambia' : 'solo si cobra en caja'} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
            <p className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>El PIN solo se usa para identificar a la cajera en el Punto de venta. Para entrar al sistema se usa el correo y contraseña.</p>
          </div>
          <div className="row2">
            <div className="field"><label>Especialidad (si atiende)</label><input value={form.specialty} placeholder="Faciales, Masajes..." onChange={e => setForm({ ...form, specialty: e.target.value })} /></div>
            <div className="field"><label>Comisión (%)</label><input type="number" value={Math.round((form.commissionRate || 0) * 100)} onChange={e => setForm({ ...form, commissionRate: (+e.target.value || 0) / 100 })} /></div>
          </div>

          {form.role === 'admin' ? (
            <p className="muted" style={{ fontSize: '.82rem' }}>El administrador tiene acceso a todos los módulos.</p>
          ) : (
            <div className="field">
              <label>Módulos a los que tiene acceso</label>
              <p className="muted" style={{ fontSize: '.78rem', margin: '0 0 8px' }}>Si no marcas ninguno, usará el acceso por defecto de empleado.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px' }}>
                {modules.map(m => (
                  <label key={m.key} className="row" style={{ gap: 7, alignItems: 'center', cursor: 'pointer', fontSize: '.86rem' }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={(form.permissions || []).includes(m.key)} onChange={() => togglePerm(m.key)} />
                    {m.label}{m.adminOnly ? <span className="muted" style={{ fontSize: '.72rem' }}> · admin</span> : ''}
                  </label>
                ))}
              </div>
              <div className="row" style={{ gap: 10, marginTop: 8 }}>
                <span className="link" onClick={() => setForm({ ...form, permissions: [...defaultEmp] })}>Acceso por defecto</span>
                <span className="link" onClick={() => setForm({ ...form, permissions: modules.map(m => m.key) })}>Todo</span>
                <span className="link" onClick={() => setForm({ ...form, permissions: [] })}>Ninguno</span>
              </div>
            </div>
          )}

          <div className="field">
            <label>Horario de trabajo {form.specialty ? '' : '(aplica a especialistas en la agenda)'}</label>
            {!form.schedule ? (
              <p className="muted" style={{ fontSize: '.82rem' }}>Sin horario definido (se puede agendar a cualquier hora). <span className="link" onClick={() => setForm({ ...form, schedule: defaultSchedule() })}>Definir horario</span></p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 18px' }}>
                  {DAYS.map(([k, name]) => {
                    const d = form.schedule[k] || { on: false, from: '09:00', to: '18:00' };
                    const setDay = patch => setForm(f => ({ ...f, schedule: { ...f.schedule, [k]: { ...d, ...patch } } }));
                    return (
                      <div key={k} className="row" style={{ gap: 8, alignItems: 'center' }}>
                        <label className="row" style={{ gap: 6, width: 92, fontSize: '.85rem', cursor: 'pointer' }}>
                          <input type="checkbox" style={{ width: 'auto' }} checked={!!d.on} onChange={e => setDay({ on: e.target.checked })} /> {name}
                        </label>
                        {d.on ? (
                          <>
                            <input type="time" value={d.from} onChange={e => setDay({ from: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                            <span className="muted">a</span>
                            <input type="time" value={d.to} onChange={e => setDay({ to: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                          </>
                        ) : <span className="muted" style={{ fontSize: '.82rem' }}>Descanso</span>}
                      </div>
                    );
                  })}
                </div>
                <span className="link" style={{ display: 'inline-block', marginTop: 8 }} onClick={() => setForm({ ...form, schedule: null })}>Quitar horario</span>
              </>
            )}
          </div>

          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}

      {confirmOff && (
        <Modal title="Desactivar empleado" onClose={() => setConfirmOff(null)}>
          <div className="alert" style={{ marginBottom: 14 }}>⚠ Estás por desactivar a <b>{confirmOff.name}</b>.</div>
          <p className="mb">No podrá iniciar sesión ni aparecer en agenda/POS, pero <b>su historial de ventas y comisiones se conserva</b>. Podrás reactivarla después.</p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setConfirmOff(null)}>Cancelar</button>
            <button className="btn" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={() => deactivate(confirmOff)}>Sí, desactivar</button>
          </div>
        </Modal>
      )}

      {perf && (
        <Modal title={`Desempeño · ${perf.staff.name}`} onClose={() => setPerf(null)} width={560}>
          {/* Ventas cobradas (POS) */}
          <div className="sec-title" style={{ marginTop: 0 }}>Ventas del mes</div>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: -6, marginBottom: 10 }}>{MONTHS[perf.data.month]} {perf.data.year} · servicios cobrados en el punto de venta</p>
          <div className="grid g3 mb">
            <div className="card kpi"><div className="lbl">Ventas</div><div className="val" style={{ fontSize: '1.6rem' }}>{money(perf.data.ventas)}</div></div>
            <div className="card kpi"><div className="lbl">Servicios</div><div className="val" style={{ fontSize: '1.6rem' }}>{perf.data.servicios}</div></div>
            <div className="card kpi"><div className="lbl">Comisión</div><div className="val" style={{ fontSize: '1.6rem' }}>{money(perf.data.comision)}</div></div>
          </div>
          <p className="muted" style={{ fontSize: '.8rem' }}>El detalle por servicio está en el módulo de Comisiones.</p>

          {/* Pipeline / embudo (oportunidades en curso) */}
          {perf.data.pipeline && (perf.data.pipeline.open > 0 || perf.data.pipeline.won > 0 || perf.data.pipeline.tasksPending > 0) && (
            <>
              <div className="sec-title" style={{ marginTop: 18 }}>Embudo de ventas</div>
              <p className="muted" style={{ fontSize: '.8rem', marginTop: -6, marginBottom: 10 }}>Oportunidades en curso y seguimiento (no cobrado aún)</p>
              <div className="grid g3 mb">
                <div className="card kpi"><div className="lbl">Tratos abiertos</div><div className="val" style={{ fontSize: '1.6rem' }}>{perf.data.pipeline.open}</div></div>
                <div className="card kpi"><div className="lbl">Valor embudo</div><div className="val" style={{ fontSize: '1.6rem' }}>{money(perf.data.pipeline.value)}</div></div>
                <div className="card kpi"><div className="lbl">Conversión</div><div className="val" style={{ fontSize: '1.6rem' }}>{perf.data.pipeline.winRate}%</div></div>
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
    <Modal title={`Documentos · ${staff.name}`} onClose={onClose}>
      <div className="card" style={{ marginBottom: 14, background: 'var(--cream)' }}>
        <div className="row2">
          <div className="field"><label>Categoría</label><Select value={up.category} onChange={v => setUp({ ...up, category: v })} options={CATS.map(c => ({ value: c, label: c }))} /></div>
          <div className="field"><label>Nombre / etiqueta</label><input value={up.name} placeholder="Ej. Contrato 2026" onChange={e => setUp({ ...up, name: e.target.value })} /></div>
        </div>
        <div className="field"><label>Archivo (PDF o imagen, máx. 5 MB)</label><input type="file" accept=".pdf,image/*" onChange={e => pickFile(e.target.files[0])} /></div>
        <button className="btn" disabled={busy || !up.file} onClick={upload}>{busy ? 'Subiendo...' : 'Subir documento'}</button>
      </div>

      <table style={{ width: '100%' }}>
        <thead><tr><th>Categoría</th><th>Nombre</th><th>Tamaño</th><th></th></tr></thead>
        <tbody>
          {docs.map(d => (
            <tr key={d.id}>
              <td><span className="badge">{d.category}</span></td>
              <td>{d.name}<br /><small className="muted">{new Date(d.createdAt).toLocaleDateString('es-MX')}</small></td>
              <td><small>{fileSize(d.size)}</small></td>
              <td className="right">
                <div className="row-actions">
                  <button className="btn ghost sm" onClick={() => open(d.id)}>Ver</button>
                  <button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => remove(d.id)}>Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
          {!docs.length && <tr><td colSpan="4" className="empty">Sin documentos</td></tr>}
        </tbody>
      </table>
    </Modal>
  );
}
