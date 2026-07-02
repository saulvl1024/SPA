import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, initials } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import Client360 from '../components/Client360.jsx';
import DealsBoard from '../components/DealsBoard.jsx';
import Tabs from '../components/Tabs.jsx';
import Select from '../components/Select.jsx';
import { isModuleEnabled, businessName, setting } from '../permissions.js';
import { useAuth } from '../auth.jsx';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Abre WhatsApp con un mensaje prellenado (sin costo, usa la app del teléfono/escritorio)
function waLink(phone, msg) {
  const num = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
function mailLink(email, subject, body) {
  return `mailto:${email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function daysAgo(d) {
  if (!d) return 'Nunca';
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return n === 0 ? 'Hoy' : `Hace ${n} días`;
}

const TAG_BG = { plum: 'bg-plum', gold: 'bg-gold', sage: 'bg-ok', blush: 'bg-blush', muted: 'bg-muted' };
// Caché de colores de etiqueta a nivel de módulo (lo llena CRM al montar); accesible por todos los subcomponentes
let TAG_COLORS = {};
const tagBadge = name => 'badge ' + (TAG_BG[TAG_COLORS[name]] || '');

export default function CRM() {
  const [tab, setTab] = useState('buscar');
  const [view360, setView360] = useState(null); // clientId a mostrar en Vista 360
  useEffect(() => {
    api.get('/tags').then(list => { TAG_COLORS = Object.fromEntries((list || []).map(t => [t.name, t.color])); }).catch(() => {});
  }, []);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  // Estos dos los activa/desactiva el super-admin desde el panel del sistema
  const campanasOn = setting('usarCampanas');
  const automatizacionesOn = setting('usarAutomatizaciones');
  const tabs = [
    ['buscar', 'Clientes'],
    ...(isModuleEnabled('tratos') ? [['tratos', 'Embudo']] : []),
    ...(isModuleEnabled('tratos') && isAdmin ? [['equipo', 'Equipo']] : []),
    ...(campanasOn ? [['campanas', 'Campañas']] : []),
    ...(automatizacionesOn ? [['automatizaciones', 'Automatización']] : []),
    ['riesgo', 'En riesgo'], ['cumple', 'Cumpleaños'], ['seguimientos', 'Seguimientos'], ['origen', 'Origen'],
  ];
  // Si la pestaña activa quedó deshabilitada, vuelve a "Clientes"
  useEffect(() => {
    if ((tab === 'campanas' && !campanasOn) || (tab === 'automatizaciones' && !automatizacionesOn)) setTab('buscar');
  }, [tab, campanasOn, automatizacionesOn]);
  return (
    <>
      <div className="top"><div><h1>CRM</h1><div className="sub">Retención y relación con clientes</div></div></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'buscar' && <ClientSearch onOpen={setView360} />}
      {tab === 'tratos' && <DealsBoard />}
      {tab === 'equipo' && isAdmin && <SellersBoard />}
      {tab === 'campanas' && campanasOn && <Campaigns />}
      {tab === 'automatizaciones' && automatizacionesOn && <Automations />}
      {tab === 'riesgo' && <AtRisk onOpen={setView360} />}
      {tab === 'cumple' && <Birthdays />}
      {tab === 'seguimientos' && <FollowUps />}
      {tab === 'origen' && <Sources />}
      {view360 && <Client360 clientId={view360} onClose={() => setView360(null)} />}
    </>
  );
}

// Buscador de clientes que abre la Vista 360 (búsqueda en el servidor)
function ClientSearch({ onOpen }) {
  const [q, setQ] = useState('');
  const [filtered, setFiltered] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/clients?take=50' + (q.trim() ? '&q=' + encodeURIComponent(q.trim()) : '')).then(setFiltered).catch(() => {});
    }, 250); // debounce: espera a que el usuario deje de teclear
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      {/* Embudo del ciclo de vida (antes era la pestaña "Flujo", ahora integrado aquí) */}
      <Pipeline onOpen={onOpen} />

      <div className="sec-title">Directorio de clientes</div>
      <div className="row mb" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Busca un cliente y abre su ficha completa (Vista 360)</span>
        <input style={{ width: 280 }} placeholder="Buscar por nombre o teléfono..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Cliente</th><th>Etiqueta</th><th>Teléfono</th><th></th></tr></thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(c.id)}>
                <td><div className="client-cell"><span className="client-avatar">{initials(c.name)}</span>{c.name}</div></td>
                <td><span className={tagBadge(c.tag)}>{c.tag}</span></td>
                <td className="muted">{c.phone || '—'}</td>
                <td><span className="link">Ver ficha 360 →</span></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan="4" className="empty">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Etapas del ciclo de vida del cliente — nombres tradicionales y neutros (sirve a cualquier nicho)
const STAGES = [
  { key: 'prospecto', icon: '◔', label: 'Prospectos', tagline: 'Registrados, sin compras aún', color: '#A99C96', soft: 'rgba(169,156,150,.12)', action: 'Invitar a su primera compra' },
  { key: 'activo', icon: '◉', label: 'Activos', tagline: 'Compraron en los últimos 45 días', color: '#6F8169', soft: 'rgba(111,129,105,.12)', action: 'Enviar mensaje de agradecimiento' },
  { key: 'riesgo', icon: '◑', label: 'En riesgo', tagline: 'Entre 45 y 90 días sin comprar', color: '#C98A4B', soft: 'rgba(201,138,75,.12)', action: 'Enviar mensaje de retención' },
  { key: 'perdido', icon: '◯', label: 'Inactivos', tagline: 'Más de 90 días sin comprar', color: '#C16B6B', soft: 'rgba(193,107,107,.12)', action: 'Enviar mensaje de reactivación' },
];
function Pipeline({ onOpen }) {
  const [counts, setCounts] = useState(null);
  const [sel, setSel] = useState(null);
  const [list, setList] = useState([]);
  const [sending, setSending] = useState(false);
  const [confirmKey, setConfirmKey] = useState(null); // etapa pendiente de confirmar envío
  const MSG_LIMIT = 24; // tope de mensajes por tanda
  useEffect(() => { api.get('/crm/pipeline').then(d => setCounts(d.counts)).catch(() => {}); }, []);
  function openStage(key) {
    setSel(key);
    api.get('/crm/pipeline?stage=' + key).then(d => setList(d.clients)).catch(() => {});
  }
  async function sendStage(key) {
    setConfirmKey(null);
    setSending(true);
    try { const r = await api.post(`/crm/pipeline/${key}/message`, { limit: MSG_LIMIT }); toast(`${r.sent} mensaje(s) enviados${r.demo ? ' (modo demo)' : ''}`, 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
    setSending(false);
  }
  const total = counts ? Object.values(counts).reduce((a, v) => a + v, 0) : 0;
  const cur = STAGES.find(s => s.key === sel);

  return (
    <>
      <p className="muted mb">El ciclo de vida de tus clientes, de un vistazo. Toca una etapa para ver y atender a esos clientes.</p>

      {/* Tablero del viaje */}
      <div className="grid g4 mb" style={{ gap: 12 }}>
        {STAGES.map(s => {
          const n = counts ? counts[s.key] : 0;
          const pct = total ? Math.round(n / total * 100) : 0;
          const on = sel === s.key;
          return (
            <div key={s.key} className="card" onClick={() => openStage(s.key)}
              style={{ cursor: 'pointer', background: s.soft, border: `1px solid ${on ? s.color : 'transparent'}`, transition: 'all .15s', textAlign: 'center', padding: '18px 14px' }}>
              <div style={{ fontSize: '1.9rem', lineHeight: 1, color: s.color }}>{s.icon}</div>
              <div className="serif" style={{ fontSize: '1.05rem', marginTop: 6, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: '2rem', fontWeight: 300, margin: '4px 0' }}>{counts ? n.toLocaleString() : '…'}</div>
              {/* barra de proporción */}
              <div style={{ height: 5, background: 'rgba(0,0,0,.05)', borderRadius: 4, overflow: 'hidden', margin: '8px 0 6px' }}>
                <div style={{ width: pct + '%', height: '100%', background: s.color }} />
              </div>
              <div className="muted" style={{ fontSize: '.74rem' }}>{s.tagline}</div>
            </div>
          );
        })}
      </div>

      {sel && (
        <>
          <div className="row mb" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="sec-title" style={{ margin: 0 }}><span style={{ color: cur.color }}>{cur.icon}</span> {cur.label} <span className="muted">· {list.length} mostrados</span></div>
            <button className="btn" disabled={sending || !list.length} onClick={() => setConfirmKey(sel)}>{cur.action}</button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Cliente</th><th>Etiqueta</th><th>Última compra</th><th>Compras</th><th></th></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(c.id)}>
                    <td><div className="client-cell"><span className="client-avatar">{initials(c.name)}</span>{c.name}</div></td>
                    <td><span className={tagBadge(c.tag)}>{c.tag}</span></td>
                    <td className="muted">{daysAgo(c.lastSale)}</td>
                    <td>{c.totalSales}</td>
                    <td><span className="link">Ver ficha 360 →</span></td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan="5" className="empty">Sin clientes en esta etapa</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmKey && (() => {
        const s = STAGES.find(x => x.key === confirmKey);
        const totalEtapa = (counts && counts[confirmKey]) || 0;
        const aEnviar = Math.min(totalEtapa, MSG_LIMIT);
        return (
          <Modal title={s?.action || 'Enviar mensajes'} onClose={() => setConfirmKey(null)} width={460}>
            <p style={{ marginTop: -4, marginBottom: 14, lineHeight: 1.5 }}>
              Se enviará un mensaje por WhatsApp a los clientes de <b style={{ color: s?.color }}>{s?.label}</b>.
            </p>
            <div className="card" style={{ background: 'var(--cream)', padding: '12px 14px', marginBottom: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Clientes en la etapa</span><b>{totalEtapa}</b>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <span className="muted">Se enviarán ahora</span><b style={{ color: 'var(--plum)' }}>{aEnviar}</b>
              </div>
            </div>
            <p className="muted" style={{ fontSize: '.78rem' }}>
              Límite de {MSG_LIMIT} mensajes por tanda para cuidar tu cuenta de WhatsApp. {totalEtapa > MSG_LIMIT && `Los ${totalEtapa - MSG_LIMIT} restantes podrás enviarlos en otra tanda.`}
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmKey(null)}>Cancelar</button>
              <button className="btn" disabled={sending || !aEnviar} onClick={() => sendStage(confirmKey)}>{sending ? 'Enviando…' : `Enviar a ${aEnviar}`}</button>
            </div>
          </Modal>
        );
      })()}
    </>
  );
}

// Tablero de desempeño por vendedor (solo admin)
function SellersBoard() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/deals/sellers-board').then(setRows).catch(e => toast(e.message, 'bad')); }, []);

  if (!rows) return <p className="muted">Cargando…</p>;
  if (!rows.length) return <div className="card"><div className="empty">Aún no hay tratos asignados a vendedores.</div></div>;

  const fmt = n => '$' + (Number(n) || 0).toLocaleString('es-MX');
  return (
    <>
      <p className="muted mb">Desempeño de cada vendedor: embudo, conversión y tareas pendientes.</p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Vendedor</th>
              <th style={{ textAlign: 'right' }}>Abiertos</th>
              <th style={{ textAlign: 'right' }}>Valor embudo</th>
              <th style={{ textAlign: 'right' }}>Ganados</th>
              <th style={{ textAlign: 'right' }}>Conversión</th>
              <th style={{ textAlign: 'right' }}>Tareas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><div className="client-cell"><span className="client-avatar">{initials(r.name)}</span>{r.name}</div></td>
                <td style={{ textAlign: 'right' }}>{r.open}</td>
                <td style={{ textAlign: 'right' }}>{fmt(r.openValue)}</td>
                <td style={{ textAlign: 'right' }}>{r.won}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className="badge bg-muted">{r.winRate}%</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {r.tasksPending}
                  {r.tasksOverdue > 0 && <span className="badge" style={{ marginLeft: 6, background: 'var(--bad)', color: '#fff', fontSize: '.62rem' }}>{r.tasksOverdue} vencidas</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Campañas de WhatsApp segmentadas
const STAGE_OPTS = [['', 'Cualquier etapa'], ['prospecto', 'Prospectos'], ['activo', 'Activos'], ['riesgo', 'En riesgo'], ['perdido', 'Inactivos']];
function Campaigns() {
  const [stage, setStage] = useState('');
  const [tag, setTag] = useState('');
  const [inactiveDays, setInactiveDays] = useState('');
  const [tags, setTags] = useState([]);
  const [preview, setPreview] = useState(null);   // { total, sample }
  const [message, setMessage] = useState('Hola {nombre}, en {negocio} tenemos una promoción especial para ti. ¡Te esperamos!');
  const [sending, setSending] = useState(false);

  useEffect(() => { api.get('/tags').then(setTags).catch(() => {}); }, []);

  const filters = () => ({ stage: stage || undefined, tag: tag || undefined, inactiveDays: inactiveDays || undefined });

  async function doPreview() {
    try { setPreview(await api.post('/crm/campaign/preview', filters())); }
    catch (e) { toast(e.message, 'bad'); }
  }
  useEffect(() => { doPreview(); }, [stage, tag, inactiveDays]); // eslint-disable-line

  async function send() {
    if (!message.trim()) return toast('Escribe el mensaje', 'bad');
    if (!preview?.total) return toast('No hay clientes en este segmento', 'bad');
    if (!confirm(`¿Enviar la campaña a ${Math.min(preview.total, 300)} cliente(s) por WhatsApp?`)) return;
    setSending(true);
    try { const r = await api.post('/crm/campaign/send', { ...filters(), message, limit: 300 }); toast(`${r.sent} mensaje(s) enviados${r.demo ? ' (modo demo)' : ''}`, 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
    setSending(false);
  }

  return (
    <>
      <p className="muted mb">Envía un mensaje por WhatsApp a un grupo de clientes filtrado. Usa <b>{'{nombre}'}</b> y <b>{'{negocio}'}</b> para personalizar.</p>

      <div className="grid g2" style={{ gridTemplateColumns: '1fr 1.1fr', gap: 16, alignItems: 'start' }}>
        {/* Segmentador */}
        <div className="card">
          <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>1. ¿A quién?</h2>
          <div className="field"><label>Etapa del flujo</label>
            <Select value={stage} onChange={setStage} options={STAGE_OPTS.map(([v, l]) => ({ value: v, label: l }))} />
          </div>
          <div className="field"><label>Etiqueta</label>
            <Select value={tag} onChange={setTag} placeholder="Cualquier etiqueta"
              options={[{ value: '', label: 'Cualquier etiqueta' }, ...tags.map(t => ({ value: t.name, label: t.name }))]} />
          </div>
          <div className="field"><label>Sin comprar hace al menos…</label>
            <Select value={inactiveDays} onChange={setInactiveDays} placeholder="Sin filtro de inactividad"
              options={[{ value: '', label: 'Sin filtro de inactividad' }, ...[30, 45, 60, 90, 180].map(d => ({ value: d, label: `${d} días` }))]} />
          </div>
          <div className="card" style={{ background: 'var(--cream)', textAlign: 'center', padding: 14, marginTop: 6 }}>
            <div className="lbl">Clientes en este segmento</div>
            <div className="val" style={{ fontSize: '1.8rem', color: 'var(--plum)' }}>{preview ? preview.total.toLocaleString() : '…'}</div>
            {preview?.total > 300 && <div className="muted" style={{ fontSize: '.78rem' }}>Se enviará a los primeros 300 por tanda</div>}
          </div>
        </div>

        {/* Mensaje + envío */}
        <div className="card">
          <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>2. El mensaje</h2>
          <div className="field"><label>Texto (personalizable)</label>
            <textarea rows="4" value={message} onChange={e => setMessage(e.target.value)} />
            <p className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>Variables: <b>{'{nombre}'}</b> = nombre del cliente · <b>{'{negocio}'}</b> = nombre de tu negocio.</p>
          </div>
          {preview?.sample?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: '.78rem', marginBottom: 4 }}>Ejemplo (primer cliente del segmento):</div>
              <div className="card" style={{ background: 'rgba(111,129,105,.08)', fontSize: '.85rem' }}>
                {message.replace(/\{nombre\}/gi, (preview.sample[0].name || '').split(' ')[0]).replace(/\{negocio\}/gi, 'tu negocio')}
              </div>
            </div>
          )}
          <button className="btn" disabled={sending || !preview?.total} onClick={send} style={{ width: '100%', justifyContent: 'center' }}>
            {sending ? 'Enviando…' : `💬 Enviar a ${preview ? Math.min(preview.total, 300) : 0} cliente(s)`}
          </button>
          <p className="muted" style={{ fontSize: '.76rem', marginTop: 8 }}>Nota: para enviar a clientes que no te escribieron en 24h se requiere una plantilla aprobada por Meta. En pruebas/demo funciona en modo simulado.</p>
        </div>
      </div>
    </>
  );
}

// Automatizaciones del CRM (corren solas con el envío diario automático)
function Automations() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/crm/automations').then(setCfg).catch(e => toast(e.message, 'bad')); }, []);

  async function save() {
    setSaving(true);
    try { await api.put('/crm/automations', cfg); toast('Automatizaciones guardadas', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
    setSaving(false);
  }
  if (!cfg) return <div className="empty">Cargando…</div>;

  const Toggle = ({ on, onChange }) => (
    <button className="btn sm" onClick={onChange}
      style={{ minWidth: 96, background: on ? 'var(--sage)' : 'transparent', color: on ? '#fff' : 'var(--muted)', border: on ? 'none' : '1px solid var(--line)' }}>
      {on ? '● Activa' : '○ Apagada'}
    </button>
  );

  return (
    <>
      <p className="muted mb">Mensajes que se envían <b>solos</b> cada día por WhatsApp. Usa <b>{'{nombre}'}</b> y <b>{'{negocio}'}</b> para personalizar. Requieren que el envío automático diario esté activo.</p>

      {/* Post-visita */}
      <div className="card mb">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div><h2 className="serif" style={{ fontSize: '1.2rem', margin: 0 }}>Agradecimiento post-visita</h2>
            <div className="muted" style={{ fontSize: '.82rem' }}>Se envía al día siguiente a quienes te visitaron / compraron.</div></div>
          <Toggle on={cfg.postVisit.on} onChange={() => setCfg({ ...cfg, postVisit: { ...cfg.postVisit, on: !cfg.postVisit.on } })} />
        </div>
        <div className="field"><label>Mensaje</label><textarea rows="2" value={cfg.postVisit.message} onChange={e => setCfg({ ...cfg, postVisit: { ...cfg.postVisit, message: e.target.value } })} /></div>
      </div>

      {/* Reactivación */}
      <div className="card mb">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div><h2 className="serif" style={{ fontSize: '1.2rem', margin: 0 }}>Reactivación por inactividad</h2>
            <div className="muted" style={{ fontSize: '.82rem' }}>Se envía una vez al cliente que cumple cierto tiempo sin comprar.</div></div>
          <Toggle on={cfg.reactivate.on} onChange={() => setCfg({ ...cfg, reactivate: { ...cfg.reactivate, on: !cfg.reactivate.on } })} />
        </div>
        <div className="field" style={{ maxWidth: 220 }}><label>Enviar cuando lleve sin comprar</label>
          <Select value={cfg.reactivate.days} onChange={v => setCfg({ ...cfg, reactivate: { ...cfg.reactivate, days: +v } })}
            options={[30, 45, 60, 90, 120, 180].map(d => ({ value: d, label: `${d} días` }))} />
        </div>
        <div className="field"><label>Mensaje</label><textarea rows="2" value={cfg.reactivate.message} onChange={e => setCfg({ ...cfg, reactivate: { ...cfg.reactivate, message: e.target.value } })} /></div>
      </div>

      {/* Cumpleaños (ya existente, informativo) */}
      <div className="card mb" style={{ background: 'var(--cream)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h2 className="serif" style={{ fontSize: '1.2rem', margin: 0 }}>Felicitación de cumpleaños</h2>
            <div className="muted" style={{ fontSize: '.82rem' }}>Ya activa. Usa la plantilla aprobada de WhatsApp y se envía el día del cumpleaños.</div></div>
          <span className="badge bg-ok">● Activa</span>
        </div>
      </div>

      <button className="btn" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar automatizaciones'}</button>
    </>
  );
}

function AtRisk({ onOpen }) {
  const [days, setDays] = useState(45);
  const [list, setList] = useState([]);
  const load = () => api.get('/crm/at-risk?days=' + days).then(d => setList(d.clients));
  useEffect(() => { load(); }, [days]); // eslint-disable-line

  async function makeFollowUp(c) {
    try { await api.post('/crm/followups', { clientId: c.id, title: 'Reactivar (en riesgo)', kind: 'riesgo' }); toast('Seguimiento creado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <div className="row mb" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Clientes sin visitas desde hace más de {days} días</span>
        <Select style={{ width: 160 }} value={days} onChange={v => setDays(+v)} options={[30, 45, 60, 90].map(d => ({ value: d, label: `${d} días` }))} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Cliente</th><th>Etiqueta</th><th>Última visita</th><th>Acciones</th></tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id}>
                <td><div className="client-cell" style={{ cursor: 'pointer' }} onClick={() => onOpen?.(c.id)}><span className="client-avatar">{initials(c.name)}</span><span className="link">{c.name}</span></div></td>
                <td><span className={tagBadge(c.tag)}>{c.tag}</span></td>
                <td className="muted">{daysAgo(c.lastVisit)}</td>
                <td className="row" style={{ gap: 8 }}>
                  {c.phone && <button className="btn sm" onClick={async () => { try { const r = await api.post(`/whatsapp/client/${c.id}/reactivate`); toast(r.demo ? 'Enviado (modo demo)' : 'Mensaje enviado', 'ok'); } catch (e) { toast(e.message, 'bad'); } }}>WhatsApp auto</button>}
                  {c.phone && <a className="btn ghost sm" target="_blank" rel="noreferrer" href={waLink(c.phone, `Hola ${c.name.split(' ')[0]}, te extrañamos en ${businessName()}. ¿Te gustaría agendar tu próxima visita? Tenemos un detalle para ti.`)}>Abrir</a>}
                  <button className="btn ghost sm" onClick={() => makeFollowUp(c)}>+ Seguimiento</button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="4" className="empty">Sin clientes en riesgo 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Birthdays() {
  const [month, setMonth] = useState(new Date().getMonth());
  const [list, setList] = useState([]);
  const [promo, setPromo] = useState(null);
  useEffect(() => { api.get('/crm/birthdays?month=' + month).then(d => setList(d.clients)); }, [month]);
  useEffect(() => { api.get('/promotions?active=true').then(ps => setPromo(ps.find(p => p.birthday) || null)).catch(() => {}); }, []);
  const promoText = promo ? ` Usa el código ${promo.code} y obtén ${promo.type === 'percent' ? promo.value + '%' : '$' + promo.value} de regalo.` : '';
  return (
    <>
      <div className="row mb" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Clientes que cumplen años en {MONTHS[month]}</span>
        <Select style={{ width: 160 }} value={month} onChange={v => setMonth(+v)} options={MONTHS.map((m, i) => ({ value: i, label: m }))} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Día</th><th>Cliente</th><th>Etiqueta</th><th>Felicitar</th></tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id}>
                <td><b>{c.day}</b></td>
                <td><div className="client-cell"><span className="client-avatar">{initials(c.name)}</span>{c.name}</div></td>
                <td><span className={tagBadge(c.tag)}>{c.tag}</span></td>
                <td className="row" style={{ gap: 8 }}>
                  {c.phone && <button className="btn sm" onClick={async () => { try { const r = await api.post(`/whatsapp/client/${c.id}/birthday`); toast(r.demo ? 'Enviado (modo demo)' : 'Felicitación enviada', 'ok'); } catch (e) { toast(e.message, 'bad'); } }}>WhatsApp auto</button>}
                  {c.phone && <a className="btn ghost sm" target="_blank" rel="noreferrer" href={waLink(c.phone, `¡Feliz cumpleaños, ${c.name.split(' ')[0]}! 🎉 En ${businessName()} queremos celebrarte.${promoText} ¡Te esperamos!`)}>Abrir</a>}
                  {c.email && <a className="btn ghost sm" href={mailLink(c.email, `¡Feliz cumpleaños de ${businessName()}!`, `¡Feliz cumpleaños, ${c.name}!${promoText} Tenemos un regalo para ti este mes.`)}>Email</a>}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="4" className="empty">Nadie cumple años este mes</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FollowUps() {
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);
  const load = () => api.get('/crm/followups').then(setItems);
  useEffect(() => { load(); api.get('/clients').then(setClients); }, []);

  async function save() {
    try { if (!form.clientId || !form.title) return toast('Cliente y título obligatorios', 'bad'); await api.post('/crm/followups', form); setForm(null); load(); toast('Seguimiento creado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function toggle(it) { await api.patch('/crm/followups/' + it.id, { done: !it.done }); load(); }
  async function remove(it) { await api.del('/crm/followups/' + it.id); load(); }

  return (
    <>
      <div className="row mb" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Tareas y recordatorios por cliente</span>
        <button className="btn" onClick={() => setForm({ clientId: clients[0]?.id || '', title: '', dueDate: '' })}>＋ Nuevo seguimiento</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>✓</th><th>Cliente</th><th>Tarea</th><th>Para</th><th></th></tr></thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} style={{ opacity: it.done ? 0.5 : 1 }}>
                <td><input type="checkbox" style={{ width: 'auto' }} checked={it.done} onChange={() => toggle(it)} /></td>
                <td>{it.client?.name}</td>
                <td style={{ textDecoration: it.done ? 'line-through' : 'none' }}>{it.title} {it.kind !== 'manual' && <span className="badge">{it.kind}</span>}</td>
                <td className="muted">{it.dueDate ? new Date(it.dueDate).toLocaleDateString('es-MX') : '—'}</td>
                <td><div className="row-actions" style={{ justifyContent: 'flex-start' }}><button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => remove(it)}>Eliminar</button></div></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="5" className="empty">Sin seguimientos pendientes</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title="Nuevo seguimiento" onClose={() => setForm(null)} width={560}>
          <div className="field"><label>Cliente</label><Select value={form.clientId} onChange={v => setForm({ ...form, clientId: v })} placeholder="Selecciona cliente..." options={clients.map(c => ({ value: c.id, label: c.name }))} /></div>
          <div className="field"><label>Tarea</label><input value={form.title} placeholder="Ej. Llamar para confirmar paquete" onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="field"><label>Fecha objetivo (opcional)</label><DateField value={form.dueDate} onChange={v => setForm({ ...form, dueDate: v })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}

function Sources() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/crm/sources').then(setRows); }, []);
  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Origen</th><th>Clientes</th><th>Proporción</th></tr></thead>
          <tbody>
            {(() => {
              const total = rows.reduce((a, r) => a + (r.clients || 0), 0) || 1;
              return rows.map(r => {
                const pct = Math.round((r.clients || 0) / total * 100);
                return (
                  <tr key={r.source}>
                    <td>{r.source}</td>
                    <td>{(r.clients || 0).toLocaleString()}</td>
                    <td style={{ minWidth: 180 }}>
                      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                        <div style={{ flex: 1, height: 8, background: 'var(--cream)', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{ width: pct + '%', height: '100%', background: 'var(--plum)' }} />
                        </div>
                        <span className="muted" style={{ fontSize: '.78rem', minWidth: 34, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
            {!rows.length && <tr><td colSpan="3" className="empty">Sin datos de origen todavía</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
