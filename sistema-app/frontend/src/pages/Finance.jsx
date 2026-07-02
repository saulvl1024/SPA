import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money, downloadExcel, toast } from '../ui.jsx';
import { isModuleEnabled } from '../permissions.js';
import DateField from '../components/DateField.jsx';

const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const firstOfMonth = () => { const d = new Date(); return localISO(new Date(d.getFullYear(), d.getMonth(), 1)); };
const pct = (cur, prev) => prev ? Math.round((cur - prev) / prev * 100) : (cur ? 100 : 0);

function Delta({ cur, prev }) {
  const p = pct(cur, prev);
  if (!prev && !cur) return null;
  return <div className="chg" style={{ color: p >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p)}% vs periodo anterior</div>;
}

// Iconos finos para los insights (stroke, sin emojis)
const ICONS = {
  up: 'M3 17l6-6 4 4 7-7M14 7h5v5',
  down: 'M3 7l6 6 4-4 7 7M14 17h5v-5',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  trophy: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M6 4h12v5a6 6 0 0 1-12 0V4z M9 18h6 M10 22h4 M12 15v3',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
};
function InsightIcon({ name }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(ICONS[name] || ICONS.star).split(' M').map((seg, i) => <path key={i} d={(i ? 'M' : '') + seg} />)}
    </svg>
  );
}

const DOW_FULL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
// Color de celda: del crema (sin ventas) al plum (máximo). Interpolación RGB simple y limpia.
const PLUM_RGB = [42, 42, 48];      // var(--plum) #2A2A30
const CREAM_RGB = [246, 245, 242];  // var(--cream) #F6F5F2
function heatColor(t) {
  if (t <= 0) return 'var(--cream)';
  const e = 0.18 + t * 0.82; // arranca con algo de tono para que se note aún con poco
  const mix = (a, b) => Math.round(a + (b - a) * e);
  return `rgb(${mix(CREAM_RGB[0], PLUM_RGB[0])},${mix(CREAM_RGB[1], PLUM_RGB[1])},${mix(CREAM_RGB[2], PLUM_RGB[2])})`;
}
function FinHeatRow({ dow, hours, heat, max, onPick, sel }) {
  return (
    <>
      <div className="fin-heat-dd">{DOW_FULL[dow]}</div>
      {hours.map(h => {
        const cell = heat[dow + '-' + h];
        const v = cell ? cell.total : 0;
        const t = v / max; // 0..1
        const isSel = sel && sel.dow === dow && sel.h === h;
        return (
          <div key={h} className={'fin-heat-c' + (isSel ? ' sel' : '')}
            onClick={() => onPick({ dow, h, total: v, count: cell ? cell.count : 0 })}
            title={cell ? `${DOW_FULL[dow]} ${h}:00 · ${money(v)} (${cell.count} tickets)` : `${DOW_FULL[dow]} ${h}:00 · sin ventas`}
            style={{ background: heatColor(t) }} />
        );
      })}
    </>
  );
}

