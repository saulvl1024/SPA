import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, toast, money, initials, matches } from '../ui.jsx';
import { useAuth } from '../auth.jsx';
import { businessName, businessLogo, businessInfo, setting } from '../permissions.js';
import Tabs from '../components/Tabs.jsx';
import Select from '../components/Select.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import DateField from '../components/DateField.jsx';

export default function POS() {
  const { user } = useAuth();
  const [session, setSession] = useState(undefined); // undefined=cargando, null=sin caja
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [packages, setPackages] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [clientQ, setClientQ] = useState('');
  const [selClient, setSelClient] = useState(null);
  const [clientOpen, setClientOpen] = useState(false);
  const [activePkgs, setActivePkgs] = useState([]);
  const [tab, setTab] = useState('servicio');
  const [cart, setCart] = useState([]);
  const [discPct, setDiscPct] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const [payments, setPayments] = useState([{ method: 'efectivo', amount: '' }]);
  const [paga, setPaga] = useState(''); // con cuánto paga el cliente (efectivo)
  const [tipMode, setTipMode] = useState('pct'); // 'pct' | 'custom'
  const [tipPct, setTipPct] = useState(0);       // porcentaje de propina
  const [tipCustom, setTipCustom] = useState(''); // monto libre de propina
  const [anticipo, setAnticipo] = useState('');
  const [ticket, setTicket] = useState(null);
  const [tickets, setTickets] = useState(false);  // buscador de tickets anteriores
  const [fondo, setFondo] = useState(1000);     // apertura de caja inline
  const [openPin, setOpenPin] = useState('');   // PIN de la cajera al abrir caja (opcional)
  const [loyalty, setLoyalty] = useState(null); // config de lealtad
  const [variantPick, setVariantPick] = useState(null); // producto cuyas variantes elegir
  const [redeemPts, setRedeemPts] = useState(0); // puntos a canjear en esta venta
  const [corte, setCorte] = useState(false);    // modal de corte
  const [counted, setCounted] = useState(0);
  const [cut, setCut] = useState(null);         // comprobante de corte
  const [cashOut, setCashOut] = useState(null); // modal salida de efectivo {amount, note}
  const [promos, setPromos] = useState([]);
  const [promoId, setPromoId] = useState('');
  const [staff, setStaff] = useState([]);
  const [kdsOrderId, setKdsOrderId] = useState(null); // comanda "para llevar" enviada a cocina
  const [scanCam, setScanCam] = useState(false); // modal de escaneo por cámara
  const [cartOpen, setCartOpen] = useState(false); // cajón/isla del ticket abierto
  const [whName, setWhName] = useState('');      // nombre del almacén del cajero (multi-almacén)
  const usaAlmacenes = setting('usarAlmacenes', false);
  const clientBox = useRef(null);
  const scanBuf = useRef({ text: '', t: 0 });    // buffer del lector USB (teclado)

  // Si multi-almacén está activo, muestra de qué almacén vende este cajero
  useEffect(() => {
    if (!usaAlmacenes) return;
    api.get('/warehouses').then(ws => {
      const mine = ws.find(w => w.id === user.warehouseId) || ws.find(w => w.isDefault) || ws[0];
      setWhName(mine?.name || '');
    }).catch(() => {});
  }, []); // eslint-disable-line

  // Cierra la lista de clientes al hacer clic fuera del buscador
  useEffect(() => {
    const onDocClick = (e) => { if (clientBox.current && !clientBox.current.contains(e.target)) setClientOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    api.get('/cash/current').then(setSession).catch(() => setSession(null));
    api.get('/catalog/services').then(setServices);
    api.get('/inventory/products').then(setProducts);
    api.get('/catalog/packages').then(setPackages);
    api.get('/promotions?active=true&scope=pos').then(setPromos).catch(() => {});
    api.get('/loyalty/config').then(setLoyalty).catch(() => {});
    api.get('/catalog/staff').then(s => setStaff(s.filter(x => x.specialty)));
    api.get('/clients?take=20').then(c => { setClients(c); });
  }, []);
  // Búsqueda de clientes en el servidor (debounce), para escalar a miles
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/clients?take=15' + (clientQ.trim() ? '&q=' + encodeURIComponent(clientQ.trim()) : '')).then(setClients).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [clientQ]);
  useEffect(() => {
    if (clientId) api.get('/packages/active?clientId=' + clientId).then(setActivePkgs); else setActivePkgs([]);
  }, [clientId]);

  const client = selClient && selClient.id === clientId ? selClient : clients.find(c => c.id === clientId);
  const sub = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const promo = promos.find(p => p.id === promoId);
  const promoDisc = promo ? (promo.type === 'percent' ? sub * promo.value / 100 : promo.value) : 0;
  const disc = Math.min(sub, promoDisc + sub * discPct / 100);
  // Canje de puntos (lealtad configurable)
  const redeemValue = loyalty?.redeemValue ?? 0.5;
  const minRedeem = loyalty?.minRedeem ?? 100;
  const clientPts = client?.points || 0;
  const wantRedeemValid = redeemPts >= minRedeem && redeemPts <= clientPts;
  const maxRedeemByMoney = Math.floor((sub - disc) / (redeemValue || 1));
  const redeemedPts = wantRedeemValid ? Math.min(redeemPts, maxRedeemByMoney) : 0;
  const pointsDiscount = redeemedPts * redeemValue;
  const creditAvail = client?.credit || 0;
  const creditUsed = useCredit ? Math.min(creditAvail, sub - disc - pointsDiscount) : 0;
  const total = sub - disc - pointsDiscount - creditUsed;
  const ppc = loyalty?.pointsPerCurrency ?? 0.1;
  const pts = Math.max(0, Math.floor(total * ppc)) - redeemedPts; // neto al saldo
  // Propina: se suma al total a cobrar pero no cuenta como ingreso ni genera puntos
  const tipEnabled = setting('tipEnabled', false);
  const tipAmount = tipEnabled && total > 0 ? Math.max(0, Math.round((tipMode === 'pct'
    ? total * (Number(tipPct) || 0) / 100
    : (Number(tipCustom) || 0)) * 100) / 100) : 0;
  const grandTotal = Math.round((total + tipAmount) * 100) / 100;
  const tipSuggested = Number(setting('tipSuggested', 10)) || 10;
  const tipChips = [0, ...new Set([tipSuggested, 15, 20])].filter((v, i, a) => a.indexOf(v) === i);
  const pagaNum = parseFloat(paga) || 0;
  const paymentTotal = payments.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
  const missing = Math.max(0, grandTotal - paymentTotal);
  const overpaid = Math.max(0, paymentTotal - grandTotal);
  const cashDue = payments.filter(p => p.method === 'efectivo').reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
  const cambio = pagaNum > 0 ? pagaNum - cashDue : 0;
  const canCheckout = grandTotal <= 0 ? cart.length > 0 : cart.length > 0
    && Math.round(paymentTotal * 100) === Math.round(grandTotal * 100)
    && payments.every(p => p.method && (parseFloat(p.amount) || 0) > 0)
    && !(cashDue > 0 && pagaNum > 0 && cambio < 0);

  function methodLabel(method) {
    return method === 'efectivo' ? 'Efectivo' : method === 'tarjeta' ? 'Tarjeta' : 'Transferencia';
  }
  function paymentLabel(list) {
    if (!list?.length) return '—';
    return list.length === 1 ? methodLabel(list[0].method) : list.map(p => `${methodLabel(p.method)} ${money(p.amount)}`).join(' · ');
  }
  function syncSinglePayment(nextTotal) {
    setPayments(p => p.length === 1 ? [{ ...p[0], amount: nextTotal > 0 ? String(Number(nextTotal.toFixed(2))) : '' }] : p);
  }

  function add(type, item) {
    if (type === 'servicio') {
      const defSpec = staff[0]?.id || null; // especialista por defecto (para comisión)
      const cp = activePkgs.find(p => p.serviceId === item.id && p.remaining > 0);
      if (cp) cart.push({ type, refId: item.id, name: item.name, price: 0, qty: 1, sub: 'Paquete · sesión incluida', fromPackage: true, packageId: cp.id, specialistId: defSpec });
      else cart.push({ type, refId: item.id, name: item.name, price: item.price, qty: 1, sub: 'Servicio', specialistId: defSpec });
    } else if (type === 'producto') {
      // Producto con variantes: abrir selector
      if (item.variants?.length > 0) { setVariantPick(item); return; }
      // Bundle: no valida stock propio (lo valida el backend por componentes)
      if (!item.isBundle && item.stock <= 0) return toast('Sin stock', 'bad');
      cart.push({ type, refId: item.id, name: item.name, price: item.price, qty: 1, sub: item.isBundle ? 'Paquete' : 'Producto', image: item.image || null });
    } else if (type === 'variante') {
      cart.push({ type: 'producto', refId: item.productId, variantId: item.id, name: `${item.productName} (${item.name})`, price: item.price != null ? item.price : item.basePrice, qty: 1, sub: 'Variante' });
    } else if (type === 'paquete') {
      cart.push({ type, refId: item.id, name: 'Paquete ' + item.name, price: item.price, qty: 1, sub: item.sessions + ' sesiones' });
    } else if (type === 'anticipo') {
      const v = +anticipo || 0; if (v <= 0) return toast('Monto inválido', 'bad');
      cart.push({ type, refId: null, name: 'Anticipo', price: v, qty: 1, sub: 'Saldo a favor' }); setAnticipo('');
    }
    setCart([...cart]);
  }
  const remove = i => { cart.splice(i, 1); setCart([...cart]); };

  // Procesa un código escaneado (lector USB o cámara): busca el producto y lo agrega.
  async function scanCode(code) {
    const c = String(code || '').trim();
    if (!c) return;
    // 1) Busca primero en los productos ya cargados (rápido, sin red)
    const local = products.find(p => p.barcode === c || (p.variants || []).some(v => v.sku === c));
    if (local) {
      const v = (local.variants || []).find(x => x.sku === c);
      if (v) add('variante', { id: v.id, productId: local.id, productName: local.name, name: v.name, price: v.price, basePrice: local.price });
      else add('producto', local);
      toast('Agregado: ' + local.name, 'ok');
      return;
    }
    // 2) Si no está local, consulta el backend
    try {
      const r = await api.get('/catalog/by-barcode/' + encodeURIComponent(c));
      if (r.type === 'variant') add('variante', { id: r.id, productId: r.productId, productName: r.name, name: '', price: r.price, basePrice: r.price });
      else add('producto', { id: r.id, name: r.name, price: r.price, stock: r.stock, isBundle: false, variants: [] });
      toast('Agregado: ' + r.name, 'ok');
    } catch {
      toast('Código no encontrado: ' + c, 'bad');
    }
  }

  // Lector USB tipo pistola: escribe el código muy rápido y termina con Enter.
  // Capturamos la ráfaga de teclas globalmente (salvo cuando se escribe en un input).
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (typing) return; // no interferir con la escritura normal
      const now = Date.now();
      // Si pasó mucho tiempo desde la última tecla, reinicia el buffer
      if (now - scanBuf.current.t > 80) scanBuf.current.text = '';
      scanBuf.current.t = now;
      if (e.key === 'Enter') {
        const code = scanBuf.current.text;
        scanBuf.current.text = '';
        if (code.length >= 4) { e.preventDefault(); scanCode(code); }
        return;
      }
      if (e.key.length === 1) scanBuf.current.text += e.key; // acumula caracteres imprimibles
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // sin deps: usa siempre el estado/productos actuales

  // ¿El item del carrito es un platillo que va a cocina/barra? (según el catálogo)
  const stationOf = it => {
    if (it.type !== 'producto') return 'ninguna';
    const p = products.find(x => x.id === it.refId);
    return p?.station || 'ninguna';
  };
  const kdsItems = cart.filter(it => { const s = stationOf(it); return s === 'cocina' || s === 'barra'; });
  const kdsEnabled = setting('usarCocina', false);

  // Enviar los platillos del carrito a la pantalla de Cocina (comanda "para llevar")
  async function sendToKitchen() {
    if (!kdsItems.length) return toast('No hay platillos de cocina/barra en el ticket', 'bad');
    try {
      const payload = kdsItems.map(i => ({ refId: i.refId, variantId: i.variantId || null, name: i.name, qty: i.qty, note: i.note || null }));
      const r = await api.post('/kitchen/takeaway', { items: payload, label: client ? client.name : 'Para llevar', orderId: kdsOrderId });
      if (r.sent > 0) { setKdsOrderId(r.orderId); toast(`Enviado a cocina · ${r.sent} platillo(s)`, 'ok'); }
      else toast('No hay platillos para cocina', 'bad');
    } catch (e) { toast(e.message, 'bad'); }
  }
  const updatePayment = (idx, patch) => setPayments(payments.map((p, i) => i === idx ? { ...p, ...patch } : p));
  function addPayment() {
    const methods = ['efectivo', 'tarjeta', 'transferencia'];
    const next = methods.find(m => !payments.some(p => p.method === m));
    if (!next || payments.length >= 3) return;
    setPayments([...payments, { method: next, amount: missing ? String(Number(missing.toFixed(2))) : '' }]);
  }
  function removePayment(idx) {
    const next = payments.filter((_, i) => i !== idx);
    setPayments(next.length ? next : [{ method: 'efectivo', amount: total > 0 ? String(Number(total.toFixed(2))) : '' }]);
  }

  async function checkout() {
    try {
      const cleanPayments = grandTotal > 0 ? payments.map(p => ({ method: p.method, amount: parseFloat(p.amount) || 0 })) : [];
      const sale = await api.post('/sales', {
        clientId, sessionId: session.id,
        items: cart.map(i => ({ type: i.type, refId: i.refId, name: i.name, qty: i.qty, price: i.price, fromPackage: i.fromPackage, packageId: i.packageId, specialistId: i.specialistId || null })),
        discount: disc, useCredit, redeemPoints: redeemedPts, tip: tipAmount, paymentMethod: cleanPayments[0]?.method || 'efectivo', payments: cleanPayments,
      });
      // Si se mandó comanda a cocina (para llevar), ciérrala al cobrar
      if (kdsOrderId) { api.post(`/kitchen/takeaway/${kdsOrderId}/close`, { saleId: sale.id }).catch(() => {}); setKdsOrderId(null); }
      setTicket({ ...sale, clientName: client?.name || sale.client?.name || 'Mostrador', cashier: user.name, method: paymentLabel(sale.payments?.length ? sale.payments : cleanPayments), pts, tip: tipAmount, paga: pagaNum, cambio, cashDue });
      setCart([]); setDiscPct(0); setUseCredit(false); setPaga(''); setPromoId(''); setRedeemPts(0); setTipPct(0); setTipCustom(''); setTipMode('pct');
      setPayments([{ method: 'efectivo', amount: '' }]);
      // Refresca datos en vivo tras la venta: clientes (saldo/puntos), productos (stock) y la caja (totales del corte)
      api.get('/clients').then(setClients);
      api.get('/inventory/products').then(setProducts);
      api.get('/cash/current').then(setSession);
      if (clientId) api.get('/packages/active?clientId=' + clientId).then(setActivePkgs);
      toast('Venta cobrada ' + money(total), 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  useEffect(() => { syncSinglePayment(grandTotal); }, [grandTotal]);

  async function openCaja() {
    try {
      let cashierId;
      // Si se escribió un PIN, identifica a la cajera (mostrador compartido)
      if (openPin && openPin.trim()) {
        const cajera = await api.post('/auth/pin', { pin: openPin.trim() });
        cashierId = cajera.id;
      }
      const s = await api.post('/cash/open', { fondo: +fondo, cashierId });
      const cur = await api.get('/cash/current');
      setSession(cur || s);
      setOpenPin('');
      toast(s.alreadyOpen ? 'Ya había una caja abierta' : 'Caja abierta', s.alreadyOpen ? 'bad' : 'ok');
    }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function doCorte() {
    try { const c = await api.post('/cash/close', { countedCash: +counted }); setCorte(false); setCut(c); setSession(null); toast('Corte realizado · caja cerrada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function refreshSession() { const cur = await api.get('/cash/current'); setSession(cur); }
  async function doCashOut() {
    try {
      if (!(+cashOut.amount > 0)) return toast('Monto inválido', 'bad');
      if (!cashOut.note) return toast('Indica el motivo', 'bad');
      await api.post('/expenses/cash-out', { amount: +cashOut.amount, note: cashOut.note });
      setCashOut(null); await refreshSession(); toast('Salida de efectivo registrada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  if (session === undefined) return <div className="top"><h1>Punto de venta</h1></div>;

  // Sin caja abierta → abrir aquí mismo (sin ir a otro módulo)
  if (session === null) return (
    <>
      <div className="top"><div><h1>Punto de venta</h1><div className="sub">Cajero en turno: <b>{user?.name}</b></div></div></div>
      <div className="card" style={{ maxWidth: 400 }}>
        <h3 className="serif mb" style={{ fontSize: '1.3rem' }}>Abrir caja</h3>
        <p className="muted mb">Para empezar a cobrar, abre tu caja indicando el efectivo inicial (fondo).</p>
        <div className="field"><label>Fondo inicial (efectivo)</label><input type="number" value={fondo} onChange={e => setFondo(e.target.value)} /></div>
        <div className="field"><label>PIN de la cajera (opcional)</label>
          <input inputMode="numeric" maxLength={6} value={openPin} placeholder="déjalo vacío para usar tu sesión" onChange={e => setOpenPin(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && openCaja()} />
          <p className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>Si varias cajeras comparten esta computadora, escribe el PIN para registrar quién abre la caja.</p>
        </div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={openCaja}>Abrir caja</button>
      </div>
      {cut && <CorteModal cut={cut} onClose={() => setCut(null)} />}
    </>
  );

  const catalog = tab === 'servicio' ? services.map(s => ({ ...s, label: s.name, price: s.price }))
    : tab === 'producto' ? products.map(p => ({ ...p, label: p.name }))
    : tab === 'paquete' ? packages.map(p => ({ ...p, label: 'Paquete ' + p.name })) : [];

  return (
    <>
      <div className="top">
        <div>
          <h1>Punto de venta</h1>
          <div className="sub">Cajero en turno: <b>{user?.name}</b>{usaAlmacenes && whName ? <> · Almacén: <b>{whName}</b></> : ''} · {client ? 'Cliente: ' + client.name : 'elige un cliente'}</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost" onClick={() => setScanCam(true)} title="Escanear con la cámara">⌷ Escanear</button>
          <button className="btn ghost" onClick={() => setTickets(true)}>Tickets</button>
          <button className="btn ghost" onClick={() => setCashOut({ amount: '', note: '' })}>Salida de efectivo</button>
          <button className="btn ghost" onClick={() => { setCounted(session.summary?.esperadoEfectivo || 0); setCorte(true); }}>Corte de caja</button>
          <div ref={clientBox} style={{ position: 'relative', width: 260 }}>
          <input placeholder={client ? client.name : 'Buscar cliente...'} value={clientQ}
            onChange={e => { setClientQ(e.target.value); setClientOpen(true); }}
            onFocus={() => setClientOpen(true)} />
          {clientOpen && (
            <div className="card" style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 30, padding: 6, maxHeight: 280, overflow: 'auto' }}>
              {clients.map(c => (
                <div key={c.id} className="navi" onClick={() => { setClientId(c.id); setSelClient(c); setClientQ(''); setClientOpen(false); }}>
                  {c.name} <span className="muted">· {c.tag}</span>
                </div>
              ))}
              {!clients.length && <div className="muted" style={{ padding: 8 }}>Sin resultados</div>}
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="pos">
        <div>
          <Tabs value={tab} onChange={setTab}
            tabs={['servicio', 'producto', 'paquete', 'anticipo'].map(t => [t, t[0].toUpperCase() + t.slice(1) + 's'])} />
          {tab === 'anticipo' ? (
            <div className="card">
              <p className="muted mb" style={{ fontSize: '.86rem' }}>Pago por adelantado: se guarda como saldo a favor del cliente.</p>
              <div className="field"><label>Monto</label><input type="number" value={anticipo} onChange={e => setAnticipo(e.target.value)} /></div>
              <button className="btn" onClick={() => add('anticipo')}>Agregar anticipo</button>
            </div>
          ) : (
            <div className="grid g3">
              {catalog.map(it => {
                const out = tab === 'producto' && !it.isBundle && it.stock <= 0;
                return (
                  <div key={it.id} className={'card prod' + (out ? ' prod-out' : '')} onClick={() => add(tab, it)}>
                    <div className="thumb">
                      {it.image
                        ? <img src={it.image} alt="" loading="lazy" decoding="async" />
                        : <span>{initials(it.label.replace(/^Paquete /, ''))}</span>}
                    </div>
                    <h4>{it.label}</h4>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span className="pp">{money(it.price)}</span>
                      {tab === 'producto' && <small className={out ? 'bad-text' : 'muted'} style={{ fontSize: '.72rem' }}>{out ? 'Sin stock' : 'stock ' + it.stock}</small>}
                    </div>
                  </div>
                );
              })}
              {!catalog.length && <div className="empty" style={{ gridColumn: '1/-1' }}>No hay {tab}s en el catálogo</div>}
            </div>
          )}
        </div>

        {cartOpen && <div className="cart-backdrop" onClick={() => setCartOpen(false)} />}
        <div className={'card cart' + (cartOpen ? ' cart-open' : '')}>
          {/* Asa: resumen tocable (total) + Cobrar, siempre visible; abre el cajón/isla */}
          <div className="cart-handle">
            <button type="button" className="cart-handle-tap" onClick={() => setCartOpen(o => !o)}>
              <span className="cart-handle-grip" aria-hidden="true" />
              <div className="cart-handle-info">
                <span className="cart-handle-count">{cart.length} {cart.length === 1 ? 'artículo' : 'artículos'}</span>
                <span className="cart-handle-total">{money(total)}</span>
              </div>
              <svg className="cart-handle-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button className="btn btn-pay cart-handle-pay" disabled={!canCheckout} onClick={checkout}>Cobrar</button>
          </div>
          <h2 className="serif mb cart-title" style={{ fontSize: '1.25rem' }}>Ticket</h2>
          {cart.length ? cart.map((i, idx) => (
            <div key={idx} className="ci">
              {i.image && <img className="ci-img" src={i.image} alt="" loading="lazy" />}
              <div style={{ flex: 1 }}>{i.name}<br /><small className="muted">{i.sub}</small>
              {i.type === 'servicio' && staff.length > 0 && (
                <Select style={{ marginTop: 6 }} value={i.specialistId || ''} placeholder="Especialista (comisión)..."
                  onChange={v => { cart[idx].specialistId = v || null; setCart([...cart]); }}
                  options={[{ value: '', label: 'Sin especialista' }, ...staff.map(s => ({ value: s.id, label: s.name }))]} />
              )}
            </div>
              <div className="row"><span>{i.price ? money(i.price * i.qty) : 'Incluido'}</span><span className="x" onClick={() => remove(idx)}>×</span></div></div>
          )) : (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .6 }}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
              <div style={{ fontSize: '.86rem', marginTop: 8 }}>Agrega productos para iniciar la venta</div>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Pagos</label>
              {payments.map((p, idx) => (
                <div className="pay-row" key={idx}>
                  <Select value={p.method} onChange={v => updatePayment(idx, { method: v })}
                    options={['efectivo', 'tarjeta', 'transferencia'].map(m => ({ value: m, label: methodLabel(m), disabled: payments.some((x, i) => i !== idx && x.method === m) }))} />
                  <input type="number" inputMode="decimal" value={p.amount} placeholder="0.00" onChange={e => updatePayment(idx, { amount: e.target.value })} />
                  {payments.length > 1 && <button className="mini-x" type="button" onClick={() => removePayment(idx)}>×</button>}
                </div>
              ))}
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <button className="btn ghost sm" type="button" disabled={payments.length >= 3 || !cart.length || total <= 0} onClick={addPayment}>+ Agregar método</button>
                <span className="muted" style={{ fontSize: '.78rem' }}>{missing ? 'Falta ' + money(missing) : overpaid ? 'Sobra ' + money(overpaid) : 'Pagado completo'}</span>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 8 }}><label>Promoción / cupón</label>
              <Select value={promoId} onChange={setPromoId} placeholder="Sin promoción"
                options={[{ value: '', label: 'Sin promoción' }, ...promos.map(p => ({ value: p.id, label: `${p.code} · ${p.name} (${p.type === 'percent' ? p.value + '%' : money(p.value)})` }))]} />
            </div>
            <div className="field" style={{ marginBottom: 8 }}><label>Descuento manual %</label><input type="number" value={discPct || ''} placeholder="0" onChange={e => { const v = e.target.value; setDiscPct(v === '' ? 0 : Math.max(0, Math.min(100, +v || 0))); }} /></div>
            <div className="tot"><span className="muted">Subtotal</span><span>{money(sub)}</span></div>
            <div className="tot"><span className="muted">Descuento{promo ? ' (' + promo.code + ')' : ''}</span><span>−{money(disc)}</span></div>
            {creditAvail > 0 && <div className="tot"><label className="muted" style={{ display: 'flex', gap: 7, alignItems: 'center', margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={useCredit} onChange={e => setUseCredit(e.target.checked)} /> Saldo a favor ({money(creditAvail)})</label><span>−{money(creditUsed)}</span></div>}
            {loyalty?.enabled && client && (
              <div className="tot" style={{ alignItems: 'center' }}>
                <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, flexWrap: 'wrap' }}>
                  Puntos del cliente: <b style={{ color: 'var(--ink)' }}>{clientPts.toLocaleString()}</b>
                  {clientPts >= minRedeem ? (
                    <>
                      <span style={{ fontSize: '.75rem' }}>· canjear (c/u = {money(redeemValue)}):</span>
                      <input type="number" min="0" max={clientPts} value={redeemPts || ''} placeholder="0" onChange={e => setRedeemPts(Math.max(0, Math.min(clientPts, +e.target.value || 0)))} style={{ width: 70, padding: '3px 6px' }} />
                      {redeemedPts > 0 && <span className="link" onClick={() => setRedeemPts(0)}>quitar</span>}
                    </>
                  ) : (
                    <span style={{ fontSize: '.74rem' }}>· necesita {minRedeem} para canjear</span>
                  )}
                </label>
                <span>{pointsDiscount > 0 ? '−' + money(pointsDiscount) : ''}</span>
              </div>
            )}
            <div className="tot"><span className="muted">Puntos {redeemedPts > 0 ? '(neto)' : 'a ganar'}</span><span>{pts >= 0 ? '+' : ''}{pts}</span></div>
            {tipEnabled && total > 0 && (
              <div className="tot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                  <span className="muted">Propina</span>
                  <b>{tipAmount > 0 ? '+' + money(tipAmount) : money(0)}</b>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: 0 }}>
                  {tipChips.map(p => (
                    <button key={p} type="button"
                      className={'btn sm ' + (tipMode === 'pct' && Number(tipPct) === p ? '' : 'ghost')}
                      onClick={() => { setTipMode('pct'); setTipPct(p); setTipCustom(''); }}>
                      {p === 0 ? 'Sin propina' : p + '%'}
                    </button>
                  ))}
                  <input type="number" min="0" inputMode="decimal" placeholder="Otro $"
                    value={tipMode === 'custom' ? tipCustom : ''}
                    onChange={e => { setTipMode('custom'); setTipCustom(e.target.value); setTipPct(0); }}
                    style={{ width: 90, padding: '4px 8px' }} />
                </div>
              </div>
            )}
            {tipAmount > 0 && <div className="tot"><span className="muted">Subtotal</span><span>{money(total)}</span></div>}
            <div className="tot grand"><span>{tipAmount > 0 ? 'Total a cobrar' : 'Total'}</span><span>{money(grandTotal)}</span></div>
          </div>
          {cashDue > 0 && cart.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--cream)', borderRadius: 12 }}>
              <div className="field" style={{ marginBottom: 8 }}><label>Paga con (efectivo)</label>
                <input type="number" inputMode="decimal" value={paga} placeholder={cashDue} onChange={e => setPaga(e.target.value)} /></div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[cashDue, Math.ceil(cashDue / 50) * 50, Math.ceil(cashDue / 100) * 100, Math.ceil(cashDue / 500) * 500]
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
          {kdsEnabled && kdsItems.length > 0 && (
            <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
              onClick={sendToKitchen}>
              {kdsOrderId ? 'Enviar nuevos platillos a cocina' : `Enviar a cocina (${kdsItems.length})`}
            </button>
          )}
          {kdsOrderId && <div className="muted" style={{ fontSize: '.78rem', textAlign: 'center', marginTop: 6 }}>Comanda enviada a la pantalla de cocina · se cerrará al cobrar</div>}
          <button className="btn btn-pay" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            disabled={!canCheckout}
            onClick={checkout}>Cobrar · {money(grandTotal)}</button>
        </div>
      </div>

      {ticket && <TicketModal t={ticket} onClose={() => setTicket(null)} />}
      {tickets && <TicketsBrowser onClose={() => setTickets(false)} onPick={t => { setTickets(false); setTicket(t); }} nameOf={id => staff.find(s => s.id === id)?.name} />}
      {scanCam && <BarcodeScanner onDetected={code => scanCode(code)} onClose={() => setScanCam(false)} />}
      {variantPick && (
        <Modal title={'Elige variante · ' + variantPick.name} onClose={() => setVariantPick(null)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {variantPick.variants.map(v => (
              <button key={v.id} className="btn ghost" disabled={v.stock <= 0}
                style={{ justifyContent: 'space-between', opacity: v.stock <= 0 ? 0.5 : 1 }}
                onClick={() => { add('variante', { ...v, productId: variantPick.id, productName: variantPick.name, basePrice: variantPick.price }); setVariantPick(null); }}>
                <span>{v.name}</span>
                <span>{money(v.price != null ? v.price : variantPick.price)} · stock {v.stock}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {corte && session?.summary && (
        <Modal title="Corte de caja" onClose={() => setCorte(false)}>
          <div className="tot"><span className="muted">Fondo inicial</span><span>{money(session.fondo)}</span></div>
          <div className="tot"><span className="muted">Efectivo</span><span>{money(session.summary.byMethod.efectivo)}</span></div>
          <div className="tot"><span className="muted">Tarjeta</span><span>{money(session.summary.byMethod.tarjeta)}</span></div>
          <div className="tot"><span className="muted">Transferencia</span><span>{money(session.summary.byMethod.transferencia)}</span></div>
          <div className="tot grand"><span>Total ventas</span><span>{money(session.summary.total)}</span></div>
          {session.summary.cashOut > 0 && <div className="tot"><span className="muted">Salidas de efectivo</span><span>−{money(session.summary.cashOut)}</span></div>}
          <div className="field" style={{ marginTop: 12 }}><label>Efectivo esperado {money(session.summary.esperadoEfectivo)} — Efectivo contado</label><input type="number" value={counted} onChange={e => setCounted(e.target.value)} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setCorte(false)}>Cancelar</button><button className="btn" onClick={doCorte}>Confirmar y cerrar caja</button></div>
        </Modal>
      )}

      {cashOut && (
        <Modal title="Salida de efectivo" onClose={() => setCashOut(null)}>
          <p className="muted mb" style={{ fontSize: '.86rem' }}>Registra dinero que sale de la caja (compra, pago, retiro). Se resta del efectivo esperado en el corte.</p>
          <div className="field"><label>Monto *</label><input type="number" value={cashOut.amount} onChange={e => setCashOut({ ...cashOut, amount: e.target.value })} /></div>
          <div className="field"><label>Motivo *</label><input value={cashOut.note} placeholder="Ej. Compra de toallas" onChange={e => setCashOut({ ...cashOut, note: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setCashOut(null)}>Cancelar</button><button className="btn" onClick={doCashOut}>Registrar salida</button></div>
        </Modal>
      )}

      {cut && <CorteModal cut={cut} onClose={() => setCut(null)} />}
    </>
  );
}

function CorteModal({ cut, onClose }) {
  return (
    <Modal title="Corte realizado" onClose={onClose}>
      <div id="ticket-print">
        <div style={{ textAlign: 'center' }}>
          <div className="serif" style={{ fontSize: '1.5rem', letterSpacing: '.15em', fontWeight: 600 }}>{businessName()}</div>
          <div className="muted" style={{ fontSize: 11 }}>Corte de caja</div>
        </div>
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
        <div className="tot"><span>Cajera</span><span>{cut.userName}</span></div>
        <div className="tot"><span>Fondo</span><span>{money(cut.fondo)}</span></div>
        <div className="tot"><span>Efectivo</span><span>{money(cut.byMethod.efectivo)}</span></div>
        <div className="tot"><span>Tarjeta</span><span>{money(cut.byMethod.tarjeta)}</span></div>
        <div className="tot"><span>Transferencia</span><span>{money(cut.byMethod.transferencia)}</span></div>
        <div className="tot grand"><span>Total ventas</span><span>{money(cut.total)}</span></div>
        {cut.cashOut > 0 && <div className="tot"><span>Salidas de efectivo</span><span>−{money(cut.cashOut)}</span></div>}
        <div className="tot"><span>Tickets</span><span>{cut.tickets}</span></div>
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
        <div className="tot"><span>Efectivo esperado</span><span>{money(cut.esperadoEfectivo)}</span></div>
        <div className="tot"><span>Contado</span><span>{money(cut.countedCash)}</span></div>
        <div className="tot grand"><span>Diferencia</span><span>{money(cut.diff)}</span></div>
      </div>
      <div className="modal-actions no-print"><button className="btn ghost" onClick={onClose}>Cerrar</button><button className="btn" onClick={() => window.print()}>Imprimir</button></div>
    </Modal>
  );
}

function TicketModal({ t, onClose }) {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  const requirePin = setting('pinCancelSale', false);   // ¿el negocio exige PIN de gerente para cancelar?
  const [voiding, setVoiding] = useState(false);   // mostrando el campo de motivo
  const [reason, setReason] = useState('');
  const [mgrPin, setMgrPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [voided, setVoided] = useState(t.voided);

  async function doVoid() {
    if (!reason.trim()) return toast('Indica el motivo', 'bad');
    if (requirePin && !mgrPin.trim()) return toast('Ingresa el PIN de un gerente', 'bad');
    setBusy(true);
    try {
      await api.post(`/sales/${t.id}/void`, { reason: reason.trim(), managerPin: mgrPin.trim() });
      setVoided(true); setVoiding(false); setMgrPin('');
      toast('Ticket cancelado · producto devuelto a stock', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose}>
      <div id="ticket-print">
        {voided && <div className="ticket-voided">CANCELADO{t.voidReason ? ' · ' + t.voidReason : ''}</div>}
        <div style={{ textAlign: 'center' }}>
          {businessLogo() && <img className="doc-logo" src={businessLogo()} alt="Logo" />}
          <div className="serif" style={{ fontSize: '1.6rem', letterSpacing: '.12em', fontWeight: 600 }}>{businessName()}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Ticket de compra</div>
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
        {t.pointsDiscount > 0 && <div className="tot"><span>Puntos canjeados ({t.pointsRedeemed})</span><span>−{money(t.pointsDiscount)}</span></div>}
        {t.creditUsed > 0 && <div className="tot"><span>Saldo aplicado</span><span>−{money(t.creditUsed)}</span></div>}
        {t.tip > 0 && <div className="tot"><span>Propina</span><span>+{money(t.tip)}</span></div>}
        <div className="tot grand"><span>TOTAL</span><span>{money(t.total)}</span></div>
        <div className="tot"><span>Pago</span><span>{t.method}</span></div>
        {t.cashDue > 0 && t.paga > 0 && <>
          <div className="tot"><span>Paga con</span><span>{money(t.paga)}</span></div>
          <div className="tot"><span>Cambio</span><span>{money(t.cambio)}</span></div>
        </>}
        <div className="tot"><span>Puntos ganados</span><span>+{t.points}</span></div>
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11, marginTop: 10 }}>{businessInfo().ticketFooter || '¡Gracias por tu visita!'}</p>
        {(() => { const b = businessInfo(); return (b.address || b.phone || b.rfc) ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 10, marginTop: 8, lineHeight: 1.5, borderTop: '1px dashed #ccc', paddingTop: 8 }}>
            {b.address && <div>{b.address}</div>}
            {(b.phone || b.rfc) && <div>{[b.phone && `Tel. ${b.phone}`, b.rfc && `RFC ${b.rfc}`].filter(Boolean).join(' · ')}</div>}
          </div>
        ) : null; })()}
      </div>
      {/* Cancelación / devolución */}
      {voiding && !voided && (
        <div className="no-print" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 8 }}>
          <div className="field"><label>Motivo de la cancelación / devolución *</label>
            <input value={reason} placeholder="Ej. Cobro erróneo, devolución del cliente..." onChange={e => setReason(e.target.value)} autoFocus /></div>
          {requirePin && (
            <div className="field"><label>PIN de gerente *</label>
              <input type="password" inputMode="numeric" value={mgrPin} placeholder="Autorización de un gerente" onChange={e => setMgrPin(e.target.value.replace(/\D/g, ''))} />
              <span className="muted" style={{ fontSize: '.74rem' }}>Un administrador debe autorizar esta cancelación con su PIN.</span>
            </div>
          )}
          <p className="muted" style={{ fontSize: '.74rem', marginTop: -4 }}>El producto regresará al stock y quedará registrado en Auditoría.</p>
        </div>
      )}
      <div className="modal-actions no-print">
        {(isAdmin || requirePin) && !voided && !voiding && <button className="btn ghost" style={{ color: 'var(--bad)', marginRight: 'auto' }} onClick={() => setVoiding(true)}>Cancelar venta</button>}
        {voiding && !voided && <button className="btn ghost" onClick={() => setVoiding(false)}>Atrás</button>}
        {voiding && !voided && <button className="btn" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} disabled={busy} onClick={doVoid}>{busy ? 'Cancelando…' : 'Confirmar cancelación'}</button>}
        {!voiding && <button className="btn ghost" onClick={onClose}>Cerrar</button>}
        {!voiding && !voided && <button className="btn" onClick={() => window.print()}>Imprimir</button>}
      </div>
    </Modal>
  );
}

// Buscador de tickets anteriores para reimprimir
function TicketsBrowser({ onClose, onPick, nameOf }) {
  const [sales, setSales] = useState([]);
  const [q, setQ] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => { api.get('/sales?date=' + date).then(setSales).catch(() => setSales([])); }, [date]);

  const filtered = sales.filter(s => {
    if (!q.trim()) return true;
    return ('#' + s.ticketNo).includes(q.trim()) || matches(s.client?.name || '', q);
  });

  // Reconstruye el objeto que espera TicketModal desde una venta histórica
  function toTicket(s) {
    const methodLabel = s.payments?.length
      ? (s.payments.length === 1 ? s.payments[0].method : s.payments.map(p => `${p.method} ${money(p.amount)}`).join(' · '))
      : s.paymentMethod;
    return {
      id: s.id, ticketNo: s.ticketNo, date: s.date, clientName: s.client?.name || '—',
      cashier: nameOf(s.cashierId) || '—', items: s.items || [],
      subtotal: s.subtotal, discount: s.discount, creditUsed: s.creditUsed,
      pointsRedeemed: s.pointsRedeemed, pointsDiscount: s.pointsDiscount,
      total: s.total, method: methodLabel, points: s.points, cashDue: 0, paga: 0, cambio: 0,
      voided: s.voided, voidReason: s.voidReason,
    };
  }

  return (
    <Modal title="Tickets anteriores" onClose={onClose} width={760}>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <div style={{ width: 180 }}><DateField value={date} onChange={setDate} /></div>
        <input placeholder="Buscar por # ticket o cliente..." value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="card" style={{ padding: 0, maxHeight: 460, overflow: 'auto' }}>
        <table style={{ width: '100%' }}>
          <thead><tr><th>#</th><th>Hora</th><th>Cliente</th><th>Total</th><th></th></tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{ opacity: s.voided ? 0.5 : 1 }}>
                <td>#{s.ticketNo}{s.voided && <span className="badge" style={{ marginLeft: 6, background: 'var(--bad)', color: '#fff', fontSize: '.58rem' }}>cancelado</span>}</td>
                <td className="muted">{new Date(s.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{s.client?.name || '—'}</td>
                <td style={{ textDecoration: s.voided ? 'line-through' : 'none' }}>{money(s.total)}</td>
                <td><button className="btn sm" onClick={() => onPick(toTicket(s))}>Ver / imprimir</button></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan="5" className="empty">Sin tickets ese día</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
