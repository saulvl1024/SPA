import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { money, toast } from '../ui.jsx';

const tierOf = (points, tiers) => (tiers.filter(t => (points || 0) >= t.min).pop() || tiers[0]);
const initials = n => (n || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
// Niveles tipo "metales premium" — coherente con grafito + oro, sin verdes
const TIER_COLOR = ['#B08D57', '#C9A66B', '#2A2A30', '#8A8D93', '#6E5733'];

const Ic = ({ d, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);

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
  const earnExample = Number(cfg.pointsPerCurrency) > 0 ? Math.round(1 / Number(cfg.pointsPerCurrency)) : null;

  return (
    <>
      <div className="card mb loy-head">
        <div className="loy-head-txt">
          <span className="loy-head-ic"><Ic s={20} d={<><path d="M12 2 15 8.5 22 9.3l-5 4.6L18.5 21 12 17.3 5.5 21 7 13.9l-5-4.6 7-.8L12 2Z" /></>} /></span>
          <div>
            <h2 className="serif" style={{ fontSize: '1.2rem', margin: 0 }}>Cómo se ganan y canjean los puntos</h2>
            <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 0' }}>{cfg.enabled ? 'El programa está activo y sumando puntos en cada venta.' : 'El programa está desactivado.'}</p>
          </div>
        </div>
        <button type="button" className={'set-switch' + (cfg.enabled ? ' on' : '')} disabled={ro}
          onClick={() => !ro && setCfg({ ...cfg, enabled: !cfg.enabled })} aria-pressed={cfg.enabled} />
      </div>

      <div className="loy-rules mb">
        <div className="loy-rule">
          <span className="loy-rule-ic gold"><Ic s={18} d={<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M9.5 10.5h3.2a1.8 1.8 0 0 1 0 3.5H9.5" /></>} /></span>
          <label className="field-lbl">Puntos por cada $1 gastado</label>
          <input type="number" step="0.01" disabled={ro} value={cfg.pointsPerCurrency} onChange={e => setCfg({ ...cfg, pointsPerCurrency: e.target.value })} />
          <p className="loy-rule-hint">{earnExample ? `1 punto por cada ${money(earnExample)} de compra` : 'Ej. 0.1 = 1 punto por cada $10'}</p>
        </div>
        <div className="loy-rule">
          <span className="loy-rule-ic plum"><Ic s={18} d={<><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" /><path d="M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7ZM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" /></>} /></span>
          <label className="field-lbl">Valor de cada punto al canjear</label>
          <input type="number" step="0.01" disabled={ro} value={cfg.redeemValue} onChange={e => setCfg({ ...cfg, redeemValue: e.target.value })} />
          <p className="loy-rule-hint">100 pts valen {money(100 * (Number(cfg.redeemValue) || 0))}</p>
        </div>
        <div className="loy-rule">
          <span className="loy-rule-ic plum"><Ic s={18} d={<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>} /></span>
          <label className="field-lbl">Mínimo de puntos para canjear</label>
          <input type="number" disabled={ro} value={cfg.minRedeem} onChange={e => setCfg({ ...cfg, minRedeem: e.target.value })} />
          <p className="loy-rule-hint">Valen {money((Number(cfg.minRedeem) || 0) * (Number(cfg.redeemValue) || 0))} al llegar al mínimo</p>
        </div>
      </div>

      <div className="card mb">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 className="serif" style={{ fontSize: '1.2rem', margin: 0 }}>Niveles y beneficios</h2>
          {!ro && <button className="btn ghost sm" onClick={addTier}><Ic s={14} d={<><path d="M12 5v14M5 12h14" /></>} /> Agregar nivel</button>}
        </div>
        <p className="muted mb" style={{ fontSize: '.84rem' }}>Cada nivel se alcanza al acumular cierta cantidad de puntos y otorga un % de descuento.</p>
        <div className="loy-tier-head"><span>Nivel</span><span>Desde (puntos)</span><span>Descuento %</span>{!ro && <span />}</div>
        {cfg.tiers.map((t, i) => (
          <div key={i} className="loy-tier" style={{ '--i': i }}>
            <div className="loy-tier-name">
              <span className="loy-swatch" style={{ background: TIER_COLOR[i % TIER_COLOR.length] }} />
              <input disabled={ro} value={t.name} onChange={e => setTier(i, 'name', e.target.value)} />
            </div>
            <input type="number" disabled={ro} value={t.min} onChange={e => setTier(i, 'min', +e.target.value)} />
            <input type="number" disabled={ro} value={t.discount} onChange={e => setTier(i, 'discount', +e.target.value)} />
            {!ro && <button className="icon-btn danger" title="Quitar nivel" onClick={() => delTier(i)}><Ic s={15} d={<><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>} /></button>}
          </div>
        ))}
      </div>

      {!ro && <button className="btn" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar configuración'}</button>}
      {ro && <p className="muted">Solo un administrador puede modificar el programa de lealtad.</p>}
    </>
  );
}

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
  const nextTier = pts => sortedTiers.find(t => t.min > pts);
  const podiumOrder = [1, 0, 2]; // plata, oro, bronce visual

  return (
    <>
      <div className="inv-kpis">
        <div className="inv-kpi">
          <span className="inv-kpi-ic plum"><Ic s={18} d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>} /></span>
          <div><b>{withPoints.length}</b><span>Clientes con puntos</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic gold"><Ic s={18} d={<><path d="M12 2 15 8.5 22 9.3l-5 4.6L18.5 21 12 17.3 5.5 21 7 13.9l-5-4.6 7-.8L12 2Z" /></>} /></span>
          <div><b>{totalPts.toLocaleString()}</b><span>Puntos en circulación · valen {money(totalPts * cfg.redeemValue)}</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic plum"><Ic s={18} d={<><path d="M4 22h16" /><path d="M6 12v10M18 12v10" /><path d="M12 2 4 8v4h16V8L12 2Z" /></>} /></span>
          <div><b>{cfg.tiers.length}</b><span>Niveles del programa</span></div>
        </div>
      </div>

      {/* Podio top 3 */}
      {top3.length >= 1 && (
        <div className="card mb">
          <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>Top clientes</h2>
          <div className="loy-podium">
            {podiumOrder.filter(i => top3[i]).map(i => {
              const c = top3[i]; const t = tierOf(c.points, cfg.tiers);
              const color = colorOf(t.name);
              const h = i === 0 ? 96 : i === 1 ? 76 : 62;
              return (
                <div key={c.id} className={'loy-pod' + (i === 0 ? ' first' : '')}>
                  {i === 0 && <span className="loy-crown"><Ic s={20} d={<><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8Z" /></>} /></span>}
                  <span className="loy-rank" style={{ background: color }}>{i + 1}</span>
                  <span className="loy-pod-av" style={{ background: color }}>{initials(c.name)}</span>
                  <div className="loy-pod-name">{c.name.split(' ').slice(0, 2).join(' ')}</div>
                  <div className="loy-pod-pts">{c.points.toLocaleString()} pts</div>
                  <div className="loy-pod-bar" style={{ height: h, background: `linear-gradient(${color}, transparent)` }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista detallada con progreso */}
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table className="inv-tbl" style={{ width: '100%' }}>
          <thead><tr><th>#</th><th>Cliente</th><th>Nivel</th><th className="right">Puntos</th><th>Progreso al siguiente nivel</th><th className="right">Valen</th></tr></thead>
          <tbody>
            {clients.map((c, idx) => {
              const t = tierOf(c.points, cfg.tiers);
              const color = colorOf(t.name);
              const nt = nextTier(c.points || 0);
              const prevMin = t.min;
              const pct = nt ? Math.min(100, Math.round(((c.points - prevMin) / (nt.min - prevMin)) * 100)) : 100;
              return (
                <tr key={c.id} className="inv-row" style={{ '--i': idx }}>
                  <td className="muted loy-num">{idx + 1}</td>
                  <td><div className="pur-sup"><span className="loy-av" style={{ background: color }}>{initials(c.name)}</span>{c.name}</div></td>
                  <td><span className="loy-badge" style={{ background: color }}>{t.name}{t.discount ? ` · ${t.discount}%` : ''}</span></td>
                  <td className="right"><b>{(c.points || 0).toLocaleString()}</b></td>
                  <td style={{ minWidth: 180 }}>
                    {nt ? (
                      <div className="loy-prog">
                        <span className="inv-bar"><span className="inv-bar-fill" style={{ width: pct + '%', background: color }} /></span>
                        <span className="muted loy-prog-lbl">{(nt.min - c.points).toLocaleString()} pts para {nt.name}</span>
                      </div>
                    ) : <span className="loy-max"><Ic s={13} d={<><path d="M12 2 15 8.5 22 9.3l-5 4.6L18.5 21 12 17.3 5.5 21 7 13.9l-5-4.6 7-.8L12 2Z" /></>} /> Nivel máximo</span>}
                  </td>
                  <td className="right muted">{money((c.points || 0) * cfg.redeemValue)}</td>
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
