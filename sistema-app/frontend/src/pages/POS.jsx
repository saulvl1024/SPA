import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, toast, money } from '../ui.jsx';
import { useAuth } from '../auth.jsx';

export default function POS() {
  const { user } = useAuth();
  const [session, setSession] = useState(undefined); // undefined=cargando, null=sin caja
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [packages, setPackages] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [activePkgs, setActivePkgs] = useState([]);
  const [tab, setTab] = useState('servicio');
  const [cart, setCart] = useState([]);
  const [discPct, setDiscPct] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const [payment, setPayment] = useState('efectivo');
  const [paga, setPaga] = useState(''); // con cuánto paga el cliente (efectivo)
  const [anticipo, setAnticipo] = useState('');
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    api.get('/cash/current').then(setSession).catch(() => setSession(null));
    api.get('/catalog/services').then(setServices);
    api.get('/inventory/products').then(setProducts);
    api.get('/catalog/packages').then(setPackages);
    api.get('/clients').then(c => { setClients(c); if (c[0]) setClientId(c[0].id); });
  }, []);
  useEffect(() => {
    if (clientId) api.get('/packages/active?clientId=' + clientId).then(setActivePkgs); else setActivePkgs([]);
  }, [clientId]);

  const client = clients.find(c => c.id === clientId);
  const sub = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const disc = sub * discPct / 100;
  const creditAvail = client?.credit || 0;
  const creditUsed = useCredit ? Math.min(creditAvail, sub - disc) : 0;
  const total = sub - disc - creditUsed;
  const pts = Math.round(total / 10);
  const pagaNum = parseFloat(paga) || 0;
  const cambio = pagaNum - total;

  function add(type, item) {
    if (type === 'servicio') {
      const cp = activePkgs.find(p => p.serviceId === item.id && p.remaining > 0);
      if (cp) cart.push({ type, refId: item.id, name: item.name, price: 0, qty: 1, sub: 'Paquete · sesión incluida', fromPackage: true, packageId: cp.id });
      else cart.push({ type, refId: item.id, name: item.name, price: item.price, qty: 1, sub: 'Servicio' });
    } else if (type === 'producto') {
      if (item.stock <= 0) return toast('Sin stock', 'bad');
      cart.push({ type, refId: item.id, name: item.name, price: item.price, qty: 1, sub: 'Producto' });
    } else if (type === 'paquete') {
      cart.push({ type, refId: item.id, name: 'Paquete ' + item.name, price: item.price, qty: 1, sub: item.sessions + ' sesiones' });
    } else if (type === 'anticipo') {
      const v = +anticipo || 0; if (v <= 0) return toast('Monto inválido', 'bad');
      cart.push({ type, refId: null, name: 'Anticipo', price: v, qty: 1, sub: 'Saldo a favor' }); setAnticipo('');
    }
    setCart([...cart]);
  }
  const remove = i => { cart.splice(i, 1); setCart([...cart]); };

  async function checkout() {
    try {
      const sale = await api.post('/sales', {
        clientId, sessionId: session.id,
        items: cart.map(i => ({ type: i.type, refId: i.refId, name: i.name, qty: i.qty, price: i.price, fromPackage: i.fromPackage, packageId: i.packageId })),
        discount: disc, useCredit, paymentMethod: payment,
      });
      setTicket({ ...sale, clientName: client.name, cashier: user.name, method: payment, pts, paga: pagaNum, cambio });
      setCart([]); setDiscPct(0); setUseCredit(false); setPaga('');
      api.get('/clients').then(setClients); // refresca saldo/puntos
      toast('Venta cobrada ' + money(total), 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  if (session === undefined) return <div className="top"><h1>Punto de venta</h1></div>;
  if (session === null) return (
    <>
      <div className="top"><h1>Punto de venta</h1></div>
      <div className="card"><div className="empty">No hay caja abierta. Ve a <Link className="link" to="/caja">Caja / Corte</Link> y abre tu caja para poder cobrar.</div></div>
    </>
  );

  const catalog = tab === 'servicio' ? services.map(s => ({ ...s, label: s.name, price: s.price }))
    : tab === 'producto' ? products.map(p => ({ ...p, label: p.name }))
    : tab === 'paquete' ? packages.map(p => ({ ...p, label: 'Paquete ' + p.name })) : [];

  return (
    <>
      <div className="top">
        <div><h1>Punto de venta</h1><div className="sub">Caja abierta · {client ? '' : 'elige un cliente'}</div></div>
        <select style={{ width: 240 }} value={clientId} onChange={e => setClientId(e.target.value)}>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name} · {c.tag}</option>)}
        </select>
      </div>

      <div className="pos">
        <div>
          <div className="tabs">
            {['servicio', 'producto', 'paquete', 'anticipo'].map(t =>
              <div key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}s</div>)}
          </div>
          {tab === 'anticipo' ? (
            <div className="card">
              <p className="muted mb" style={{ fontSize: '.86rem' }}>Pago por adelantado: se guarda como saldo a favor del cliente.</p>
              <div className="field"><label>Monto</label><input type="number" value={anticipo} onChange={e => setAnticipo(e.target.value)} /></div>
              <button className="btn" onClick={() => add('anticipo')}>Agregar anticipo</button>
            </div>
          ) : (
            <div className="grid g3">
              {catalog.map(it => (
                <div key={it.id} className="card prod" onClick={() => add(tab, it)}>
                  <div className="thumb" /><h4>{it.label}</h4><span className="pp">{money(it.price)}</span>
                  {tab === 'producto' && <small className="muted"> · stock {it.stock}</small>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card cart">
          <h2 className="serif mb" style={{ fontSize: '1.25rem' }}>Ticket</h2>
          {cart.length ? cart.map((i, idx) => (
            <div key={idx} className="ci"><div>{i.name}<br /><small className="muted">{i.sub}</small></div>
              <div className="row"><span>{i.price ? money(i.price * i.qty) : 'Incluido'}</span><span className="x" onClick={() => remove(idx)}>×</span></div></div>
          )) : <div className="empty">Carrito vacío</div>}
          <div style={{ marginTop: 12 }}>
            <div className="field" style={{ marginBottom: 8 }}><label>Método de pago</label>
              <select value={payment} onChange={e => setPayment(e.target.value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select></div>
            <div className="field" style={{ marginBottom: 8 }}><label>Descuento %</label><input type="number" value={discPct} onChange={e => setDiscPct(Math.max(0, Math.min(100, +e.target.value || 0)))} /></div>
            <div className="tot"><span className="muted">Subtotal</span><span>{money(sub)}</span></div>
            <div className="tot"><span className="muted">Descuento</span><span>−{money(disc)}</span></div>
            {creditAvail > 0 && <div className="tot"><label className="muted" style={{ display: 'flex', gap: 7, alignItems: 'center', margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={useCredit} onChange={e => setUseCredit(e.target.checked)} /> Saldo a favor ({money(creditAvail)})</label><span>−{money(creditUsed)}</span></div>}
            <div className="tot"><span className="muted">Puntos</span><span>+{pts}</span></div>
            <div className="tot grand"><span>Total</span><span>{money(total)}</span></div>
          </div>
          {payment === 'efectivo' && cart.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--cream)', borderRadius: 12 }}>
              <div className="field" style={{ marginBottom: 8 }}><label>Paga con (efectivo)</label>
                <input type="number" inputMode="decimal" value={paga} placeholder={total} onChange={e => setPaga(e.target.value)} /></div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map(v => <button key={v} className="btn ghost sm" onClick={() => setPaga(String(v))}>{money(v)}</button>)}
              </div>
              <div className="tot grand" style={{ borderColor: 'var(--blush)' }}>
                <span>Cambio</span>
                <span style={{ color: cambio < 0 ? 'var(--bad)' : 'var(--ok)' }}>
                  {cambio < 0 ? 'Faltan ' + money(-cambio) : money(cambio)}
                </span>
              </div>
            </div>
          )}
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            disabled={!cart.length || (payment === 'efectivo' && pagaNum > 0 && cambio < 0)}
            onClick={checkout}>Cobrar {money(total)}</button>
        </div>
      </div>

      {ticket && <TicketModal t={ticket} onClose={() => setTicket(null)} />}
    </>
  );
}

function TicketModal({ t, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div id="ticket-print">
        <div style={{ textAlign: 'center' }}>
          <div className="serif" style={{ fontSize: '1.6rem', letterSpacing: '.3em', fontWeight: 600 }}>SÉRÈN</div>
          <div className="muted" style={{ fontSize: 11 }}>Spa &amp; Wellness</div>
        </div>
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
        <div className="tot"><span>Ticket</span><span>#{t.ticketNo}</span></div>
        <div className="tot"><span>Fecha</span><span>{new Date(t.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
        <div className="tot"><span>Cliente</span><span>{t.clientName}</span></div>
        <div className="tot"><span>Atendido por</span><span>{t.cashier}</span></div>
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
        {t.items.map(i => <div key={i.id} className="tot"><span>{i.name}{i.qty > 1 ? ' x' + i.qty : ''}</span><span>{i.price ? money(i.price * i.qty) : 'Incluido'}</span></div>)}
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
        <div className="tot"><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
        {t.discount > 0 && <div className="tot"><span>Descuento</span><span>−{money(t.discount)}</span></div>}
        {t.creditUsed > 0 && <div className="tot"><span>Saldo aplicado</span><span>−{money(t.creditUsed)}</span></div>}
        <div className="tot grand"><span>TOTAL</span><span>{money(t.total)}</span></div>
        <div className="tot"><span>Pago</span><span>{t.method}</span></div>
        {t.method === 'efectivo' && t.paga > 0 && <>
          <div className="tot"><span>Paga con</span><span>{money(t.paga)}</span></div>
          <div className="tot"><span>Cambio</span><span>{money(t.cambio)}</span></div>
        </>}
        <div className="tot"><span>Puntos ganados</span><span>+{t.points}</span></div>
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11, marginTop: 10 }}>¡Gracias por tu visita!</p>
      </div>
      <div className="modal-actions no-print"><button className="btn ghost" onClick={onClose}>Cerrar</button><button className="btn" onClick={() => window.print()}>🖨 Imprimir</button></div>
    </Modal>
  );
}
