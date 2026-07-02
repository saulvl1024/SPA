import { useEffect, useState, useRef } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money, downloadExcel } from '../ui.jsx';
import { setting } from '../permissions.js';
import ImportModal from '../components/ImportModal.jsx';
import Select from '../components/Select.jsx';

const label = x => x.stock <= x.minStock / 2 ? ['Crítico', 'bg-bad'] : x.stock <= x.minStock ? ['Bajo', 'bg-warn'] : ['Óptimo', 'bg-ok'];

// Redimensiona una imagen a máx 400px y la comprime a JPEG base64 (para no inflar la BD)
function compressImage(file, maxSize = 400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        else if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Campo para asignar imagen de producto: subir archivo (comprimido) o pegar URL.
function ImageField({ value, onChange }) {
  const [mode, setMode] = useState('file'); // file | url
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return;
    setLoading(true);
    try { onChange(await compressImage(f)); }
    catch { toast('No se pudo procesar la imagen', 'bad'); }
    finally { setLoading(false); }
  }

  return (
    <div className="field">
      <label>Imagen del producto</label>
      <div className="imgf">
        {/* Vista previa / dropzone a la izquierda */}
        <div
          className={'imgf-drop' + (value ? ' has' : '') + (drag ? ' drag' : '')}
          onClick={() => mode === 'file' && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
          role="button" tabIndex={0}>
          {loading
            ? <span className="imgf-spin" />
            : value
              ? <><img src={value} alt="" /><span className="imgf-overlay">Cambiar</span></>
              : <span className="imgf-empty">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                  <span>{mode === 'file' ? 'Toca o arrastra' : 'Pega una URL'}</span>
                </span>}
        </div>

        {/* Controles a la derecha */}
        <div className="imgf-side">
          <div className="seg-mini">
            <button type="button" className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>Subir</button>
            <button type="button" className={mode === 'url' ? 'on' : ''} onClick={() => setMode('url')}>URL</button>
          </div>
          {mode === 'file'
            ? <button type="button" className="btn ghost sm imgf-pick" onClick={() => fileRef.current?.click()}>Elegir imagen…</button>
            : <input type="url" placeholder="https://..." value={value && value.startsWith('http') ? value : ''} onChange={e => onChange(e.target.value)} />}
          {value && <button type="button" className="imgf-remove" onClick={() => onChange('')}>Quitar imagen</button>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  // Puede editar stock por almacén: admin o quien tenga el permiso 'stock_almacen'
  const puedeStock = admin || (user.perms || []).includes('stock_almacen');
  const [supplies, setSupplies] = useState([]);
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState(null);
  const [editMin, setEditMin] = useState(null);
  const [newSupply, setNewSupply] = useState(null);
  const [newProduct, setNewProduct] = useState(null);
  const [services, setServices] = useState([]);
  const [recipe, setRecipe] = useState(null); // { service, rows:[{supplyId, qty}] }
  const [showImport, setShowImport] = useState(false);
  const [editItem, setEditItem] = useState(null); // editar nombre/precio
  const [bundle, setBundle] = useState(null);   // { product, rows:[{componentId, qty}] }
  const [variants, setVariants] = useState(null); // { product, list }
  const [showWh, setShowWh] = useState(false);   // modal gestión de almacenes
  const [warehouses, setWarehouses] = useState([]); // lista de almacenes
  // Por defecto, el empleado entra con SU sucursal preseleccionada; el admin ve "Todos".
  const [whSel, setWhSel] = useState(() => (user.role !== 'admin' && user.warehouseId) ? user.warehouseId : '');
  const [whLevels, setWhLevels] = useState({});  // { productId: qty } del almacén seleccionado
  const usaAlmacenes = setting('usarAlmacenes', false);

  const load = () => { api.get('/inventory/supplies').then(setSupplies); api.get('/inventory/products').then(setProducts); };
  useEffect(() => { load(); if (admin) api.get('/catalog/services').then(setServices); }, []); // eslint-disable-line

  // Carga la lista de almacenes (si la función está activa)
  const loadWarehouses = () => { if (usaAlmacenes) api.get('/warehouses').then(setWarehouses).catch(() => {}); };
  useEffect(() => { loadWarehouses(); }, []); // eslint-disable-line

  // Al elegir un almacén, carga el stock de cada producto en ese almacén
  useEffect(() => {
    if (whSel) api.get(`/warehouses/${whSel}/levels`).then(setWhLevels).catch(() => setWhLevels({}));
    else setWhLevels({});
  }, [whSel]);

  // Guarda el stock de un producto en el almacén seleccionado y refresca el total
  async function setWhQty(productId, qty) {
    try {
      const r = await api.put(`/warehouses/stock/${productId}/${whSel}`, { qty: +qty || 0 });
      setWhLevels(m => ({ ...m, [productId]: +qty || 0 }));
      load(); // actualiza el total que se muestra en "Todos"
      toast(`Stock actualizado · total ${r.total}`, 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function openRecipe(svc) {
    const full = await api.get('/catalog/services/' + svc.id);
    setRecipe({ service: full, rows: (full.recipe || []).map(r => ({ supplyId: r.supplyId, qty: r.qty })) });
  }
  async function saveRecipe() {
    try { await api.put(`/catalog/services/${recipe.service.id}/recipe`, { items: recipe.rows.filter(r => r.supplyId && +r.qty > 0) }); setRecipe(null); toast('Receta guardada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  async function addStock() {
    try {
      const qty = Number(stock.qty);
      if (!qty) return toast('Indica una cantidad distinta de cero', 'bad');
      if (!stock.reason?.trim()) return toast('Indica el motivo del ajuste', 'bad');
      await api.post(`/inventory/${stock.kind || 'supplies'}/${stock.id}/stock`, { qty, reason: stock.reason.trim() });
      setStock(null); load(); toast('Ajuste registrado', 'ok');
    }
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

  async function saveEdit() {
    try {
      if (!editItem.name) return toast('Falta el nombre', 'bad');
      if (editItem.kind === 'products') await api.put(`/inventory/products/${editItem.id}`, { name: editItem.name, price: +editItem.price, station: editItem.station, barcode: editItem.barcode, category: editItem.category, image: editItem.image });
      else await api.put(`/inventory/supplies/${editItem.id}`, { name: editItem.name, category: editItem.category, unit: editItem.unit });
      setEditItem(null); load(); toast('Guardado', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  // --- Paquetes (bundles) ---
  function openBundle(p) {
    setBundle({ product: p, rows: (p.components || []).map(c => ({ componentId: c.componentId, qty: c.qty })) });
  }
  async function saveBundle() {
    try {
      await api.put(`/inventory/products/${bundle.product.id}/components`, { items: bundle.rows.filter(r => r.componentId && +r.qty > 0) });
      setBundle(null); load(); toast('Paquete configurado', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  // --- Variantes ---
  function openVariants(p) {
    api.get(`/inventory/products/${p.id}/variants`).then(list => setVariants({ product: p, list, form: null }));
  }
  function reloadVariants() { api.get(`/inventory/products/${variants.product.id}/variants`).then(list => setVariants(v => ({ ...v, list }))); }
  async function saveVariant(f) {
    try {
      if (!f.name) return toast('Falta el nombre de la variante', 'bad');
      if (f.id) await api.put(`/inventory/variants/${f.id}`, f);
      else await api.post(`/inventory/products/${variants.product.id}/variants`, f);
      setVariants(v => ({ ...v, form: null })); reloadVariants(); load(); toast('Variante guardada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function delVariant(id) {
    try { await api.del(`/inventory/variants/${id}`); reloadVariants(); load(); toast('Variante eliminada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  const Rows = ({ list, kind }) => list.map(x => {
    const [lbl, cls] = label(x);
    return (
      <tr key={x.id}>
        <td>{x.name}
          {x.isBundle && <span className="badge" style={{ background: 'var(--gold)', color: '#fff', marginLeft: 6, fontSize: '.66rem' }}>paquete</span>}
          {x.variants?.length > 0 && <span className="badge" style={{ background: 'var(--plum)', color: '#fff', marginLeft: 6, fontSize: '.66rem' }}>{x.variants.length} variantes</span>}
        </td>{kind === 'supplies' ? <td>{x.category || '—'}</td> : <td>{money(x.price)}</td>}
        <td>
          {whSel && kind === 'products'
            ? <input type="number" min="0" placeholder="0" defaultValue={whLevels[x.id] || ''} key={whSel + x.id} style={{ width: 80, padding: '5px 8px' }}
                onBlur={e => (Number(e.target.value) || 0) !== (whLevels[x.id] || 0) && setWhQty(x.id, e.target.value)} />
            : <>{x.stock}{x.unit ? ' ' + x.unit : ''}</>}
        </td><td>{x.minStock}</td>
        <td><span className={'badge ' + cls}>{lbl}</span></td>
        <td>
          {admin ? (
            <div className="row-actions">
              <button className="btn ghost sm" onClick={() => setEditItem({ id: x.id, kind, name: x.name, price: x.price ?? 0, category: x.category || '', unit: x.unit || 'pza', station: x.station || 'ninguna', barcode: x.barcode || '', image: x.image || '' })}>Editar</button>
              <button className="btn ghost sm" onClick={() => setStock({ id: x.id, name: x.name, qty: 0, kind, current: x.stock, reason: '' })}>Ajustar</button>
              <button className="btn ghost sm" onClick={() => setEditMin({ id: x.id, kind, name: x.name, minStock: x.minStock })}>Mín.</button>
              {kind === 'products' && <button className="btn ghost sm" onClick={() => openBundle(x)}>Paquete</button>}
              {kind === 'products' && setting('usarVariantes') && <button className="btn ghost sm" onClick={() => openVariants(x)}>Variantes</button>}
            </div>
          ) : <span className="muted" style={{ fontSize: '.8rem' }}>—</span>}
        </td>
      </tr>
    );
  });

  function exportXlsx() {
    const prod = [['Producto', 'Precio', 'Stock', 'Mínimo', 'Estado'], ...products.map(x => [x.name, x.price, x.stock, x.minStock, label(x)[0]])];
    const sheets = [{ name: 'Productos', rows: prod }];
    // Solo incluir insumos si el negocio usa recetas
    if (setting('usarRecetas')) {
      const sup = [['Insumo', 'Categoría', 'Unidad', 'Stock', 'Mínimo', 'Estado'], ...supplies.map(x => [x.name, x.category, x.unit, x.stock, x.minStock, label(x)[0]])];
      sheets.unshift({ name: 'Insumos', rows: sup });
    }
    downloadExcel('inventario_' + new Date().toISOString().slice(0, 10), sheets);
  }

  return (
    <>
      <div className="top"><h1>Inventario</h1>
        <div className="row">
          <button className="btn ghost" onClick={exportXlsx}>⬇ Excel</button>
          {admin && usaAlmacenes && <button className="btn ghost" onClick={() => setShowWh(true)}>Almacenes</button>}
          {admin && setting('usarRecetas') && <button className="btn ghost" onClick={() => setNewSupply({ name: '', category: 'General', unit: 'pza', stock: '', minStock: '' })}>Insumo</button>}
          {admin && <button className="btn ghost" onClick={() => setShowImport(true)}>⬆ Importar</button>}
          {admin && <button className="btn" onClick={() => setNewProduct({ name: '', price: '', stock: '', minStock: '' })}>Producto</button>}
        </div>
      </div>
      {showImport && <ImportModal title="Importar productos" endpoint="products"
        columns={['nombre', 'precio', 'stock', 'minimo', 'costo']}
        sample={['Shampoo 500ml', 180, 24, 6, 95]}
        onDone={load} onClose={() => setShowImport(false)} />}
      {setting('usarRecetas') && <>
        <div className="sec-title">Insumos</div>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table><thead><tr><th>Insumo</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Estado</th><th></th></tr></thead>
            <tbody><Rows list={supplies} kind="supplies" /></tbody></table>
        </div>
      </>}
      <div className="row mb" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
        <div className="sec-title" style={{ margin: 0 }}>Productos</div>
        {usaAlmacenes && warehouses.length > 0 && puedeStock && (
          <div style={{ minWidth: 220 }}>
            <label className="muted" style={{ fontSize: '.74rem', display: 'block', marginBottom: 4 }}>Ver y editar stock de</label>
            <Select value={whSel} onChange={setWhSel} placeholder="Todos los almacenes (total)"
              options={[{ value: '', label: 'Todos los almacenes (total)' }, ...warehouses.map(w => ({ value: w.id, label: w.name + (w.isDefault ? ' · principal' : '') }))]} />
          </div>
        )}
      </div>
      {whSel && <p className="muted mb" style={{ fontSize: '.8rem', marginTop: -6 }}>Editando el stock en <b>{warehouses.find(w => w.id === whSel)?.name}</b>. El total se actualiza solo.</p>}
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Producto</th><th>Precio</th><th>{whSel ? 'Stock aquí' : 'Stock'}</th><th>Mínimo</th><th>Estado</th><th></th></tr></thead>
          <tbody><Rows list={products} kind="products" /></tbody></table>
      </div>
      {!admin && <p className="muted" style={{ marginTop: 12, fontSize: '.82rem' }}>Solo el administrador puede establecer mínimos.</p>}

      {admin && setting('usarRecetas') && (
        <>
          <div className="sec-title">Recetas por servicio</div>
          <p className="muted" style={{ marginTop: -6, marginBottom: 10, fontSize: '.84rem' }}>Define cuánto de cada insumo consume cada servicio. Se descuenta automáticamente al completar el servicio.</p>
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table><thead><tr><th>Servicio</th><th>Precio</th><th>Insumos en receta</th><th></th></tr></thead>
              <tbody>
                {services.map(s => (
                  <tr key={s.id}><td>{s.name}</td><td>{money(s.price)}</td><td className="muted">{(s.recipe?.length ?? '—')}</td>
                    <td><div className="row-actions"><button className="btn ghost sm" onClick={() => openRecipe(s)}>Editar receta</button></div></td></tr>
                ))}
                {!services.length && <tr><td colSpan="4" className="empty">Sin servicios</td></tr>}
              </tbody></table>
          </div>
        </>
      )}

      {recipe && (
        <Modal title={'Receta · ' + recipe.service.name} onClose={() => setRecipe(null)}>
          <p className="muted mb" style={{ fontSize: '.84rem' }}>Insumos que se descuentan al realizar este servicio.</p>
          {recipe.rows.map((row, idx) => (
            <div className="row" key={idx} style={{ gap: 8, marginBottom: 8 }}>
              <Select style={{ flex: 2 }} value={row.supplyId} placeholder="Insumo..." onChange={v => setRecipe({ ...recipe, rows: recipe.rows.map((r, i) => i === idx ? { ...r, supplyId: v } : r) })}
                options={supplies.map(su => ({ value: su.id, label: `${su.name} (${su.unit})` }))} />
              <input style={{ flex: 1 }} type="number" placeholder="Cantidad" value={row.qty} onChange={e => setRecipe({ ...recipe, rows: recipe.rows.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r) })} />
              <button className="btn ghost sm" onClick={() => setRecipe({ ...recipe, rows: recipe.rows.filter((_, i) => i !== idx) })}>×</button>
            </div>
          ))}
          <button className="btn ghost sm" onClick={() => setRecipe({ ...recipe, rows: [...recipe.rows, { supplyId: '', qty: '' }] })}>Agregar insumo</button>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setRecipe(null)}>Cancelar</button><button className="btn" onClick={saveRecipe}>Guardar receta</button></div>
        </Modal>
      )}

      {/* Configurar paquete (bundle) */}
      {bundle && (
        <Modal title={'Paquete · ' + bundle.product.name} onClose={() => setBundle(null)}>
          <p className="muted mb" style={{ fontSize: '.84rem' }}>Define qué productos y cuántas unidades incluye este paquete. Al venderlo se descuenta el stock de cada componente. Deja la lista vacía para que sea un producto normal.</p>
          {bundle.rows.map((row, idx) => (
            <div className="row" key={idx} style={{ gap: 8, marginBottom: 8 }}>
              <Select style={{ flex: 2 }} value={row.componentId} placeholder="Producto..." onChange={v => setBundle({ ...bundle, rows: bundle.rows.map((r, i) => i === idx ? { ...r, componentId: v } : r) })}
                options={products.filter(p => p.id !== bundle.product.id && !p.isBundle).map(p => ({ value: p.id, label: p.name }))} />
              <input type="number" min="1" placeholder="Cant." style={{ flex: 1 }} value={row.qty} onChange={e => setBundle({ ...bundle, rows: bundle.rows.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r) })} />
              <button className="mini-x" type="button" onClick={() => setBundle({ ...bundle, rows: bundle.rows.filter((_, i) => i !== idx) })}>×</button>
            </div>
          ))}
          <button className="btn ghost sm" onClick={() => setBundle({ ...bundle, rows: [...bundle.rows, { componentId: '', qty: 1 }] })}>Agregar producto</button>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setBundle(null)}>Cancelar</button><button className="btn" onClick={saveBundle}>Guardar paquete</button></div>
        </Modal>
      )}

      {variants && (
        <Modal title={'Variantes · ' + variants.product.name} onClose={() => setVariants(null)}>
          <p className="muted mb" style={{ fontSize: '.84rem' }}>Crea combinaciones (talla, color, sabor...) con su propio precio y stock.</p>
          {variants.list.length > 0 && (
            <table style={{ width: '100%', marginBottom: 12 }}>
              <thead><tr><th>Variante</th><th>Precio</th><th>Stock</th><th></th></tr></thead>
              <tbody>
                {variants.list.map(v => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td>{v.price != null ? money(v.price) : <span className="muted">base</span>}</td>
                    <td>{v.stock}</td>
                    <td className="right">
                      <div className="row-actions">
                        <button className="btn ghost sm" onClick={() => setVariants(s => ({ ...s, form: { id: v.id, name: v.name, price: v.price ?? '', stock: v.stock, sku: v.sku || '' } }))}>Editar</button>
                        <button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => delVariant(v.id)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {variants.form ? (
            <div className="card" style={{ background: 'var(--cream)' }}>
              <div className="field"><label>Nombre de la variante *</label><input value={variants.form.name} placeholder="Ej. Rojo / Talla M" onChange={e => setVariants(s => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
              <div className="row2">
                <div className="field"><label>Precio (vacío = usa el base)</label><input type="number" value={variants.form.price} onChange={e => setVariants(s => ({ ...s, form: { ...s.form, price: e.target.value } }))} /></div>
                <div className="field"><label>Stock</label><input type="number" value={variants.form.stock} onChange={e => setVariants(s => ({ ...s, form: { ...s.form, stock: e.target.value } }))} /></div>
              </div>
              <div className="field"><label>SKU (opcional)</label><input value={variants.form.sku} onChange={e => setVariants(s => ({ ...s, form: { ...s.form, sku: e.target.value } }))} /></div>
              <div className="modal-actions"><button className="btn ghost" onClick={() => setVariants(s => ({ ...s, form: null }))}>Cancelar</button><button className="btn" onClick={() => saveVariant(variants.form)}>Guardar variante</button></div>
            </div>
          ) : (
            <button className="btn" onClick={() => setVariants(s => ({ ...s, form: { name: '', price: '', stock: 0, sku: '' } }))}>Nueva variante</button>
          )}
        </Modal>
      )}

      {/* Nuevo producto */}
      {newProduct && (
        <Modal title="Nuevo producto" onClose={() => setNewProduct(null)} width={460}>
          <div className="field"><label>Nombre *</label><input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Ej. Shampoo 500ml" /></div>
          <div className="row2">
            <div className="field"><label>Precio</label><input type="number" min="0" placeholder="0" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} /></div>
            <div className="field"><label>Stock inicial</label><input type="number" min="0" placeholder="0" value={newProduct.stock} onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Stock mínimo</label><input type="number" min="0" placeholder="0" value={newProduct.minStock} onChange={e => setNewProduct({ ...newProduct, minStock: e.target.value })} /></div>
            <div className="field"><label>Categoría</label><input value={newProduct.category || ''} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} placeholder="Ej. Shampoo, Cremas" /></div>
          </div>
          <div className="field"><label>Código de barras</label><input value={newProduct.barcode || ''} onChange={e => setNewProduct({ ...newProduct, barcode: e.target.value })} placeholder="Escanea o escribe" /></div>
          <ImageField value={newProduct.image || ''} onChange={v => setNewProduct({ ...newProduct, image: v })} />
          <div className="modal-actions"><button className="btn ghost" onClick={() => setNewProduct(null)}>Cancelar</button><button className="btn" onClick={saveProduct}>Guardar</button></div>
        </Modal>
      )}

      {/* Editar producto / insumo */}
      {editItem && (
        <Modal title={editItem.kind === 'products' ? 'Editar producto' : 'Editar insumo'} onClose={() => setEditItem(null)} width={460}>
          <div className="field"><label>Nombre *</label><input value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} /></div>
          {editItem.kind === 'products' ? (
            <>
              <div className="row2">
                <div className="field"><label>Precio</label><input type="number" min="0" value={editItem.price} onChange={e => setEditItem({ ...editItem, price: e.target.value })} /></div>
                <div className="field"><label>Categoría</label><input value={editItem.category || ''} onChange={e => setEditItem({ ...editItem, category: e.target.value })} placeholder="Ej. Shampoo, Cremas" /></div>
              </div>
              <div className="field"><label>Código de barras</label><input value={editItem.barcode || ''} onChange={e => setEditItem({ ...editItem, barcode: e.target.value })} placeholder="Escanea o escribe" /></div>
              <ImageField value={editItem.image || ''} onChange={v => setEditItem({ ...editItem, image: v })} />
              {setting('usarCocina') && (
                <div className="field"><label>Estación (comanda)</label>
                  <Select value={editItem.station} onChange={v => setEditItem({ ...editItem, station: v })}
                    options={[{ value: 'ninguna', label: 'Ninguna' }, { value: 'cocina', label: 'Cocina' }, { value: 'barra', label: 'Barra' }]} />
                </div>
              )}
            </>
          ) : (
            <div className="row2">
              <div className="field"><label>Categoría</label><input value={editItem.category} onChange={e => setEditItem({ ...editItem, category: e.target.value })} /></div>
              <div className="field"><label>Unidad</label><input value={editItem.unit} onChange={e => setEditItem({ ...editItem, unit: e.target.value })} /></div>
            </div>
          )}
          <div className="modal-actions"><button className="btn ghost" onClick={() => setEditItem(null)}>Cancelar</button><button className="btn" onClick={saveEdit}>Guardar</button></div>
        </Modal>
      )}

      {/* Nuevo insumo */}
      {newSupply && (
        <Modal title="Nuevo insumo" onClose={() => setNewSupply(null)} width={460}>
          <div className="field"><label>Nombre *</label><input value={newSupply.name} onChange={e => setNewSupply({ ...newSupply, name: e.target.value })} /></div>
          <div className="row2">
            <div className="field"><label>Categoría</label><input value={newSupply.category} onChange={e => setNewSupply({ ...newSupply, category: e.target.value })} /></div>
            <div className="field"><label>Unidad</label><input value={newSupply.unit} onChange={e => setNewSupply({ ...newSupply, unit: e.target.value })} placeholder="pza, ml, g..." /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Stock inicial</label><input type="number" min="0" placeholder="0" value={newSupply.stock} onChange={e => setNewSupply({ ...newSupply, stock: e.target.value })} /></div>
            <div className="field"><label>Stock mínimo</label><input type="number" min="0" placeholder="0" value={newSupply.minStock} onChange={e => setNewSupply({ ...newSupply, minStock: e.target.value })} /></div>
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setNewSupply(null)}>Cancelar</button><button className="btn" onClick={saveSupply}>Guardar</button></div>
        </Modal>
      )}

      {/* Ajustar stock (entrada/salida con motivo → queda en auditoría) */}
      {stock && (
        <Modal title={'Ajustar stock · ' + stock.name} onClose={() => setStock(null)} width={420}>
          <p className="muted mb" style={{ fontSize: '.84rem' }}>Stock actual: <b style={{ color: 'var(--ink)' }}>{stock.current}</b>. Usa positivo para entrada, negativo para salida.</p>
          <div className="row2">
            <div className="field"><label>Cantidad (+ entra / − sale)</label>
              <input type="number" placeholder="0" value={stock.qty} onChange={e => setStock({ ...stock, qty: e.target.value })} autoFocus /></div>
            <div className="field"><label>Stock resultante</label>
              <input value={Math.max(0, (stock.current || 0) + (Number(stock.qty) || 0))} readOnly style={{ background: 'var(--cream)' }} /></div>
          </div>
          <div className="field"><label>Motivo del ajuste *</label>
            <input value={stock.reason} placeholder="Ej. Merma, conteo físico, producto dañado..." onChange={e => setStock({ ...stock, reason: e.target.value })} /></div>
          <div className="mesa-legend" style={{ fontSize: '.72rem' }}>
            {['Conteo físico', 'Merma', 'Producto dañado', 'Caducado'].map(m => (
              <button key={m} type="button" className="btn ghost sm" onClick={() => setStock({ ...stock, reason: m })}>{m}</button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: '.74rem', marginTop: 8 }}>Este movimiento quedará registrado en Auditoría con el motivo.</p>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setStock(null)}>Cancelar</button><button className="btn" onClick={addStock}>Registrar ajuste</button></div>
        </Modal>
      )}

      {/* Editar mínimo */}
      {editMin && (
        <Modal title={'Stock mínimo · ' + editMin.name} onClose={() => setEditMin(null)} width={380}>
          <div className="field"><label>Stock mínimo</label><input type="number" min="0" value={editMin.minStock} onChange={e => setEditMin({ ...editMin, minStock: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setEditMin(null)}>Cancelar</button><button className="btn" onClick={saveMin}>Guardar</button></div>
        </Modal>
      )}

      {/* Gestión de almacenes (multi-sucursal) */}
      {showWh && <WarehousesModal onClose={() => { setShowWh(false); loadWarehouses(); }} />}
    </>
  );
}

// Modal de gestión de almacenes/sucursales (crear, marcar principal, eliminar)
function WarehousesModal({ onClose }) {
  const [list, setList] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const load = () => api.get('/warehouses').then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return toast('Escribe el nombre', 'bad');
    try { await api.post('/warehouses', { name, address }); setName(''); setAddress(''); load(); toast('Almacén creado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function makeDefault(w) {
    try { await api.put('/warehouses/' + w.id, { isDefault: true }); load(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function remove(w) {
    if (!confirm(`¿Eliminar el almacén "${w.name}"? Su stock se descontará del total.`)) return;
    try { await api.del('/warehouses/' + w.id); load(); toast('Almacén eliminado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <Modal title="Almacenes / sucursales" onClose={onClose} width={520}>
      <p className="muted mb" style={{ fontSize: '.84rem' }}>Crea los almacenes o sucursales de tu negocio. El stock de cada producto se distribuye entre ellos.</p>
      <div className="card" style={{ background: 'var(--cream)', padding: 12, marginBottom: 12 }}>
        <div className="row2" style={{ gap: 8 }}>
          <input placeholder="Nombre (ej. Sucursal Centro)" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="Dirección (opcional)" value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <button className="btn" style={{ marginTop: 8 }} onClick={create}>＋ Agregar almacén</button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Almacén</th><th>Dirección</th><th></th></tr></thead>
          <tbody>
            {list.map(w => (
              <tr key={w.id}>
                <td>{w.name}{w.isDefault && <span className="badge bg-muted" style={{ marginLeft: 6, fontSize: '.62rem' }}>principal</span>}</td>
                <td className="muted">{w.address || '—'}</td>
                <td className="right"><div className="row-actions">
                  {!w.isDefault && <button className="btn ghost sm" onClick={() => makeDefault(w)}>Hacer principal</button>}
                  <button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => remove(w)}>Eliminar</button>
                </div></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="3" className="empty">Sin almacenes. Crea el primero arriba.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Listo</button></div>
    </Modal>
  );
}
