import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { money, toast } from '../ui.jsx';

const tierOf = (points, tiers) => (tiers.filter(t => (points || 0) >= t.min).pop() || tiers[0]);

export default function Loyalty() {
  const { user } = useAuth();
  const admin = user.role === 'admin' || user.role === 'superadmin';
  const [tab, setTab] = useState('config');
  return (
    <>
      <div className="top"><div><h1>Lealtad y recompensas</h1><div className="sub">Programa de puntos configurable</div></div></div>
      <div className="tabs">
        <div className={'tab' + (tab === 'config' ? ' active' : '')} onClick={() => setTab('config')}>Configuración</div>
        <div className={'tab' + (tab === 'ranking' ? ' active' : '')} onClick={() => setTab('ranking')}>Clientes por puntos</div>
      </div>
      {tab === 'config' && <Config admin={admin} />}
      {tab === 'ranking' && <Ranking />}
    </>
  );
}

function Config({ admin }) {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/loyalty/config').then(setCfg).catch(e => toast(e.message, 'bad')); }, []);

  async function save() {
    setSaving(true);
    try { await api.put('/loyalty/config', cfg); toast('Configuración guardada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
    setSaving(false);
  }
  function setTier(i, k, v) { setCfg(c => ({ ...c, tiers: c.tiers.map((t, j) => j === i ? { ...t, [k]: v } : t) })); }
  function addTier() { setCfg(c => ({ ...c, tiers: [...c.tiers, { name: 'Nuevo nivel', min: 0, discount: 0 }] })); }
  function delTier(i) { setCfg(c => ({ ...c, tiers: c.tiers.filter((_, j) => j !== i) })); }

  if (!cfg) return <div className="empty">Cargando…</div>;
  const ro = !admin; // solo lectura si no es admin

  return (
    <>
      <div className="card mb">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="serif" style={{ fontSize: '1.2rem', margin: 0 }}>Cómo se ganan y canjean los puntos</h2>
          <label className="muted" style={{ display: 'flex', gap: 7, alignItems: 'center', margin: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} disabled={ro} checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} /> Programa activo
          </label>
        </div>
        <div className="grid g3" style={{ marginTop: 12 }}>
          <div className="field"><label>Puntos por cada $1 gastado</label>
            <input type="number" step="0.01" disabled={ro} value={cfg.pointsPerCurrency} onChange={e => setCfg({ ...cfg, pointsPerCurrency: e.target.value })} />
            <p className="muted" style={{ fontSize: '.76rem', marginTop: 3 }}>Ej. 0.1 = 1 punto por cada $10</p>
          </div>
          <div className="field"><label>Valor de cada punto al canjear</label>
            <input type="number" step="0.01" disabled={ro} value={cfg.redeemValue} onChange={e => setCfg({ ...cfg, redeemValue: e.target.value })} />
            <p className="muted" style={{ fontSize: '.76rem', marginTop: 3 }}>Ej. 0.5 = 100 pts valen {money(50)}</p>
          </div>
          <div className="field"><label>Mínimo de puntos para canjear</label>
            <input type="number" disabled={ro} value={cfg.minRedeem} onChange={e => setCfg({ ...cfg, minRedeem: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="card mb">
        <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>Niveles y beneficios</h2>
        <p className="muted mb" style={{ fontSize: '.84rem' }}>Cada nivel se alcanza al acumular cierta cantidad de puntos y otorga un % de descuento.</p>
        <table style={{ width: '100%' }}>
          <thead><tr><th>Nivel</th><th>Desde (puntos)</th><th>Descuento %</th>{!ro && <th></th>}</tr></thead>
          <tbody>
            {cfg.tiers.map((t, i) => (
              <tr key={i}>
                <td><input disabled={ro} value={t.name} onChange={e => setTier(i, 'name', e.target.value)} style={{ maxWidth: 160 }} /></td>
                <td><input type="number" disabled={ro} value={t.min} onChange={e => setTier(i, 'min', +e.target.value)} style={{ maxWidth: 110 }} /></td>
                <td><input type="number" disabled={ro} value={t.discount} onChange={e => setTier(i, 'discount', +e.target.value)} style={{ maxWidth: 90 }} /></td>
                {!ro && <td><div className="row-actions" style={{ justifyContent: 'flex-start' }}><button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => delTier(i)}>Quitar</button></div></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!ro && <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={addTier}>Agregar nivel</button>}
      </div>

      {!ro && <button className="btn" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>}
      {ro && <p className="muted">Solo un administrador puede modificar el programa de lealtad.</p>}
    </>
  );
}

const initials = n => (n || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
// Niveles tipo "metales premium" — coherente con grafito + oro, sin verdes
const TIER_COLOR = ['#B08D57', '#C9A66B', '#2A2A30', '#8A8D93', '#6E5733'];

function Ranking() {
  const [clients, setClients] = useState([]);
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    api.get('/loyalty/config').then(setCfg).catch(() => {});
    api.get('/clients?order=points&take=100').then(setClients).catch(() => {});
  }, []);
  if (!cfg) return <div className="empty">Cargando…</div>;

  const withPoints = clients.filter(c => (c.points || 0) > 0);
  const top3 = withPoints.slice(0, 3);
  const totalPts = clients.reduce((a, c) => a + (c.points || 0), 0);
  const sortedTiers = cfg.tiers;
  const colorOf = name => TIER_COLOR[sortedTiers.findIndex(t => t.name === name) % TIER_COLOR.length] || 'var(--gold)';
  // progreso al siguiente nivel
  const nextTier = pts => sortedTiers.find(t => t.min > pts);
  const podiumOrder = [1, 0, 2]; // plata, oro, bronce visual

  return (
    <>
      {/* Resumen */}
      <div className="grid g3 mb">
        <div className="card kpi"><div className="lbl">Clientes con puntos</div><div className="val">{withPoints.length}</div></div>
        <div className="card kpi"><div className="lbl">Puntos en circulación</div><div className="val">{totalPts.toLocaleString()}</div><div className="chg">valen {money(totalPts * cfg.redeemValue)}</div></div>
        <div className="card kpi"><div className="lbl">Niveles del programa</div><div className="val">{cfg.tiers.length}</div></div>
      </div>

      {/* Podio top 3 */}
      {top3.length >= 1 && (
        <div className="card mb">
          <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>Top clientes</h2>
          <div className="row" style={{ justifyContent: 'center', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
            {podiumOrder.filter(i => top3[i]).map(i => {
              const c = top3[i]; const t = tierOf(c.points, cfg.tiers);
              const h = i === 0 ? 92 : i === 1 ? 74 : 60;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
              return (
                <div key={c.id} style={{ textAlign: 'center', width: 120 }}>
                  <div style={{ fontSize: '1.4rem' }}>{medal}</div>
                  <div className="client-avatar" style={{ width: 52, height: 52, fontSize: '1.1rem', margin: '4px auto', background: colorOf(t.name), color: '#fff' }}>{initials(c.name)}</div>
                  <div style={{ fontWeight: 500, fontSize: '.86rem', lineHeight: 1.2 }}>{c.name.split(' ').slice(0, 2).join(' ')}</div>
                  <div className="muted" style={{ fontSize: '.78rem' }}>{c.points.toLocaleString()} pts</div>
                  <div style={{ height: h, background: `linear-gradient(${colorOf(t.name)}, transparent)`, borderRadius: '10px 10px 0 0', marginTop: 6, opacity: .35 }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista detallada con progreso */}
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%' }}>
          <thead><tr><th>#</th><th>Cliente</th><th>Nivel</th><th>Puntos</th><th>Progreso al siguiente nivel</th><th>Valen</th></tr></thead>
          <tbody>
            {clients.map((c, idx) => {
              const t = tierOf(c.points, cfg.tiers);
              const nt = nextTier(c.points || 0);
              const prevMin = t.min;
              const pct = nt ? Math.min(100, Math.round(((c.points - prevMin) / (nt.min - prevMin)) * 100)) : 100;
              return (
                <tr key={c.id}>
                  <td className="muted">{idx + 1}</td>
                  <td><div className="client-cell"><span className="client-avatar" style={{ background: colorOf(t.name), color: '#fff' }}>{initials(c.name)}</span>{c.name}</div></td>
                  <td><span className="badge" style={{ background: colorOf(t.name), color: '#fff' }}>{t.name}{t.discount ? ` · ${t.discount}%` : ''}</span></td>
                  <td><b>{(c.points || 0).toLocaleString()}</b></td>
                  <td style={{ minWidth: 160 }}>
                    {nt ? (
                      <div>
                        <div style={{ height: 6, background: 'rgba(0,0,0,.06)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: pct + '%', height: '100%', background: colorOf(t.name) }} />
                        </div>
                        <span className="muted" style={{ fontSize: '.72rem' }}>{(nt.min - c.points).toLocaleString()} pts para {nt.name}</span>
                      </div>
                    ) : <span className="muted" style={{ fontSize: '.76rem' }}>Nivel máximo ✦</span>}
                  </td>
                  <td className="muted">{money((c.points || 0) * cfg.redeemValue)}</td>
                </tr>
              );
            })}
            {!clients.length && <tr><td colSpan="6" className="empty">Sin clientes con puntos todavía</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
