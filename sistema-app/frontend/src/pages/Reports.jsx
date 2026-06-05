import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money, downloadExcel } from '../ui.jsx';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [clients, setClients] = useState([]);

  useEffect(() => {
    api.get('/sales').then(setSales);
    api.get('/catalog/services').then(setServices);
    api.get('/catalog/staff').then(setStaff);
    api.get('/clients').then(setClients);
  }, []);

  const y = new Date().getFullYear();
  const byM = Array(12).fill(0);
  sales.forEach(s => { const d = new Date(s.date); if (d.getFullYear() === y) byM[d.getMonth()] += s.total; });
  const maxM = Math.max(...byM, 1);
  const upto = new Date().getMonth();
  const totalYear = byM.reduce((a, b) => a + b, 0);

  const mix = {}; let totalServ = 0;
  sales.forEach(s => s.items?.forEach(i => { if (i.type === 'servicio') { mix[i.refId] = (mix[i.refId] || 0) + i.qty; totalServ += i.qty; } }));
  const topServ = Object.entries(mix).map(([id, n]) => ({ name: services.find(s => s.id === id)?.name || 'Servicio', n })).sort((a, b) => b.n - a.n).slice(0, 5);

  function exportXlsx() {
    const months = [['Mes', 'Ingresos'], ...byM.map((v, i) => [MONTHS[i], v])];
    const serv = [['Servicio', 'Cantidad'], ...topServ.map(s => [s.name, s.n])];
    const bySp = {};
    sales.forEach(s => s.items?.forEach(i => { if (i.specialistId) bySp[i.specialistId] = (bySp[i.specialistId] || 0) + i.price * i.qty; }));
    const sp = [['Especialista', 'Ventas'], ...Object.entries(bySp).map(([id, v]) => [staff.find(x => x.id === id)?.name || id, v])];
    downloadExcel('reportes_' + y, [{ name: 'Ingresos por mes', rows: months }, { name: 'Servicios', rows: serv }, { name: 'Especialistas', rows: sp }]);
  }

  return (
    <>
      <div className="top"><h1>Reportes y analíticas</h1><button className="btn ghost" onClick={exportXlsx}>⬇ Excel</button></div>
      <div className="grid g4 mb">
        <div className="card kpi"><div className="lbl">Ventas del año</div><div className="val">{money(totalYear)}</div></div>
        <div className="card kpi"><div className="lbl">Tickets</div><div className="val">{sales.length}</div></div>
        <div className="card kpi"><div className="lbl">Clientes</div><div className="val">{clients.length}</div></div>
        <div className="card kpi"><div className="lbl">Servicios vendidos</div><div className="val">{totalServ}</div></div>
      </div>
      <div className="card mb"><h2 className="serif mb" style={{ fontSize: '1.25rem' }}>Ingresos por mes</h2>
        <div className="bars">{byM.slice(0, upto + 1).map((v, i) => <div key={i} className="bar"><div className="col" style={{ height: Math.max(4, v / maxM * 100) + '%' }} /><small>{MONTHS[i]}</small></div>)}</div>
      </div>
      <div className="card"><h2 className="serif mb" style={{ fontSize: '1.25rem' }}>Servicios más vendidos</h2>
        <table><tbody>{topServ.map((s, i) => <tr key={i}><td>{s.name}</td><td className="right"><b>{s.n}</b></td></tr>)}{!topServ.length && <tr><td className="empty">Aún sin datos</td></tr>}</tbody></table>
      </div>
    </>
  );
}
