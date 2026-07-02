import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money, matches } from '../ui.jsx';
import { businessName, setting } from '../permissions.js';
import Select from '../components/Select.jsx';
import Tabs from '../components/Tabs.jsx';
import DateField from '../components/DateField.jsx';

const STATUS = {
  borrador:   { label: 'Borrador',   cls: '' },
  enviada:    { label: 'Enviada',    cls: 'bg-gold' },
  aceptada:   { label: 'Aceptada',   cls: 'bg-ok' },
  rechazada:  { label: 'Rechazada',  cls: 'bg-bad' },
  vencida:    { label: 'Vencida',    cls: 'bg-warn' },
  convertida: { label: 'Convertida', cls: 'bg-ok' },
};

export default function Ventas() {
  const { user } = useAuth();
  const admin = user.role === 'admin' || user.role === 'superadmin';
  const [tab, setTab] = useState('cotizaciones');
  const tabs = [
    ['cotizaciones', 'Cotizaciones'],
    ['cartera', 'Cartera de clientes'],
    ...(admin ? [['listas', 'Listas de precios']] : []),
  ];
  return (
    <>
      <div className="top"><div><h1>Ventas</h1><div className="sub">Cotizaciones, cartera y listas de precios</div></div></div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'cotizaciones' && <Quotes admin={admin} />}
      {tab === 'cartera' && <Portfolio admin={admin} />}
      {tab === 'listas' && admin && <PriceLists />}
    </>
  );
}

