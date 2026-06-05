import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money, downloadExcel } from '../ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
function byMethod(sales) {
  const m = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  sales.forEach(s => { m[s.paymentMethod] = (m[s.paymentMethod] || 0) + s.total; });
  return m;
}

export default function Caja() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [session, setSession] = useState(undefined);
  const [fondo, setFondo] = useState(1000);
  const [corte, setCorte] = useState(false);
  const [counted, setCounted] = useState(0);
  const [cut, setCut] = useState(null);

  const loadSession = () => api.get('/cash/current').then(setSession);
  useEffect(() => { loadSession(); }, []);

  async function open() { try { await api.post('/cash/open', { fondo: +fondo }); loadSession(); toast('Caja abierta', 'ok'); } catch (e) { toast(e.message, 'bad'); } }
  async function doClose() {
    try { const c = await api.post('/cash/close', { countedCash: +counted }); setCorte(false); setCut(c); setSession(null); toast('Corte realizado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <div className="top"><h1>Caja / Corte</h1><div className="sub">{user.name}</div></div>

      {session === null && (
        <div className="card" style={{ maxWidth: 380 }}>
          <h3 className="serif mb">Abrir caja</h3>
          <div className="field"><label>Fondo inicial (efectivo)</label><input type="number" value={fondo} onChange={e => setFondo(e.target.value)} /></div>
          <button className="btn" onClick={open}>Abrir caja</button>
        </div>
      )}

      {session && session.id && (
        <>
          <div className="grid g4 mb">
            <div className="card kpi"><div className="lbl">Fondo</div><div className="val">{money(session.fondo)}</div></div>
            <div className="card kpi"><div className="lbl">Efectivo</div><div className="val">{money(session.summary.byMethod.efectivo)}</div></div>
            <div className="card kpi"><div className="lbl">Tarjeta + transf.</div><div className="val">{money(session.summary.byMethod.tarjeta + session.summary.byMethod.transferencia)}</div></div>
            <div className="card kpi"><div className="lbl">Total turno</div><div className="val">{money(session.summary.total)}</div></div>
          </div>
          <button className="btn" onClick={() => { setCounted(session.summary.esperadoEfectivo); setCorte(true); }}>Hacer corte de caja</button>
          <p className="muted" style={{ marginTop: 10 }}>{session.summary.tickets} tickets en este turno. El corte cierra la caja y guarda el resumen.</p>
        </>
      )}

      {admin && <AdminCaja />}

      {corte && session && (
        <Modal title="Corte de caja" onClose={() => setCorte(false)}>
          <div className="tot"><span className="muted">Fondo</span><span>{money(session.fondo)}</span></div>
          <div className="tot"><span className="muted">Efectivo</span><span>{money(session.summary.byMethod.efectivo)}</span></div>
          <div className="tot"><span className="muted">Tarjeta</span><span>{money(session.summary.byMethod.tarjeta)}</span></div>
          <div className="tot"><span className="muted">Transferencia</span><span>{money(session.summary.byMethod.transferencia)}</span></div>
          <div className="tot grand"><span>Total</span><span>{money(session.summary.total)}</span></div>
          <div className="field" style={{ marginTop: 12 }}><label>Efectivo esperado {money(session.summary.esperadoEfectivo)} — Efectivo contado</label><input type="number" value={counted} onChange={e => setCounted(e.target.value)} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setCorte(false)}>Cancelar</button><button className="btn" onClick={doClose}>Confirmar y cerrar</button></div>
        </Modal>
      )}

      {cut && (
        <Modal title="Corte realizado" onClose={() => setCut(null)}>
          <div id="ticket-print">
            <div className="tot"><span>Cajera</span><span>{cut.userName}</span></div>
            <div className="tot"><span>Efectivo</span><span>{money(cut.byMethod.efectivo)}</span></div>
            <div className="tot"><span>Tarjeta</span><span>{money(cut.byMethod.tarjeta)}</span></div>
            <div className="tot"><span>Transferencia</span><span>{money(cut.byMethod.transferencia)}</span></div>
            <div className="tot grand"><span>Total ventas</span><span>{money(cut.total)}</span></div>
            <div className="tot"><span>Efectivo esperado</span><span>{money(cut.esperadoEfectivo)}</span></div>
            <div className="tot"><span>Contado</span><span>{money(cut.countedCash)}</span></div>
            <div className="tot grand"><span>Diferencia</span><span>{money(cut.diff)}</span></div>
          </div>
          <div className="modal-actions no-print"><button className="btn ghost" onClick={() => setCut(null)}>Cerrar</button><button className="btn" onClick={() => window.print()}>🖨 Imprimir</button></div>
        </Modal>
      )}
    </>
  );
}