export default function Finance() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(localISO(new Date()));
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [dayDetail, setDayDetail] = useState(null); // { date, sales } detalle al clicar una barra
  const [heatSel, setHeatSel] = useState(null);     // { dow, h, total, count } franja del heatmap seleccionada

  const load = () => api.get(`/analytics?from=${from}&to=${to}`).then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [from, to]); // eslint-disable-line

  // Atajos de periodo
  function setRange(days) {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - days + 1);
    setFrom(localISO(start)); setTo(localISO(end));
  }
  function setThisMonth() { setFrom(firstOfMonth()); setTo(localISO(new Date())); }
  const isMonth = from === firstOfMonth() && to === localISO(new Date());

  function openDay(date) {
    if (dayDetail?.date === date) { setDayDetail(null); return; } // toggle
    api.get('/sales?date=' + date).then(sales => setDayDetail({ date, sales })).catch(() => toast('No se pudo cargar el detalle', 'bad'));
  }

  if (err) return (<><div className="top"><h1>Finanzas y BI</h1></div><div className="card" style={{ color: '#C16B6B' }}>{err}</div></>);
  if (!d) return <div className="top"><h1>Finanzas y BI</h1></div>;
  const c = d.current, pv = d.previous, occ = d.occupancy;

  const proj = d.projection || {};
  const insights = d.insights || [];
  const prevOff = d.prevSerieByOffset || {};
  const serieKeys = Object.keys(c.serie).sort();
  // maxSerie considera ambas series (actual y anterior alineada) para que las barras compartan escala
  const maxSerie = Math.max(...serieKeys.map(k => c.serie[k]), ...Object.values(prevOff), 1);
  const maxDow = Math.max(...occ.byDow, 1);

  // Heatmap: matriz día×hora. Detecta rango de horas con actividad para no mostrar 24 columnas vacías.
  const heat = c.heat || {};
  const heatHours = Object.keys(heat).map(k => +k.split('-')[1]);
  const hMin = heatHours.length ? Math.min(...heatHours) : 9;
  const hMax = heatHours.length ? Math.max(...heatHours) : 20;
  const hoursRange = [];
  for (let h = hMin; h <= hMax; h++) hoursRange.push(h);
  const maxHeat = Math.max(1, ...Object.values(heat).map(c => c.total));

  function exportXlsx() {
    const resumen = [['Métrica', 'Periodo', 'Anterior'],
      ['Ingresos', c.ingresos, pv.ingresos], ['Costo de ventas', c.costoVentas, ''], ['Gastos', c.gastos, pv.gastos], ['Utilidad', c.utilidad, pv.utilidad],
      ['Compras de inventario (informativo)', c.comprasTotal || 0, ''],
      ['Tickets', c.tickets, pv.tickets], ['Clientes', c.clientes, pv.clientes], ['Nuevos', c.nuevos, ''], ['Recurrentes', c.recurrentes, '']];
    const items = [['Artículo', 'Tipo', 'Cantidad', 'Ingreso', 'Costo', 'Margen $', 'Margen %'], ...c.topItems.map(i => [i.name, i.type, i.qty, i.total, i.costo || 0, i.margen || 0, Math.round(i.margenPct || 0)])];
    const rentables = [['Artículo', 'Margen $', 'Margen %'], ...(c.topRentables || []).map(i => [i.name, i.margen, Math.round(i.margenPct || 0)])];
    const clientes = [['Cliente', 'Visitas', 'Gasto'], ...c.topClientes.map(x => [x.name, x.visitas, x.total])];
    const origen = [['Canal', 'Clientes', 'Ingresos'], ...c.origen.map(o => [o.source, o.clientes, o.ingresos])];
    downloadExcel(`finanzas_${from}_a_${to}`, [{ name: 'Resumen', rows: resumen }, { name: 'Top artículos', rows: items }, { name: 'Más rentables', rows: rentables }, { name: 'Top clientes', rows: clientes }, { name: 'Origen', rows: origen }]);
  }

  return (
    <>
      <div className="top">
        <div><h1>Finanzas y BI</h1><div className="sub">Análisis del negocio</div></div>
        <button className="btn ghost" onClick={exportXlsx}>⬇ Excel</button>
      </div>

      {/* Filtros: atajos de periodo + rango personalizado */}
      <div className="fin-filters mb">
        <div className="fin-chips">
          <button className="fin-chip" onClick={() => setRange(1)}>Hoy</button>
          <button className="fin-chip" onClick={() => setRange(7)}>7 días</button>
          <button className="fin-chip" onClick={() => setRange(30)}>30 días</button>
          <button className={'fin-chip' + (isMonth ? ' on' : '')} onClick={setThisMonth}>Este mes</button>
        </div>
        <div className="fin-range">
          <DateField style={{ width: 140 }} value={from} onChange={setFrom} />
          <span className="muted">a</span>
          <DateField style={{ width: 140 }} value={to} onChange={setTo} />
        </div>
      </div>

      {/* KPIs financieros */}
      <div className="stat-row mb">
        <div className="stat"><div className="lbl">Ingresos</div><div className="val">{money(c.ingresos)}</div><Delta cur={c.ingresos} prev={pv.ingresos} /></div>
        <div className="stat"><div className="lbl">Costo de ventas</div><div className="val">{money(c.costoVentas)}</div><div className="chg">insumos + productos</div></div>
        <div className="stat"><div className="lbl">Gastos</div><div className="val">{money(c.gastos)}</div><Delta cur={c.gastos} prev={pv.gastos} /></div>
        <div className="stat"><div className="lbl">Utilidad real</div><div className="val" style={{ color: c.utilidad < 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(c.utilidad)}</div><Delta cur={c.utilidad} prev={pv.utilidad} /></div>
      </div>
      <p className="muted mb" style={{ fontSize: '.82rem', marginTop: -6 }}>Utilidad real = Ingresos − Costo de ventas − Gastos · Ticket promedio {money(c.ticketProm)} ({c.tickets} tickets)</p>

      {/* Insights automáticos: lo que el negocio debe notar de un vistazo */}
      {insights.length > 0 && (
        <div className="fin-insights mb">
          {insights.map((it, i) => (
            <div key={i} className={'fin-insight ' + it.tone} style={{ '--i': i }}>
              <span className="fin-insight-ico"><InsightIcon name={it.icon} /></span>
              <div className="fin-insight-body">
                <div className="fin-insight-title">{it.title}</div>
                <div className="fin-insight-text">{it.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Punto de equilibrio + proyección de cierre */}
      <div className="grid g2 mb">
        <div className="card fin-be">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="serif" style={{ fontSize: '1.2rem' }}>Punto de equilibrio</h2>
            <span className={'fin-be-tag ' + (proj.superado ? 'ok' : 'warn')}>{proj.superado ? 'Superado' : `${proj.breakEvenPct || 0}%`}</span>
          </div>
          <p className="muted" style={{ fontSize: '.8rem', margin: '2px 0 12px' }}>Ventas necesarias para cubrir costos y gastos del periodo.</p>
          <div className="fin-be-bar">
            <span className="fin-be-fill" style={{ width: Math.min(100, proj.breakEvenPct || 0) + '%', background: proj.superado ? 'var(--ok)' : 'var(--gold,#C9A66B)' }} />
            {proj.breakEven > 0 && <span className="fin-be-mark" title="Punto de equilibrio" />}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Vendido</div><b>{money(c.ingresos)}</b></div>
            <div style={{ textAlign: 'center' }}><div className="muted" style={{ fontSize: '.72rem' }}>Equilibrio</div><b>{money(proj.breakEven || 0)}</b></div>
            <div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: '.72rem' }}>{proj.superado ? 'Sobre el punto' : 'Falta'}</div><b style={{ color: proj.superado ? 'var(--ok)' : 'var(--bad)' }}>{money(Math.abs((c.ingresos) - (proj.breakEven || 0)))}</b></div>
          </div>
        </div>

        <div className="card fin-be">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="serif" style={{ fontSize: '1.2rem' }}>Proyección de cierre</h2>
            {proj.enCurso ? <span className="fin-be-tag info">Día {proj.elapsedDays}/{proj.totalDays}</span> : <span className="fin-be-tag">Periodo cerrado</span>}
          </div>
          <p className="muted" style={{ fontSize: '.8rem', margin: '2px 0 12px' }}>
            {proj.enCurso ? `Al ritmo actual de ${money(proj.ritmoDia || 0)}/día.` : 'El periodo ya terminó; cifras finales.'}
          </p>
          <div className="fin-proj-big">{money(proj.ingresoProyectado || c.ingresos)}</div>
          <div className="muted" style={{ fontSize: '.78rem', marginTop: 2 }}>ingresos proyectados al cierre</div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <div><div className="muted" style={{ fontSize: '.72rem' }}>Utilidad proyectada</div><b style={{ color: (proj.utilidadProyectada ?? c.utilidad) < 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(proj.utilidadProyectada ?? c.utilidad)}</b></div>
            <div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: '.72rem' }}>Margen de contribución</div><b>{proj.margenContribPct ?? 0}%</b></div>
          </div>
        </div>
      </div>

      {/* Compras: informativo, NO afecta la utilidad (eso va por costo de ventas) */}
      <div className="card mb" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="lbl">Compras de inventario (periodo)</div>
          <div className="val" style={{ fontSize: '1.4rem' }}>{money(c.comprasTotal || 0)}</div>
        </div>
        <p className="muted" style={{ fontSize: '.8rem', maxWidth: 460, margin: 0 }}>
          Informativo: lo que invertiste en inventario. No se resta de la utilidad — su impacto ya está en el <b>costo de ventas</b> cuando los productos o insumos se venden.
        </p>
      </div>

      {/* Flujo: ingresos por día (clicable) con comparativo del periodo anterior superpuesto */}
      <div className="card mb">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
          <h2 className="serif" style={{ fontSize: '1.25rem' }}>Ingresos por día <span className="muted" style={{ fontSize: '.78rem', fontWeight: 400 }}>· toca una barra para ver el detalle</span></h2>
          {Object.keys(prevOff).length > 0 && (
            <div className="fin-legend">
              <span className="fin-legend-i"><i className="dot cur" />Este periodo</span>
              <span className="fin-legend-i"><i className="dot prev" />Periodo anterior</span>
            </div>
          )}
        </div>
        {serieKeys.length ? (
          <div className="bars fin-bars-cmp mt">
            {serieKeys.slice(-30).map((k, idx) => {
              const off = serieKeys.length - serieKeys.slice(-30).length + idx; // offset desde inicio del periodo
              const prevV = prevOff[off] || 0;
              return (
                <div key={k} className="bar" style={{ cursor: 'pointer' }} title={`${k}: ${money(c.serie[k])}${prevV ? ` · anterior ${money(prevV)}` : ''} · clic para detalle`}
                  onClick={() => openDay(k)}>
                  {prevV > 0 && <span className="fin-ghost" style={{ height: Math.max(2, prevV / maxSerie * 100) + '%' }} />}
                  <div className="col" style={{ height: Math.max(3, c.serie[k] / maxSerie * 100) + '%', background: dayDetail?.date === k ? 'var(--plum)' : undefined }} />
                  <small>{k.slice(8)}</small>
                </div>
              );
            })}
          </div>
        ) : <div className="empty">Sin ventas en el periodo</div>}

        {dayDetail && (
          <div className="card" style={{ background: 'var(--cream)', marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b>Ventas del {new Date(dayDetail.date + 'T12:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
              <span className="link" onClick={() => setDayDetail(null)}>cerrar ✕</span>
            </div>
            <div className="row mb" style={{ gap: 18 }}>
              <span className="muted">Total: <b style={{ color: 'var(--ink)' }}>{money(c.serie[dayDetail.date] || 0)}</b></span>
              <span className="muted">Tickets: <b style={{ color: 'var(--ink)' }}>{dayDetail.sales.length}</b></span>
              <span className="muted">Promedio: <b style={{ color: 'var(--ink)' }}>{money(dayDetail.sales.length ? (c.serie[dayDetail.date] || 0) / dayDetail.sales.length : 0)}</b></span>
            </div>
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead><tr><th>#</th><th>Hora</th><th>Cliente</th><th>Total</th></tr></thead>
                <tbody>
                  {dayDetail.sales.map(s => (
                    <tr key={s.id}>
                      <td>#{s.ticketNo}</td>
                      <td className="muted">{new Date(s.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{s.client?.name || '—'}</td>
                      <td>{money(s.total)}</td>
                    </tr>
                  ))}
                  {!dayDetail.sales.length && <tr><td colSpan="4" className="empty">Sin ventas ese día</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Retención + ingresos por tipo */}
      <div className="grid g2 mb">
        <div className="card">
          <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>Retención y clientes</h2>
          <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="muted">Clientes atendidos</span><b>{c.clientes}</b></div>
          <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="muted">Nuevos</span><b>{c.nuevos}</b></div>
          <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="muted">Recurrentes</span><b>{c.recurrentes}</b></div>
          <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="muted">Tasa de retorno</span><b>{c.clientes ? Math.round(c.recurrentes / c.clientes * 100) : 0}%</b></div>
          <div className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}><span className="muted">Valor de vida (LTV) promedio</span><b>{money(d.ltv.ltvPromedio)}</b></div>
        </div>
        <div className="card">
          <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>Ingresos por tipo</h2>
          {(() => {
            const ents = Object.entries(c.ingresoTipo).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
            const max = Math.max(1, ...ents.map(e => e[1]));
            return ents.length ? ents.map(([k, v]) => (
              <div key={k} className="fin-prop">
                <div className="fin-prop-head"><span style={{ textTransform: 'capitalize' }}>{k}</span><b>{money(v)}</b></div>
                <div className="fin-prop-bar"><span style={{ width: (v / max * 100) + '%', background: 'var(--plum)' }} /></div>
              </div>
            )) : <p className="muted">Sin ingresos</p>;
          })()}
          <h2 className="serif mb mt" style={{ fontSize: '1.2rem', marginTop: 18 }}>Gastos por categoría</h2>
          {(() => {
            const ents = Object.entries(c.gastosCat).sort((a, b) => b[1] - a[1]);
            const max = Math.max(1, ...ents.map(e => e[1]));
            return ents.length ? ents.map(([k, v]) => (
              <div key={k} className="fin-prop">
                <div className="fin-prop-head"><span>{k}</span><b>{money(v)}</b></div>
                <div className="fin-prop-bar"><span style={{ width: (v / max * 100) + '%', background: 'var(--gold,#C9A66B)' }} /></div>
              </div>
            )) : <p className="muted">Sin gastos</p>;
          })()}
        </div>
      </div>

      {/* Ocupación — solo relevante si el negocio usa agenda/citas (spa, servicios).
          Se muestra si el módulo Agenda está activo o si hay citas en el periodo. */}
      {(isModuleEnabled('agenda') && (occ.byStaff.length > 0 || occ.byDow.some(n => n > 0))) && (
        <div className="grid g2 mb">
          <div className="card">
            <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>Ocupación por día de la semana</h2>
            <div className="bars" style={{ height: 140 }}>
              {[1, 2, 3, 4, 5, 6, 0].map(i => (
                <div key={i} className="bar" title={`${occ.byDow[i]} citas`}>
                  <div className="col" style={{ height: Math.max(3, occ.byDow[i] / maxDow * 100) + '%' }} />
                  <small>{DOW[i]}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h2 className="serif mb" style={{ fontSize: '1.2rem' }}>Citas por especialista</h2>
            <div className="fin-rank">
              {occ.byStaff.map((s, k) => (
                <div key={s.name} className="fin-rank-row">
                  <span className={'fin-rank-n' + (k < 3 ? ' top' : '')}>{k + 1}</span>
                  <span className="fin-rank-name">{s.name}</span>
                  <b className="fin-rank-val">{s.count}</b>
                </div>
              ))}
              {!occ.byStaff.length && <div className="empty">Sin citas</div>}
            </div>
          </div>
        </div>
      )}

      {/* Mapa de calor: cuándo vendes más (hora × día). Solo si hay datos. */}
      {Object.keys(heat).length > 0 && (() => {
        // Franja pico para el texto descriptivo
        let peak = null;
        Object.entries(heat).forEach(([key, cell]) => {
          if (!peak || cell.total > peak.total) { const [dw, hh] = key.split('-').map(Number); peak = { dow: dw, h: hh, total: cell.total, count: cell.count }; }
        });
        return (
          <div className="card mb">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
              <h2 className="serif" style={{ fontSize: '1.2rem' }}>¿Cuándo vendes más? <span className="muted" style={{ fontSize: '.78rem', fontWeight: 400 }}>· toca una casilla para ver el detalle</span></h2>
            </div>
            {peak && (
              <p className="muted" style={{ fontSize: '.84rem', margin: '4px 0 12px' }}>
                Tu mejor franja es el <b style={{ color: 'var(--ink)' }}>{DOW_FULL[peak.dow]} a las {peak.h}:00</b> · {money(peak.total)} en {peak.count} ticket{peak.count !== 1 ? 's' : ''}.
              </p>
            )}
            <div className="fin-heat" style={{ '--cols': hoursRange.length }}>
              <div className="fin-heat-corner" />
              {hoursRange.map(h => <div key={'h' + h} className="fin-heat-hh">{h}</div>)}
              {[1, 2, 3, 4, 5, 6, 0].map(dow => (
                <FinHeatRow key={dow} dow={dow} hours={hoursRange} heat={heat} max={maxHeat}
                  sel={heatSel} onPick={p => setHeatSel(s => (s && s.dow === p.dow && s.h === p.h) ? null : p)} />
              ))}
            </div>
            <div className="fin-heat-scale">
              <span>Menos</span>
              <span className="fin-heat-scale-grad" />
              <span>Más ingreso</span>
            </div>

            {/* Detalle de la franja seleccionada */}
            {heatSel && (
              <div className="fin-heat-detail">
                <div>
                  <div className="fin-heat-detail-when">{DOW_FULL[heatSel.dow]} · {heatSel.h}:00 – {heatSel.h + 1}:00</div>
                  <div className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>
                    {heatSel.total > 0
                      ? `${money(heatSel.total)} en ${heatSel.count} ticket${heatSel.count !== 1 ? 's' : ''} · promedio ${money(heatSel.count ? heatSel.total / heatSel.count : 0)} por venta`
                      : 'Sin ventas en esta franja. Podría ser una oportunidad para una promoción.'}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => setHeatSel(null)}>Cerrar</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Lo más vendido vs lo más rentable — frecuentemente NO coinciden */}
      <div className="grid g2 mb">
        <div className="card"><h2 className="serif mb" style={{ fontSize: '1.15rem' }}>Más vendido <span className="muted" style={{ fontSize: '.74rem', fontWeight: 400 }}>· por ingreso</span></h2>
          <div className="fin-rank">
            {c.topItems.map((i, k) => (
              <div key={k} className="fin-rank-row">
                <span className={'fin-rank-n' + (k < 3 ? ' top' : '')}>{k + 1}</span>
                <span className="fin-rank-name">{i.name}<small className="muted" style={{ display: 'block', fontSize: '.7rem' }}>{i.qty} und · margen {Math.round(i.margenPct || 0)}%</small></span>
                <b className="fin-rank-val">{money(i.total)}</b>
              </div>
            ))}
            {!c.topItems.length && <div className="empty">—</div>}
          </div>
        </div>
        <div className="card"><h2 className="serif mb" style={{ fontSize: '1.15rem' }}>Más rentable <span className="muted" style={{ fontSize: '.74rem', fontWeight: 400 }}>· por margen $</span></h2>
          <div className="fin-rank">
            {(c.topRentables || []).map((i, k) => (
              <div key={k} className="fin-rank-row">
                <span className={'fin-rank-n' + (k < 3 ? ' top' : '')}>{k + 1}</span>
                <span className="fin-rank-name">{i.name}<small className="muted" style={{ display: 'block', fontSize: '.7rem' }}>{Math.round(i.margenPct || 0)}% de margen</small></span>
                <b className="fin-rank-val" style={{ color: 'var(--ok)' }}>{money(i.margen)}</b>
              </div>
            ))}
            {!(c.topRentables || []).length && <div className="empty">Sin datos de costo</div>}
          </div>
        </div>
      </div>

      {/* Tops con ranking visual */}
      <div className="grid g2">
        <div className="card"><h2 className="serif mb" style={{ fontSize: '1.15rem' }}>Top clientes</h2>
          <div className="fin-rank">
            {c.topClientes.map((x, k) => (
              <div key={k} className="fin-rank-row">
                <span className={'fin-rank-n' + (k < 3 ? ' top' : '')}>{k + 1}</span>
                <span className="fin-rank-name">{x.name}</span>
                <b className="fin-rank-val">{money(x.total)}</b>
              </div>
            ))}
            {!c.topClientes.length && <div className="empty">—</div>}
          </div>
        </div>
        <div className="card"><h2 className="serif mb" style={{ fontSize: '1.15rem' }}>Por canal / origen</h2>
          <div className="fin-rank">
            {c.origen.map((o, k) => (
              <div key={k} className="fin-rank-row">
                <span className={'fin-rank-n' + (k < 3 ? ' top' : '')}>{k + 1}</span>
                <span className="fin-rank-name">{o.source}<small className="muted" style={{ display: 'block', fontSize: '.7rem' }}>{o.clientes} clientes</small></span>
                <b className="fin-rank-val">{money(o.ingresos)}</b>
              </div>
            ))}
            {!c.origen.length && <div className="empty">—</div>}
          </div>
        </div>
      </div>
    </>
  );
}
