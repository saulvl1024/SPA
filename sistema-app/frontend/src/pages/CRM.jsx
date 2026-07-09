import { useEffect, useState, Fragment } from 'react';
import { api } from '../api.js';
import { Modal, toast, initials } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import Client360 from '../components/Client360.jsx';
import DealsBoard from '../components/DealsBoard.jsx';
import ProjectsBoard from '../components/ProjectsBoard.jsx';
import CardScanner from '../components/CardScanner.jsx';
import ImportExport from '../components/ImportExport.jsx';
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
  // Visibilidad de pestañas del CRM configurada por el admin (Ajustes). Por defecto: visibles.
  const crmTabs = setting('crmTabs', {}) || {};
  const tabOn = k => crmTabs[k] !== false;
  const tabs = [
    ['buscar', 'Clientes'],
    ...(tabOn('empresas') ? [['empresas', 'Empresas']] : []),
    ...(isModuleEnabled('tratos') && tabOn('tratos') ? [['tratos', 'Embudo']] : []),
    ...(isModuleEnabled('tratos') && isAdmin ? [['equipo', 'Equipo']] : []),
    ...(tabOn('proyectos') ? [['proyectos', 'Proyectos']] : []),
    ...(campanasOn && tabOn('campanas') ? [['campanas', 'Campañas']] : []),
    ...(automatizacionesOn && tabOn('automatizaciones') ? [['automatizaciones', 'Automatización']] : []),
    ...(tabOn('cumple') ? [['cumple', 'Cumpleaños']] : []),
    ...(tabOn('seguimientos') ? [['seguimientos', 'Seguimientos']] : []),
    ...(tabOn('origen') ? [['origen', 'Origen']] : []),
  ];
  // Si la pestaña activa quedó deshabilitada, vuelve a "Clientes"
  useEffect(() => {
    // Si la pestaña activa ya no está visible (la ocultó el admin), vuelve a Clientes
    if (!tabs.some(t => t[0] === tab)) setTab('buscar');
  }, [tab, tabs]); // eslint-disable-line
  return (
    <>
      <div className="top"><div><h1>CRM</h1><div className="sub">Retención y relación con clientes</div></div></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'buscar' && <ClientSearch onOpen={setView360} />}
      {tab === 'empresas' && <Companies onOpen={setView360} />}
      {tab === 'proyectos' && <ProjectsBoard />}
      {tab === 'tratos' && <DealsBoard />}
      {tab === 'equipo' && isAdmin && <SellersBoard />}
      {tab === 'campanas' && campanasOn && <Campaigns />}
      {tab === 'automatizaciones' && automatizacionesOn && <Automations />}
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
  const [newForm, setNewForm] = useState(null);   // alta de contacto/cliente
  const [phoneDup, setPhoneDup] = useState(null);  // cliente existente con el mismo teléfono
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState([]);
  useEffect(() => { api.get('/companies').then(setCompanies).catch(() => {}); }, []);
  const reload = () => api.get('/clients?take=50' + (q.trim() ? '&q=' + encodeURIComponent(q.trim()) : '')).then(setFiltered).catch(() => {});
  useEffect(() => {
    const t = setTimeout(reload, 250); // debounce: espera a que el usuario deje de teclear
    return () => clearTimeout(t);
  }, [q]);

  // Alerta en vivo: ¿el teléfono ya está registrado con otro cliente?
  useEffect(() => {
    const ph = newForm?.phone || '';
    if (ph.replace(/\D/g, '').length < 7) { setPhoneDup(null); return; }
    const t = setTimeout(() => {
      api.get('/clients/check-phone?phone=' + encodeURIComponent(ph) + (newForm?.id ? '&excludeId=' + newForm.id : ''))
        .then(r => setPhoneDup(r.duplicate ? r.client : null)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [newForm?.phone]);

  // Abre el formulario para EDITAR un cliente existente (trae sus datos completos)
  async function editClient(c) {
    try {
      const full = await api.get('/clients/' + c.id);
      setNewForm({ id: full.id, name: full.name || '', phone: full.phone || '', email: full.email || '', tag: full.tag || 'Nueva', source: full.source || '', companyId: full.companyId || '' });
      setPhoneDup(null);
    } catch { toast('No se pudo abrir el cliente', 'bad'); }
  }

  // Aplica los datos leídos de una tarjeta al formulario (rellena lo vacío / detectado)
  function applyScan(d) {
    setNewForm(f => {
      let companyId = f.companyId;
      if (d.company) {
        const b = d.company.toLowerCase();
        const m = companies.find(c => { const a = c.name.toLowerCase(); return a.includes(b) || b.includes(a); });
        if (m) companyId = m.id;
      }
      return { ...f, name: d.name || f.name, phone: d.phone || f.phone, email: d.email || f.email, companyId };
    });
  }

  async function saveNew() {
    if (!newForm.name?.trim()) return toast('El nombre es obligatorio', 'bad');
    setSaving(true);
    try {
      if (newForm.id) {
        await api.put('/clients/' + newForm.id, { ...newForm, force: !!phoneDup });
        toast('Cliente actualizado', 'ok');
      } else {
        await api.post('/clients', { ...newForm, force: !!phoneDup }); // force: guardar aunque el tel. exista
        toast('Contacto creado', 'ok');
      }
      setNewForm(null); setPhoneDup(null); reload();
    } catch (e) { toast(e.message, 'bad'); }
    finally { setSaving(false); }
  }

  return (
    <>
      {/* Embudo del ciclo de vida (antes era la pestaña "Flujo", ahora integrado aquí) */}
      <Pipeline onOpen={onOpen} />

      <div className="row mb" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="sec-title" style={{ margin: 0 }}>Directorio de clientes</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <ImportExport exportUrl="/clients/export" importUrl="/clients/import" filename="clientes" label="clientes"
            columns={[
              { key: 'name', label: 'Nombre' }, { key: 'phone', label: 'Teléfono' },
              { key: 'email', label: 'Correo' }, { key: 'birth', label: 'Cumpleaños' },
              { key: 'tag', label: 'Etiqueta' }, { key: 'source', label: 'Origen' },
              { key: 'empresa', label: 'Empresa' }, { key: 'note', label: 'Nota' },
            ]} onDone={reload} />
          <button className="btn" onClick={() => { setNewForm({ name: '', phone: '', email: '', tag: 'Nueva', source: '', companyId: '' }); setPhoneDup(null); }}>＋ Nuevo contacto o cliente</button>
        </div>
      </div>
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
                <td className="right"><div className="row-actions">
                  <button className="btn ghost sm" onClick={e => { e.stopPropagation(); editClient(c); }}>Editar</button>
                  <span className="link" onClick={e => { e.stopPropagation(); onOpen(c.id); }}>Ver 360 →</span>
                </div></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan="4" className="empty">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>

      {newForm && (
        <Modal title={newForm.id ? 'Editar cliente' : 'Nuevo contacto o cliente'} onClose={() => setNewForm(null)}>
          {!newForm.id && (
            <div className="card mb" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--cream)', padding: '10px 12px' }}>
              <span className="muted" style={{ fontSize: '.82rem' }}>¿Tienes su tarjeta? Tómale foto y detecto los datos.</span>
              <CardScanner onData={applyScan} />
            </div>
          )}
          <div className="field"><label>Nombre *</label><input value={newForm.name} onChange={e => setNewForm({ ...newForm, name: e.target.value })} placeholder="Nombre completo" autoFocus /></div>
          <div className="row2">
            <div className="field"><label>Teléfono</label><input type="tel" inputMode="numeric" value={newForm.phone} onChange={e => setNewForm({ ...newForm, phone: e.target.value.replace(/[^\d+]/g, '') })} placeholder="10 dígitos" /></div>
            <div className="field"><label>Email</label><input value={newForm.email} onChange={e => setNewForm({ ...newForm, email: e.target.value })} placeholder="correo@ejemplo.com" /></div>
          </div>
          {phoneDup && (
            <div className="card" style={{ background: 'rgba(201,138,75,.12)', border: '1px solid #C98A4B', padding: '10px 12px', marginBottom: 12 }}>
              <b style={{ color: '#B4771F' }}>⚠ Teléfono ya registrado</b>
              <div className="muted" style={{ fontSize: '.84rem', marginTop: 2 }}>Este número ya está en el sistema con <b>{phoneDup.name}</b>. Puedes guardar de todos modos si de verdad es otro contacto.</div>
            </div>
          )}
          <div className="row2">
            <div className="field"><label>Origen</label>
              <Select value={newForm.source || ''} onChange={v => setNewForm({ ...newForm, source: v })} placeholder="Sin registrar"
                options={[{ value: '', label: 'Sin registrar' }, 'Instagram', 'Facebook', 'TikTok', 'Recomendación', 'Google', 'Pasó por el local', 'Otro']} />
            </div>
            <div className="field"><label>Etiqueta</label><input value={newForm.tag} onChange={e => setNewForm({ ...newForm, tag: e.target.value })} placeholder="Nueva" /></div>
          </div>
          {companies.length > 0 && (
            <div className="field"><label>Empresa (opcional)</label>
              <Select value={newForm.companyId} onChange={v => setNewForm({ ...newForm, companyId: v })} placeholder="Sin empresa"
                options={[{ value: '', label: 'Sin empresa' }, ...companies.map(c => ({ value: c.id, label: c.name }))]} />
            </div>
          )}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setNewForm(null)}>Cancelar</button>
            <button className="btn" disabled={saving} onClick={saveNew}>{phoneDup ? 'Guardar de todos modos' : 'Crear contacto'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// Empresas cliente (CRM B2B): administrar empresas y ver sus contactos ligados
function Companies({ onOpen }) {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);     // crear/editar empresa
  const [detail, setDetail] = useState(null);  // empresa expandida con sus clientes
  const reload = () => api.get('/companies' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : '')).then(setList).catch(() => {});
  useEffect(() => { const t = setTimeout(reload, 250); return () => clearTimeout(t); }, [q]);

  async function save() {
    if (!form.name?.trim()) return toast('El nombre es obligatorio', 'bad');
    try {
      if (form.id) await api.put('/companies/' + form.id, form);
      else await api.post('/companies', form);
      toast('Empresa guardada', 'ok'); setForm(null); reload();
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function remove(c) {
    if (!confirm('¿Eliminar la empresa ' + c.name + '? Sus contactos quedarán sin empresa (no se borran).')) return;
    try { await api.del('/companies/' + c.id); reload(); toast('Empresa eliminada', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  }
  async function openDetail(c) {
    if (detail?.id === c.id) { setDetail(null); return; }
    try { setDetail(await api.get('/companies/' + c.id)); } catch { toast('No se pudo abrir', 'bad'); }
  }

  return (
    <>
      <div className="row mb" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input style={{ width: 280 }} placeholder="Buscar empresa..." value={q} onChange={e => setQ(e.target.value)} />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <ImportExport exportUrl="/companies/export" importUrl="/companies/import" filename="empresas" label="empresas"
            columns={[
              { key: 'name', label: 'Nombre' }, { key: 'rfc', label: 'RFC' },
              { key: 'phone', label: 'Teléfono' }, { key: 'email', label: 'Correo' },
              { key: 'address', label: 'Dirección' }, { key: 'notes', label: 'Notas' },
            ]} onDone={reload} />
          <button className="btn" onClick={() => setForm({ name: '', rfc: '', phone: '', email: '', address: '', notes: '' })}>＋ Nueva empresa</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Empresa</th><th>Contactos</th><th>Teléfono</th><th></th></tr></thead>
          <tbody>
            {list.map(c => (
              <Fragment key={c.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => openDetail(c)}>
                  <td><b>{c.name}</b>{c.rfc && <span className="muted" style={{ fontSize: '.78rem' }}> · {c.rfc}</span>}</td>
                  <td>{c._count?.clients || 0}</td>
                  <td className="muted">{c.phone || '—'}</td>
                  <td className="right"><div className="row-actions">
                    <button className="btn ghost sm" onClick={e => { e.stopPropagation(); setForm(c); }}>Editar</button>
                    <button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={e => { e.stopPropagation(); remove(c); }}>Eliminar</button>
                  </div></td>
                </tr>
                {detail?.id === c.id && (
                  <tr><td colSpan="4" style={{ background: 'var(--cream)' }}>
                    <div style={{ padding: '4px 2px' }}>
                      <b style={{ fontSize: '.85rem' }}>Contactos de {c.name}</b>
                      {detail.clients.length ? detail.clients.map(cl => (
                        <div key={cl.id} className="row" style={{ justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                          <span>{cl.name} <span className="muted" style={{ fontSize: '.78rem' }}>{cl.phone || ''}</span></span>
                          <span className="link" onClick={() => onOpen(cl.id)}>Ver ficha →</span>
                        </div>
                      )) : <div className="muted" style={{ fontSize: '.82rem', padding: '6px 0' }}>Sin contactos ligados aún. Asigna esta empresa a un cliente desde su ficha.</div>}
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
            {!list.length && <tr><td colSpan="4" className="empty">Sin empresas</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar empresa' : 'Nueva empresa'} onClose={() => setForm(null)}>
          {!form.id && (
            <div className="card mb" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: 'var(--cream)', padding: '10px 12px' }}>
              <span className="muted" style={{ fontSize: '.82rem' }}>¿Tienes su tarjeta? Tómale foto y detecto los datos.</span>
              <CardScanner onData={d => setForm(f => ({ ...f, name: d.company || d.name || f.name, phone: d.phone || f.phone, email: d.email || f.email }))} />
            </div>
          )}
          <div className="field"><label>Nombre *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus placeholder="Razón social o nombre comercial" /></div>
          <div className="row2">
            <div className="field"><label>RFC</label><input value={form.rfc || ''} onChange={e => setForm({ ...form, rfc: e.target.value })} /></div>
            <div className="field"><label>Teléfono</label><input type="tel" inputMode="numeric" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value.replace(/[^\d+]/g, '') })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Email</label><input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Dirección</label><input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notas</label><textarea rows="2" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}
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
  if (!rows.length) return <div className="card"><div className="empty">Aún no hay oportunidades asignadas a vendedores.</div></div>;

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
