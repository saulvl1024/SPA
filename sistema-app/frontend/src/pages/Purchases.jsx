import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, money, matches } from '../ui.jsx';
import { setting } from '../permissions.js';
import Select from '../components/Select.jsx';
import Tabs from '../components/Tabs.jsx';

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
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);   // compra a ver en detalle
  const [q, setQ] = useState('');

  const load = () => api.get('/purchases').then(setList);
  useEffect(() => {
    load();
    api.get('/purchases/suppliers').then(setSuppliers);
    api.get('/inventory/supplies').then(setSupplies);
    api.get('/inventory/products').then(setProducts);
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
      setForm(null); load();
      api.get('/inventory/supplies').then(setSupplies); api.get('/inventory/products').then(setProducts);
      toast('Compra registrada · stock y costo actualizados', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  // KPIs del mes en curso
  const now = new Date();
  const mes = list.filter(p => { const d = new Date(p.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const totalMes = mes.reduce((a, p) => a + p.total, 0);
  const provActivos = new Set(list.map(p => p.supplierId).filter(Boolean)).size;

  const shown = list.filter(p => !q.trim() || matches(p.supplier?.name || '', q) || matches(p.invoiceNo || '', q) || p.items.some(i => matches(i.name, q)));

  return (
    <>
      <div className="stat-row mb">
        <div className="stat"><div className="lbl">Comprado este mes</div><div className="val">{money(totalMes)}</div><div className="chg">{mes.length} compra{mes.length !== 1 ? 's' : ''}</div></div>
        <div className="stat"><div className="lbl">Total de compras</div><div className="val">{list.length}</div></div>
        <div className="stat"><div className="lbl">Proveedores</div><div className="val">{provActivos}</div><div className="chg">con compras</div></div>
        <div className="stat"><div className="lbl">Última compra</div><div className="val" style={{ fontSize: '1.2rem' }}>{list[0] ? new Date(list[0].date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'}</div></div>
      </div>

      <div className="row mb" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <input style={{ flex: 1, maxWidth: 320 }} placeholder="Buscar por proveedor, folio o artículo..." value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" onClick={newForm}>＋ Nueva compra</button>
      </div>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Folio</th><th>Artículos</th><th className="right">Total</th><th></th></tr></thead>
          <tbody>
            {shown.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(p)}>
                <td className="td-date">{new Date(p.date).toLocaleDateString('es-MX')}</td>
                <td>{p.supplier?.name || <span className="muted">Sin proveedor</span>}</td>
                <td className="muted">{p.invoiceNo || '—'}</td>
                <td className="muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.items.length} art. · {p.items.map(i => i.name).join(', ')}</td>
                <td className="right"><b>{money(p.total)}</b></td>
                <td className="right"><span className="link" style={{ fontSize: '.8rem' }}>Ver →</span></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan="6" className="empty">{q ? 'Sin coincidencias' : 'Sin compras registradas'}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Detalle de una compra */}
      {detail && (
        <Modal title={'Compra · ' + new Date(detail.date).toLocaleDateString('es-MX')} onClose={() => setDetail(null)} width={520}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div><div className="muted" style={{ fontSize: '.78rem' }}>Proveedor</div><div>{detail.supplier?.name || 'Sin proveedor'}</div></div>
            <div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: '.78rem' }}>Folio</div><div>{detail.invoiceNo || '—'}</div></div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Artículo</th><th className="right">Cant.</th><th className="right">Costo u.</th><th className="right">Importe</th></tr></thead>
              <tbody>
                {detail.items.map((i, k) => (
                  <tr key={k}><td>{i.name}</td><td className="right">{i.qty}</td><td className="right muted">{money(i.unitCost)}</td><td className="right">{money(i.qty * i.unitCost)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.notes && <p className="muted mb" style={{ fontSize: '.84rem', marginTop: 10 }}>Nota: {detail.notes}</p>}
          <div className="tot grand" style={{ marginTop: 12 }}><span>Total</span><span>{money(detail.total)}</span></div>
          <div className="modal-actions"><button className="btn" onClick={() => setDetail(null)}>Cerrar</button></div>
        </Modal>
      )}

      {form && (
        <Modal title="Nueva compra" onClose={() => setForm(null)}>
          <div className="row2">
            <div className="field"><label>Proveedor</label><Select value={form.supplierId} onChange={v => setForm({ ...form, supplierId: v })} placeholder="Sin proveedor" options={[{ value: '', label: 'Sin proveedor' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} /></div>
            <div className="field"><label>Folio / factura</label><input value={form.invoiceNo} onChange={e => setForm({ ...form, invoiceNo: e.target.value })} /></div>
          </div>
          <label>Artículos</label>
          {form.items.map((it, idx) => {
            const opts = it.kind === 'supply' ? supplies : products;
            return (
              <div key={idx} className="row" style={{ gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <Select style={{ width: 110 }} value={it.kind} onChange={v => setItem(idx, { kind: v, refId: '' })} options={[...(setting('usarRecetas') ? [{ value: 'supply', label: 'Insumo' }] : []), { value: 'product', label: 'Producto' }]} />
                <Select style={{ flex: 1, minWidth: 130 }} value={it.refId} onChange={v => setItem(idx, { refId: v })} placeholder="Elegir..." options={opts.map(o => ({ value: o.id, label: o.name }))} />
                <input style={{ width: 70 }} type="number" placeholder="Cant." value={it.qty} onChange={e => setItem(idx, { qty: e.target.value })} />
                <input style={{ width: 90 }} type="number" placeholder="Costo u." value={it.unitCost} onChange={e => setItem(idx, { unitCost: e.target.value })} />
                <button className="btn ghost sm" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>×</button>
              </div>
            );
          })}
          <button className="btn ghost sm" onClick={addItem}>Agregar artículo</button>
          <div className="tot grand" style={{ marginTop: 12 }}><span>Total compra</span><span>{money(total)}</span></div>
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
      <div className="row mb" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setForm({ name: '', phone: '', email: '', notes: '' })}>Nuevo proveedor</button></div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Proveedor</th><th>Teléfono</th><th>Email</th><th></th></tr></thead>
          <tbody>
            {list.map(s => (
              <tr key={s.id}><td>{s.name}</td><td>{s.phone || '—'}</td><td>{s.email || '—'}</td>
                <td className="right"><div className="row-actions"><button className="btn ghost sm" onClick={() => setForm(s)}>Editar</button><button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => remove(s)}>Eliminar</button></div></td></tr>
            ))}
            {!list.length && <tr><td colSpan="4" className="empty">Sin proveedores</td></tr>}
          </tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.id ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => setForm(null)}>
          <div className="field"><label>Nombre *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row2">
            <div className="field"><label>Teléfono</label><input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notas</label><textarea rows="2" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}
