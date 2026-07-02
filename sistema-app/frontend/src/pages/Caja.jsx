import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money, downloadExcel } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import { businessName } from '../permissions.js';

const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localISO(new Date());
function byMethod(sales) {
  const m = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  sales.forEach(s => {
    if (s.payments?.length) s.payments.forEach(p => { m[p.method] = (m[p.method] || 0) + p.amount; });
    else m[s.paymentMethod] = (m[s.paymentMethod] || 0) + s.total;
  });
  return m;
}
function methodName(method) {
  return method === 'efectivo' ? 'Efectivo' : method === 'tarjeta' ? 'Tarjeta' : 'Transferencia';
}
// Reimprime un ticket abriendo una ventana de impresión con su contenido
function printTicket(s, cashierName) {
  const f = n => '$' + Math.round(n || 0).toLocaleString('es-MX');
  const method = s.payments?.length
    ? (s.payments.length === 1 ? methodName(s.payments[0].method) : s.payments.map(p => `${methodName(p.method)} ${f(p.amount)}`).join(' · '))
    : methodName(s.paymentMethod);
  const rows = (s.items || []).map(i => `<div class="r"><span>${i.name}${i.qty > 1 ? ' x' + i.qty : ''}</span><span>${i.price ? f(i.price * i.qty) : 'Incluido'}</span></div>`).join('');
  const html = `<html><head><title>Ticket #${s.ticketNo}</title><style>
    body{font-family:system-ui,sans-serif;max-width:300px;margin:0 auto;padding:16px;color:#2F2927}
    .c{text-align:center} .r{display:flex;justify-content:space-between;padding:2px 0;font-size:13px}
    .g{font-weight:700;font-size:16px;border-top:1px solid #000;padding-top:6px;margin-top:6px}
    hr{border:none;border-top:1px dashed #aaa;margin:8px 0}</style></head><body>
    <div class="c"><div style="font-size:20px;letter-spacing:.12em;font-weight:700">${businessName()}</div><div style="font-size:11px;color:#888">Ticket de compra</div></div>
    <hr><div class="r"><span>Ticket</span><span>#${s.ticketNo}</span></div>
    <div class="r"><span>Fecha</span><span>${new Date(s.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
    <div class="r"><span>Cliente</span><span>${s.client?.name || '—'}</span></div>
    <div class="r"><span>Atendido por</span><span>${cashierName || '—'}</span></div>
    <hr>${rows}<hr>
    <div class="r"><span>Subtotal</span><span>${f(s.subtotal)}</span></div>
    ${s.discount > 0 ? `<div class="r"><span>Descuento</span><span>−${f(s.discount)}</span></div>` : ''}
    ${s.pointsDiscount > 0 ? `<div class="r"><span>Puntos canjeados (${s.pointsRedeemed})</span><span>−${f(s.pointsDiscount)}</span></div>` : ''}
    ${s.creditUsed > 0 ? `<div class="r"><span>Saldo aplicado</span><span>−${f(s.creditUsed)}</span></div>` : ''}
    <div class="r g"><span>TOTAL</span><span>${f(s.total)}</span></div>
    <div class="r"><span>Pago</span><span>${method}</span></div>
    <div class="r"><span>Puntos</span><span>+${s.points || 0}</span></div>
    <p class="c" style="font-size:11px;color:#888;margin-top:10px">¡Gracias por tu visita!</p>
    <script>window.onload=()=>{window.print();}</script></body></html>`;
  const w = window.open('', '_blank', 'width=380,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

function saleMethodLabel(sale) {
  if (!sale.payments?.length) return methodName(sale.paymentMethod);
  return sale.payments.length === 1
    ? methodName(sale.payments[0].method)
    : sale.payments.map(p => `${methodName(p.method)} ${money(p.amount)}`).join(' · ');
}

export default function Caja() {
  const { user } = useAuth();
  const admin = user.role === 'admin';

  if (!admin) {
    return (
      <>
        <div className="top"><h1>Caja</h1></div>
        <div className="card"><div className="empty">La apertura de caja y el corte ahora se hacen directamente en <b>Punto de venta</b>. Este módulo de historial es solo para administración.</div></div>
      </>
    );
  }

  return (
    <>
      <div className="top"><div><h1>Caja · Historial y cortes</h1><div className="sub">Acceso de administrador</div></div></div>
      <AdminCaja />
    </>
  );
}

function AdminCaja() {
  const [date, setDate] = useState(today());
  const [sales, setSales] = useState([]);
  const [cuts, setCuts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [openSessions, setOpenSessions] = useState([]);
  const [closing, setClosing] = useState(null); // sesión a forzar corte

  const reloadCuts = () => api.get('/cash/cuts').then(setCuts);
  const reloadSales = () => api.get('/sales?date=' + date).then(setSales);
  const reloadSalidas = () => api.get('/expenses?date=' + date).then(list => setSalidas(list.filter(e => e.category === 'Salida de efectivo'))).catch(() => setSalidas([]));
  const reloadOpen = () => api.get('/cash/open-sessions').then(setOpenSessions).catch(() => setOpenSessions([]));
  useEffect(() => { reloadCuts(); reloadOpen(); api.get('/catalog/staff').then(setStaff); }, []);
  useEffect(() => { reloadSales(); reloadSalidas(); }, [date]); // eslint-disable-line

  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return localISO(d); };
  const refresh = () => { reloadSales(); reloadCuts(); reloadSalidas(); reloadOpen(); };

  async function confirmForceClose() {
    try {
      await api.post('/cash/close/' + closing.id, { countedCash: Number(closing.counted) || 0 });
      toast('Caja cerrada', 'ok'); setClosing(null); reloadOpen(); reloadCuts();
    } catch (e) { toast(e.message, 'bad'); }
  }

  const m = byMethod(sales);
  const total = sales.reduce((a, s) => a + s.total, 0);
  const totalSalidas = salidas.reduce((a, e) => a + e.amount, 0);
  const nameOf = id => staff.find(s => s.id === id)?.name?.split(' ')[0] || '—';
  const itemsLabel = s => (s.items || []).map(i => `${i.name}${i.qty > 1 ? ' x' + i.qty : ''}`).join(', ');
  const itemsByType = (s, t) => (s.items || []).filter(i => i.type === t).map(i => `${i.name}${i.qty > 1 ? ' x' + i.qty : ''}`).join(', ');

  function exportSales() {
    const ventas = [['Fecha', 'Hora', 'Ticket', 'Cliente', 'Teléfono', 'Cajera', 'Servicios', 'Productos', 'Paquetes', 'Detalle', 'Método', 'Subtotal', 'Descuento', 'Saldo aplicado', 'Total', 'Puntos']];
    sales.forEach(s => ventas.push([
      date, new Date(s.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      s.ticketNo, s.client?.name || '', s.client?.phone || '', nameOf(s.cashierId),
      itemsByType(s, 'servicio'), itemsByType(s, 'producto'), itemsByType(s, 'paquete'), itemsLabel(s),
      saleMethodLabel(s), s.subtotal, s.discount, s.creditUsed || 0, s.total, s.points,
    ]));
    // Hoja 2: una fila por artículo (detalle fino)
    const detalle = [['Ticket', 'Cliente', 'Tipo', 'Artículo', 'Cantidad', 'Precio unitario', 'Importe']];
    sales.forEach(s => (s.items || []).forEach(i => detalle.push([s.ticketNo, s.client?.name || '', i.type, i.name, i.qty, i.price, i.price * i.qty])));
    // Hoja 3: salidas de efectivo del día
    const outs = [['Hora', 'Motivo', 'Monto', 'Registró']];
    salidas.forEach(e => outs.push([new Date(e.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), e.note || '', e.amount, nameOf(e.staffId)]));
    downloadExcel('ventas_' + date, [{ name: 'Ventas', rows: ventas }, { name: 'Detalle por artículo', rows: detalle }, { name: 'Salidas de efectivo', rows: outs }]);
  }
  function exportCuts() {
    const rows = [['Fecha y hora', 'Cajera', 'Fondo', 'Efectivo', 'Tarjeta', 'Transferencia', 'Total ventas', 'Tickets', 'Salidas de efectivo', 'Efectivo esperado', 'Contado', 'Diferencia']];
    cuts.forEach(c => rows.push([new Date(c.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }), c.userName, c.fondo, c.byMethod.efectivo, c.byMethod.tarjeta, c.byMethod.transferencia, c.total, c.tickets, c.cashOut || 0, c.esperadoEfectivo, c.countedCash, c.diff]));
    downloadExcel('cortes_caja', [{ name: 'Cortes', rows }]);
  }

  return (
    <>
      <div className="sec-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <span>Administrador · corte e historial</span>
        <div className="row">
          <button className="btn ghost sm" onClick={() => setDate(today())}>Hoy</button>
          <button className="btn ghost sm" onClick={() => setDate(yesterday())}>Ayer</button>
          <DateField style={{ width: 160 }} value={date} onChange={setDate} />
          <button className="btn ghost sm" onClick={refresh}>⟳ Actualizar</button>
          <button className="btn ghost sm" onClick={exportSales}>⬇ Ventas</button>
          <button className="btn ghost sm" onClick={exportCuts}>⬇ Cortes</button>
        </div>
      </div>
      <div className="grid g4 mb">
        <div className="card kpi"><div className="lbl">Efectivo</div><div className="val">{money(m.efectivo)}</div></div>
        <div className="card kpi"><div className="lbl">Tarjeta + transf.</div><div className="val">{money(m.tarjeta + m.transferencia)}</div></div>
        <div className="card kpi"><div className="lbl">Salidas de efectivo</div><div className="val" style={{ color: totalSalidas ? 'var(--bad)' : 'inherit' }}>{money(totalSalidas)}</div></div>
        <div className="card kpi"><div className="lbl">Total ventas {date}</div><div className="val">{money(total)}</div></div>
      </div>

      {openSessions.length > 0 && (
        <>
          <div className="sec-title" style={{ color: 'var(--bad)' }}>⚠ Cajas abiertas (sin cortar)</div>
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table><thead><tr><th>Cajera</th><th>Abierta desde</th><th>Fondo</th><th>Efectivo esperado</th><th>Total ventas</th><th></th></tr></thead><tbody>
              {openSessions.map(s => (
                <tr key={s.id}>
                  <td><b>{s.userName}</b></td>
                  <td className="td-date">{new Date(s.openedAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{money(s.fondo)}</td>
                  <td>{money(s.esperadoEfectivo)}</td>
                  <td>{money(s.total)}</td>
                  <td><button className="btn ghost sm" onClick={() => setClosing({ ...s, counted: Math.round(s.esperadoEfectivo) })}>Forzar corte</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </>
      )}

      <div className="sec-title">Ventas del día</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Ticket</th><th>Cliente</th><th>Cajera</th><th>Método</th><th>Total</th><th></th></tr></thead><tbody>
          {sales.map(s => <tr key={s.id}><td>#{s.ticketNo}</td><td>{s.client?.name}</td><td>{nameOf(s.cashierId)}</td><td><span className="badge">{saleMethodLabel(s)}</span></td><td>{money(s.total)}</td>
            <td><button className="btn ghost sm" title="Reimprimir ticket" onClick={() => printTicket(s, nameOf(s.cashierId))}>🖨</button></td></tr>)}
          {!sales.length && <tr><td colSpan="6" className="empty">Sin ventas</td></tr>}
        </tbody></table>
      </div>

      <div className="sec-title">Salidas de efectivo del día</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Hora</th><th>Motivo</th><th>Registró</th><th>Monto</th></tr></thead><tbody>
          {salidas.map(e => <tr key={e.id}><td className="td-date">{new Date(e.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td><td>{e.note || '—'}</td><td>{nameOf(e.staffId)}</td><td style={{ color: 'var(--bad)' }}>−{money(e.amount)}</td></tr>)}
          {!salidas.length && <tr><td colSpan="4" className="empty">Sin salidas de efectivo</td></tr>}
        </tbody></table>
      </div>

      <div className="sec-title">Cortes guardados</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Fecha / hora</th><th>Cajera</th><th>Total ventas</th><th>Salidas</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody>
          {cuts.map(c => <tr key={c.id}><td className="td-date">{new Date(c.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td><td>{c.userName}</td><td>{money(c.total)}</td><td>{c.cashOut ? '−' + money(c.cashOut) : '—'}</td><td>{money(c.countedCash)}</td><td>{money(c.diff)}</td></tr>)}
          {!cuts.length && <tr><td colSpan="6" className="empty">Aún no hay cortes</td></tr>}
        </tbody></table>
      </div>

      {closing && (
        <Modal title={`Forzar corte · ${closing.userName}`} onClose={() => setClosing(null)}>
          <p className="muted mb">Esta caja quedó abierta desde el {new Date(closing.openedAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}. Al cerrarla se guardará el corte con la diferencia que indiques.</p>
          <div className="tot"><span className="muted">Fondo inicial</span><span>{money(closing.fondo)}</span></div>
          <div className="tot"><span className="muted">Efectivo esperado</span><span>{money(closing.esperadoEfectivo)}</span></div>
          <div className="field" style={{ marginTop: 12 }}><label>Efectivo contado en caja</label>
            <input type="number" value={closing.counted} onChange={e => setClosing({ ...closing, counted: e.target.value })} />
          </div>
          <div className="tot"><span className="muted">Diferencia</span><span style={{ color: (Number(closing.counted) - closing.esperadoEfectivo) < 0 ? 'var(--bad)' : 'var(--ok)' }}>{money((Number(closing.counted) || 0) - closing.esperadoEfectivo)}</span></div>
          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="btn ghost" onClick={() => setClosing(null)}>Cancelar</button>
            <button className="btn" onClick={confirmForceClose}>Cerrar caja</button>
          </div>
        </Modal>
      )}
    </>
  );
}
