import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [appts, setAppts] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.get('/clients'), api.get('/appointments')])
      .then(([c, a]) => { setClients(c); setAppts(a); })
      .catch(e => setErr(e.message));
  }, []);

  return (
    <>
      <div className="top"><h1>Dashboard</h1></div>
      {err && <div className="card" style={{ color: '#C16B6B' }}>Error: {err}. ¿Está corriendo el backend?</div>}
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="lbl">Clientes</div><div className="val">{clients.length}</div></div>
        <div className="card kpi"><div className="lbl">Citas de hoy</div><div className="val">{appts.length}</div></div>
        <div className="card kpi"><div className="lbl">Pendientes</div><div className="val">{appts.filter(a => ['agendada', 'confirmada'].includes(a.status)).length}</div></div>
        <div className="card kpi"><div className="lbl">Completadas</div><div className="val">{appts.filter(a => a.status === 'completada').length}</div></div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Especialista</th><th>Estado</th></tr></thead>
          <tbody>
            {appts.map(a => (
              <tr key={a.id}>
                <td>{new Date(a.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{a.client?.name}</td>
                <td>{a.service?.name}</td>
                <td>{a.staff?.name}</td>
                <td><span className="badge">{a.status}</span></td>
              </tr>
            ))}
            {!appts.length && <tr><td colSpan="5" style={{ color: 'var(--muted)' }}>Sin citas hoy</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
