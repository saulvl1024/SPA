import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money } from '../ui.jsx';

export default function Commissions() {
  const [sales, setSales] = useState([]);
  const [staff, setStaff] = useState([]);
  useEffect(() => { api.get('/sales').then(setSales); api.get('/catalog/staff').then(setStaff); }, []);

  const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
  const agg = {};
  sales.forEach(s => {
    const d = new Date(s.date); if (d.getFullYear() !== y || d.getMonth() !== mo) return;
    s.items?.forEach(i => { if (i.specialistId && i.price) agg[i.specialistId] = (agg[i.specialistId] || 0) + i.price * i.qty; });
  });
  const rows = staff.filter(s => s.specialty).map(s => ({ s, sales: agg[s.id] || 0, com: (agg[s.id] || 0) * s.commissionRate }));
  const total = rows.reduce((a, r) => a + r.com, 0);

  return (
    <>
      <div className="top"><h1>Comisiones</h1><div className="sub">Mes actual</div></div>
      <div className="grid g3 mb">
        <div className="card kpi"><div className="lbl">Comisiones del periodo</div><div className="val">{money(total)}</div></div>
        <div className="card kpi"><div className="lbl">Especialistas</div><div className="val">{rows.length}</div></div>
        <div className="card kpi"><div className="lbl">Con ventas</div><div className="val">{rows.filter(r => r.sales > 0).length}</div></div>
      </div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Especialista</th><th>Especialidad</th><th>Ventas del mes</th><th>% Comisión</th><th>A pagar</th></tr></thead><tbody>
          {rows.map(r => <tr key={r.s.id}><td>{r.s.name}</td><td>{r.s.specialty}</td><td>{money(r.sales)}</td><td>{Math.round(r.s.commissionRate * 100)}%</td><td><b>{money(r.com)}</b></td></tr>)}
          {!rows.length && <tr><td colSpan="5" className="empty">Sin datos</td></tr>}
        </tbody></table>
      </div>
      <div className="card" style={{ marginTop: 16 }}><b>✦ Recordatorios automáticos.</b> <span className="muted">Confirmación, recordatorio 24 h antes y seguimiento post-visita (WhatsApp / SMS / email) — pendiente de integrar proveedor.</span></div>
    </>
  );
}