function AdminCaja() {
  const [date, setDate] = useState(today());
  const [sales, setSales] = useState([]);
  const [cuts, setCuts] = useState([]);
  const [staff, setStaff] = useState([]);

  useEffect(() => { api.get('/cash/cuts').then(setCuts); api.get('/catalog/staff').then(setStaff); }, []);
  useEffect(() => { api.get('/sales?date=' + date).then(setSales); }, [date]);

  const m = byMethod(sales);
  const total = sales.reduce((a, s) => a + s.total, 0);
  const nameOf = id => staff.find(s => s.id === id)?.name?.split(' ')[0] || '—';

  function exportSales() {
    const rows = [['Fecha', 'Ticket', 'Cliente', 'Cajera', 'Método', 'Subtotal', 'Descuento', 'Saldo aplicado', 'Total']];
    sales.forEach(s => rows.push([date, s.ticketNo, s.client?.name || '', nameOf(s.cashierId), s.paymentMethod, s.subtotal, s.discount, s.creditUsed || 0, s.total]));
    downloadExcel('ventas_' + date, [{ name: 'Ventas', rows }]);
  }
  function exportCuts() {
    const rows = [['Fecha', 'Cajera', 'Fondo', 'Efectivo', 'Tarjeta', 'Transferencia', 'Total ventas', 'Tickets', 'Efectivo esperado', 'Contado', 'Diferencia']];
    cuts.forEach(c => rows.push([new Date(c.date).toLocaleDateString('es-MX'), c.userName, c.fondo, c.byMethod.efectivo, c.byMethod.tarjeta, c.byMethod.transferencia, c.total, c.tickets, c.esperadoEfectivo, c.countedCash, c.diff]));
    downloadExcel('cortes_caja', [{ name: 'Cortes', rows }]);
  }

  return (
    <>
      <div className="sec-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <span>Administrador · corte e historial</span>
        <div className="row">
          <input type="date" style={{ width: 170 }} value={date} onChange={e => setDate(e.target.value)} />
          <button className="btn ghost sm" onClick={exportSales}>⬇ Ventas</button>
          <button className="btn ghost sm" onClick={exportCuts}>⬇ Cortes</button>
        </div>
      </div>
      <div className="grid g4 mb">
        <div className="card kpi"><div className="lbl">Efectivo</div><div className="val">{money(m.efectivo)}</div></div>
        <div className="card kpi"><div className="lbl">Tarjeta</div><div className="val">{money(m.tarjeta)}</div></div>
        <div className="card kpi"><div className="lbl">Transferencia</div><div className="val">{money(m.transferencia)}</div></div>
        <div className="card kpi"><div className="lbl">Total {date}</div><div className="val">{money(total)}</div></div>
      </div>

      <div className="sec-title">Ventas del día</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Ticket</th><th>Cliente</th><th>Cajera</th><th>Método</th><th>Total</th></tr></thead><tbody>
          {sales.map(s => <tr key={s.id}><td>#{s.ticketNo}</td><td>{s.client?.name}</td><td>{nameOf(s.cashierId)}</td><td><span className="badge">{s.paymentMethod}</span></td><td>{money(s.total)}</td></tr>)}
          {!sales.length && <tr><td colSpan="5" className="empty">Sin ventas</td></tr>}
        </tbody></table>
      </div>

      <div className="sec-title">Cortes guardados</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Fecha</th><th>Cajera</th><th>Total</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody>
          {cuts.map(c => <tr key={c.id}><td>{new Date(c.date).toLocaleDateString('es-MX')}</td><td>{c.userName}</td><td>{money(c.total)}</td><td>{money(c.countedCash)}</td><td>{money(c.diff)}</td></tr>)}
          {!cuts.length && <tr><td colSpan="5" className="empty">Aún no hay cortes</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}