/* ============ COTIZACIONES ============ */
function Quotes({ admin }) {
  const [quotes, setQuotes] = useState([]);
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState(null);     // cotización en edición (o nueva)
  const [view, setView] = useState(null);     // cotización a ver/imprimir
  const [convert, setConvert] = useState(null);

  const load = () => api.get('/ventas/quotes' + (filter ? '?status=' + filter : '')).then(setQuotes).catch(e => toast(e.message, 'bad'));
  useEffect(() => { load(); }, [filter]); // eslint-disable-line

  const totalAbierto = quotes.filter(q => ['borrador', 'enviada'].includes(q.status)).reduce((a, q) => a + q.total, 0);
  const ganadas = quotes.filter(q => q.status === 'aceptada' || q.status === 'convertida').length;

  return (
    <>
      <div className="stat-row mb">
        <div className="stat"><div className="lbl">Cotizaciones</div><div className="val">{quotes.length}</div></div>
        <div className="stat"><div className="lbl">Valor en curso</div><div className="val">{money(totalAbierto)}</div><div className="chg">borradores + enviadas</div></div>
        <div className="stat"><div className="lbl">Aceptadas</div><div className="val">{ganadas}</div></div>
        <div className="stat"><div className="lbl">Conversión</div><div className="val">{quotes.length ? Math.round(ganadas / quotes.length * 100) : 0}%</div></div>
      </div>

      <div className="row mb" style={{ justifyContent: 'space-between' }}>
        <div style={{ width: 200 }}>
          <Select value={filter} onChange={setFilter} placeholder="Todos los estados"
            options={[{ value: '', label: 'Todos los estados' }, ...Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
        </div>
        <button className="btn" onClick={() => setEdit({ items: [], discount: '', taxRate: '', shipping: '', shippingFree: false, clientId: '', clientName: '', notes: '', validUntil: '' })}>Nueva cotización</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Folio</th><th>Cliente</th><th className="col-sm-hide">Fecha</th><th>Estado</th><th className="right">Total</th><th></th></tr></thead>
          <tbody>
            {quotes.map(q => (
              <tr key={q.id}>
                <td>#{q.folio}</td>
                <td>{q.client?.name || q.clientName || 'Sin cliente'}</td>
                <td className="col-sm-hide muted">{new Date(q.createdAt).toLocaleDateString('es-MX')}</td>
                <td><span className={'badge ' + (STATUS[q.status]?.cls || '')}>{STATUS[q.status]?.label || q.status}</span></td>
                <td className="right">{money(q.total)}</td>
                <td className="right">
                  <div className="row-actions">
                    <button className="btn ghost sm" onClick={() => setView(q)}>Ver</button>
                    {q.status !== 'convertida' && <button className="btn ghost sm" onClick={() => openEdit(q, setEdit)}>Editar</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!quotes.length && <tr><td colSpan="6" className="empty">Sin cotizaciones aún</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && <QuoteEditor admin={admin} draft={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {view && <QuoteView quote={view} onClose={() => setView(null)} onChanged={load} onConvert={q => { setView(null); setConvert(q); }} />}
      {convert && <ConvertModal quote={convert} onClose={() => setConvert(null)} onDone={() => { setConvert(null); load(); }} />}
    </>
  );
}

async function openEdit(q, setEdit) {
  try {
    const full = await api.get('/ventas/quotes/' + q.id);
    setEdit({
      id: full.id, clientId: full.clientId || '', clientName: full.clientName || '',
      discount: full.discount, taxRate: full.taxRate, notes: full.notes || '',
      validUntil: full.validUntil ? full.validUntil.slice(0, 10) : '',
      items: full.items.map(i => ({ type: i.type, refId: i.refId || '', name: i.name, qty: i.qty, price: i.price, discount: i.discount })),
    });
  } catch (e) { toast(e.message, 'bad'); }
}

/* ============ EDITOR DE COTIZACIÓN ============ */
function QuoteEditor({ draft, onClose, onSaved }) {
  const [form, setForm] = useState(draft);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [picker, setPicker] = useState('producto');
  const [pickId, setPickId] = useState('');

  useEffect(() => {
    api.get('/inventory/products').then(setProducts).catch(() => {});
    api.get('/catalog/services').then(setServices).catch(() => {});
    api.get('/ventas/clients').then(setClients).catch(() => {});
  }, []);

  const lineSub = it => ((Number(it.price) || 0) * (Number(it.qty) || 0)) * (1 - (Number(it.discount) || 0) / 100);
  const subtotal = form.items.reduce((a, it) => a + lineSub(it), 0);
  const base = Math.max(0, subtotal - (Number(form.discount) || 0));
  const tax = base * ((+form.taxRate || 0) / 100);

  // Envío: regla de envío gratis por umbral configurada por el negocio (0 = desactivada)
  const umbralEnvioGratis = Number(setting('envioGratisDesde', 0)) || 0;
  const alcanzaUmbral = umbralEnvioGratis > 0 && subtotal >= umbralEnvioGratis;
  const envioGratis = !!form.shippingFree || alcanzaUmbral;
  const envio = envioGratis ? 0 : Math.max(0, Number(form.shipping) || 0);
  const total = base + tax + envio;

  function addItem() {
    const cat = picker === 'producto' ? products : services;
    const found = cat.find(x => x.id === pickId);
    if (!found) return toast('Elige un ítem', 'bad');
    setForm(f => ({ ...f, items: [...f.items, { type: picker, refId: found.id, name: found.name, qty: 1, price: found.price || 0, discount: 0 }] }));
    setPickId('');
  }
  const setItem = (idx, patch) => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  const delItem = idx => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  async function save() {
    if (!form.items.length) return toast('Agrega al menos un ítem', 'bad');
    try {
      const payload = { ...form, clientId: form.clientId || null };
      if (form.id) await api.put('/ventas/quotes/' + form.id, payload);
      else await api.post('/ventas/quotes', payload);
      toast('Cotización guardada', 'ok'); onSaved();
    } catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <Modal title={form.id ? `Cotización #${form.folio || ''}` : 'Nueva cotización'} onClose={onClose} width={760}>
      <div className="row2">
        <div className="field"><label>Cliente</label>
          <Select searchable value={form.clientId} onChange={v => setForm({ ...form, clientId: v })} placeholder="Buscar cliente..."
            options={[{ value: '', label: 'Sin cliente (escribir nombre)' }, ...clients.map(c => ({ value: c.id, label: c.name }))]} />
        </div>
        {!form.clientId && <div className="field"><label>Nombre del prospecto</label><input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} placeholder="Ej. Distribuidora del Norte" /></div>}
      </div>

      {/* Agregar ítems */}
      <div className="field"><label>Agregar productos / servicios</label>
        <div className="row" style={{ gap: 8 }}>
          <Select style={{ width: 120 }} value={picker} onChange={v => { setPicker(v); setPickId(''); }} options={[{ value: 'producto', label: 'Producto' }, { value: 'servicio', label: 'Servicio' }]} />
          <div style={{ flex: 1 }}>
            <Select searchable value={pickId} onChange={setPickId} placeholder="Buscar producto/servicio..."
              options={(picker === 'producto' ? products : services).map(x => ({ value: x.id, label: `${x.name} · ${money(x.price)}` }))} />
          </div>
          <button className="btn ghost" type="button" onClick={addItem}>Agregar</button>
        </div>
      </div>

      {/* Líneas */}
      {form.items.length > 0 && (
        <div className="card scroll-x" style={{ padding: 0, marginBottom: 12 }}>
          <table>
            <thead><tr><th>Concepto</th><th style={{ width: 70 }}>Cant.</th><th style={{ width: 100 }}>Precio</th><th style={{ width: 80 }}>Desc.%</th><th className="right">Importe</th><th></th></tr></thead>
            <tbody>
              {form.items.map((it, idx) => (
                <tr key={idx}>
                  <td>{it.name}<br /><small className="muted">{it.type}</small></td>
                  <td><input type="number" min="1" value={it.qty} onChange={e => setItem(idx, { qty: e.target.value })} style={{ width: 60, padding: '6px 8px' }} /></td>
                  <td><input type="number" min="0" value={it.price} onChange={e => setItem(idx, { price: e.target.value })} style={{ width: 90, padding: '6px 8px' }} /></td>
                  <td><input type="number" min="0" max="100" value={it.discount} onChange={e => setItem(idx, { discount: Math.min(100, Math.max(0, +e.target.value || 0)) })} style={{ width: 70, padding: '6px 8px' }} /></td>
                  <td className="right">{money(lineSub(it))}</td>
                  <td><span className="mini-x" onClick={() => delItem(idx)}>×</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row2">
        <div className="field"><label>Descuento global ($)</label><input type="number" min="0" placeholder="0" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} /></div>
        <div className="field"><label>IVA (%)</label><input type="number" min="0" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: e.target.value })} placeholder="0 = sin IVA" /></div>
      </div>

      {/* Costo de envío: campo editable + opción de cortesía. La regla de umbral aplica sola. */}
      <div className="field">
        <label>Costo de envío</label>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="number" min="0" placeholder="0" style={{ width: 130 }}
            value={envioGratis ? '' : form.shipping}
            disabled={envioGratis}
            onChange={e => setForm({ ...form, shipping: e.target.value })} />
          <label className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: '.86rem', margin: 0 }}>
            <input type="checkbox" checked={!!form.shippingFree} onChange={e => setForm({ ...form, shippingFree: e.target.checked })} style={{ width: 'auto' }} />
            Envío gratis (cortesía)
          </label>
        </div>
        {alcanzaUmbral && !form.shippingFree && (
          <span className="muted" style={{ fontSize: '.78rem' }}>Envío gratis automático: el subtotal alcanzó el umbral de {money(umbralEnvioGratis)}.</span>
        )}
      </div>
      <div className="row2">
        <div className="field"><label>Vigencia (válida hasta)</label><DateField value={form.validUntil} onChange={v => setForm({ ...form, validUntil: v })} /></div>
        <div className="field"><label>Notas</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Condiciones, entrega..." /></div>
      </div>

      {/* Totales */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <div className="tot"><span className="muted">Subtotal</span><span>{money(subtotal)}</span></div>
        {(+form.discount > 0) && <div className="tot"><span className="muted">Descuento</span><span>−{money(+form.discount)}</span></div>}
        {(+form.taxRate > 0) && <div className="tot"><span className="muted">IVA ({form.taxRate}%)</span><span>{money(tax)}</span></div>}
        {(envio > 0 || envioGratis) && <div className="tot"><span className="muted">Envío</span><span>{envioGratis ? <span style={{ color: 'var(--ok)' }}>Gratis</span> : money(envio)}</span></div>}
        <div className="tot grand"><span>Total</span><span>{money(total)}</span></div>
      </div>

      <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={save}>Guardar cotización</button></div>
    </Modal>
  );
}

/* ============ VER / IMPRIMIR COTIZACIÓN ============ */
function QuoteView({ quote, onClose, onChanged, onConvert }) {
  const [q, setQ] = useState(quote);
  useEffect(() => { api.get('/ventas/quotes/' + quote.id).then(setQ).catch(() => {}); }, [quote.id]);

  async function setStatus(status) {
    try { await api.patch(`/ventas/quotes/${q.id}/status`, { status }); setQ({ ...q, status }); onChanged(); toast('Estado actualizado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  const lineSub = it => (it.price * it.qty) * (1 - (it.discount || 0) / 100);

  // Resumen de texto plano de la cotización (para WhatsApp / email)
  function buildSummary() {
    const L = [];
    L.push(`*${businessName()}* — Cotización #${q.folio}`);
    const cli = q.client?.name || q.clientName;
    if (cli) L.push(`Cliente: ${cli}`);
    L.push('');
    (q.items || []).forEach(it => {
      L.push(`• ${it.name}  x${it.qty}  —  ${money(lineSub(it))}`);
    });
    L.push('');
    L.push(`Subtotal: ${money(q.subtotal)}`);
    if (q.discount > 0) L.push(`Descuento: −${money(q.discount)}`);
    if (q.taxRate > 0) L.push(`IVA (${q.taxRate}%): ${money(q.tax)}`);
    if (q.shipping > 0 || q.shippingFree) L.push(`Envío: ${q.shippingFree ? 'Gratis' : money(q.shipping)}`);
    L.push(`*TOTAL: ${money(q.total)}*`);
    if (q.validUntil) L.push(`\nVálida hasta: ${new Date(q.validUntil).toLocaleDateString('es-MX')}`);
    if (q.notes) L.push(`\n${q.notes}`);
    return L.join('\n');
  }

  // Deja solo dígitos del teléfono (wa.me exige formato internacional sin signos)
  const cleanPhone = p => (p || '').replace(/[^\d]/g, '');

  function sendWhatsApp() {
    const phone = cleanPhone(q.client?.phone);
    const text = encodeURIComponent(buildSummary());
    // Con número del cliente abre su chat; sin número abre WhatsApp para elegir destinatario.
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
    if (q.status === 'borrador') setStatus('enviada');
  }

  function sendEmail() {
    const to = q.client?.email || '';
    const subject = encodeURIComponent(`Cotización #${q.folio} — ${businessName()}`);
    // El cuerpo va en texto plano (sin asteriscos de WhatsApp)
    const body = encodeURIComponent(buildSummary().replace(/\*/g, ''));
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    if (q.status === 'borrador') setStatus('enviada');
  }

  return (
    <Modal title={`Cotización #${q.folio}`} onClose={onClose} width={680}>
      <div id="ticket-print">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div className="serif" style={{ fontSize: '1.6rem', letterSpacing: '.1em', fontWeight: 600 }}>{businessName()}</div>
          <div className="muted" style={{ fontSize: 12 }}>Cotización #{q.folio} · {new Date(q.createdAt).toLocaleDateString('es-MX')}</div>
        </div>
        <div className="tot"><span>Cliente</span><span>{q.client?.name || q.clientName || 'Sin cliente'}</span></div>
        {q.validUntil && <div className="tot"><span>Válida hasta</span><span>{new Date(q.validUntil).toLocaleDateString('es-MX')}</span></div>}
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
        <table style={{ width: '100%', fontSize: 13 }}>
          <thead><tr><th>Concepto</th><th>Cant</th><th className="right">Importe</th></tr></thead>
          <tbody>
            {(q.items || []).map(it => (
              <tr key={it.id}><td>{it.name}{it.discount > 0 ? ` (−${it.discount}%)` : ''}</td><td>{it.qty}</td><td className="right">{money(lineSub(it))}</td></tr>
            ))}
          </tbody>
        </table>
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
        <div className="tot"><span>Subtotal</span><span>{money(q.subtotal)}</span></div>
        {q.discount > 0 && <div className="tot"><span>Descuento</span><span>−{money(q.discount)}</span></div>}
        {q.taxRate > 0 && <div className="tot"><span>IVA ({q.taxRate}%)</span><span>{money(q.tax)}</span></div>}
        {(q.shipping > 0 || q.shippingFree) && <div className="tot"><span>Envío</span><span>{q.shippingFree ? 'Gratis' : money(q.shipping)}</span></div>}
        <div className="tot grand"><span>TOTAL</span><span>{money(q.total)}</span></div>
        {q.notes && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{q.notes}</p>}
      </div>

      <div className="row no-print" style={{ gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <span className="badge" style={{ alignSelf: 'center' }}>{STATUS[q.status]?.label}</span>
        {q.status !== 'convertida' && <>
          {q.status !== 'enviada' && <button className="btn ghost sm" onClick={() => setStatus('enviada')}>Marcar enviada</button>}
          {q.status !== 'aceptada' && <button className="btn ghost sm" onClick={() => setStatus('aceptada')}>Aceptada</button>}
          {q.status !== 'rechazada' && <button className="btn ghost sm" onClick={() => setStatus('rechazada')}>Rechazada</button>}
        </>}
      </div>
      {/* Enviar la cotización al cliente */}
      <div className="row no-print" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn ghost sm" onClick={sendWhatsApp} title={q.client?.phone ? `Enviar al WhatsApp de ${q.client.name}` : 'Abrir WhatsApp y elegir destinatario'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 5, verticalAlign: '-2px' }}><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.82 9.82 0 001.515 5.248l-.999 3.648 3.74-.943zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
          WhatsApp
        </button>
        <button className="btn ghost sm" onClick={sendEmail} title={q.client?.email ? `Enviar a ${q.client.email}` : 'Abrir correo'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: '-3px' }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
          Email
        </button>
        <span className="muted" style={{ alignSelf: 'center', fontSize: '.76rem' }}>
          {q.client?.phone || q.client?.email ? 'Se abrirá con los datos del cliente.' : 'Tip: registra teléfono/email del cliente para autocompletar.'}
        </span>
      </div>

      <div className="modal-actions no-print">
        <button className="btn ghost" onClick={() => window.print()}>Imprimir / PDF</button>
        {q.status !== 'convertida' && <button className="btn" onClick={() => onConvert(q)}>Convertir en venta</button>}
        {q.status === 'convertida' && <span className="muted" style={{ alignSelf: 'center' }}>Ya convertida en venta</span>}
      </div>
    </Modal>
  );
}

/* ============ CONVERTIR EN VENTA ============ */
function ConvertModal({ quote, onClose, onDone }) {
  const [method, setMethod] = useState('efectivo');
  async function go() {
    try { const r = await api.post(`/ventas/quotes/${quote.id}/convert`, { paymentMethod: method }); toast(`Convertida · venta #${r.ticketNo}`, 'ok'); onDone(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  return (
    <Modal title="Convertir en venta" onClose={onClose}>
      <p className="mb">La cotización <b>#{quote.folio}</b> ({money(quote.total)}) se convertirá en una venta real: se descuenta el inventario y entra al corte de caja.</p>
      <div className="field"><label>Método de pago</label>
        <Select value={method} onChange={setMethod} options={[{ value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' }, { value: 'transferencia', label: 'Transferencia' }]} />
      </div>
      <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={go}>Confirmar venta</button></div>
    </Modal>
  );
}

/* ============ CARTERA DE CLIENTES ============ */
function Portfolio({ admin }) {
  const [clients, setClients] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [q, setQ] = useState('');
  const [dist, setDist] = useState(null); // modal de reparto al azar: { sellerIds:Set, onlyUnassigned:bool }
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/ventas/clients' + (q ? '?q=' + encodeURIComponent(q) : '')).then(setClients).catch(() => {});
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]); // eslint-disable-line
  useEffect(() => { if (admin) api.get('/catalog/staff').then(setSellers).catch(() => {}); }, [admin]);

  async function assign(clientId, sellerId) {
    try { await api.patch(`/ventas/clients/${clientId}/seller`, { sellerId: sellerId || null }); load(); toast('Cartera actualizada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  function openDistribute() { setDist({ sellerIds: new Set(sellers.map(s => s.id)), onlyUnassigned: true }); }
  function toggleSeller(id) {
    setDist(d => { const s = new Set(d.sellerIds); s.has(id) ? s.delete(id) : s.add(id); return { ...d, sellerIds: s }; });
  }
  async function runDistribute() {
    if (!dist.sellerIds.size) return toast('Elige al menos un vendedor', 'bad');
    setBusy(true);
    try {
      const r = await api.post('/ventas/clients/distribute', { sellerIds: [...dist.sellerIds], onlyUnassigned: dist.onlyUnassigned });
      setDist(null); load();
      toast(r.count ? `Se repartieron ${r.count} cliente(s) al azar` : 'No había clientes para repartir', r.count ? 'ok' : 'bad');
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="row mb" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span className="muted">{admin ? 'Asigna clientes a cada vendedor. Cada vendedor solo ve su cartera.' : 'Tu cartera de clientes asignada.'}</span>
        <div className="row" style={{ gap: 8 }}>
          {admin && <button className="btn ghost" onClick={openDistribute}>Repartir al azar</button>}
          <input style={{ width: 220 }} placeholder="Buscar cliente..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Cliente</th><th className="col-sm-hide">Teléfono</th><th>{admin ? 'Vendedor asignado' : 'Etiqueta'}</th></tr></thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="col-sm-hide muted">{c.phone || '—'}</td>
                <td style={{ width: admin ? 220 : 'auto' }}>
                  {admin
                    ? <Select value={c.sellerId || ''} onChange={v => assign(c.id, v)} placeholder="Sin asignar"
                        options={[{ value: '', label: 'Sin asignar' }, ...sellers.map(s => ({ value: s.id, label: s.name }))]} />
                    : <span className="badge">{c.tag}</span>}
                </td>
              </tr>
            ))}
            {!clients.length && <tr><td colSpan="3" className="empty">{admin ? 'Sin clientes' : 'Aún no tienes clientes asignados'}</td></tr>}
          </tbody>
        </table>
      </div>

      {dist && (
        <Modal title="Repartir clientes al azar" onClose={() => setDist(null)} width={520}>
          <p className="muted mb" style={{ fontSize: '.86rem' }}>
            Los clientes se reparten de forma equitativa y aleatoria entre los vendedores que elijas.
          </p>

          <div className="field">
            <label>Vendedores a incluir</label>
            <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {sellers.map(s => (
                <label key={s.id} className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer', padding: '4px 2px' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={dist.sellerIds.has(s.id)} onChange={() => toggleSeller(s.id)} />
                  <span>{s.name}</span>
                </label>
              ))}
              {!sellers.length && <span className="muted" style={{ fontSize: '.84rem' }}>No hay vendedores registrados.</span>}
            </div>
          </div>

          <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={dist.onlyUnassigned} onChange={e => setDist({ ...dist, onlyUnassigned: e.target.checked })} />
            <span>Repartir solo los clientes sin vendedor asignado</span>
          </label>
          <p className="muted" style={{ fontSize: '.76rem', marginTop: 4 }}>
            {dist.onlyUnassigned ? 'Los clientes que ya tienen vendedor no se tocan.' : 'Atención: se reasignarán TODOS los clientes, incluso los que ya tenían vendedor.'}
          </p>

          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setDist(null)}>Cancelar</button>
            <button className="btn" disabled={busy} onClick={runDistribute}>{busy ? 'Repartiendo…' : 'Repartir al azar'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ============ LISTAS DE PRECIOS (admin) ============ */
function PriceLists() {
  const [lists, setLists] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState(null); // id de la lista en edición
  const [delList, setDelList] = useState(null); // lista pendiente de eliminar (confirmación)

  const load = () => api.get('/ventas/price-lists').then(setLists).catch(() => {});
  const loadAll = () => {
    load();
    api.get('/inventory/products').then(setProducts).catch(() => {});
    api.get('/ventas/product-categories').then(setCategories).catch(() => {});
  };
  useEffect(() => { loadAll(); }, []);

  async function create() {
    if (!newName.trim()) return toast('Escribe un nombre', 'bad');
    try { await api.post('/ventas/price-lists', { name: newName }); setNewName(''); load(); toast('Lista creada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function removeList(l) {
    try { await api.del('/ventas/price-lists/' + l.id); setDelList(null); load(); toast('Lista eliminada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  const editList = lists.find(l => l.id === editId) || null;

  return (
    <>
      <div className="row mb" style={{ gap: 8 }}>
        <input style={{ flex: 1, maxWidth: 280 }} placeholder="Nueva lista (Mayoreo, Distribuidor...)" value={newName} onChange={e => setNewName(e.target.value)} />
        <button className="btn" onClick={create}>Crear lista</button>
      </div>
      <div className="grid g3 mb">
        {lists.map(l => (
          <div key={l.id} className="card">
            <h3 style={{ fontWeight: 500 }}>{l.name}{l.isDefault ? ' · base' : ''}</h3>
            <p className="muted" style={{ fontSize: '.8rem' }}>{l.items.length} producto(s) con precio especial</p>
            <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
              <button className="btn ghost sm" onClick={() => setEditId(l.id)}>Gestionar</button>
              {!l.isDefault && <button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => setDelList(l)}>Eliminar</button>}
            </div>
          </div>
        ))}
        {!lists.length && <div className="card empty" style={{ gridColumn: '1/-1' }}>Sin listas. Crea una (ej. Mayoreo) para precios especiales.</div>}
      </div>

      {editList && (
        <PriceListEditor list={editList} products={products} categories={categories}
          onClose={() => setEditId(null)} onChanged={loadAll} />
      )}

      {delList && (
        <Modal title="Eliminar lista de precios" onClose={() => setDelList(null)} width={420}>
          <p style={{ marginTop: -4, marginBottom: 16, lineHeight: 1.5 }}>
            ¿Seguro que quieres eliminar la lista <b style={{ color: 'var(--plum)' }}>{delList.name}</b>? Se perderán todos sus precios especiales. Esta acción no se puede deshacer.
          </p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setDelList(null)}>Cancelar</button>
            <button className="btn" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={() => removeList(delList)}>Eliminar lista</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// Editor avanzado de una lista de precios: agregar/quitar productos, agregar todos,
// y aplicar % de descuento (global o por categoría).
function PriceListEditor({ list, products, categories, onClose, onChanged }) {
  const [tool, setTool] = useState(null);   // 'discount' | 'add' | null (panel de acción masiva)
  const [percent, setPercent] = useState(10);
  const [cat, setCat] = useState('');       // categoría objetivo ('' = todas)
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [confirmClear, setConfirmClear] = useState(false); // confirmación de vaciar

  const inList = new Set(list.items.map(i => i.productId));
  const match = p => !q || matches(p.name, q) || matches(p.category || '', q);
  // Sin búsqueda: solo los productos de la lista. Con búsqueda: cualquier producto que coincida
  // (los de la lista primero, luego los de fuera).
  const rows = q
    ? products.filter(match).sort((a, b) => (inList.has(b.id) ? 1 : 0) - (inList.has(a.id) ? 1 : 0))
    : products.filter(p => inList.has(p.id));

  async function setPrice(productId, price) {
    try { await api.put(`/ventas/price-lists/${list.id}/item`, { productId, price: +price || 0 }); onChanged(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function addOne(p) {
    try { await api.put(`/ventas/price-lists/${list.id}/item`, { productId: p.id, price: p.price }); setQ(''); onChanged(); toast('Agregado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function removeOne(productId) {
    try { await api.del(`/ventas/price-lists/${list.id}/item/${productId}`); setQ(''); onChanged(); toast('Producto quitado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function addAll() {
    setBusy(true);
    try { const r = await api.post(`/ventas/price-lists/${list.id}/add-all`, cat ? { category: cat } : {}); onChanged(); setTool(null); toast(`${r.count} producto(s) agregados`, 'ok'); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  async function clearAll() {
    setBusy(true);
    try { await api.post(`/ventas/price-lists/${list.id}/clear`, cat ? { category: cat } : {}); setConfirmClear(false); onChanged(); toast('Productos quitados', 'ok'); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  async function applyDiscount() {
    setBusy(true);
    try {
      const r = await api.post(`/ventas/price-lists/${list.id}/apply-discount`, { percent: +percent, ...(cat ? { category: cat } : {}) });
      onChanged(); setTool(null); toast(`${percent}% aplicado a ${r.count} producto(s)`, 'ok');
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }

  return (
    <Modal title={`Lista de precios · ${list.name}`} onClose={onClose} width={760}>
      {/* Encabezado: resumen + categoría objetivo */}
      <div className="pl-head">
        <div>
          <div className="pl-count">{list.items.length}</div>
          <div className="muted" style={{ fontSize: '.74rem' }}>productos con precio especial</div>
        </div>
        <div className="pl-target">
          <label className="muted" style={{ fontSize: '.74rem', display: 'block', marginBottom: 4 }}>Acciones masivas aplican a</label>
          <Select value={cat} onChange={setCat} placeholder="Todas las categorías"
            options={[{ value: '', label: 'Todas las categorías' }, ...categories.map(c => ({ value: c, label: c }))]} />
        </div>
      </div>

      {/* Barra de acciones masivas — segmented */}
      <div className="pl-toolbar">
        <button className="pl-tool" disabled={busy} onClick={addAll} title={`Agregar ${cat || 'todos los'} productos`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Agregar {cat || 'todos'}</span>
        </button>
        <button className={'pl-tool' + (tool === 'discount' ? ' on' : '')} disabled={busy} onClick={() => setTool(tool === 'discount' ? null : 'discount')} title="Aplicar % de descuento">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
          <span>Descuento</span>
        </button>
        <button className="pl-tool pl-tool-danger" disabled={busy} onClick={() => setConfirmClear(true)} title={`Vaciar ${cat || 'la lista'}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Vaciar {cat || 'lista'}</span>
        </button>
      </div>
      {tool === 'discount' && (
        <div className="pl-discount">
          <span className="muted" style={{ fontSize: '.82rem' }}>Precio de lista = precio base menos</span>
          <input type="number" min="0" max="100" value={percent} onChange={e => setPercent(e.target.value)} />
          <span className="muted">%</span>
          <button className="btn sm" disabled={busy} onClick={applyDiscount}>{busy ? 'Aplicando…' : `Aplicar a ${cat || 'todos'}`}</button>
        </div>
      )}

      <input className="pl-search" placeholder="Buscar cualquier producto o categoría para agregar o editar..." value={q} onChange={e => setQ(e.target.value)} />

      <div className="pl-sec-title">
        {q ? 'Resultados de la búsqueda' : 'En esta lista'}
        {!q && <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, marginLeft: 6 }}>· busca arriba para agregar otros productos</span>}
      </div>
      <div className="pl-table">
        <table>
          <thead><tr><th>Producto</th><th>Categoría</th><th className="right">Base</th><th style={{ width: 110 }}>Precio lista</th><th></th></tr></thead>
          <tbody>
            {rows.map(p => {
              const cur = list.items.find(i => i.productId === p.id);
              const isIn = inList.has(p.id);
              return (
                <tr key={p.id} style={{ opacity: isIn ? 1 : 0.72 }}>
                  <td>{p.name}{!isIn && <span className="badge bg-muted" style={{ marginLeft: 6, fontSize: '.6rem' }}>fuera</span>}</td>
                  <td className="muted">{p.category || '—'}</td>
                  <td className="right muted">{money(p.price)}</td>
                  <td>
                    {isIn
                      ? <input type="number" defaultValue={cur?.price ?? ''} placeholder={p.price} onBlur={e => e.target.value !== '' && setPrice(p.id, e.target.value)} style={{ width: 92, padding: '6px 8px' }} />
                      : <span className="muted" style={{ fontSize: '.8rem' }}>—</span>}
                  </td>
                  <td className="right">
                    {isIn
                      ? <button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => removeOne(p.id)}>Quitar</button>
                      : <button className="btn ghost sm" onClick={() => addOne(p)}>＋ Agregar</button>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan="5" className="empty">{q ? 'Ningún producto coincide' : 'Aún no hay productos. Busca arriba para agregarlos, o usa "Agregar todos".'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="modal-actions"><button className="btn" onClick={onClose}>Listo</button></div>

      {confirmClear && (
        <Modal title="Vaciar lista" onClose={() => setConfirmClear(false)} width={420}>
          <p style={{ marginTop: -4, marginBottom: 16, lineHeight: 1.5 }}>
            {cat
              ? <>Se quitarán de esta lista todos los productos de la categoría <b style={{ color: 'var(--plum)' }}>{cat}</b>.</>
              : <>Se quitarán <b style={{ color: 'var(--plum)' }}>todos</b> los productos de esta lista. Los precios especiales se perderán.</>}
          </p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setConfirmClear(false)}>Cancelar</button>
            <button className="btn" disabled={busy} style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={clearAll}>{busy ? 'Quitando…' : 'Vaciar'}</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
