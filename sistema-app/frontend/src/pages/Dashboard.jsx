import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { money, initials } from '../ui.jsx';
import Insights from '../components/Insights.jsx';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const COLORS = ['#2A2A30', '#C9A66B', '#7F9279', '#9A968E'];
const colorFor = s => COLORS[(s || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const iso = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
// Saludo según la hora: un detalle invisible que cuando está mal, se nota
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
// Íconos SVG limpios para los KPIs (mejor que caracteres sueltos como $ ◷ ♡ ▣)
const ico = {
  sales: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>,
  heart: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>,
  receipt: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v18l2.5-1.5L10 21l2-1.5L14 21l2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5 5 3z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>,
};

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [appts, setAppts] = useState([]);
  const [clientTotal, setClientTotal] = useState(0);
  const [sales, setSales] = useState([]);
  const [low, setLow] = useState([]);
  const [crm, setCrm] = useState({ risk: 0, birthdays: 0, followups: 0 });
  const [alerts, setAlerts] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/appointments').then(setAppts).catch(e => setErr(e.message));
    api.get('/clients/count').then(d => setClientTotal(d.total)).catch(() => {});
    api.get('/sales').then(setSales).catch(() => {});
    Promise.all([api.get('/inventory/supplies'), api.get('/inventory/products')])
      .then(([s, p]) => setLow([...s, ...p].filter(x => x.stock <= x.minStock)))
      .catch(() => {});
    // Resumen CRM
    Promise.all([
      api.get('/crm/at-risk').catch(() => ({ clients: [] })),
      api.get('/crm/birthdays').catch(() => ({ clients: [] })),
      api.get('/crm/followups?done=false').catch(() => []),
    ]).then(([r, b, f]) => setCrm({ risk: r.clients?.length || 0, birthdays: b.clients?.length || 0, followups: Array.isArray(f) ? f.length : 0 }))
      .catch(() => {});
    loadAlerts();
    // Recargar alertas al volver a la pestaña (p. ej. tras resolver algo en otro módulo)
    const onFocus = () => loadAlerts();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const loadAlerts = () => api.get('/insights').then(d => setAlerts(d.alerts || [])).catch(() => {});

  const today = iso(new Date());
  const salesToday = sales.filter(s => iso(new Date(s.date)) === today);
  const totalToday = salesToday.reduce((a, s) => a + s.total, 0);
  const pending = appts.filter(a => ['agendada', 'confirmada'].includes(a.status)).length;
  const avg = salesToday.length ? totalToday / salesToday.length : 0;

  // Ventas de la semana (lunes a domingo de la semana actual)
  const monday = new Date(); const day = (monday.getDay() + 6) % 7; monday.setDate(monday.getDate() - day); monday.setHours(0, 0, 0, 0);
  const week = DAYS.map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return iso(d); });
  const weekTotals = week.map(d => sales.filter(s => iso(new Date(s.date)) === d).reduce((a, s) => a + s.total, 0));
  const maxW = Math.max(...weekTotals, 1);

  const hh = d => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="top">
        <div>
          <h1>{greeting()}, {user?.name?.split(' ')[0]}</h1>
          <div className="sub">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Resumen del día</div>
        </div>
        <button className="btn" onClick={() => nav('/agenda')}>＋ Nueva cita</button>
      </div>

      {err && <div className="card mb" style={{ color: '#C16B6B' }}>Error: {err}. ¿Está corriendo el backend?</div>}

      {alerts.length > 0 && (
        <div className="card mb">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 className="serif" style={{ fontSize: '1.3rem' }}>Alertas y recomendaciones</h2>
            <span className="link" onClick={loadAlerts} title="Actualizar" style={{ cursor: 'pointer' }}>↻ Actualizar</span>
          </div>
          <Insights alerts={alerts} />
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="lbl">Ventas de hoy</div>
          <div className="val">{money(totalToday)}</div>
          <div className="chg">{salesToday.length} {salesToday.length === 1 ? 'ticket' : 'tickets'}</div>
        </div>
        <div className="stat">
          <div className="lbl">Citas de hoy</div>
          <div className="val">{appts.length}</div>
          <div className="chg">{pending} pendientes</div>
        </div>
        <div className="stat">
          <div className="lbl">Clientes</div>
          <div className="val">{clientTotal.toLocaleString()}</div>
          <div className="chg">registrados</div>
        </div>
        <div className="stat">
          <div className="lbl">Ticket promedio</div>
          <div className="val">{money(avg)}</div>
          <div className="chg">{salesToday.length ? 'por venta' : 'sin ventas aún'}</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16, gridTemplateColumns: '1.5fr 1fr' }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h2 className="serif" style={{ fontSize: '1.3rem' }}>Ventas de la semana</h2>
            <span className="muted" style={{ fontSize: '.8rem' }}>{money(weekTotals.reduce((a, b) => a + b, 0))} total</span>
          </div>
          <div className="bars">
            {DAYS.map((d, i) => {
              const isToday = week[i] === today;
              return (
                <div key={d} className="bar" title={`${d}: ${money(weekTotals[i])}`}>
                  <small className="muted" style={{ fontSize: '.62rem', opacity: weekTotals[i] ? 1 : 0 }}>{weekTotals[i] >= 1000 ? Math.round(weekTotals[i] / 1000) + 'k' : weekTotals[i] || ''}</small>
                  <div className="col" style={{ height: Math.max(4, weekTotals[i] / maxW * 100) + '%', animationDelay: i * 55 + 'ms', filter: isToday ? 'none' : 'saturate(.7) opacity(.82)' }} />
                  <small style={{ fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--plum)' : 'var(--muted)' }}>{d}</small>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <h2 className="serif mb" style={{ fontSize: '1.3rem' }}>Alertas de inventario</h2>
          {low.length ? low.slice(0, 6).map(x => (
            <div key={x.id} className="row" style={{ justifyContent: 'space-between', padding: '7px 0' }}>
              <span>{x.name}</span>
              <span className={'badge ' + (x.stock <= x.minStock / 2 ? 'bg-bad' : 'bg-warn')}>{x.stock} {x.unit || 'u'}</span>
            </div>
          )) : (
            <div style={{ textAlign: 'center', padding: '22px 0', color: 'var(--muted)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              <div style={{ marginTop: 6, fontSize: '.86rem' }}>Todo en niveles óptimos</div>
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', margin: '26px 0 12px' }}>
        <h2 className="serif" style={{ fontSize: '1.3rem' }}>Próximas citas de hoy</h2>
        <span className="link" onClick={() => nav('/agenda')}>Ver agenda →</span>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Especialista</th><th>Estado</th></tr></thead>
          <tbody>
            {appts.slice().sort((a, b) => new Date(a.start) - new Date(b.start)).map(a => (
              <tr key={a.id}>
                <td>{hh(a.start)}</td>
                <td><div className="client-cell"><span className="client-avatar" style={{ background: colorFor(a.client?.name) }}>{initials(a.client?.name)}</span>{a.client?.name}</div></td>
                <td>{a.service?.name}</td>
                <td>{a.staff?.name}</td>
                <td><span className={'badge ' + ({ confirmada: 'bg-ok', completada: 'bg-ok', en_sala: 'bg-gold', no_asistio: 'bg-bad', cancelada: 'bg-bad' }[a.status] || '')}>{a.status?.replace('_', ' ')}</span></td>
              </tr>
            ))}
            {!appts.length && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '34px 24px' }}>
              <div className="serif" style={{ fontSize: '1.15rem', color: 'var(--ink)' }}>Sin citas para hoy</div>
              <div className="muted" style={{ fontSize: '.85rem', margin: '4px 0 12px' }}>La agenda está despejada.</div>
              <button className="btn sm" onClick={() => nav('/agenda')}>Agendar una cita</button>
            </td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
