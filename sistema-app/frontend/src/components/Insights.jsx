import { useNavigate } from 'react-router-dom';

// Colores por severidad (usa las variables del tema)
const SEV = {
  alta:  { bg: 'rgba(193,107,107,.10)', bd: 'var(--bad)',  ic: '⚠', label: 'Urgente' },
  media: { bg: 'rgba(201,138,75,.10)',  bd: 'var(--warn)', ic: '◆', label: 'Atención' },
  info:  { bg: 'rgba(111,129,105,.10)', bd: 'var(--ok)',   ic: '✦', label: 'Aviso' },
};

// Lista de tarjetas de alertas reutilizable (Dashboard y modal).
export default function Insights({ alerts = [], onNavigate }) {
  const nav = useNavigate();
  const go = link => { onNavigate?.(); nav(link); };

  if (!alerts.length) {
    return <div className="muted" style={{ padding: '8px 0' }}>Todo en orden por ahora ✦ Sin alertas pendientes.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {alerts.map(a => {
        const s = SEV[a.severity] || SEV.info;
        return (
          <div key={a.id} onClick={() => go(a.link)}
            style={{ cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
              background: s.bg, borderLeft: `3px solid ${s.bd}`, borderRadius: 10, padding: '12px 14px' }}>
            <span style={{ fontSize: '1.1rem', color: s.bd, lineHeight: 1.2 }}>{s.ic}</span>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <b>{a.title}</b>
                <span className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>{s.label}</span>
              </div>
              <div className="muted" style={{ fontSize: '.85rem', marginTop: 2 }}>{a.detail}</div>
            </div>
            <span className="muted" style={{ fontSize: '1.1rem' }}>›</span>
          </div>
        );
      })}
    </div>
  );
}
