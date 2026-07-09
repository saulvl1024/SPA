import { useEffect, useState, Fragment } from 'react';
import { api } from '../api.js';
import { Modal, toast, money } from '../ui.jsx';
import Select from './Select.jsx';
import DateField from './DateField.jsx';
import { useAuth } from '../auth.jsx';

const STATUSES = [
  ['por_iniciar', 'Por iniciar', '#A99C96'],
  ['en_progreso', 'En progreso', '#6F8169'],
  ['en_pausa', 'En pausa', '#C98A4B'],
  ['completado', 'Completado', '#7A5C68'],
];
const PRIORITY = { alta: ['Alta', '#C16B6B'], media: ['Media', '#C98A4B'], baja: ['Baja', '#8A9A85'] };
const fdate = d => d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '';
const isOverdue = d => d && new Date(d) < new Date(new Date().toDateString());

export default function ProjectsBoard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [projects, setProjects] = useState([]);
  const [mine, setMine] = useState(!isAdmin);
  const [staff, setStaff] = useState([]);
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [edit, setEdit] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const load = () => api.get('/projects' + (mine ? '?mine=1' : '')).then(setProjects).catch(e => toast(e.message, 'bad'));
  useEffect(() => { load(); }, [mine]); // eslint-disable-line
  useEffect(() => {
    api.get('/catalog/staff').then(setStaff).catch(() => {});
    api.get('/companies').then(setCompanies).catch(() => {});
    api.get('/clients?take=50').then(setClients).catch(() => {});
  }, []);

  async function saveProject() {
    if (!edit.name?.trim()) return toast('El nombre es obligatorio', 'bad');
    try {
      if (edit.id) await api.put('/projects/' + edit.id, edit);
      else {
        const p = await api.post('/projects', edit);
        if (edit.memberIds?.length) await api.put(`/projects/${p.id}/members`, { memberIds: edit.memberIds });
      }
      toast('Proyecto guardado', 'ok'); setEdit(null); load();
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function move(id, status) { try { await api.patch(`/projects/${id}/status`, { status }); load(); } catch (e) { toast(e.message, 'bad'); } }
  function drop(status) {
    const proj = projects.find(p => p.id === dragId);
    if (proj && proj.status !== status) move(dragId, status);
    setDragId(null); setOverCol(null);
  }

  const byStatus = s => projects.filter(p => p.status === s);

  return (
    <>
      <div className="row mb" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className={'fin-chip' + (mine ? ' on' : '')} onClick={() => setMine(true)}>Mis proyectos</button>
          {isAdmin && <button className={'fin-chip' + (!mine ? ' on' : '')} onClick={() => setMine(false)}>Todos</button>}
        </div>
        <button className="btn" onClick={() => setEdit({ name: '', description: '', status: 'por_iniciar', clientId: '', companyId: '', ownerId: user.id, dueDate: '', value: '', memberIds: [] })}>＋ Nuevo proyecto</button>
      </div>

      <div className="scroll-x">
        <div className="proj-board">
          {STATUSES.map(([key, label, color]) => {
            const items = byStatus(key);
            const active = overCol === key;
            return (
              <div key={key} className={'proj-col' + (active ? ' over' : '')} style={{ '--col': color }}
                onDragOver={e => { if (dragId) { e.preventDefault(); setOverCol(key); } }}
                onDragLeave={() => setOverCol(o => o === key ? null : o)}
                onDrop={() => drop(key)}>
                <div className="proj-col-head"><span className="proj-dot" style={{ background: color }} />{label}<span className="proj-col-n">{items.length}</span></div>
                {items.map((p, i) => (
                  <div key={p.id} className={'proj-card' + (dragId === p.id ? ' dragging' : '')} style={{ '--i': i, '--col': color }}
                    draggable
                    onDragStart={() => setDragId(p.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onClick={() => { if (!dragId) setOpenId(p.id); }}>
                    <div className="proj-card-title">{p.name}</div>
                    {(p.ownerName || p.memberNames?.length) && (
                      <div className="proj-card-sub">
                        {p.ownerName && <span className="proj-avatar" title={p.ownerName}>{p.ownerName.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>}
                        <span>{p.ownerName || 'Sin responsable'}{p.memberNames?.length ? ` · +${p.memberNames.length} en equipo` : ''}</span>
                      </div>
                    )}
                    <div className="proj-progress"><span style={{ width: p.progress.pct + '%', background: color }} /></div>
                    <div className="proj-card-foot">
                      <span className="muted">{p.progress.done}/{p.progress.total} tareas · {p.milestonesDone}/{p.milestonesTotal} hitos</span>
                      {p.dueDate && <span className={'proj-due' + (isOverdue(p.dueDate) && p.status !== 'completado' ? ' over' : '')}>{fdate(p.dueDate)}</span>}
                    </div>
                  </div>
                ))}
                {!items.length && <div className="proj-empty">{active ? 'Suelta aquí' : 'Sin proyectos'}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {edit && (
        <Modal title={edit.id ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={() => setEdit(null)} width={560}>
          <div className="field"><label>Nombre *</label><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} autoFocus /></div>
          <div className="field"><label>Descripción</label><textarea rows="2" value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="row2">
            <div className="field"><label>Responsable</label>
              <Select value={edit.ownerId || ''} onChange={v => setEdit({ ...edit, ownerId: v })} placeholder="Sin responsable"
                options={[{ value: '', label: 'Sin responsable' }, ...staff.map(s => ({ value: s.id, label: s.name }))]} />
            </div>
            <div className="field datefield-fit"><label>Fecha límite</label><DateField inline value={edit.dueDate || ''} onChange={v => setEdit({ ...edit, dueDate: v })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Cliente (opcional)</label>
              <Select searchable value={edit.clientId || ''} onChange={v => setEdit({ ...edit, clientId: v })} placeholder="Sin cliente"
                options={[{ value: '', label: 'Sin cliente' }, ...clients.map(c => ({ value: c.id, label: c.name }))]} />
            </div>
            <div className="field"><label>Empresa (opcional)</label>
              <Select value={edit.companyId || ''} onChange={v => setEdit({ ...edit, companyId: v })} placeholder="Sin empresa"
                options={[{ value: '', label: 'Sin empresa' }, ...companies.map(c => ({ value: c.id, label: c.name }))]} />
            </div>
          </div>
          <div className="field"><label>Equipo asignado</label>
            <div className="proj-members">
              {staff.map(s => {
                const on = (edit.memberIds || []).includes(s.id);
                return <button key={s.id} type="button" className={'proj-member-chip' + (on ? ' on' : '')}
                  onClick={() => setEdit({ ...edit, memberIds: on ? edit.memberIds.filter(x => x !== s.id) : [...(edit.memberIds || []), s.id] })}>{s.name}</button>;
              })}
            </div>
            {edit.id && <span className="muted" style={{ fontSize: '.76rem' }}>Al editar, el equipo se guarda por separado desde la vista del proyecto.</span>}
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn" onClick={saveProject}>Guardar</button></div>
        </Modal>
      )}

      {openId && <ProjectDetail id={openId} staff={staff} onClose={() => { setOpenId(null); load(); }} onEdit={p => { setOpenId(null); setEdit({ ...p, memberIds: (p.memberNames || []).map(m => m.staffId) }); }} />}
    </>
  );
}

// ---- Detalle de proyecto: hitos → listas → tareas → subtareas ----
function ProjectDetail({ id, staff, onClose, onEdit }) {
  const [p, setP] = useState(null);
  const [qa, setQa] = useState(null); // alta rápida: { type, parentId, title, targetDate }
  const load = () => api.get('/projects/' + id).then(setP).catch(() => {});
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  if (!p) return <Modal title="Proyecto" onClose={onClose}><div className="empty">Cargando…</div></Modal>;

  const staffName = sid => staff.find(s => s.id === sid)?.name || '';

  // Alta rápida con modal propio (en vez del prompt del navegador)
  const QA_LABELS = {
    milestone: ['Nuevo hito', 'Ej. Fase 1: Diseño'],
    list: ['Nueva lista de tareas', 'Ej. Pendientes de la semana'],
    task: ['Nueva tarea', 'Describe la tarea'],
    subtask: ['Nueva subtarea', 'Describe la subtarea'],
  };
  async function submitQa() {
    if (!qa.title?.trim()) return toast('Escribe un nombre', 'bad');
    try {
      if (qa.type === 'milestone') await api.post(`/projects/${id}/milestones`, { name: qa.title, targetDate: qa.targetDate || null });
      if (qa.type === 'list') await api.post(`/projects/milestones/${qa.parentId}/lists`, { name: qa.title });
      if (qa.type === 'task') await api.post(`/projects/lists/${qa.parentId}/tasks`, { title: qa.title });
      if (qa.type === 'subtask') await api.post(`/projects/tasks/${qa.parentId}/subtasks`, { title: qa.title });
      setQa(null); load();
    } catch (e) { toast(e.message, 'bad'); }
  }

  const addMilestone = () => setQa({ type: 'milestone', title: '', targetDate: '' });
  async function toggleMilestone(m) { await api.put(`/projects/milestones/${m.id}`, { completed: !m.completed }); load(); }
  async function delMilestone(m) { if (confirm('¿Eliminar el hito "' + m.name + '" y todo su contenido?')) { await api.del('/projects/milestones/' + m.id); load(); } }
  const addList = mid => setQa({ type: 'list', parentId: mid, title: '' });
  async function delList(l) { if (confirm('¿Eliminar la lista "' + l.name + '"?')) { await api.del('/projects/lists/' + l.id); load(); } }
  const addTask = lid => setQa({ type: 'task', parentId: lid, title: '' });
  async function toggleTask(t) { await api.patch(`/projects/tasks/${t.id}/toggle`); load(); }
  async function delTask(t) { await api.del('/projects/tasks/' + t.id); load(); }
  async function setTask(t, patch) { await api.put('/projects/tasks/' + t.id, patch); load(); }
  const addSub = tid => setQa({ type: 'subtask', parentId: tid, title: '' });
  async function toggleSub(s) { await api.patch(`/projects/subtasks/${s.id}/toggle`); load(); }
  async function delSub(s) { await api.del('/projects/subtasks/' + s.id); load(); }

  return (
    <Modal title={p.name} onClose={onClose} width={760}>
      {/* Cabecera del proyecto */}
      {(() => { const st = STATUSES.find(s => s[0] === p.status) || STATUSES[0]; return (
        <div className="proj-detail-head">
          <div style={{ minWidth: 0 }}>
            <span className="proj-status-pill" style={{ background: `color-mix(in srgb, ${st[2]} 15%, transparent)`, color: st[2] }}>
              <span className="proj-dot" style={{ background: st[2] }} />{st[1]}
            </span>
            {p.description && <p className="muted" style={{ margin: '8px 0 0', fontSize: '.86rem' }}>{p.description}</p>}
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            <Select style={{ width: 150 }} value={p.status} onChange={async v => { await api.patch(`/projects/${id}/status`, { status: v }); load(); }} options={STATUSES.map(([k, l]) => ({ value: k, label: l }))} />
            <button className="btn ghost sm" onClick={() => onEdit(p)}>Editar</button>
          </div>
        </div>
      ); })()}

      {/* Datos clave */}
      <div className="proj-facts">
        <div className="proj-fact"><span className="proj-fact-l">Responsable</span><span className="proj-fact-v">{p.ownerName || '—'}</span></div>
        {(p.company || p.client) && <div className="proj-fact"><span className="proj-fact-l">{p.company ? 'Empresa' : 'Cliente'}</span><span className="proj-fact-v">{p.company?.name || p.client?.name}</span></div>}
        <div className="proj-fact"><span className="proj-fact-l">Entrega</span><span className={'proj-fact-v' + (isOverdue(p.dueDate) && p.status !== 'completado' ? ' over' : '')}>{p.dueDate ? fdate(p.dueDate) : '—'}</span></div>
        <div className="proj-fact"><span className="proj-fact-l">Equipo</span><span className="proj-fact-v">{p.memberNames?.length ? p.memberNames.length + (p.memberNames.length === 1 ? ' persona' : ' personas') : '—'}</span></div>
      </div>

      {/* Progreso general */}
      <div className="proj-prog-wrap">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <b style={{ fontSize: '.9rem' }}>Progreso general</b>
          <span className="proj-prog-pct">{p.progress.pct}%</span>
        </div>
        <div className="proj-progress big"><span style={{ width: p.progress.pct + '%' }} /></div>
        <div className="muted" style={{ fontSize: '.78rem', marginTop: 5 }}>{p.progress.done} de {p.progress.total} tareas · {p.milestones.filter(m => m.completed).length}/{p.milestones.length} hitos</div>
      </div>

      {/* Línea de tiempo de hitos */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 10px' }}>
        <b className="serif" style={{ fontSize: '1.15rem' }}>Hitos y tareas</b>
        <button className="btn sm" onClick={addMilestone}>＋ Hito</button>
      </div>

      {!p.milestones.length && <div className="empty">Aún no hay hitos. Crea el primero para marcar la secuencia del proyecto.</div>}

      {p.milestones.map(m => (
        <div key={m.id} className={'proj-ms' + (m.completed ? ' done' : '')}>
          <div className="proj-ms-head">
            <label className="proj-check">
              <input type="checkbox" checked={m.completed} onChange={() => toggleMilestone(m)} />
              <b>{m.name}</b>
            </label>
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              {m.targetDate && <span className={'proj-due' + (isOverdue(m.targetDate) && !m.completed ? ' over' : '')}>meta {fdate(m.targetDate)}</span>}
              <button className="btn ghost sm" onClick={() => addList(m.id)}>＋ Lista</button>
              <button className="mini-x" onClick={() => delMilestone(m)}>×</button>
            </div>
          </div>
          {m.description && <p className="muted" style={{ fontSize: '.8rem', margin: '2px 0 8px 26px' }}>{m.description}</p>}

          {m.taskLists.map(l => {
            const done = l.tasks.filter(t => t.done).length;
            return (
              <div key={l.id} className="proj-list">
                <div className="proj-list-head">
                  <span>{l.name} <span className="muted" style={{ fontSize: '.76rem' }}>{done}/{l.tasks.length}</span></span>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => addTask(l.id)}>＋ Tarea</button>
                    <button className="mini-x" onClick={() => delList(l)}>×</button>
                  </div>
                </div>
                {l.tasks.map(t => (
                  <div key={t.id} className="proj-task">
                    <div className="proj-task-main">
                      <label className="proj-check">
                        <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} />
                        <span className={t.done ? 'proj-task-title done' : 'proj-task-title'}>{t.title}</span>
                      </label>
                      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <span className="proj-prio" style={{ color: PRIORITY[t.priority]?.[1] }}>{PRIORITY[t.priority]?.[0]}</span>
                        {t.dueDate && <span className={'proj-due' + (isOverdue(t.dueDate) && !t.done ? ' over' : '')}>{fdate(t.dueDate)}</span>}
                        {t.assigneeId && <span className="proj-assignee">{staffName(t.assigneeId).split(' ')[0]}</span>}
                        <button className="mini-x" onClick={() => delTask(t)}>×</button>
                      </div>
                    </div>
                    {/* controles de la tarea */}
                    <div className="proj-task-ctrl">
                      <Select style={{ width: 110 }} value={t.priority} onChange={v => setTask(t, { priority: v })} options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v[0] }))} />
                      <Select style={{ width: 150 }} value={t.assigneeId || ''} onChange={v => setTask(t, { assigneeId: v })} placeholder="Asignar a…"
                        options={[{ value: '', label: 'Sin asignar' }, ...staff.map(s => ({ value: s.id, label: s.name }))]} />
                      <button className="btn ghost sm" onClick={() => addSub(t.id)}>＋ Subtarea</button>
                    </div>
                    <div className="proj-task-date datefield-fit">
                      <DateField inline value={t.dueDate || ''} onChange={v => setTask(t, { dueDate: v })} placeholder="Fecha límite (opcional)" />
                    </div>
                    {/* subtareas */}
                    {t.subtasks.map(s => (
                      <div key={s.id} className="proj-sub">
                        <label className="proj-check">
                          <input type="checkbox" checked={s.done} onChange={() => toggleSub(s)} />
                          <span className={s.done ? 'proj-sub-title done' : 'proj-sub-title'}>{s.title}</span>
                        </label>
                        <button className="mini-x" onClick={() => delSub(s)}>×</button>
                      </div>
                    ))}
                  </div>
                ))}
                {!l.tasks.length && <div className="muted" style={{ fontSize: '.78rem', padding: '4px 0 6px 4px' }}>Sin tareas aún.</div>}
              </div>
            );
          })}
        </div>
      ))}

      {/* Alta rápida (hito / lista / tarea / subtarea) con modal propio */}
      {qa && (
        <Modal title={QA_LABELS[qa.type][0]} onClose={() => setQa(null)} width={480}>
          <div className="field"><label>Nombre</label>
            <input value={qa.title} autoFocus placeholder={QA_LABELS[qa.type][1]}
              onChange={e => setQa({ ...qa, title: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') submitQa(); }} />
          </div>
          {qa.type === 'milestone' && (
            <div className="field datefield-fit"><label>Fecha meta (opcional)</label><DateField inline value={qa.targetDate || ''} onChange={v => setQa({ ...qa, targetDate: v })} /></div>
          )}
          <div className="modal-actions"><button className="btn ghost" onClick={() => setQa(null)}>Cancelar</button><button className="btn" onClick={submitQa}>Agregar</button></div>
        </Modal>
      )}
    </Modal>
  );
}
