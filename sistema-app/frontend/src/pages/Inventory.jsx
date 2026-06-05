import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money, downloadExcel } from '../ui.jsx';

const label = x => x.stock <= x.minStock / 2 ? ['Crítico', 'bg-bad'] : x.stock <= x.minStock ? ['Bajo', 'bg-warn'] : ['Óptimo', 'bg-ok'];

export default function Inventory() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [supplies, setSupplies] = useState([]);
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState(null);
  const [editMin, setEditMin] = useState(null);
  const [newSupply, setNewSupply] = useState(null);
  const [newProduct, setNewProduct] = useState(null);

  const load = () => { api.get('/inventory/supplies').then(setSupplies); api.get('/inventory/products').then(setProducts); };
  useEffect(() => { load(); }, []);

  async function addStock() {
    try { await api.post(`/inventory/supplies/${stock.id}/stock`, { qty: +stock.qty }); setStock(null); load(); toast('Stock actualizado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function saveMin() {
    try { await api.patch(`/inventory/${editMin.kind}/${editMin.id}/min`, { minStock: +editMin.minStock }); setEditMin(null); load(); toast('Mínimo actualizado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function saveSupply() {
    try { if (!newSupply.name) return toast('Falta el nombre', 'bad'); await api.post('/inventory/supplies', newSupply); setNewSupply(null); load(); toast('Insumo agregado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function saveProduct() {
    try { if (!newProduct.name) return toast('Falta el nombre', 'bad'); await api.post('/inventory/products', newProduct); setNewProduct(null); load(); toast('Producto agregado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  const Rows = ({ list, kind }) => list.map(x => {
    const [lbl, cls] = label(x);
    return (
      <tr key={x.id}>
        <td>{x.name}</td>{kind === 'supplies' ? <td>{x.category || '—'}</td> : <td>{money(x.price)}</td>}
        <td>{x.stock}{x.unit ? ' ' + x.unit : ''}</td><td>{x.minStock}</td>
        <td><span className={'badge ' + cls}>{lbl}</span></td>
        <td>
          {kind === 'supplies' && <span className="link" onClick={() => setStock({ id: x.id, name: x.name, qty: 10 })}>+ Entrada</span>}
          {admin && <> {kind === 'supplies' ? ' · ' : ''}<span className="link" onClick={() => setEditMin({ id: x.id, kind, name: x.name, minStock: x.minStock })}>Editar mín.</span></>}
        </td>
      </tr>
    );
  });

  function exportXlsx() {
    const sup = [['Insumo', 'Categoría', 'Unidad', 'Stock', 'Mínimo', 'Estado'], ...supplies.map(x => [x.name, x.category, x.unit, x.stock, x.minStock, label(x)[0]])];
    const prod = [['Producto', 'Precio', 'Stock', 'Mínimo', 'Estado'], ...products.map(x => [x.name, x.price, x.stock, x.minStock, label(x)[0]])];
    downloadExcel('inventario_' + new Date().toISOString().slice(0, 10), [{ name: 'Insumos', rows: sup }, { name: 'Productos', rows: prod }]);
  }

  return (
    <>
      <div className="top"><h1>Inventario</h1>
        <div className="row">
          <button className="btn ghost" onClick={exportXlsx}>⬇ Excel</button>
          {admin && <button className="btn ghost" onClick={() => setNewSupply({ name: '', category: 'General', unit: 'pza', stock: 0, minStock: 10 })}>＋ Insumo</button>}
          {admin && <button className="btn" onClick={() => setNewProduct({ name: '', price: 0, stock: 0, minStock: 6 })}>＋ Producto</button>}
        </div>
      </div>
      <div className="sec-title">Insumos</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Insumo</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Estado</th><th></th></tr></thead>
          <tbody><Rows list={supplies} kind="supplies" /></tbody></table>
      </div>
      <div className="sec-title">Productos</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Producto</th><th>Precio</th><th>Stock</th><th>Mínimo</th><th>Estado</th><th></th></tr></thead>
          <tbody><Rows list={products} kind="products" /></tbody></table>
      </div>
      {!admin && <p className="muted" style={{ marginTop: 12, fontSize: '.82rem' }}>Solo el administrador puede establecer mínimos.</p>}

      {stock && (
        <Modal title="Entrada de stock" onClose={() => setStock(null)}>
          <p className="mb">{stock.name}</p>
          <div className="field"><label>Cantidad a agregar</label><input type="number" value={stock.qty} onChange={e => setStock({ ...stock, qty: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setStock(null)}>Cancelar</button><button className="btn" onClick={addStock}>Agregar</button></div>
        </Modal>
      )}
      {editMin && (
        <Modal title="Editar mínimo" onClose={() => setEditMin(null)}>
          <p className="mb">{editMin.name}</p>
          <div className="field"><label>Stock mínimo (alerta de reorden)</label><input type="number" value={editMin.minStock} onChange={e => setEditMin({ ...editMin, minStock: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setEditMin(null)}>Cancelar</button><button className="btn" onClick={saveMin}>Guardar</button></div>
        </Modal>
      )}
      {newSupply && (
        <Modal title="Nuevo insumo" onClose={() => setNewSupply(null)}>
          <div className="field"><label>Nombre *</label><input value={newSupply.name} onChange={e => setNewSupply({ ...newSupply, name: e.target.value })} /></div>
          <div className="row2">
            <div className="field"><label>Categoría</label><input value={newSupply.category} onChange={e => setNewSupply({ ...newSupply, category: e.target.value })} /></div>
            <div className="field"><label>Unidad</label><input value={newSupply.unit} onChange={e => setNewSupply({ ...newSupply, unit: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Stock inicial</label><input type="number" value={newSupply.stock} onChange={e => setNewSupply({ ...newSupply, stock: e.target.value })} /></div>
            <div className="field"><label>Stock mínimo</label><input type="number" value={newSupply.minStock} onChange={e => setNewSupply({ ...newSupply, minStock: e.target.value })} /></div>
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setNewSupply(null)}>Cancelar</button><button className="btn" onClick={saveSupply}>Guardar</button></div>
        </Modal>
      )}
      {newProduct && (
        <Modal title="Nuevo producto" onClose={() => setNewProduct(null)}>
          <div className="field"><label>Nombre *</label><input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} /></div>
          <div className="row2">
            <div className="field"><label>Precio</label><input type="number" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} /></div>
            <div className="field"><label>Stock</label><input type="number" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} /></div>
          </div>
          <div className="field"><label>Stock mínimo</label><input type="number" value={newProduct.minStock} onChange={e => setNewProduct({ ...newProduct, minStock: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setNewProduct(null)}>Cancelar</button><button className="btn" onClick={saveProduct}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}
