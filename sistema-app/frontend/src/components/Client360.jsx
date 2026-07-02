import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, money, initials, toast } from '../ui.jsx';
import { isModuleEnabled } from '../permissions.js';

const fdate = d => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fdatetime = d => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// Etiquetas de actividad (texto formal, sin emojis — consistente con el embudo)
const ACT_LABELS = { llamada: 'Llamada', whatsapp: 'WhatsApp', correo: 'Correo', reunion: 'Reunión', nota: 'Nota', tarea: 'Tarea' };
const onlyDigits = s => (s || '').replace(/\D/g, '');

// Vista 360 de un cliente: ficha unificada con todo en una pantalla.
export default function Client360({ clientId, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    api.get(`/crm/client/${clientId}/360`).then(setD).catch(e => setErr(e.message));
  }, [clientId]);

  if (err) return <Modal title="Cliente" onClose={onClose}><div className="empty">{err}</div></Modal>;
  if (!d) return <Modal title="Cargando..." onClose={onClose}><div className="empty">Cargando ficha…</div></Modal>;

  const c = d.client, k = d.kpis;
  const go = path => { onClose(); nav(path); };
  const riesgo = k.diasSinVenir != null && k.diasSinVenir > 45;

  const Kpi = ({ label, value, sub }) => (
    <div className="card kpi" style={{ padding: 14 }}>
      <div className="lbl">{label}</div>
      <div className="val" style={{ fontSize: '1.3rem' }}>{value}</div>
      {sub && <div className="chg">{sub}</div>}
    </div>
  );

  return (
    <Modal title="" onClose={onClose}>
      {/* Encabezado */}
      <div className="row" style={{ gap: 16, alignItems: 'center', marginTop: -8 }}>
        <span className="client-avatar" style={{ width: 60, height: 60, fontSize: '1.4rem' }}>{initials(c.name)}</span>
        <div style={{ flex: 1 }}>
          <h2 className="serif" style={{ fontSize: '1.5rem', margin: 0 }}>{c.name}</h2>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            <span className={'badge ' + (c.tag === 'VIP' ? 'bg-gold' : 'bg-ok')}>{c.tag}</span>
            {c.phone ? ' · ' + c.phone : ''}{c.source ? ' · ' + c.source : ''} · Cliente desde {fdate(c.createdAt)}
          </div>
        </div>
      </div>

      {riesgo && <div className="alert" style={{ marginTop: 12 }}>⚠ En riesgo de fuga · {k.diasSinVenir} días sin venir</div>}

      {/* KPIs */}
      <div className="grid g4" style={{ marginTop: 14, gap: 10 }}>
        <Kpi label="Gasto total" value={money(k.totalGastado)} />
        <Kpi label="Visitas" value={k.visitas} sub={`Ticket prom. ${money(k.ticketProm)}`} />
        <Kpi label="Última visita" value={k.lastVisit ? fdate(k.lastVisit) : 'Nunca'} sub={k.diasSinVenir != null ? `hace ${k.diasSinVenir} días` : ''} />
        <Kpi label="Puntos · saldo" value={k.puntos ?? c.points} sub={money(c.credit) + ' a favor'} />
      </div>

      {/* Próxima cita + favorito + paquetes */}
      <div className="card" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div><span className="muted" style={{ fontSize: '.78rem' }}>Próxima cita</span><div>{d.proximaCita ? `${fdatetime(d.proximaCita.start)} · ${d.proximaCita.service?.name || ''}` : 'Sin cita agendada'}</div></div>
        <div><span className="muted" style={{ fontSize: '.78rem' }}>Servicio favorito</span><div>{k.favorito || '—'}</div></div>
        <div><span className="muted" style={{ fontSize: '.78rem' }}>Paquetes activos</span><div>{k.paquetesActivos}</div></div>
      </div>

      {/* Alergias/notas clínicas */}
      {(d.record?.allergies || d.record?.contraindications) && (
        <div className="alert" style={{ marginTop: 12 }}>
          ⚠ {d.record.allergies && <><b>Alergias:</b> {d.record.allergies}. </>}
          {d.record.contraindications && <><b>Contraindicaciones:</b> {d.record.contraindications}.</>}
        </div>
      )}

      {/* Historial de compras */}
      <h3 className="serif" style={{ fontSize: '1.1rem', margin: '16px 0 8px' }}>Últimas compras</h3>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%' }}>
          <thead><tr><th>Fecha</th><th>Detalle</th><th>Total</th></tr></thead>
          <tbody>
            {d.sales.map(s => (
              <tr key={s.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fdate(s.date)}</td>
                <td className="muted" style={{ fontSize: '.85rem' }}>{(s.items || []).map(i => i.name).join(', ') || '—'}</td>
                <td>{money(s.total)}</td>
              </tr>
            ))}
            {!d.sales.length && <tr><td colSpan="3" className="empty">Sin compras registradas</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Notas clínicas recientes */}
      {d.notes.length > 0 && (
        <>
          <h3 className="serif" style={{ fontSize: '1.1rem', margin: '16px 0 8px' }}>Notas de evolución</h3>
          <div className="card">
            {d.notes.map(n => (
              <div key={n.id} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--line)' }}>
                <div className="muted" style={{ fontSize: '.74rem' }}>{fdate(n.date)}</div>
                <b style={{ fontWeight: 500 }}>{n.title}</b>
                {n.evolution && <p className="muted" style={{ margin: '2px 0 0' }}>{n.evolution}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bitácora de contacto: actividades registradas en los tratos del cliente */}
      {d.bitacora?.length > 0 && (
        <>
          <h3 className="serif" style={{ fontSize: '1.1rem', margin: '16px 0 8px' }}>Bitácora de contacto</h3>
          <div className="card" style={{ display: 'grid', gap: 8 }}>
            {d.bitacora.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                <span className="badge bg-muted" style={{ flex: '0 0 auto', fontSize: '.68rem' }}>{ACT_LABELS[a.type] || a.type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.86rem', textDecoration: a.done ? 'line-through' : 'none' }}>{a.note || ACT_LABELS[a.type]}</div>
                  <div className="muted" style={{ fontSize: '.7rem', marginTop: 2 }}>
                    {fdate(a.createdAt)}
                    {a.staffName && ` · ${a.staffName}`}
                    {a.dealTitle && ` · ${a.dealTitle}`}
                    {a.dueDate && ` · vence ${fdate(a.dueDate)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Acciones rápidas */}
      <div className="modal-actions" style={{ marginTop: 16, flexWrap: 'wrap' }}>
        {c.phone && <a className="btn ghost" target="_blank" rel="noreferrer"
          href={`https://wa.me/${onlyDigits(c.phone)}?text=${encodeURIComponent(`Hola ${(c.name || '').split(' ')[0]}, te saludamos de parte de nuestro equipo. `)}`}>WhatsApp</a>}
        {isModuleEnabled('expediente') && <button className="btn ghost" onClick={() => go('/expediente?cliente=' + c.id)}>Ver expediente</button>}
        <button className="btn ghost" onClick={() => go('/agenda')}>Agendar cita</button>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
