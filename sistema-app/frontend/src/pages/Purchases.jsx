import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money, matches, initials } from '../ui.jsx';
import { setting } from '../permissions.js';
import Select from '../components/Select.jsx';
import Tabs from '../components/Tabs.jsx';

const Ic = ({ d, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);
const monogram = name => (name || '·').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function Purchases() {
  const [tab, setTab] = useState('compras');
  return (
    <>
      <div className="top"><div><h1>Compras</h1><div className="sub">Proveedores, compras y costo de inventario</div></div></div>
      <Tabs tabs={[['compras', 'Compras'], ['prov', 'Proveedores']]} value={tab} onChange={setTab} />
      {tab === 'compras' ? <ComprasTab /> : <ProveedoresTab />}
    </>
  );
}

function ComprasTab() {
  const { user } = useAuth();
  const admin = user.role === 'admin' || user.role === 'superadmin';
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState('');
  const [seeding, setSeeding] = useState(false);

  const load = () => api.get('/purchases').then(setList);
  const reloadStock = () => { api.get('/inventory/supplies').then(setSupplies); api.get('/inventory/products').then(setProducts); };
  useEffect(() => {
    load();
    api.get('/purchases/suppliers').then(setSuppliers);
    reloadStock();
  }, []);

  const newForm = () => setForm({ supplierId: '', invoiceNo: '', notes: '', items: [] });
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { kind: setting('usarRecetas') ? 'supply' : 'product', refId: '', qty: '', unitCost: '' }] }));
  const setItem = (idx, patch) => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  const total = form ? form.items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.unitCost) || 0), 0) : 0;

  async function save() {
    try {
      const items = form.items.filter(i => i.refId && +i.qty > 0).map(i => ({
        kind: i.kind, supplyId: i.kind === 'supply' ? i.refId : undefined, productId: i.kind === 'product' ? i.refId : undefined,
        qty: +i.qty, unitCost: +i.unitCost,
      }));
      if (!items.length) return toast('Agrega al menos un artículo', 'bad');
      await api.post('/purchases', { supplierId: form.supplierId || null, invoiceNo: form.invoiceNo, notes: form.notes, items });
      setForm(null); load(); reloadStock();
      toast('Compra registrada · stock y costo actualizados', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function seedDemo() {
    if (!confirm('¿Cargar compras de prueba? Se crearán proveedores y varias compras de ejemplo (suma stock y costo a tus productos).')) return;
    setSeeding(true);
    try {
      const r = await api.post('/purchases/seed-demo');
      load(); api.get('/purchases/suppliers').then(setSuppliers); reloadStock();
      toast(`Listo · ${r.purchases} compras y ${r.suppliers} proveedores de prueba`, 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    finally { setSeeding(false); }
  }

  // KPIs del mes en curso
  const now = new Date();
  const mes = list.filter(p => { const d = new Date(p.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const totalMes = mes.reduce((a, p) => a + p.total, 0);
  const provActivos = new Set(list.map(p => p.supplierId).filter(Boolean)).size;
  const ticketProm = list.length ? list.reduce((a, p) => a + p.total, 0) / list.length : 0;

  const shown = list.filter(p => !q.trim() || matches(p.supplier?.name || '', q) || matches(p.invoiceNo || '', q) || p.items.some(i => matches(i.name, q)));

  return (
    <>
      <div className="inv-kpis">
        <div className="inv-kpi">
          <span className="inv-kpi-ic gold"><Ic s={18} d={<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>} /></span>
          <div><b>{money(totalMes)}</b><span>Comprado este mes</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic plum"><Ic s={18} d={<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M8 4v16" /></>} /></span>
          <div><b>{list.length}</b><span>Compras registradas</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic plum"><Ic s={18} d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>} /></span>
          <div><b>{provActivos}</b><span>Proveedores con compras</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic gold"><Ic s={18} d={<><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-5" /></>} /></span>
          <div><b>{money(ticketProm)}</b><span>Ticket promedio</span></div>
        </div>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search">
          <Ic s={16} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />
          <input placeholder="Buscar por proveedor, folio o artículo…" value={q} onChange={e => setQ(e.target.value)} />
          {q && <button className="inv-search-x" onClick={() => setQ('')} title="Limpiar"><Ic s={14} d={<><path d="M18 6 6 18M6 6l12 12" /></>} /></button>}
        </div>
        <span className="inv-count">{shown.length} de {list.length}</span>
        {admin && (
          <button className="btn ghost" disabled={seeding} onClick={seedDemo}>
            <Ic s={15} d={<><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /></>} /> {seeding ? 'Cargando…' : 'Datos de prueba'}
          </button>
        )}
        <button className="btn" onClick={newForm}><Ic s={15} d={<><path d="M12 5v14M5 12h14" /></>} /> Nueva compra</button>
      </div>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table className="inv-tbl">
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Folio</th><th>Artículos</th><th className="right">Total</th><th></th></tr></thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={p.id} className="inv-row" style={{ cursor: 'pointer', '--i': i }} onClick={() => setDetail(p)}>
                <td className="td-date">
                  <div className="pur-date">
                    <b>{new Date(p.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</b>
                    <span>{new Date(p.date).getFullYear()}</span>
                  </div>
                </td>
                <td>
                  <div className="pur-sup">
                    <span className="pur-sup-mono">{p.supplier ? monogram(p.supplier.name) : '—'}</span>
                    <span>{p.supplier?.name || <span className="muted">Sin proveedor</span>}</span>
                  </div>
                </td>
                <td>{p.invoiceNo ? <span className="pur-folio">{p.invoiceNo}</span> : <span className="muted">—</span>}</td>
                <td className="muted"><span className="pur-items">{p.items.length}</span> <span className="pur-items-txt">{p.items.map(i => i.name).join(', ')}</span></td>
                <td className="right"><b className="inv-price">{money(p.total)}</b></td>
                <td className="right"><span className="icon-btn" title="Ver detalle"><Ic s={15} d={<path d="M9 18l6-6-6-6" />} /></span></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan="6" className="empty">{q ? 'Sin coincidencias' : 'Sin compras registradas'}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Detalle de una compra */}
      {detail && (
        <Modal title={'Compra · ' + new Date(detail.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} onClose={() => setDetail(null)} width={540}>
          <div className="pur-detail-head">
            <div className="pur-sup">
              <span className="pur-sup-mono lg">{detail.supplier ? monogram(detail.supplier.name) : '—'}</span>
              <div>
                <b>{detail.supplier?.name || 'Sin proveedor'}</b>
                <span className="muted">{detail.invoiceNo ? 'Folio ' + detail.invoiceNo : 'Sin folio'}</span>
              </div>
            </div>
            <div className="pur-detail-total">
              <span>Total</span>
              <b>{money(detail.total)}</b>
            </div>
          </div>
          <div className="card" style={{ padding: 0, marginTop: 4 }}>
            <table className="inv-tbl">
              <thead><tr><th>Artículo</th><th className="right">Cant.</th><th className="right">Costo u.</th><th className="right">Importe</th></tr></thead>
              <tbody>
                {detail.items.map((i, k) => (
                  <tr key={k}><td>{i.name}</td><td className="right">{i.qty}</td><td className="right muted">{money(i.unitCost)}</td><td className="right"><b>{money(i.qty * i.unitCost)}</b></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.notes && <p className="muted" style={{ fontSize: '.84rem', marginTop: 12 }}>Nota: {detail.notes}</p>}
          <div className="modal-actions"><button className="btn" onClick={() => setDetail(null)}>Cerrar</button></div>
        </Modal>
      )}

      {form && (
        <Modal title="Nueva compra" onClose={() => setForm(null)} width={620}>
          <div className="row2">
            <div className="field"><label className="field-lbl">Proveedor</label><Select value={form.supplierId} onChange={v => setForm({ ...form, supplierId: v })} placeholder="Sin proveedor" options={[{ value: '', label: 'Sin proveedor' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} /></div>
            <div className="field"><label className="field-lbl">Folio / factura</label><input value={form.invoiceNo} onChange={e => setForm({ ...form, invoiceNo: e.target.value })} placeholder="Ej. F-1024" /></div>
          </div>
          <label className="field-lbl">Artículos</label>
          {form.items.length === 0 && <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 10px' }}>Agrega los productos o insumos que entraron con esta compra.</p>}
          {form.items.map((it, idx) => {
            const opts = it.kind === 'supply' ? supplies : products;
            const sub = (Number(it.qty) || 0) * (Number(it.unitCost) || 0);
            return (
              <div key={idx} className="pur-item-row">
                <Select style={{ width: 108 }} value={it.kind} onChange={v => setItem(idx, { kind: v, refId: '' })} options={[...(setting('usarRecetas') ? [{ value: 'supply', label: 'Insumo' }] : []), { value: 'product', label: 'Producto' }]} />
                <Select style={{ flex: 1, minWidth: 130 }} value={it.refId} onChange={v => setItem(idx, { refId: v })} placeholder="Elegir…" options={opts.map(o => ({ value: o.id, label: o.name }))} />
                <input style={{ width: 66 }} type="number" placeholder="Cant." value={it.qty} onChange={e => setItem(idx, { qty: e.target.value })} />
                <input style={{ width: 92 }} type="number" placeholder="Costo u." value={it.unitCost} onChange={e => setItem(idx, { unitCost: e.target.value })} />
                <span className="pur-item-sub">{sub > 0 ? money(sub) : '—'}</span>
                <button className="icon-btn danger" type="button" title="Quitar" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}><Ic s={15} d={<><path d="M18 6 6 18M6 6l12 12" /></>} /></button>
              </div>
            );
          })}
          <button className="btn ghost sm" onClick={addItem} style={{ marginTop: 4 }}><Ic s={14} d={<><path d="M12 5v14M5 12h14" /></>} /> Agregar artículo</button>
          <div className="tot grand" style={{ marginTop: 14 }}><span>Total compra</span><span>{money(total)}</span></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Registrar compra</button></div>
        </Modal>
      )}
    </>
  );
}

function ProveedoresTab() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const load = () => api.get('/purchases/suppliers').then(setList);
  useEffect(() => { load(); }, []);

  async function save() {
    try { if (!form.name) return toast('Falta el nombre', 'bad'); if (form.id) await api.put('/purchases/suppliers/' + form.id, form); else await api.post('/purchases/suppliers', form); setForm(null); load(); toast('Proveedor guardado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function remove(s) { if (!confirm('¿Eliminar proveedor ' + s.name + '?')) return; await api.del('/purchases/suppliers/' + s.id); load(); }

  return (
    <>
      <div className="row mb" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: '.85rem' }}>{list.length} proveedor{list.length !== 1 ? 'es' : ''}</span>
        <button className="btn" onClick={() => setForm({ name: '', phone: '', email: '', notes: '' })}><Ic s={15} d={<><path d="M12 5v14M5 12h14" /></>} /> Nuevo proveedor</button>
      </div>

      {list.length === 0 ? (
        <div className="empty-cal">
          <Ic s={28} d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>} />
          <p>Sin proveedores</p>
          <span className="muted">Registra a quién le compras insumos y productos.</span>
        </div>
      ) : (
        <div className="prov-grid">
          {list.map((s, i) => (
            <div key={s.id} className="prov-card" style={{ '--i': i }}>
              <div className="prov-card-top">
                <span className="prov-mono">{monogram(s.name)}</span>
                <div className="prov-actions">
                  <button className="icon-btn" title="Editar" onClick={() => setForm(s)}><Ic s={15} d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} /></button>
                  <button className="icon-btn danger" title="Eliminar" onClick={() => remove(s)}><Ic s={15} d={<><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>} /></button>
                </div>
              </div>
              <div className="prov-name">{s.name}</div>
              <div className="prov-contact">
                {s.phone && <span><Ic s={13} d={<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" />} /> {s.phone}</span>}
                {s.email && <span><Ic s={13} d={<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>} /> {s.email}</span>}
                {!s.phone && !s.email && <span className="muted">Sin datos de contacto</span>}
              </div>
              {s.notes && <div className="prov-notes">{s.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => setForm(null)}>
          <div className="field"><label className="field-lbl">Nombre *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Distribuidora Bella" /></div>
          <div className="row2">
            <div className="field"><label className="field-lbl">Teléfono</label><input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label className="field-lbl">Email</label><input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="field"><label className="field-lbl">Notas</label><textarea rows="2" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Condiciones, días de entrega, etc." /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}
