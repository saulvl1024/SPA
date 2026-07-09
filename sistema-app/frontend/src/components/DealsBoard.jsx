import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, money, initials } from '../ui.jsx';
import Select from './Select.jsx';
import DateField from './DateField.jsx';
import ImportExport from './ImportExport.jsx';

// Tipos de actividad (texto formal, sin emojis)
const ACT_LABELS = { llamada: 'Llamada', whatsapp: 'WhatsApp', correo: 'Correo', reunion: 'Reunión / Visita', nota: 'Nota', tarea: 'Tarea / Recordatorio' };
const ACT_OPTIONS = Object.entries(ACT_LABELS).map(([value, label]) => ({ value, label }));

// Íconos de línea monocromáticos (estilo Feather) para cada tipo de actividad
function ActIcon(type) {
  const p = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (type) {
    case 'llamada': return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
    case 'whatsapp': return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>;
    case 'correo': return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>;
    case 'reunion': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'nota': return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>;
    case 'tarea': return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="3"/></svg>;
  }
}

// Detecta viewport de celular (<=760px) de forma reactiva
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width:760px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:760px)');
    const fn = e => setM(e.matches);
    mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    return () => mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn);
  }, []);
  return m;
}

// Tablero Kanban (Embudo) de tratos con arrastrar y soltar
export default function DealsBoard() {
  const isMobile = useIsMobile();
  const [board, setBoard] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [ownerFilter, setOwnerFilter] = useState('');  // filtrar el embudo por vendedor
  const [mobileStage, setMobileStage] = useState(0);    // índice de etapa visible en celular
  const [metrics, setMetrics] = useState(null);         // métricas de conversión del embudo
  const [showMetrics, setShowMetrics] = useState(false);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);   // trato en edición/creación
  const [acts, setActs] = useState([]);     // actividades del trato abierto
  const [newAct, setNewAct] = useState({ type: 'llamada', note: '', dueDate: '' });
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [moveDeal, setMoveDeal] = useState(null); // trato a mover en móvil (selector de etapa)
  const [pipeline, setPipeline] = useState('b2c'); // embudo activo: b2c | b2b
  const [stageForm, setStageForm] = useState(null); // crear/renombrar etapa: { id?, name }

  const load = (owner = ownerFilter, pipe = pipeline) => {
    const params = new URLSearchParams({ pipeline: pipe });
    if (owner) params.set('ownerId', owner);
    const qs = '?' + params.toString();
    api.get('/deals/board' + qs)
      .then(d => { setBoard(d.stages); if (d.sellers) setSellers(d.sellers); })
      .catch(e => toast(e.message, 'bad'));
    api.get('/deals/metrics' + qs).then(setMetrics).catch(() => {});
  };
  useEffect(() => { load(); setMobileStage(0); }, [ownerFilter, pipeline]); // eslint-disable-line
  // Carga la lista de clientes una vez; el buscador del Select filtra sobre ella.
  useEffect(() => { api.get('/clients?take=1000').then(setClients).catch(() => {}); }, []);

  const pipelineTotal = board.filter(s => !s.isWon && !s.isLost).reduce((a, s) => a + s.total, 0);

  async function drop(stage) {
    setOverStage(null);
    if (!dragId) return;
    const id = dragId; setDragId(null);
    // Optimista: mover en UI antes de confirmar
    try { await api.patch(`/deals/${id}/move`, { stageId: stage.id }); load(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  // Mover a una etapa por selección (móvil/táctil, donde el drag nativo no funciona)
  async function moveTo(stageId) {
    const id = moveDeal?.id; setMoveDeal(null);
    if (!id) return;
    try { await api.patch(`/deals/${id}/move`, { stageId }); load(); toast('Oportunidad movida', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  async function save() {
    try {
      if (!form.title?.trim()) return toast('Falta el título', 'bad');
      if (form.id) await api.put('/deals/' + form.id, form);
      else await api.post('/deals', { ...form, pipeline }); // crea en el embudo activo
      setForm(null); load(); toast('Oportunidad guardada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function saveStage() {
    if (!stageForm.name?.trim()) return toast('Falta el nombre de la etapa', 'bad');
    try {
      if (stageForm.id) await api.put('/deals/stages/' + stageForm.id, { name: stageForm.name });
      else await api.post('/deals/stages', { name: stageForm.name, pipeline });
      setStageForm(null); load(); toast('Etapa guardada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function delStage(st) {
    if (!confirm('¿Eliminar la etapa "' + st.name + '"? (debe estar vacía)')) return;
    try { await api.del('/deals/stages/' + st.id); load(); toast('Etapa eliminada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function remove() {
    try { await api.del('/deals/' + form.id); setForm(null); load(); toast('Oportunidad eliminada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  // Abre el trato y carga su historial de actividades
  function openDeal(f) {
    setForm(f); setActs([]); setNewAct({ type: 'llamada', note: '', dueDate: '' });
    if (f.id) api.get(`/deals/${f.id}/activities`).then(setActs).catch(() => {});
  }
  async function addActivity() {
    if (!form?.id) return;
    if (newAct.type === 'tarea' && !newAct.note.trim()) return toast('Describe la tarea', 'bad');
    try {
      await api.post(`/deals/${form.id}/activities`, newAct);
      const list = await api.get(`/deals/${form.id}/activities`);
      setActs(list);
      setNewAct({ type: 'llamada', note: '', dueDate: '' });
      toast(newAct.type === 'tarea' ? 'Tarea creada (ver Seguimientos)' : 'Actividad registrada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function doneActivity(id) {
    try { await api.patch(`/deals/activities/${id}/done`, {}); setActs(a => a.map(x => x.id === id ? { ...x, done: true } : x)); }
    catch (e) { toast(e.message, 'bad'); }
  }

  const stageColor = s => s.isWon ? 'var(--sage)' : s.isLost ? 'var(--bad)' : 'var(--plum)';
  const wonTotal = board.filter(s => s.isWon).reduce((a, s) => a + s.total, 0);
  const openCount = board.filter(s => !s.isWon && !s.isLost).reduce((a, s) => a + s.count, 0);

  // Tarjeta de trato (reutilizada en kanban desktop y lista móvil)
  const Card = (d, stage) => (
    <div key={d.id} draggable={!isMobile}
      onDragStart={() => setDragId(d.id)}
      onDragEnd={() => { setDragId(null); setOverStage(null); }}
      onClick={() => openDeal({ id: d.id, title: d.title, amount: d.amount, clientId: d.clientId || '', contactName: d.clientName && !d.clientId ? d.clientName : '', notes: d.notes || '' })}
      style={{
        background: 'var(--card)', borderRadius: 12, padding: '12px 13px', marginBottom: 9,
        cursor: isMobile ? 'pointer' : 'grab', opacity: dragId === d.id ? 0.35 : 1,
        boxShadow: '0 2px 8px -4px rgba(47,41,39,.18)', borderLeft: `3px solid ${stageColor(stage)}`,
        transition: 'box-shadow .12s, transform .12s',
      }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ fontWeight: 500, fontSize: '.92rem', lineHeight: 1.3, flex: 1 }}>{d.title}</div>
        <button className="deal-move" title="Mover a otra etapa"
          onClick={e => { e.stopPropagation(); setMoveDeal({ id: d.id, title: d.title, stageId: stage.id }); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div style={{ color: stageColor(stage), fontWeight: 600, margin: '5px 0', fontSize: '1.02rem' }}>{money(d.amount)}</div>
      {d.clientName && <div className="client-cell" style={{ fontSize: '.8rem', marginBottom: 4 }}><span className="client-avatar" style={{ width: 20, height: 20, fontSize: '.6rem' }}>{initials(d.clientName)}</span><span className="muted">{d.clientName}</span></div>}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 6, fontSize: '.72rem' }}>
        {d.ownerName
          ? <span className="badge" style={{ fontSize: '.66rem', padding: '2px 8px' }} title="Vendedor responsable">{d.ownerName.split(' ')[0]}</span>
          : <span />}
        {!stage.isWon && !stage.isLost && (
          <span className="muted" title="Días en esta etapa" style={{ color: d.days >= 14 ? 'var(--bad)' : d.days >= 7 ? 'var(--warn)' : 'var(--muted)' }}>
            {d.days === 0 ? 'hoy' : `${d.days}d`}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Sub-pestañas: dos embudos separados */}
      <div className="pipe-tabs mb">
        <button className={'pipe-tab' + (pipeline === 'b2c' ? ' on' : '')} onClick={() => setPipeline('b2c')}>
          <b>B2C</b><span>Consumidor final</span>
        </button>
        <button className={'pipe-tab' + (pipeline === 'b2b' ? ' on' : '')} onClick={() => setPipeline('b2b')}>
          <b>B2B</b><span>Empresas</span>
        </button>
      </div>

      {/* Resumen del embudo */}
      <div className="stat-row mb">
        <div className="stat"><div className="lbl">Embudo abierto</div><div className="val" style={{ color: 'var(--plum)' }}>{money(pipelineTotal)}</div><div className="chg">{openCount} oportunidades en curso</div></div>
        <div className="stat"><div className="lbl">Ganado</div><div className="val" style={{ color: 'var(--sage)' }}>{money(wonTotal)}</div></div>
        <div className="stat"><div className="lbl">Conversión</div><div className="val">{metrics ? metrics.winRate + '%' : '—'}</div><div className="chg">{metrics ? `${metrics.wonCount} ganados · ${metrics.lostCount} perdidos` : ''}</div></div>
        <div className="stat"><div className="lbl">Cierre promedio</div><div className="val">{metrics ? metrics.avgCloseDays : '—'}<span style={{ fontSize: '.5em', marginLeft: 4 }}>días</span></div><div className="chg">de las oportunidades ganadas</div></div>
      </div>

      {/* Métricas por etapa (desplegable) */}
      {metrics && (() => {
        const maxVal = Math.max(1, ...metrics.byStage.map(s => s.total));
        return (
          <div className="mb">
            <button className={'metrics-toggle' + (showMetrics ? ' on' : '')} onClick={() => setShowMetrics(v => !v)}>
              <svg className="metrics-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              <span>Métricas por etapa</span>
              <svg className="metrics-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/></svg>
            </button>
            {showMetrics && (
              <div className="metrics-panel">
                {metrics.byStage.map((s, i) => {
                  const closed = s.isWon || s.isLost;
                  const pct = Math.round((s.total / maxVal) * 100);
                  const barColor = s.isWon ? 'var(--sage)' : s.isLost ? 'var(--bad)' : 'var(--plum)';
                  const daysColor = closed ? 'var(--muted)' : (s.avgDays >= 14 ? 'var(--bad)' : s.avgDays >= 7 ? 'var(--warn)' : 'var(--muted)');
                  return (
                    <div key={s.id} className="metric-row" style={{ '--i': i }}>
                      <div className="metric-head">
                        <span className="metric-name">{s.name}
                          {s.isWon && <span className="badge bg-muted metric-tag">Ganado</span>}
                          {s.isLost && <span className="badge bg-muted metric-tag">Perdido</span>}
                        </span>
                        <span className="metric-val">{money(s.total)}</span>
                      </div>
                      <div className="metric-bar"><span className="metric-bar-fill" style={{ width: pct + '%', background: barColor }} /></div>
                      <div className="metric-meta">
                        <span>{s.count} oportunidad{s.count !== 1 ? 'es' : ''}</span>
                        {!closed && <span style={{ color: daysColor }}>{s.avgDays === 0 ? 'hoy' : s.avgDays + ' días prom.'}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Filtro por vendedor + nuevo trato */}
      <div className="embudo-toolbar mb">
        {sellers.length > 0
          ? <div className="embudo-filter">
              <Select value={ownerFilter} onChange={setOwnerFilter} placeholder="Todos los vendedores"
                options={[{ value: '', label: 'Todos los vendedores' }, ...sellers.map(s => ({ value: s.id, label: s.name }))]} />
            </div>
          : <span />}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <ImportExport exportUrl="/deals/export" importUrl="/deals/import" filename="oportunidades" label="oportunidades"
            columns={[
              { key: 'title', label: 'Oportunidad' }, { key: 'amount', label: 'Monto' },
              { key: 'cliente', label: 'Cliente' }, { key: 'telefono', label: 'Teléfono' },
              { key: 'etapa', label: 'Etapa' }, { key: 'embudo', label: 'Embudo' },
              { key: 'notes', label: 'Notas' },
            ]} onDone={() => load()} />
          <button className="btn ghost" onClick={() => setStageForm({ name: '' })}>＋ Etapa</button>
          <button className="btn embudo-new" onClick={() => setForm({ title: '', amount: '', clientId: '', contactName: '', notes: '' })}>Nueva oportunidad</button>
        </div>
      </div>

      {isMobile ? (
        /* ===== VISTA CELULAR: una etapa a la vez, seleccionable con chips ===== */
        <div>
          {/* Chips de etapas (scroll horizontal) — cada chip muestra nombre y conteo */}
          <div className="embudo-chips">
            {board.map((stage, i) => {
              const sel = i === mobileStage;
              return (
                <button key={stage.id} className={'embudo-chip' + (sel ? ' on' : '')}
                  onClick={() => setMobileStage(i)}
                  style={sel ? { background: stageColor(stage), borderColor: stageColor(stage) } : { color: stageColor(stage) }}>
                  {stage.name}
                  <span className="embudo-chip-n" style={sel ? {} : { background: stageColor(stage) }}>{stage.count}</span>
                </button>
              );
            })}
          </div>

          {/* Etapa activa */}
          {board[mobileStage] && (() => {
            const stage = board[mobileStage];
            return (
              <div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', margin: '4px 2px 12px' }}>
                  <b style={{ color: stageColor(stage), fontSize: '1rem' }}>{stage.name}</b>
                  <span className="muted" style={{ fontSize: '.85rem' }}>{stage.count} · {money(stage.total)}</span>
                </div>
                {stage.deals.map(d => Card(d, stage))}
                {!stage.deals.length && <div className="muted" style={{ fontSize: '.85rem', textAlign: 'center', padding: '32px 12px', border: '1.5px dashed var(--line)', borderRadius: 14 }}>Sin oportunidades en esta etapa.</div>}
              </div>
            );
          })()}
        </div>
      ) : (
        /* ===== VISTA DESKTOP/TABLET: kanban con arrastrar y soltar ===== */
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start' }}>
          {board.map(stage => {
            const active = overStage === stage.id;
            return (
              <div key={stage.id} className="deal-col"
                onDragOver={e => { e.preventDefault(); setOverStage(stage.id); }}
                onDragLeave={() => setOverStage(o => o === stage.id ? null : o)}
                onDrop={() => drop(stage)}
                style={{
                  minWidth: 250, flex: '1 0 250px',
                  background: active ? 'var(--blush-lt)' : 'var(--cream)',
                  border: active ? `1.5px dashed ${stageColor(stage)}` : '1px solid var(--line)',
                  borderRadius: 16, padding: 12, transition: 'all .15s',
                }}>
                {/* Encabezado de columna */}
                <div style={{ borderBottom: `2px solid ${stageColor(stage)}`, paddingBottom: 8, marginBottom: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: stageColor(stage), fontSize: '.9rem', letterSpacing: '.02em' }}>{stage.name}</b>
                    <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                      {!stage.isWon && !stage.isLost && (
                        <>
                          <button className="deal-stage-btn" title="Renombrar" onClick={() => setStageForm({ id: stage.id, name: stage.name })}>✎</button>
                          <button className="deal-stage-btn" title="Eliminar etapa" onClick={() => delStage(stage)}>×</button>
                        </>
                      )}
                      <span style={{ background: stageColor(stage), color: '#fff', borderRadius: 999, padding: '1px 9px', fontSize: '.72rem', fontWeight: 600 }}>{stage.count}</span>
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: '.78rem', marginTop: 3 }}>{money(stage.total)}</div>
                </div>

                {stage.deals.map(d => Card(d, stage))}
                {!stage.deals.length && <div className="muted" style={{ fontSize: '.76rem', textAlign: 'center', padding: '18px 8px', border: '1.5px dashed var(--line)', borderRadius: 12, lineHeight: 1.4 }}>Arrastra una oportunidad aquí</div>}
              </div>
            );
          })}
        </div>
      )}

      {stageForm && (
        <Modal title={stageForm.id ? 'Renombrar etapa' : 'Nueva etapa'} onClose={() => setStageForm(null)} width={420}>
          <div className="field"><label>Nombre de la etapa</label>
            <input value={stageForm.name} autoFocus placeholder="Ej. Demostración, Cotización enviada…"
              onChange={e => setStageForm({ ...stageForm, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveStage(); }} />
          </div>
          {!stageForm.id && <p className="muted" style={{ fontSize: '.78rem' }}>Se agrega al embudo <b>{pipeline.toUpperCase()}</b>, antes de las etapas de cierre (Ganado/Perdido).</p>}
          <div className="modal-actions"><button className="btn ghost" onClick={() => setStageForm(null)}>Cancelar</button><button className="btn" onClick={saveStage}>Guardar</button></div>
        </Modal>
      )}

      {moveDeal && (
        <Modal title="Mover oportunidad" onClose={() => setMoveDeal(null)}>
          <p className="muted mb" style={{ fontSize: '.86rem' }}>Mover <b style={{ color: 'var(--ink)' }}>{moveDeal.title}</b> a la etapa:</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {board.map(s => (
              <button key={s.id} className={'btn ' + (s.id === moveDeal.stageId ? '' : 'ghost')}
                disabled={s.id === moveDeal.stageId}
                style={{ justifyContent: 'space-between', width: '100%' }}
                onClick={() => moveTo(s.id)}>
                <span>{s.name}</span>
                <span style={{ opacity: .7, fontSize: '.8rem' }}>{s.id === moveDeal.stageId ? 'actual' : money(s.total)}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setMoveDeal(null)}>Cancelar</button></div>
        </Modal>
      )}

      {form && (
        <Modal title={form.id ? 'Editar oportunidad' : 'Nueva oportunidad'} onClose={() => setForm(null)} width={form.id ? 760 : 520}>
          <div className={form.id ? 'deal-modal-grid' : ''}>
            {/* Columna izquierda: datos del trato */}
            <div className="deal-modal-info">
              <div className="field"><label>Título *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ej. Venta de 10 ton de maíz" /></div>
              <div className="grid g2">
                <div className="field"><label>Monto</label><input type="number" min="0" max="999999999" step="0.01" placeholder="0" value={form.amount}
                  onChange={e => {
                    let v = e.target.value;
                    if (v === '') return setForm({ ...form, amount: '' });
                    let n = Number(v);
                    if (n < 0) n = 0;
                    if (n > 999999999) n = 999999999; // tope ~1,000 millones
                    setForm({ ...form, amount: n });
                  }} /></div>
              </div>
              <div className="field"><label>Cliente (opcional)</label>
                <Select searchable value={form.clientId} onChange={v => setForm({ ...form, clientId: v })}
                  placeholder="Sin cliente registrado"
                  options={[{ value: '', label: 'Sin cliente registrado' }, ...clients.map(c => ({ value: c.id, label: c.name }))]} />
              </div>
              {!form.clientId && <div className="field"><label>O nombre de contacto</label><input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} placeholder="Ej. Distribuidora del Norte" /></div>}
              <div className="field" style={{ marginBottom: 0 }}><label>Notas</label><textarea rows="3" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>

            {/* Columna derecha: actividades y seguimiento (solo tratos guardados) */}
            {form.id && (
              <div className="deal-modal-acts">
                <div className="deal-acts-title">Actividades y seguimiento</div>

                {/* Compositor de actividad */}
                <div className="deal-act-compose">
                  <Select value={newAct.type} onChange={v => setNewAct({ ...newAct, type: v })}
                    options={ACT_OPTIONS} />
                  <input placeholder={newAct.type === 'tarea' ? 'Describe la tarea…' : 'Detalle (opcional)'}
                    value={newAct.note} onChange={e => setNewAct({ ...newAct, note: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addActivity(); } }} />
                  {newAct.type === 'tarea' &&
                    <DateField inline value={newAct.dueDate} onChange={v => setNewAct({ ...newAct, dueDate: v })} />}
                  <button className="btn" type="button" onClick={addActivity}>Registrar</button>
                </div>
                {newAct.type === 'tarea' && (
                  <div className="muted" style={{ fontSize: '.72rem', marginTop: -2, marginBottom: 4 }}>
                    {form.clientId ? 'Esta tarea aparecerá también en la pestaña Seguimientos.' : 'Asigna un cliente a la oportunidad para que la tarea aparezca en Seguimientos.'}
                  </div>
                )}

                {/* Línea de tiempo de actividades */}
                <div className="deal-act-timeline">
                  {acts.length === 0 && <div className="muted" style={{ fontSize: '.8rem', padding: '14px 2px' }}>Aún no hay actividades registradas.</div>}
                  {acts.map(a => {
                    const isTask = a.type === 'tarea';
                    return (
                      <div key={a.id} className={'deal-act-item' + (a.done ? ' done' : '')}>
                        <span className="deal-act-ic">{ActIcon(a.type)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="deal-act-text">{a.note || ACT_LABELS[a.type] || a.type}</div>
                          <div className="deal-act-meta">
                            {ACT_LABELS[a.type] || a.type}
                            {' · '}{new Date(a.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                            {a.dueDate && ` · vence ${new Date(a.dueDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`}
                          </div>
                        </div>
                        {isTask && !a.done && <button className="btn ghost sm" type="button" onClick={() => doneActivity(a.id)}>Completar</button>}
                        {isTask && a.done && <span className="badge bg-muted">Hecho</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="modal-actions">
            {form.id && <button className="btn ghost" style={{ color: 'var(--bad)', marginRight: 'auto' }} onClick={remove}>Eliminar</button>}
            <button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn" onClick={save}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
