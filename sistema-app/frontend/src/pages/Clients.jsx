import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money, initials } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import { can } from '../permissions.js';
import ImportModal from '../components/ImportModal.jsx';
import Select from '../components/Select.jsx';

const COLORS = ['#2A2A30', '#C9A66B', '#7F9279', '#9A968E'];
const colorFor = s => COLORS[(s || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const TAG_BG = { plum: 'bg-plum', gold: 'bg-gold', sage: 'bg-ok', blush: '', muted: '' };

export default function Clients() {
  const nav = useNavigate();
  const { user } = useAuth();
  const admin = user?.role === 'admin';
  const [clients, setClients] = useState([]);
  const [tags, setTags] = useState([]);
  const [pkgCount, setPkgCount] = useState({});
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [origTag, setOrigTag] = useState(null);
  const [confirmTag, setConfirmTag] = useState(false);
  const [manageTags, setManageTags] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [err, setErr] = useState('');
  const [total, setTotal] = useState(0);

  const load = (query = '') => api.get('/clients?take=100' + (query ? '&q=' + encodeURIComponent(query) : '')).then(setClients).catch(e => setErr(e.message));
  const loadTags = () => api.get('/tags').then(setTags).catch(() => {});

  useEffect(() => {
    load(); loadTags();
    api.get('/clients/count').then(d => setTotal(d.total)).catch(() => {});
    api.get('/packages/active').then(list => {
      const m = {}; list.forEach(p => { if (p.remaining > 0) m[p.clientId] = (m[p.clientId] || 0) + 1; });
      setPkgCount(m);
    }).catch(() => {});
  }, []);

  const tagClass = name => 'badge ' + (TAG_BG[tags.find(t => t.name === name)?.color] ?? '');

  async function doSave() {
    try {
      if (!form.name) return toast('El nombre es obligatorio', 'bad');
      const payload = { ...form };
      // tagManual=true si admin cambió la etiqueta a mano
      if (form.id && admin && form.tag !== origTag) payload.tagManual = true;
      if (form.id) await api.put('/clients/' + form.id, payload);
      else await api.post('/clients', payload);
      setForm(null); setConfirmTag(false); setErr(''); load(q); toast('Cliente guardado', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  function save() {
    // Si el admin cambió la etiqueta manualmente, pide confirmación
    if (form.id && admin && form.tag !== origTag) setConfirmTag(true);
    else doSave();
  }
  async function recalc() {
    try { const r = await api.post('/tags/recalc'); load(q); toast(`Etiquetas recalculadas (${r.updated} actualizadas)`, 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  const fields = { name: '', phone: '', email: '', birth: '', tag: tags.find(t => t.isDefault)?.name || 'Nueva', note: '', source: '' };
  const tagOptions = tags.length ? tags.map(t => t.name) : ['Nueva', 'Frecuente', 'VIP'];

  return (
    <>
      <div className="top">
        <div><h1>Clientes</h1><div className="sub">{total.toLocaleString()} clientes · mostrando {clients.length}</div></div>
        <div className="row">
          {admin && <button className="btn ghost" onClick={() => setManageTags(true)}>Etiquetas</button>}
          {admin && <button className="btn ghost" onClick={() => setShowImport(true)}>Importar</button>}
          {admin && <button className="btn ghost" onClick={recalc}>Recalcular</button>}
          <input placeholder="Buscar por nombre..." value={q} style={{ width: 200, margin: 0 }} onChange={e => { setQ(e.target.value); load(e.target.value); }} />
          <button className="btn" onClick={() => { setForm({ ...fields }); setOrigTag(null); }}>Nuevo cliente</button>
        </div>
      </div>

      {err && <div className="card" style={{ color: '#C16B6B', marginBottom: 14 }}>{err}</div>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Cliente</th><th>Teléfono</th><th className="col-sm-hide">Etiqueta</th><th className="col-sm-hide">Paquetes activos</th><th className="col-sm-hide">Puntos</th><th className="col-sm-hide">Saldo a favor</th><th></th></tr></thead>
          <tbody>
            {clients.map((c, i) => (
              <tr key={c.id} className={i < 12 ? 'row-in' : ''} style={i < 12 ? { animationDelay: i * 25 + 'ms' } : undefined}>
                <td><div className="client-cell"><span className="client-avatar" style={{ background: colorFor(c.name) }}>{initials(c.name)}</span><span>{c.name}</span></div></td>
                <td>{c.phone || '—'}</td>
                <td className="col-sm-hide"><span className={tagClass(c.tag)}>{c.tag}</span>{c.tagManual && <span className="muted" title="Etiqueta fijada manualmente" style={{ marginLeft: 5, verticalAlign: 'middle' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline' }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>}</td>
                <td className="col-sm-hide">{pkgCount[c.id] || '—'}</td>
                <td className="col-sm-hide">{c.points}</td>
                <td className="col-sm-hide">{c.credit ? money(c.credit) : '—'}</td>
                <td className="right">
                  <div className="row-actions">
                    {can(user, 'expediente') && <button className="btn ghost sm" onClick={() => nav('/expediente?cliente=' + c.id)}>Expediente</button>}
                    <button className="btn ghost sm" onClick={() => { setForm({ id: c.id, name: c.name, phone: c.phone || '', email: c.email || '', birth: c.birth ? c.birth.slice(0, 10) : '', tag: c.tag, note: c.note || '', source: c.source || '', tagManual: c.tagManual }); setOrigTag(c.tag); }}>Editar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!clients.length && <tr><td colSpan="7" style={{ textAlign: 'center', padding: '38px 24px' }}>
              <div className="serif" style={{ fontSize: '1.15rem', color: 'var(--ink)' }}>{q ? 'Sin coincidencias' : 'Aún no hay clientes'}</div>
              <div className="muted" style={{ fontSize: '.85rem', margin: '4px 0 12px' }}>{q ? `Nada coincide con “${q}”.` : 'Registra tu primer cliente para empezar.'}</div>
              {!q && <button className="btn sm" onClick={() => { setForm({ ...fields }); setOrigTag(null); }}>Nuevo cliente</button>}
            </td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={() => setForm(null)} width={560}>
          <div className="field"><label>Nombre completo *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row2">
            <div className="field"><label>Teléfono</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Fecha de nacimiento</label><DateField value={form.birth} onChange={v => setForm({ ...form, birth: v })} placeholder="Día / mes / año" /></div>
            <div className="field"><label>Etiqueta {!admin && '(solo admin)'}</label>
              <Select value={form.tag} disabled={!admin} onChange={v => setForm({ ...form, tag: v })} options={tagOptions.map(t => ({ value: t, label: t }))} />
              {form.id && admin && form.tagManual && <small className="muted">Fijada manualmente</small>}
            </div>
          </div>
          <div className="field"><label>¿Cómo nos conoció? (origen)</label>
            <Select value={form.source || ''} onChange={v => setForm({ ...form, source: v })} placeholder="Sin registrar"
              options={[{ value: '', label: 'Sin registrar' }, 'Instagram', 'Facebook', 'TikTok', 'Recomendación', 'Google', 'Pasó por el local', 'Otro']} />
          </div>
          {form.id && admin && form.tagManual && <p className="muted" style={{ fontSize: '.8rem', marginTop: -4 }}><span className="link" onClick={() => setForm({ ...form, tagManual: false })}>Volver a etiqueta automática</span></p>}
          <div className="field"><label>Nota (opcional)</label><textarea rows="2" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Cualquier observación general del cliente" />
            {can(user, 'expediente') && <span className="muted" style={{ fontSize: '.78rem' }}>Información clínica (alergias, tipo de piel, padecimientos) se captura en el módulo Expediente.</span>}
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}

      {confirmTag && (
        <Modal title="Cambiar etiqueta" onClose={() => setConfirmTag(false)}>
          <div className="alert" style={{ marginBottom: 14 }}>¿Seguro de cambiar la etiqueta del cliente a <b>{form.tag}</b>?</div>
          <p className="mb">Al fijarla manualmente, el sistema <b>dejará de recalcularla automáticamente</b> (podrás volver a automática después).</p>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setConfirmTag(false)}>Cancelar</button><button className="btn" onClick={doSave}>Sí, cambiar</button></div>
        </Modal>
      )}

      {manageTags && <TagsModal tags={tags} reload={loadTags} onClose={() => setManageTags(false)} />}
      {showImport && <ImportModal title="Importar clientes" endpoint="clients"
        columns={['nombre', 'telefono', 'email', 'etiqueta', 'origen']}
        sample={['Ana López', '5512345678', 'ana@correo.com', 'Nueva', 'Instagram']}
        onDone={() => { load(); api.get('/clients/count').then(d => setTotal(d.total)).catch(() => {}); }}
        onClose={() => setShowImport(false)} />}
    </>
  );
}

const COLOR_OPTS = [['plum', 'Malva'], ['gold', 'Oro'], ['sage', 'Salvia'], ['blush', 'Blush'], ['muted', 'Gris']];
const emptyTag = { name: '', color: 'plum', priority: 0, minVisits: '', minSpend: '', periodDays: 30, isDefault: false, active: true };

function TagsModal({ tags, reload, onClose }) {
  const [form, setForm] = useState(null);
  const [delTag, setDelTag] = useState(null);

  async function save() {
    try {
      if (!form.name) return toast('Falta el nombre', 'bad');
      if (form.id) await api.put('/tags/' + form.id, form); else await api.post('/tags', form);
      setForm(null); reload(); toast('Etiqueta guardada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function confirmRemove() {
    try { await api.del('/tags/' + delTag.id); setDelTag(null); reload(); toast('Etiqueta eliminada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function seed() {
    const sug = [
      { name: 'VIP', color: 'gold', priority: 30, minVisits: 4, minSpend: 5000, periodDays: 30 },
      { name: 'Frecuente', color: 'sage', priority: 20, minVisits: 2, minSpend: 2000, periodDays: 30 },
      { name: 'Nueva', color: 'muted', priority: 0, isDefault: true },
    ];
    try { for (const t of sug) await api.post('/tags', t); reload(); toast('Etiquetas sugeridas creadas', 'ok'); } catch (e) { toast(e.message, 'bad'); }
  }

  return (
   <>
    <Modal title="Etiquetas de cliente" onClose={onClose}>
      <p className="muted mb" style={{ fontSize: '.84rem' }}>Una etiqueta se asigna automáticamente si el cliente alcanza el mínimo de <b>visitas</b> o de <b>gasto</b> en su periodo. Gana la de mayor prioridad.</p>
      {!form && (
        <>
          {!tags.length && <button className="btn ghost mb" onClick={seed}>Crear etiquetas sugeridas (VIP, Frecuente, Nueva)</button>}
          <table style={{ width: '100%' }}>
            <thead><tr><th>Etiqueta</th><th>Regla</th><th>Periodo</th><th></th></tr></thead>
            <tbody>
              {tags.map(t => (
                <tr key={t.id}>
                  <td><span className={'badge ' + (TAG_BG[t.color] || '')}>{t.name}</span>{t.isDefault && <small className="muted"> (base)</small>}</td>
                  <td><small>{t.minVisits != null ? `≥ ${t.minVisits} visitas` : ''}{t.minVisits != null && t.minSpend != null ? ' o ' : ''}{t.minSpend != null ? `≥ ${money(t.minSpend)}` : ''}{t.minVisits == null && t.minSpend == null ? '—' : ''}</small></td>
                  <td><small>{t.periodDays} días</small></td>
                  <td className="right"><div className="row-actions"><button className="btn ghost sm" onClick={() => setForm(t)}>Editar</button><button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => setDelTag(t)}>Eliminar</button></div></td>
                </tr>
              ))}
              {!tags.length && <tr><td colSpan="4" className="empty">Sin etiquetas</td></tr>}
            </tbody>
          </table>
          <div className="modal-actions"><button className="btn" onClick={() => setForm({ ...emptyTag })}>Nueva etiqueta</button></div>
        </>
      )}
      {form && (
        <>
          <div className="row2">
            <div className="field"><label>Nombre *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Color</label><Select value={form.color} onChange={v => setForm({ ...form, color: v })} options={COLOR_OPTS.map(([v, l]) => ({ value: v, label: l }))} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Mín. visitas (en periodo)</label><input type="number" value={form.minVisits} placeholder="vacío = no aplica" onChange={e => setForm({ ...form, minVisits: e.target.value })} /></div>
            <div className="field"><label>Mín. gasto $ (en periodo)</label><input type="number" value={form.minSpend} placeholder="vacío = no aplica" onChange={e => setForm({ ...form, minSpend: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Periodo (días)</label><input type="number" value={form.periodDays} onChange={e => setForm({ ...form, periodDays: e.target.value })} /></div>
            <div className="field"><label>Prioridad</label><input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} /></div>
          </div>
          <label className="row" style={{ gap: 7, cursor: 'pointer', marginBottom: 4 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} /> Etiqueta base (si no califica a ninguna)</label>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Volver</button><button className="btn" onClick={save}>Guardar</button></div>
        </>
      )}
    </Modal>
    {delTag && (
      <Modal title="Eliminar etiqueta" onClose={() => setDelTag(null)}>
        <p>¿Eliminar la etiqueta <span className={'badge ' + (TAG_BG[delTag.color] || '')}>{delTag.name}</span>?</p>
        <p className="muted" style={{ fontSize: '.82rem' }}>Los clientes con esta etiqueta se reasignarán automáticamente en el próximo recálculo.</p>
        <div className="modal-actions"><button className="btn ghost" onClick={() => setDelTag(null)}>Cancelar</button><button className="btn danger" onClick={confirmRemove}>Sí, eliminar</button></div>
      </Modal>
    )}
   </>
  );
}
