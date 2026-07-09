import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Modal, money, initials, downloadStyledExcel } from '../ui.jsx';
import { businessName } from '../permissions.js';
import Select from '../components/Select.jsx';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const Ic = ({ d, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);

// Cálculo de comisión de una línea de venta. Hoy: % plano del especialista.
function lineCommission(item, staff) {
  const base = (item.price || 0) * (item.qty || 1);
  return base * (staff?.commissionRate || 0);
}

export default function Commissions() {
  const now = new Date();
  const [sales, setSales] = useState([]);
  const [staff, setStaff] = useState([]);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [detail, setDetail] = useState(null);

  useEffect(() => { api.get('/catalog/staff').then(setStaff); }, []);
  // Trae SOLO las ventas del mes elegido (rango en el backend, sin truncar a 500).
  useEffect(() => {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    api.get(`/sales?from=${from}&to=${to}`).then(setSales).catch(() => {});
  }, [month, year]);

  const specialists = useMemo(() => staff.filter(s => s.specialty), [staff]);
  const staffById = id => specialists.find(s => s.id === id);

  const periodSales = useMemo(() => sales.filter(s => {
    if (s.voided) return false; // una venta cancelada no paga comisión
    const d = new Date(s.date); return d.getFullYear() === year && d.getMonth() === month;
  }), [sales, year, month]);

  const rows = useMemo(() => {
    const agg = {};
    periodSales.forEach(s => (s.items || []).forEach(i => {
      if (!i.specialistId) return;
      const sp = staffById(i.specialistId); if (!sp) return;
      const a = agg[sp.id] || (agg[sp.id] = { sp, ventas: 0, servicios: 0, com: 0, items: [] });
      const base = (i.price || 0) * (i.qty || 1);
      a.ventas += base; a.servicios += (i.qty || 1); a.com += lineCommission(i, sp);
      a.items.push({ sale: s, item: i, base, com: lineCommission(i, sp) });
    }));
    return specialists.map(sp => agg[sp.id] || { sp, ventas: 0, servicios: 0, com: 0, items: [] })
      .sort((a, b) => b.com - a.com);
  }, [periodSales, specialists]); // eslint-disable-line

  const totalCom = rows.reduce((a, r) => a + r.com, 0);
  const totalServ = rows.reduce((a, r) => a + r.servicios, 0);
  const conVentas = rows.filter(r => r.com > 0);
  const top = conVentas[0];
  const maxCom = Math.max(...rows.map(r => r.com), 1);
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  function shiftMonth(delta) {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  }
  const isThisMonth = year === now.getFullYear() && month === now.getMonth();

  function exportXlsx() {
    const head = [['Especialista', 'Especialidad', 'Servicios', 'Ventas', '% Comisión', 'A pagar']];
    rows.forEach(r => head.push([r.sp.name, r.sp.specialty, r.servicios, r.ventas, Math.round(r.sp.commissionRate * 100) + '%', r.com]));
    head.push(['', '', '', '', 'TOTAL', totalCom]);
    downloadStyledExcel(`comisiones_${MONTHS[month]}_${year}`, [{ name: 'Comisiones', rows: head }]);
  }

  return (
    <>
      <div className="top">
        <div><h1>Comisiones</h1><div className="sub">{MONTHS[month]} {year}</div></div>
        <div className="row" style={{ gap: 8 }}>
          <div className="day-nav">
            <button className="day-nav-btn" aria-label="Mes anterior" onClick={() => shiftMonth(-1)}><Ic s={16} d={<path d="M15 18l-6-6 6-6" />} /></button>
            <button className={'day-nav-today' + (isThisMonth ? ' on' : '')} onClick={() => { setMonth(now.getMonth()); setYear(now.getFullYear()); }}>Este mes</button>
            <button className="day-nav-btn" aria-label="Mes siguiente" onClick={() => shiftMonth(1)}><Ic s={16} d={<path d="M9 18l6-6-6-6" />} /></button>
          </div>
          <Select value={month} onChange={v => setMonth(+v)} style={{ width: 140 }} options={MONTHS.map((m, i) => ({ value: i, label: m }))} />
          <Select value={year} onChange={v => setYear(+v)} style={{ width: 100 }} options={years.map(y => ({ value: y, label: String(y) }))} />
          <button className="btn ghost" onClick={exportXlsx}><Ic s={15} d={<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>} /> Exportar</button>
        </div>
      </div>

      <div className="inv-kpis">
        <div className="inv-kpi">
          <span className="inv-kpi-ic gold"><Ic s={18} d={<><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>} /></span>
          <div><b>{money(totalCom)}</b><span>Total a pagar</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic plum"><Ic s={18} d={<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>} /></span>
          <div><b>{totalServ}</b><span>Servicios realizados</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic plum"><Ic s={18} d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>} /></span>
          <div><b>{conVentas.length}</b><span>Especialistas con ventas</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic gold"><Ic s={18} d={<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h2a2 2 0 0 1 0 4h-2M7 5H5a2 2 0 0 0 0 4h2" /></>} /></span>
          <div><b>{top ? top.sp.name.split(' ')[0] : '—'}</b><span>Top del mes{top ? ` · ${money(top.com)}` : ''}</span></div>
        </div>
      </div>

      {conVentas.length === 0 && rows.length > 0 ? (
        <div className="empty-cal">
          <Ic s={28} d={<><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>} />
          <p>Sin comisiones en {MONTHS[month]} {year}</p>
          <span className="muted">No hubo servicios con especialista asignado este mes.</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-cal">
          <Ic s={28} d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>} />
          <p>Sin especialistas</p>
          <span className="muted">Asígnales una especialidad en el módulo Personal.</span>
        </div>
      ) : (
        <>
          <div className="comm-list">
            {rows.map((r, i) => {
              const pct = r.com > 0 ? Math.max(4, Math.round((r.com / maxCom) * 100)) : 0;
              const rank = i + 1;
              return (
                <div key={r.sp.id} className={'comm-row' + (r.com > 0 ? '' : ' zero')} style={{ '--i': Math.min(i, 12) }}>
                  <span className={'comm-rank' + (rank === 1 && r.com > 0 ? ' first' : '')}>{rank}</span>
                  <span className="comm-av">{initials(r.sp.name)}</span>
                  <div className="comm-main">
                    <div className="comm-name">{r.sp.name}<small>{r.sp.specialty}</small></div>
                    <div className="comm-bar"><span style={{ width: pct + '%' }} /></div>
                    <div className="comm-meta">{r.servicios} servicio{r.servicios !== 1 ? 's' : ''} · {money(r.ventas)} vendido · {Math.round(r.sp.commissionRate * 100)}% comisión</div>
                  </div>
                  <div className="comm-amt">
                    <b>{money(r.com)}</b>
                    {r.items.length > 0 && <button className="btn ghost sm" onClick={() => setDetail(r)}><Ic s={13} d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>} /> Recibo</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="comm-total">
            <span>Total a pagar · {MONTHS[month]} {year}</span>
            <b>{money(totalCom)}</b>
          </div>
        </>
      )}

      {detail && <DetailModal r={detail} period={`${MONTHS[month]} ${year}`} onClose={() => setDetail(null)} />}
    </>
  );
}

function DetailModal({ r, period, onClose }) {
  return (
    <Modal title={`Comisión · ${r.sp.name}`} onClose={onClose}>
      <div id="ticket-print">
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div className="serif" style={{ fontSize: '1.4rem', letterSpacing: '.1em', fontWeight: 600 }}>{businessName()}</div>
          <div className="muted" style={{ fontSize: 12 }}>Recibo de comisión · {period}</div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', margin: '4px 0' }}><span className="muted">Especialista</span><span>{r.sp.name}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', margin: '4px 0' }}><span className="muted">Especialidad</span><span>{r.sp.specialty}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', margin: '4px 0' }}><span className="muted">% Comisión</span><span>{Math.round(r.sp.commissionRate * 100)}%</span></div>
        <hr style={{ border: 'none', borderTop: '1px dashed var(--line)', margin: '12px 0' }} />
        <table style={{ width: '100%' }}>
          <thead><tr><th style={{ textAlign: 'left', fontSize: 11 }}>Servicio</th><th style={{ textAlign: 'right', fontSize: 11 }}>Venta</th><th style={{ textAlign: 'right', fontSize: 11 }}>Comisión</th></tr></thead>
          <tbody>
            {r.items.map((it, idx) => (
              <tr key={idx}>
                <td style={{ fontSize: 12 }}>{it.item.name}{it.item.qty > 1 ? ' x' + it.item.qty : ''}</td>
                <td style={{ textAlign: 'right', fontSize: 12 }}>{money(it.base)}</td>
                <td style={{ textAlign: 'right', fontSize: 12 }}>{money(it.com)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr style={{ border: 'none', borderTop: '1px dashed var(--line)', margin: '12px 0' }} />
        <div className="tot grand"><span>Total a pagar</span><span>{money(r.com)}</span></div>
        <p style={{ marginTop: 26, fontSize: 12 }}>Firma de recibido: ____________________________</p>
      </div>
      <div className="modal-actions no-print">
        <button className="btn ghost" onClick={onClose}>Cerrar</button>
        <button className="btn" onClick={() => window.print()}><Ic s={15} d={<><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></>} /> Imprimir recibo</button>
      </div>
    </Modal>
  );
}
