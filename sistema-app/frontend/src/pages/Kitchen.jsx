import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../ui.jsx';

const mins = since => since ? Math.floor((Date.now() - new Date(since).getTime()) / 60000) : 0;
const clock = since => {
  if (!since) return '0:00';
  const s = Math.floor((Date.now() - new Date(since).getTime()) / 1000);
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
const STATIONS = [
  { key: 'todas',  label: 'Todas' },
  { key: 'cocina', label: 'Cocina' },
  { key: 'barra',  label: 'Barra' },
];
// nivel de urgencia → clase de badge del sistema
const badgeClass = m => m >= 15 ? 'bg-bad' : m >= 8 ? 'bg-warn' : 'bg-ok';
const accentVar = m => m >= 15 ? 'var(--bad)' : m >= 8 ? 'var(--warn)' : 'var(--sage)';

export default function Kitchen() {
  const [tickets, setTickets] = useState([]);
  const [station, setStation] = useState('todas');
  const [loading, setLoading] = useState(true);
  const [, force] = useState(0);

  const load = (st = station) => {
    const qs = st && st !== 'todas' ? `?station=${st}` : '';
    api.get(`/kitchen${qs}`).then(d => { setTickets(d); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [station]);
  useEffect(() => {
    const a = setInterval(() => load(), 8000);
    const b = setInterval(() => force(x => x + 1), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [station]);

  async function setItem(id, kitchen) {
    try { await api.patch(`/kitchen/items/${id}`, { kitchen }); load(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function readyAll(orderId) {
    try { await api.patch(`/kitchen/orders/${orderId}/ready`, {}); load(); toast('Comanda completada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  const totalItems = tickets.reduce((a, t) => a + t.items.length, 0);
  const oldest = tickets.length ? Math.max(...tickets.map(t => mins(t.items[0]?.sentAt || t.openedAt))) : 0;

  return (
    <>
      <div className="top">
        <div>
          <h1>Cocina</h1>
          <div className="sub">Comandas en preparación · se actualiza automáticamente</div>
        </div>
        <div className="tabs" style={{ display: 'flex', gap: 8 }}>
          {STATIONS.map(s => (
            <div key={s.key} className="tab" onClick={() => setStation(s.key)}
              style={station === s.key ? { background: 'var(--plum)', color: '#fff', borderColor: 'var(--plum)' } : {}}>
              {s.label}
            </div>
          ))}
        </div>
      </div>

      <div className="grid g3 mb" style={{ gap: 16 }}>
        <div className="card kpi"><div className="lbl">Comandas activas</div><div className="val">{tickets.length}</div></div>
        <div className="card kpi"><div className="lbl">Platillos pendientes</div><div className="val">{totalItems}</div></div>
        <div className="card kpi"><div className="lbl">Mayor espera</div><div className="val" style={{ color: accentVar(oldest) }}>{oldest} min</div></div>
      </div>

      {loading ? <div className="card"><div className="empty">Cargando…</div></div>
      : !tickets.length ? (
        <div className="card">
          <div className="empty">
            <div className="serif" style={{ fontSize: '1.3rem', color: 'var(--ink)' }}>Sin comandas pendientes</div>
            <div style={{ marginTop: 4 }}>No hay platillos en preparación{station !== 'todas' ? ` en ${station}` : ''}.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
          {tickets.map((t, idx) => {
            const waited = mins(t.items[0]?.sentAt || t.openedAt);
            const accent = accentVar(waited);
            return (
              <div key={t.orderId} className="card kds-ticket" style={{ padding: 0, overflow: 'hidden', borderTop: `3px solid ${accent}`, animationDelay: Math.min(idx * 45, 270) + 'ms' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 18px 12px' }}>
                  <div>
                    <div className="serif" style={{ fontSize: '1.3rem', lineHeight: 1 }}>Mesa {t.tableNumber}</div>
                    <div className="muted" style={{ fontSize: '.74rem', marginTop: 3 }}>Comanda {String(idx + 1).padStart(2, '0')} · {t.label}{t.zone ? ` · ${t.zone}` : ''}</div>
                  </div>
                  <span className={'badge ' + badgeClass(waited)} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{clock(t.items[0]?.sentAt || t.openedAt)}</span>
                </div>

                {t.items.map(it => {
                  const prep = it.kitchen === 'preparando';
                  return (
                    <div key={it.id} style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', background: prep ? 'var(--cream)' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        {it.qty > 1 && <span className="serif" style={{ fontSize: '1.15rem', color: 'var(--plum)', minWidth: 24 }}>{it.qty}×</span>}
                        <span style={{ fontWeight: 600, fontSize: '1.02rem', flex: 1 }}>{it.name}</span>
                        {it.station === 'barra' && <span className="badge b-cream" style={{ color: 'var(--muted)' }}>Barra</span>}
                      </div>
                      {it.note && <div style={{ fontSize: '.85rem', color: 'var(--bad)', fontWeight: 500, marginTop: 4 }}>Nota: {it.note}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        {!prep && <button className="btn ghost sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setItem(it.id, 'preparando')}>En preparación</button>}
                        <button className="btn sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setItem(it.id, 'listo')}>Marcar listo</button>
                      </div>
                    </div>
                  );
                })}

                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
                  <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => readyAll(t.orderId)}>Completar toda la comanda</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
