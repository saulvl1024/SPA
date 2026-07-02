import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money, matches } from '../ui.jsx';
import Select from '../components/Select.jsx';

const elapsed = since => {
  if (!since) return '';
  const m = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function Tables() {
  const { user } = useAuth();
  const admin = user.role === 'admin' || user.role === 'superadmin';
  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [sel, setSel] = useState(null);        // mesa abierta (panel de cuentas)
  const [orders, setOrders] = useState([]);    // cuentas de la mesa seleccionada
  const [activeOrder, setActiveOrder] = useState(null); // cuenta en la que se agregan items
  const [newTable, setNewTable] = useState(null);
  const [pay, setPay] = useState(null);        // cuenta a cobrar
  const [confirmDel, setConfirmDel] = useState(null); // cuenta a eliminar
  const [q, setQ] = useState('');
  const [editMap, setEditMap] = useState(false);   // modo acomodar mesas (arrastrar)
  const [showNfc, setShowNfc] = useState(false);   // panel de URLs para stickers NFC
  const [positions, setPositions] = useState({});  // { id: {x,y} } posiciones locales mientras se arrastra
  const [dirty, setDirty] = useState(false);       // hay cambios sin guardar en el mapa

  const loadTables = () => api.get('/tables').then(setTables).catch(e => toast(e.message, 'bad'));
  useEffect(() => { loadTables(); api.get('/inventory/products').then(setProducts).catch(() => {}); }, []);

  // NFC del mesero: ?abrir=ID en la URL abre automáticamente esa mesa al cargar
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('abrir');
    if (!id || !tables.length) return;
    const mesa = tables.find(t => t.id === id);
    if (mesa) {
      openTable(mesa);
      // limpia el parámetro para no reabrir al refrescar
      window.history.replaceState({}, '', '/mesas');
    }
  }, [tables]); // eslint-disable-line
  // Refresco periódico para ver tiempos y estados al día (pausado mientras se acomoda el mapa)
  useEffect(() => { if (editMap) return; const t = setInterval(loadTables, 30000); return () => clearInterval(t); }, [editMap]);

  // posición efectiva de una mesa (local si se está arrastrando, si no la de la BD)
  const posOf = t => positions[t.id] || { x: t.posX ?? 40, y: t.posY ?? 40 };

  // arrastre con puntero (funciona en mouse y touch gracias a Pointer Events)
  function startDrag(e, t) {
    if (!editMap) return;
    e.preventDefault();
    const canvas = e.currentTarget.parentElement.getBoundingClientRect();
    const start = posOf(t);
    const offX = e.clientX - canvas.left - start.x;
    const offY = e.clientY - canvas.top - start.y;
    const move = ev => {
      const x = Math.max(0, Math.min(canvas.width - 100, ev.clientX - canvas.left - offX));
      const y = Math.max(0, Math.min(canvas.height - 100, ev.clientY - canvas.top - offY));
      setPositions(p => ({ ...p, [t.id]: { x, y } }));
      setDirty(true);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  async function saveLayout() {
    // "Snap a la cuadrícula": respeta CÓMO acomodaste cada mesa (arriba/al lado),
    // solo redondea su posición a la celda más cercana para que queden parejas,
    // con buena separación. No reordena las mesas.
    const GAP = 150, MARGIN = 24;  // separación amplia entre mesas
    const snap = v => MARGIN + Math.round((v - MARGIN) / GAP) * GAP;
    // Resuelve colisiones: si dos mesas caen en la misma celda, corre la segunda a la derecha
    const taken = new Set();
    const payload = tables.map(t => {
      const p = posOf(t);
      let x = Math.max(MARGIN, snap(p.x));
      let y = Math.max(MARGIN, snap(p.y));
      while (taken.has(x + ',' + y)) x += GAP; // celda ocupada → siguiente columna
      taken.add(x + ',' + y);
      return { id: t.id, posX: x, posY: y };
    });
    try { await api.patch('/tables/layout', { positions: payload }); setDirty(false); setEditMap(false); setPositions({}); loadTables(); toast('Mesas alineadas y guardadas', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  async function openTable(t) {
    setSel(t);
    const os = await api.get(`/tables/${t.id}/orders`);
    setOrders(os);
    setActiveOrder(os[0]?.id || null);
    if (!os.length) await addAccount(t.id, os);
  }
  async function reloadOrders(tableId) {
    const os = await api.get(`/tables/${tableId}/orders`);
    setOrders(os);
    if (!os.find(o => o.id === activeOrder)) setActiveOrder(os[0]?.id || null);
    loadTables();
  }
  async function addAccount(tableId, current) {
    const o = await api.post(`/tables/${tableId}/orders`, {});
    const os = [...(current || orders), { ...o, items: [] }];
    setOrders(os); setActiveOrder(o.id);
  }
  async function addItem(p) {
    if (!activeOrder) return toast('Abre o elige una cuenta', 'bad');
    if (p.variants?.length) { /* simple: agrega base; variantes finas se manejan en POS */ }
    try { await api.post(`/tables/orders/${activeOrder}/items`, { productId: p.id, qty: 1 }); reloadOrders(sel.id); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function delItem(id) { await api.del(`/tables/orders/items/${id}`); reloadOrders(sel.id); }
  async function confirmRemove() {
    const o = confirmDel;
    try {
      await api.post(`/tables/orders/${o.id}/cancel`, {});
      setConfirmDel(null);
      const os = await api.get(`/tables/${sel.id}/orders`);
      setOrders(os); setActiveOrder(os[0]?.id || null);
      loadTables();
      if (!os.length) setSel(null); // mesa quedó libre
      toast('Cuenta eliminada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function moveItem(itemId, toOrderId) { await api.patch(`/tables/orders/items/${itemId}/move`, { toOrderId }); reloadOrders(sel.id); }

  async function doCheckout() {
    try {
      const r = await api.post(`/tables/orders/${pay.id}/checkout`, { paymentMethod: pay.method });
      toast(`Cobrado · ticket #${r.ticketNo}`, 'ok');
      setPay(null); reloadOrders(sel.id);
      const os = await api.get(`/tables/${sel.id}/orders`);
      if (!os.length) { setSel(null); }
    } catch (e) { toast(e.message, 'bad'); }
  }

  const filtered = products.filter(p => !q.trim() || matches(p.name, q)).slice(0, 60);
  const curOrder = orders.find(o => o.id === activeOrder);

  // --- VISTA: mapa de mesas (lienzo arrastrable) ---
  const libres = tables.filter(t => t.status !== 'ocupada').length;
  const ocupadas = tables.length - libres;
  const enCurso = tables.reduce((a, t) => a + (t.total || 0), 0);     // total de cuentas abiertas
  const ticketProm = ocupadas ? enCurso / ocupadas : 0;
  if (!sel) return (
    <>
      <div className="top">
        <div><h1>Mesas</h1>
          <div className="sub">
            {editMap ? 'Arrastra las mesas para acomodarlas como tu local. Guarda al terminar.'
              : 'Toca una mesa para abrir o ver su cuenta'}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {admin && !editMap && <button className="btn ghost" onClick={() => setShowNfc(true)}>Stickers NFC</button>}
          {admin && !editMap && <button className="btn ghost" onClick={() => setEditMap(true)}>✥ Acomodar</button>}
          {admin && editMap && <button className="btn ghost" onClick={() => { setEditMap(false); setPositions({}); setDirty(false); }}>Cancelar</button>}
          {admin && editMap && <button className="btn" onClick={saveLayout}>Guardar acomodo</button>}
          {admin && !editMap && <button className="btn" onClick={() => setNewTable({ number: '', zone: '', capacity: 4, shape: 'round' })}>＋ Nueva mesa</button>}
        </div>
      </div>

      {!editMap && tables.length > 0 && (
        <>
          <div className="stat-row mb mesas-kpis">
            <div className="stat"><div className="lbl">Libres</div><div className="val" style={{ color: 'var(--sage)' }}>{libres}</div></div>
            <div className="stat"><div className="lbl">Ocupadas</div><div className="val" style={{ color: 'var(--gold,#C9A66B)' }}>{ocupadas}</div></div>
            <div className="stat"><div className="lbl">En curso</div><div className="val">{money(enCurso)}</div><div className="chg">cuentas abiertas</div></div>
            <div className="stat"><div className="lbl">Ticket prom.</div><div className="val">{money(ticketProm)}</div><div className="chg">por mesa ocupada</div></div>
          </div>
          <div className="mesa-legend mb">
            <span><i className="ml-dot" style={{ background: 'var(--sage)' }} /> Libre</span>
            <span><i className="ml-dot" style={{ background: 'var(--gold,#C9A66B)' }} /> Ocupada</span>
            <span><i className="ml-dot" style={{ background: 'var(--warn)' }} /> +1h</span>
            <span><i className="ml-dot" style={{ background: 'var(--bad)' }} /> +1.5h</span>
          </div>
        </>
      )}

      {!tables.length ? <div className="card"><div className="empty">No hay mesas. {admin ? 'Crea la primera con “＋ Nueva mesa”.' : ''}</div></div> : (
        <>
        {/* MAPA (desktop): lienzo arrastrable */}
        <div className="mesas-map mesa-canvas" style={{
          position: 'relative', minHeight: 520, height: '70vh', borderRadius: 16,
          background: 'linear-gradient(0deg, var(--card), var(--card)) padding-box, repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(127,127,127,.06) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(127,127,127,.06) 40px)',
          border: editMap ? '2px dashed var(--accent)' : '1px solid var(--line)',
          overflow: 'auto', boxShadow: 'inset 0 1px 6px rgba(0,0,0,.04)',
        }}>
          {tables.map(t => {
            const occ = t.status === 'ocupada';
            const p = posOf(t);
            const square = t.shape === 'square';
            const mins = occ && t.openedAt ? Math.floor((Date.now() - new Date(t.openedAt).getTime()) / 60000) : 0;
            const alert = mins >= 90 ? 'late' : mins >= 60 ? 'warn' : '';
            return (
              <div key={t.id}
                className={'mesa-chip' + (occ ? ' occ' : ' free') + (alert ? ' ' + alert : '') + (editMap ? ' editing' : '')}
                onPointerDown={e => editMap && startDrag(e, t)}
                onClick={() => !editMap && openTable(t)}
                style={{ left: p.x, top: p.y, borderRadius: square ? 16 : '50%' }}>
                <span className="mesa-dot" />
                <div className="serif mesa-num">{t.number}</div>
                {!occ && <div className="mesa-cap">{t.capacity}p{t.zone ? ` · ${t.zone}` : ''}</div>}
                {occ && <div className="mesa-total">{money(t.total)}</div>}
                {occ && <div className="mesa-time">{elapsed(t.openedAt)}{t.cuentas > 1 ? ` · ${t.cuentas}c` : ''}</div>}
              </div>
            );
          })}
        </div>

        {/* LISTA (móvil): tarjetas a ancho completo, fáciles de tocar */}
        <div className="mesas-list">
          {tables.map(t => {
            const occ = t.status === 'ocupada';
            const mins = occ && t.openedAt ? Math.floor((Date.now() - new Date(t.openedAt).getTime()) / 60000) : 0;
            const alert = mins >= 90 ? 'late' : mins >= 60 ? 'warn' : '';
            return (
              <button key={t.id} className={'mesa-li' + (occ ? ' occ' : ' free') + (alert ? ' ' + alert : '')} onClick={() => openTable(t)}>
                <span className="mesa-li-dot" />
                <span className="mesa-li-num serif">{t.number}</span>
                <span className="mesa-li-info">
                  <span className="mesa-li-state">{occ ? 'Ocupada' : 'Libre'}</span>
                  <span className="mesa-li-sub">{t.capacity} personas{t.zone ? ` · ${t.zone}` : ''}{occ && t.cuentas > 1 ? ` · ${t.cuentas} cuentas` : ''}</span>
                </span>
                {occ
                  ? <span className="mesa-li-right"><b className="mesa-li-total">{money(t.total)}</b><span className="mesa-li-time">{elapsed(t.openedAt)}</span></span>
                  : <svg className="mesa-li-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>}
              </button>
            );
          })}
        </div>
        </>
      )}

      {showNfc && (
        <Modal title="Stickers NFC / QR" onClose={() => setShowNfc(false)} width={620}>
          <p className="muted mb" style={{ fontSize: '.86rem', lineHeight: 1.5 }}>
            Programa estas direcciones en tus stickers NFC (con cualquier app gratuita de NFC) o genera un QR.
            El <b>sticker del cliente</b> abre el menú; el <b>sticker del mesero</b> abre la comanda de esa mesa.
          </p>
          <div className="nfc-base">
            <span className="muted">Menú general (sin mesa): </span>
            <code>{location.origin}/menu</code>
            <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(location.origin + '/menu').then(() => toast('Copiado', 'ok'))}>Copiar</button>
          </div>
          <div className="card" style={{ padding: 0, marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
            <table>
              <thead><tr><th>Mesa</th><th>Sticker cliente (menú)</th><th>Sticker mesero (abrir)</th></tr></thead>
              <tbody>
                {tables.map(t => {
                  const menuUrl = `${location.origin}/menu?mesa=${encodeURIComponent(t.number)}`;
                  const openUrl = `${location.origin}/mesas?abrir=${t.id}`;
                  return (
                    <tr key={t.id}>
                      <td><b>{t.number}</b></td>
                      <td><button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(menuUrl).then(() => toast('URL del menú copiada', 'ok'))}>Copiar menú</button></td>
                      <td><button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(openUrl).then(() => toast('URL de apertura copiada', 'ok'))}>Copiar apertura</button></td>
                    </tr>
                  );
                })}
                {!tables.length && <tr><td colSpan="3" className="empty">Crea mesas primero.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: '.76rem', marginTop: 10 }}>
            Nota: el sticker del mesero requiere que tenga la sesión abierta en su teléfono para que abra la comanda directo.
          </p>
          <div className="modal-actions"><button className="btn" onClick={() => setShowNfc(false)}>Listo</button></div>
        </Modal>
      )}

      {newTable && (
        <Modal title="Nueva mesa" onClose={() => setNewTable(null)}>
          <div className="row2">
            <div className="field"><label>Número / nombre *</label><input value={newTable.number} onChange={e => setNewTable({ ...newTable, number: e.target.value })} placeholder="12, Terraza 3..." /></div>
            <div className="field"><label>Zona</label><input value={newTable.zone} onChange={e => setNewTable({ ...newTable, zone: e.target.value })} placeholder="Salón, Terraza..." /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Capacidad</label><input type="number" value={newTable.capacity} onChange={e => setNewTable({ ...newTable, capacity: e.target.value })} /></div>
            <div className="field"><label>Forma</label>
              <Select value={newTable.shape} onChange={v => setNewTable({ ...newTable, shape: v })} options={[{ value: 'round', label: 'Redonda' }, { value: 'square', label: 'Cuadrada' }]} />
            </div>
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setNewTable(null)}>Cancelar</button>
            <button className="btn" onClick={async () => { try { if (!newTable.number) return toast('Falta el número', 'bad'); await api.post('/tables', newTable); setNewTable(null); loadTables(); toast('Mesa creada', 'ok'); } catch (e) { toast(e.message, 'bad'); } }}>Crear</button></div>
        </Modal>
      )}
    </>
  );

  // --- VISTA: cuenta de una mesa ---
  return (
    <>
      <div className="top">
        <div><h1>Mesa {sel.number} <span className="muted" style={{ fontSize: '.9rem' }}>· {sel.zone || 'Salón'}</span></h1>
          <div className="sub">Abierta hace {elapsed(orders[0]?.openedAt)} · {orders.length} cuenta(s)</div></div>
        <button className="btn ghost" onClick={() => { setSel(null); loadTables(); }}>← Volver al mapa</button>
      </div>

      <div className="grid g2" style={{ alignItems: 'start', gap: 16 }}>
        {/* Catálogo para agregar */}
        <div className="card">
          <input placeholder="Buscar producto..." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 8, maxHeight: 420, overflow: 'auto' }}>
            {filtered.map(p => (
              <div key={p.id} className="card prod" style={{ cursor: 'pointer', padding: 10 }} onClick={() => addItem(p)}>
                <div style={{ fontSize: '.85rem', fontWeight: 500 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: '.8rem' }}>{money(p.price)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cuentas de la mesa */}
        <div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {orders.map(o => (
              <button key={o.id} className={'btn sm ' + (activeOrder === o.id ? '' : 'ghost')} onClick={() => setActiveOrder(o.id)}>{o.label} · {money(o.total)}</button>
            ))}
            <button className="btn ghost sm" onClick={() => addAccount(sel.id)}>＋ Cuenta</button>
          </div>

          {curOrder ? (
            <div className="card">
              <h3 className="serif mb" style={{ fontSize: '1.2rem' }}>{curOrder.label}</h3>
              {curOrder.items.map(it => (
                <div key={it.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                  <span>{it.qty > 1 ? it.qty + '× ' : ''}{it.name}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {money(it.price * it.qty)}
                    {orders.length > 1 && (
                      <select value="" onChange={e => e.target.value && moveItem(it.id, e.target.value)} title="Mover a otra cuenta" style={{ width: 36, padding: '2px' }}>
                        <option value="">⇄</option>
                        {orders.filter(o => o.id !== curOrder.id).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    )}
                    <span className="link" style={{ color: 'var(--bad)' }} onClick={() => delItem(it.id)}>×</span>
                  </span>
                </div>
              ))}
              {!curOrder.items.length && <div className="empty">Cuenta vacía · agrega productos</div>}
              <div className="tot grand" style={{ marginTop: 10 }}><span>Total</span><span>{money(curOrder.total)}</span></div>
              <div className="modal-actions">
                {admin && <button className="btn ghost" style={{ color: 'var(--bad)', marginRight: 'auto' }} onClick={() => setConfirmDel(curOrder)}>Eliminar cuenta</button>}
                <button className="btn" disabled={!curOrder.items.length} onClick={() => setPay({ id: curOrder.id, label: curOrder.label, total: curOrder.total, method: 'efectivo' })}>Cobrar {money(curOrder.total)}</button>
              </div>
            </div>
          ) : <div className="card"><div className="empty">Crea una cuenta para empezar</div></div>}
        </div>
      </div>

      {pay && (
        <Modal title={`Cobrar ${pay.label}`} onClose={() => setPay(null)}>
          <div className="tot grand mb"><span>Total</span><span>{money(pay.total)}</span></div>
          <div className="field"><label>Método de pago</label>
            <select value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })}>
              <option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option>
            </select>
          </div>
          <p className="muted" style={{ fontSize: '.8rem' }}>Se generará un ticket y se descontará el inventario. La venta entra al corte de caja.</p>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setPay(null)}>Cancelar</button><button className="btn" onClick={doCheckout}>Confirmar cobro</button></div>
        </Modal>
      )}

      {confirmDel && (
        <Modal title="Eliminar cuenta" onClose={() => setConfirmDel(null)}>
          <p>¿Eliminar la cuenta <b>{confirmDel.label}</b>?
            {confirmDel.items.length > 0 && <> Tiene <b>{confirmDel.items.length} producto(s)</b> ({money(confirmDel.total)}) que se descartarán sin cobrar.</>}
          </p>
          <p className="muted" style={{ fontSize: '.82rem' }}>Esta acción queda registrada en Auditoría.</p>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setConfirmDel(null)}>Cancelar</button><button className="btn danger" onClick={confirmRemove}>Sí, eliminar</button></div>
        </Modal>
      )}
    </>
  );
}
