import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Modal, money, initials, downloadExcel } from '../ui.jsx';
import { businessName } from '../permissions.js';
import Select from '../components/Select.jsx';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Cálculo de comisión de una línea de venta. Hoy: % plano del especialista.
// (Estructurado para, en el futuro, distinguir servicio/producto o escalonado.)
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
  const [detail, setDetail] = useState(null); // especialista seleccionada para desglose

  useEffect(() => { api.get('/sales').then(setSales); api.get('/catalog/staff').then(setStaff); }, []);

  const specialists = useMemo(() => staff.filter(s => s.specialty), [staff]);
  const staffById = id => specialists.find(s => s.id === id);

  // Ventas del periodo (mes/año elegido)
  const periodSales = useMemo(() => sales.filter(s => {
    const d = new Date(s.date); return d.getFullYear() === year && d.getMonth() === month;
  }), [sales, year, month]);

  // Agregado por especialista: ventas, nº servicios y comisión
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
  const top = rows.find(r => r.com > 0);
  const maxCom = Math.max(...rows.map(r => r.com), 1);
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  function exportXlsx() {
    const head = [['Especialista', 'Especialidad', 'Servicios', 'Ventas', '% Comisión', 'A pagar']];
    rows.forEach(r => head.push([r.sp.name, r.sp.specialty, r.servicios, r.ventas, Math.round(r.sp.commissionRate * 100) + '%', r.com]));
    head.push(['', '', '', '', 'TOTAL', totalCom]);
    downloadExcel(`comisiones_${MONTHS[month]}_${year}`, [{ name: 'Comisiones', rows: head }]);
  }

  return (
    <>
      <div className="top">
        <div><h1>Comisiones</h1><div className="sub">{MONTHS[month]} {year}</div></div>
        <div className="row">
          <Select value={month} onChange={v => setMonth(+v)} style={{ width: 150 }} options={MONTHS.map((m, i) => ({ value: i, label: m }))} />
          <Select value={year} onChange={v => setYear(+v)} style={{ width: 110 }} options={years.map(y => ({ value: y, label: String(y) }))} />
          <button className="btn ghost" onClick={exportXlsx}>⬇ Excel</button>
        </div>
      </div>

      <div className="grid g4 mb">
        <div className="card kpi"><div className="lbl">Total a pagar</div><div className="val">{money(totalCom)}</div></div>
        <div className="card kpi"><div className="lbl">Servicios realizados</div><div className="val">{totalServ}</div></div>
        <div className="card kpi"><div className="lbl">Especialistas con ventas</div><div className="val">{rows.filter(r => r.com > 0).length}</div></div>
        <div className="card kpi"><div className="lbl">Top del mes</div><div className="val" style={{ fontSize: '1.5rem' }}>{top ? top.sp.name.split(' ')[0] : '—'}</div><div className="chg">{top ? money(top.com) : ''}</div></div>
      </div>

      {rows.some(r => r.com > 0) && (
        <div className="card mb">
          <h2 className="serif mb" style={{ fontSize: '1.25rem' }}>Comisiones por especialista</h2>
          <div className="bars">
            {rows.map(r => (
              <div key={r.sp.id} className="bar" title={money(r.com)}>
                <div className="col" style={{ height: Math.max(4, r.com / maxCom * 100) + '%' }} />
                <small>{r.sp.name.split(' ')[0]}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Especialista</th><th>Especialidad</th><th>Servicios</th><th>Ventas</th><th>% Comisión</th><th>A pagar</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.sp.id}>
                <td><div className="client-cell"><span className="client-avatar">{initials(r.sp.name)}</span>{r.sp.name}</div></td>
                <td>{r.sp.specialty}</td>
                <td>{r.servicios}</td>
                <td>{money(r.ventas)}</td>
                <td>{Math.round(r.sp.commissionRate * 100)}%</td>
                <td><b>{money(r.com)}</b></td>
                <td>{r.items.length > 0 && <div className="row-actions" style={{ justifyContent: 'flex-start' }}><button className="btn ghost sm" onClick={() => setDetail(r)}>Ver / recibo</button></div>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="7" className="empty">Sin especialistas. Asígnales especialidad en Personal.</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td colSpan="5" style={{ textAlign: 'right', fontWeight: 600 }}>Total a pagar</td><td colSpan="2"><b>{money(totalCom)}</b></td></tr></tfoot>}
        </table>
      </div>

      {detail && <DetailModal r={detail} period={`${MONTHS[month]} ${year}`} staffById={staffById} onClose={() => setDetail(null)} />}
    </>
  );
}

function DetailModal({ r, period, onClose }) {
  return (
    <Modal title={`Comisión · ${r.sp.name}`} onClose={onClose}>
      <div id="ticket-print">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div className="serif" style={{ fontSize: '1.4rem', letterSpacing: '.1em', fontWeight: 600 }}>{businessName()}</div>
          <div className="muted" style={{ fontSize: 12 }}>Recibo de comisión · {period}</div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', margin: '4px 0' }}><span className="muted">Especialista</span><span>{r.sp.name}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', margin: '4px 0' }}><span className="muted">Especialidad</span><span>{r.sp.specialty}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', margin: '4px 0' }}><span className="muted">% Comisión</span><span>{Math.round(r.sp.commissionRate * 100)}%</span></div>
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
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
        <hr style={{ border: 'none', borderTop: '1px dashed #ccc', margin: '10px 0' }} />
        <div className="row" style={{ justifyContent: 'space-between' }}><b>Total a pagar</b><b>{money(r.com)}</b></div>
        <p style={{ marginTop: 24, fontSize: 12 }}>Firma de recibido: ____________________________</p>
      </div>
      <div className="modal-actions no-print"><button className="btn ghost" onClick={onClose}>Cerrar</button><button className="btn" onClick={() => window.print()}>🖨 Imprimir recibo</button></div>
    </Modal>
  );
}
