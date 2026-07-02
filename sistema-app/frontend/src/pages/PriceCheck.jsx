import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Modal, money, toast, matches } from '../ui.jsx';
import { setting } from '../permissions.js';
import { useAuth } from '../auth.jsx';
import BarcodeScanner from '../components/BarcodeScanner.jsx';

/* Checador de precios — tablet en el piso de venta.
   Card centrada (foto arriba, info abajo), precio base + listas configuradas por el admin,
   y promoción activa destacada con color. El admin configura qué listas se muestran (engranaje). */
export default function PriceCheck() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [notFound, setNotFound] = useState('');
  const [scanCam, setScanCam] = useState(false);
  const [suggest, setSuggest] = useState([]);
  const [whBreak, setWhBreak] = useState([]);
  const [lists, setLists] = useState([]);         // todas las listas (con items)
  const [shownIds, setShownIds] = useState([]);   // ids de listas a mostrar en la card
  const [promos, setPromos] = useState([]);
  const [cfgOpen, setCfgOpen] = useState(false);  // panel de ajustes (admin)
  const inputRef = useRef(null);
  const scanBuf = useRef({ text: '', t: 0 });
  const usaAlmacenes = setting('usarAlmacenes', false);

  // Carga listas, config del checador y promociones activas
  useEffect(() => {
    api.get('/ventas/price-lists').then(setLists).catch(() => {});
    api.get('/catalog/price-check-config').then(c => setShownIds(c.lists || [])).catch(() => {});
    // Solo promociones de alcance "general" (descuento de producto) aplican en el checador
    api.get('/promotions?active=true&scope=general').then(setPromos).catch(() => {});
  }, []);

  useEffect(() => {
    const pid = result?.productId || result?.id;
    if (usaAlmacenes && pid && result?.type !== 'variant') {
      api.get('/warehouses/stock/' + pid).then(r => setWhBreak(r.filter(w => w.qty > 0))).catch(() => setWhBreak([]));
    } else setWhBreak([]);
  }, [result]); // eslint-disable-line

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function lookupCode(code) {
    const c = String(code || '').trim();
    if (!c) return;
    setNotFound(''); setSuggest([]);
    try { const r = await api.get('/catalog/by-barcode/' + encodeURIComponent(c)); setResult(r); setQ(''); }
    catch { setResult(null); setNotFound(c); }
  }

  useEffect(() => {
    if (!q.trim()) { setSuggest([]); return; }
    const t = setTimeout(() => {
      api.get('/inventory/products').then(list => {
        setSuggest((list || []).filter(p => matches(p.name, q) || matches(p.category || '', q)).slice(0, 8));
      }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function pickProduct(p) {
    setResult({ type: 'product', id: p.id, name: p.name, price: p.price, stock: p.stock, category: p.category, image: p.image });
    setQ(''); setSuggest([]); setNotFound('');
  }

  useEffect(() => {
    function onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' && e.target !== inputRef.current) return;
      const now = Date.now();
      if (now - scanBuf.current.t > 80) scanBuf.current.text = '';
      scanBuf.current.t = now;
      if (e.key === 'Enter') {
        const code = scanBuf.current.text; scanBuf.current.text = '';
        if (code.length >= 4) { e.preventDefault(); lookupCode(code); }
        return;
      }
      if (e.key.length === 1) scanBuf.current.text += e.key;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Precio base y promoción ----
  const pid = result?.productId || result?.id;
  const basePrice = result?.price || 0;
  const bestPromo = promos.reduce((best, p) => {
    const off = p.type === 'percent' ? basePrice * (p.value / 100) : p.value;
    return off > (best?.off || 0) ? { ...p, off } : best;
  }, null);
  const finalPrice = bestPromo ? Math.max(0, basePrice - bestPromo.off) : basePrice;

  // Listas configuradas que contienen este producto, con su precio especial
  const shownLists = result
    ? lists.filter(l => shownIds.includes(l.id))
        .map(l => ({ name: l.name, price: l.items.find(i => i.productId === pid)?.price }))
        .filter(l => l.price != null)
    : [];

  async function saveCfg(ids) {
    setShownIds(ids);
    try { await api.put('/catalog/price-check-config', { lists: ids }); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <div className="pc-page">
      <div className="top">
        <div><h1>Checador de precios</h1><div className="sub">Escanea o busca un producto para ver su precio</div></div>
        {isAdmin && lists.length > 0 && (
          <button className="btn ghost pc-gear" onClick={() => setCfgOpen(true)} title="Configurar listas mostradas">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        )}
      </div>

      <div className="pc-search">
        <div className="pc-search-wrap">
          <svg className="pc-search-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input ref={inputRef} className="pc-input" placeholder="Escanea el código o escribe el nombre…"
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && q.trim()) { e.preventDefault(); if (suggest[0]) pickProduct(suggest[0]); } }} />
        </div>
        <button className="btn pc-cam" onClick={() => setScanCam(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Cámara</span>
        </button>
      </div>

      {suggest.length > 0 && (
        <div className="pc-suggest">
          {suggest.map((p, i) => (
            <button key={p.id} className="pc-suggest-row" style={{ '--i': i }} onClick={() => pickProduct(p)}>
              <span className="pc-sug-thumb">
                {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span>{(p.name || '?').trim().charAt(0).toUpperCase()}</span>}
              </span>
              <span className="pc-sug-text">
                <span className="pc-sug-name">{p.name}</span>
                {p.category && <span className="pc-sug-cat">{p.category}</span>}
              </span>
              <span className="pc-sug-price">{money(p.price)}</span>
              <svg className="pc-sug-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      )}

      {/* Resultado — card centrada vertical */}
      {result && (
        <div className="pc-stage">
          <div className={'pc-card2' + (bestPromo ? ' has-promo' : '')} key={pid}>
            <div className="pc-img2">
              {result.image ? <img src={result.image} alt="" /> : <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .35 }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>}
            </div>

            <div className="pc-body">
              <div className="pc-tags">
                {result.category && <span className="pc-tag">{result.category}</span>}
                {bestPromo && <span className="pc-tag pc-tag-promo">{bestPromo.name}</span>}
              </div>
              <div className="pc-name">{result.name}</div>

              {/* Precio principal: con promo se ve en bloque destacado de color */}
              {bestPromo ? (
                <div className="pc-promo-block">
                  <span className="pc-price-was">{money(basePrice)}</span>
                  <span className="pc-price-final">{money(finalPrice)}</span>
                  <span className="pc-promo-tag">
                    {bestPromo.type === 'percent' ? `−${bestPromo.value}%` : `−${money(bestPromo.value)}`} · {bestPromo.name}
                  </span>
                </div>
              ) : (
                <div className="pc-price">{money(basePrice)}</div>
              )}

              {/* Listas de precios configuradas, apiladas */}
              {shownLists.length > 0 && (
                <div className="pc-lists">
                  <div className="pc-lists-head">Otros precios</div>
                  {shownLists.map((l, i) => (
                    <div key={i} className="pc-list-card" style={{ '--i': i }}>
                      <span className="pc-list-dot" />
                      <span className="pc-list-name">{l.name}</span>
                      <span className="pc-list-price">{money(l.price)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={'pc-stock' + (result.stock <= 0 ? ' out' : '')}>
                <span className="pc-stock-dot" />
                {result.stock > 0 ? `${result.stock} en existencia` : 'Sin existencia'}
              </div>

              {usaAlmacenes && whBreak.length > 0 && (
                <div className="pc-wh">
                  {whBreak.map(w => (
                    <div key={w.warehouseId} className="pc-wh-row"><span className="muted">{w.name}</span><b>{w.qty}</b></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {notFound && !result && (
        <div className="pc-empty">No se encontró ningún producto con el código <b>{notFound}</b>.</div>
      )}
      {!result && !notFound && suggest.length === 0 && (
        <div className="pc-hint">
          <div className="pc-hint-ic">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 7v10M10 7v10M14 7v10M18 7v10"/></svg>
          </div>
          <p className="muted">Pasa un producto por el lector, o escribe su nombre arriba.</p>
          {promos.length > 0 && (
            <div className="pc-promos-banner">
              <span className="pc-promos-label">Promociones activas</span>
              <div className="pc-promos-chips">
                {promos.map(p => <span key={p.id} className="pc-promo-chip">{p.name} · {p.type === 'percent' ? `${p.value}%` : money(p.value)}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Panel de configuración (admin): qué listas mostrar en la card */}
      {cfgOpen && (
        <Modal title="Listas en el checador" onClose={() => setCfgOpen(false)} width={440}>
          <p className="muted mb" style={{ fontSize: '.86rem' }}>Elige qué listas de precios aparecen en la card del checador. Los clientes las verán automáticamente.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {lists.map(l => {
              const on = shownIds.includes(l.id);
              return (
                <label key={l.id} className="pc-cfg-row">
                  <input type="checkbox" checked={on} onChange={() => saveCfg(on ? shownIds.filter(x => x !== l.id) : [...shownIds, l.id])} />
                  <span>{l.name}</span>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: '.78rem' }}>{l.items.length} productos</span>
                </label>
              );
            })}
            {!lists.length && <span className="muted" style={{ fontSize: '.84rem' }}>No hay listas de precios. Créalas en Ventas → Listas de precios.</span>}
          </div>
          <div className="modal-actions"><button className="btn" onClick={() => setCfgOpen(false)}>Listo</button></div>
        </Modal>
      )}

      {scanCam && <BarcodeScanner onDetected={code => { setScanCam(false); lookupCode(code); }} onClose={() => setScanCam(false)} />}
    </div>
  );
}
