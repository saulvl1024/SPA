import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast, money } from '../ui.jsx';
import { setSettings, setBusinessName } from '../permissions.js';

// Pestañas del CRM que el admin puede mostrar/ocultar (Clientes siempre visible)
const CRM_TABS = [
  ['empresas', 'Empresas', 'Directorio de empresas cliente (B2B)'],
  ['tratos', 'Embudo', 'Pipeline de oportunidades B2C/B2B'],
  ['proyectos', 'Proyectos', 'Gestión de proyectos con hitos y tareas'],
  ['campanas', 'Campañas', 'Campañas de marketing'],
  ['automatizaciones', 'Automatización', 'Recordatorios y envíos automáticos'],
  ['cumple', 'Cumpleaños', 'Clientes que cumplen años'],
  ['seguimientos', 'Seguimientos', 'Tareas de seguimiento pendientes'],
  ['origen', 'Origen', 'De dónde llegan tus clientes'],
];

const Ic = ({ children }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const Sw = ({ on, onClick }) => (
  <button type="button" className={'set-switch' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on} />
);

// Quita el fondo de un logo: relleno (flood-fill) desde los bordes con el color de las esquinas.
// Solo elimina el fondo conectado a los bordes → conserva los blancos internos del propio logo.
function stripLogoBg(dataURL) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w = img.width, h = img.height;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, w, h); const d = id.data;
      const at = (x, y) => (y * w + x) * 4;
      // Color de fondo estimado = promedio de las 4 esquinas
      const cs = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
      let rr = 0, gg = 0, bb = 0;
      cs.forEach(([x, y]) => { const p = at(x, y); rr += d[p]; gg += d[p + 1]; bb += d[p + 2]; });
      rr /= 4; gg /= 4; bb /= 4;
      const tol = 72;
      const match = p => Math.sqrt((d[p] - rr) ** 2 + (d[p + 1] - gg) ** 2 + (d[p + 2] - bb) ** 2) < tol;
      const seen = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
      for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }
      while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const vi = y * w + x; if (seen[vi]) continue; seen[vi] = 1;
        const p = at(x, y);
        if (!match(p)) continue;
        d[p + 3] = 0; // transparente
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }
      ctx.putImageData(id, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [bizName, setBizName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/system/config').then(c => { setCfg(c.settings || {}); setBizName(c.businessName || ''); }).catch(e => toast(e.message, 'bad'));
  }, []);

  if (!cfg) return <div className="top"><h1>Ajustes del sistema</h1></div>;

  const crmTabs = cfg.crmTabs || {};
  const tabOn = k => crmTabs[k] !== false;
  const setTab = (k, v) => setCfg({ ...cfg, crmTabs: { ...crmTabs, [k]: v } });
  const set = (k, v) => setCfg({ ...cfg, [k]: v });   // helper para ajustes sueltos
  const num = (k, def = 0) => cfg[k] ?? def;

  // Subir logo: lo redimensiona (máx 300px) para mantener el archivo pequeño
  function onLogoFile(e) {
    const file = e.target.files?.[0]; if (e.target) e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 300;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // Quita el fondo automáticamente al subir, así aparece sin fondo en todos lados
        stripLogoBg(canvas.toDataURL('image/png')).then(clean => setCfg(c => ({ ...c, logo: clean })));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // Vuelve a quitar el fondo del logo ya guardado (por si se subió antes con fondo)
  function removeLogoBg() {
    if (!cfg.logo) return;
    stripLogoBg(cfg.logo).then(clean => { setCfg(cf => ({ ...cf, logo: clean })); toast('Fondo quitado · recuerda Guardar cambios', 'ok'); });
  }

  async function save() {
    setSaving(true);
    try {
      // Enviamos todos los ajustes; el backend solo aplica los editables por el admin
      const body = { settings: cfg, businessName: bizName };
      const r = await api.put('/system/admin-settings', body);
      setSettings(r.settings);          // aplica de inmediato en toda la app
      setBusinessName(r.businessName);  // nombre del negocio en menú, tickets, etc.
      setCfg(r.settings);
      toast('Ajustes guardados', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="top">
        <div><h1>Ajustes del sistema</h1></div>
        <button className="btn set-save" disabled={saving} onClick={save}>
          {saving ? 'Guardando…' : (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Guardar cambios</>)}
        </button>
      </div>

      {/* Marca y datos del negocio (ancho completo) */}
      <section className="set-card set-lead">
          <div className="set-card-head">
            <span className="set-card-ic"><Ic><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" /><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" /></Ic></span>
            <div><div className="set-card-t">Marca y datos del negocio</div><div className="set-card-d">Aparecen en tickets, cotizaciones y el menú público</div></div>
          </div>
          <div className="set-card-body">
            <div className="field"><label>Nombre del negocio</label>
              <input value={bizName} onChange={e => setBizName(e.target.value)} placeholder="El nombre que aparece en el menú, tickets y documentos" />
            </div>
            <div className="set-logo">
              <div className="brand-logo-box">
                {cfg.logo ? <img src={cfg.logo} alt="Logo" /> : <span className="muted" style={{ fontSize: '.76rem' }}>Sin logo</span>}
              </div>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="logo-btn upload">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                    {cfg.logo ? 'Cambiar logo' : 'Subir logo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onLogoFile} />
                  </label>
                  {cfg.logo && <button type="button" className="logo-btn bg" onClick={removeLogoBg} title="Quita el fondo blanco/uniforme">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 2 20 20" /><path d="M8.35 2.69A10 10 0 0 1 21.3 15.65M6 6a10 10 0 0 0 12 12" /><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" /></svg>
                    Quitar fondo
                  </button>}
                  {cfg.logo && <button type="button" className="logo-btn remove" onClick={() => setCfg({ ...cfg, logo: '' })}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                    Quitar
                  </button>}
                </div>
                <span className="muted" style={{ fontSize: '.76rem', display: 'block', marginTop: 6, maxWidth: 340 }}>Se recomienda PNG con fondo transparente. Si tu logo tiene fondo blanco, usa <b>Quitar fondo</b> y luego <b>Guardar cambios</b>.</span>
              </div>
            </div>
            <div className="row2" style={{ marginTop: 14 }}>
              <div className="field"><label>Razón social</label><input value={cfg.businessLegalName || ''} onChange={e => setCfg({ ...cfg, businessLegalName: e.target.value })} placeholder="Nombre fiscal del negocio" /></div>
              <div className="field"><label>RFC</label><input value={cfg.businessRfc || ''} onChange={e => setCfg({ ...cfg, businessRfc: e.target.value })} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Teléfono</label><input value={cfg.businessPhone || ''} onChange={e => setCfg({ ...cfg, businessPhone: e.target.value })} /></div>
              <div className="field"><label>Email</label><input value={cfg.businessEmail || ''} onChange={e => setCfg({ ...cfg, businessEmail: e.target.value })} /></div>
            </div>
            <div className="field"><label>Dirección</label><input value={cfg.businessAddress || ''} onChange={e => setCfg({ ...cfg, businessAddress: e.target.value })} placeholder="Calle, número, colonia, ciudad" /></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Pie del ticket de venta</label><input value={cfg.ticketFooter || ''} onChange={e => setCfg({ ...cfg, ticketFooter: e.target.value })} placeholder="Ej. ¡Gracias por tu compra!" /></div>
          </div>
        </section>

        {/* Dos columnas de flujo propio: sin huecos entre tarjetas */}
        <div className="set-grid">
        <div className="set-col">

        {/* Pestañas del CRM */}
        <section className="set-card">
          <div className="set-card-head">
            <span className="set-card-ic"><Ic><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></Ic></span>
            <div><div className="set-card-t">Pestañas del CRM</div><div className="set-card-d">Muestra u oculta secciones (Clientes siempre visible)</div></div>
          </div>
          <div className="set-card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {CRM_TABS.map(([key, label, desc]) => (
              <div key={key} className={'set-row' + (tabOn(key) ? '' : ' off')}>
                <span className="set-row-ic">{label[0]}</span>
                <div className="set-row-txt"><div className="set-row-l">{label}</div><div className="set-row-d">{desc}</div></div>
                <Sw on={tabOn(key)} onClick={() => setTab(key, !tabOn(key))} />
              </div>
            ))}
          </div>
        </section>

        {/* Cotizaciones y envíos */}
        <section className="set-card">
          <div className="set-card-head">
            <span className="set-card-ic"><Ic><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></Ic></span>
            <div><div className="set-card-t">Cotizaciones y envíos</div><div className="set-card-d">Envío gratis por umbral y WhatsApp del negocio</div></div>
          </div>
          <div className="set-card-body">
            <div className="row2">
              <div className="field">
                <label>Envío gratis a partir de ($)</label>
                <input type="number" min="0" placeholder="0 = desactivado"
                  value={cfg.envioGratisDesde ?? ''}
                  onChange={e => setCfg({ ...cfg, envioGratisDesde: e.target.value === '' ? 0 : Math.max(0, +e.target.value || 0) })} />
                <span className="muted" style={{ fontSize: '.76rem' }}>{cfg.envioGratisDesde > 0 ? `El envío es gratis desde ${money(cfg.envioGratisDesde)}.` : 'Si el subtotal alcanza este monto, el envío se pone gratis solo.'}</span>
              </div>
              <div className="field">
                <label>WhatsApp del negocio</label>
                <input placeholder="Ej. 5218112345678"
                  value={cfg.whatsappNumero ?? ''}
                  onChange={e => setCfg({ ...cfg, whatsappNumero: e.target.value })} />
                <span className="muted" style={{ fontSize: '.76rem' }}>Formato internacional, sin “+” ni espacios.</span>
              </div>
            </div>
          </div>
        </section>

        </div>{/* fin col 1 */}
        <div className="set-col">

        {/* Seguridad */}
        <section className="set-card">
          <div className="set-card-head">
            <span className="set-card-ic"><Ic><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Ic></span>
            <div><div className="set-card-t">Seguridad</div><div className="set-card-d">Protege las acciones sensibles del negocio</div></div>
          </div>
          <div className="set-card-body" style={{ paddingTop: 4 }}>
            <div className="set-row"><span className="set-row-ic">✕</span><div className="set-row-txt"><div className="set-row-l">PIN para cancelar / devolver</div><div className="set-row-d">Pide PIN de gerente al cancelar una venta</div></div><Sw on={!!cfg.pinCancelSale} onClick={() => set('pinCancelSale', !cfg.pinCancelSale)} /></div>
            <div className="set-row"><span className="set-row-ic">±</span><div className="set-row-txt"><div className="set-row-l">PIN para ajustar stock</div><div className="set-row-d">Pide PIN al modificar inventario a mano</div></div><Sw on={!!cfg.pinStockAdjust} onClick={() => set('pinStockAdjust', !cfg.pinStockAdjust)} /></div>
            <div className="set-row"><span className="set-row-ic">%</span><div className="set-row-txt"><div className="set-row-l">PIN para descuentos grandes</div><div className="set-row-d">Cuando superan el máximo permitido</div></div><Sw on={!!cfg.pinBigDiscount} onClick={() => set('pinBigDiscount', !cfg.pinBigDiscount)} /></div>
            <div className="field" style={{ marginTop: 12, marginBottom: 0 }}><label>Cierre de sesión por inactividad (minutos)</label><input type="number" min="0" style={{ maxWidth: 170 }} value={num('sessionTimeoutMin')} onChange={e => set('sessionTimeoutMin', Math.max(0, +e.target.value || 0))} /><span className="muted" style={{ fontSize: '.76rem' }}>0 = no cerrar sesión automáticamente.</span></div>
          </div>
        </section>

        {/* Ventas / POS */}
        <section className="set-card">
          <div className="set-card-head">
            <span className="set-card-ic"><Ic><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></Ic></span>
            <div><div className="set-card-t">Ventas / Punto de venta</div><div className="set-card-d">Impuestos, propina, pagos y descuentos</div></div>
          </div>
          <div className="set-card-body">
            <div className="row2">
              <div className="field"><label>IVA por defecto (%)</label><input type="number" min="0" max="100" value={num('ivaDefault')} onChange={e => set('ivaDefault', Math.max(0, Math.min(100, +e.target.value || 0)))} /></div>
              <div className="field"><label>Descuento máx. por empleado (%)</label><input type="number" min="0" max="100" value={num('maxDiscountPct', 100)} onChange={e => set('maxDiscountPct', Math.max(0, Math.min(100, +e.target.value || 0)))} /></div>
            </div>
            <div className="set-row"><span className="set-row-ic">I</span><div className="set-row-txt"><div className="set-row-l">Precios con IVA incluido</div><div className="set-row-d">Los precios ya llevan el impuesto</div></div><Sw on={cfg.pricesIncludeIva !== false} onClick={() => set('pricesIncludeIva', cfg.pricesIncludeIva === false)} /></div>
            <div className="set-row"><span className="set-row-ic">$</span><div className="set-row-txt"><div className="set-row-l">Sugerir propina</div><div className="set-row-d">Mostrar propina sugerida al cobrar</div></div><Sw on={!!cfg.tipEnabled} onClick={() => set('tipEnabled', !cfg.tipEnabled)} /></div>
            {cfg.tipEnabled && <div className="field" style={{ marginTop: 8 }}><label>Propina sugerida (%)</label><input type="number" min="0" max="100" style={{ maxWidth: 140 }} value={num('tipSuggested', 10)} onChange={e => set('tipSuggested', Math.max(0, Math.min(100, +e.target.value || 0)))} /></div>}
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: '.82rem', fontWeight: 500, color: 'var(--ink)' }}>Métodos de pago aceptados</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
                {[['payCash', 'Efectivo'], ['payCard', 'Tarjeta'], ['payTransfer', 'Transferencia']].map(([k, l]) => (
                  <button key={k} type="button" className={'proj-member-chip' + (cfg[k] !== false ? ' on' : '')} onClick={() => set(k, cfg[k] === false)}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Agenda e inventario */}
        <section className="set-card">
          <div className="set-card-head">
            <span className="set-card-ic"><Ic><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Ic></span>
            <div><div className="set-card-t">Agenda e inventario</div><div className="set-card-d">Citas, recordatorios y alertas de stock</div></div>
          </div>
          <div className="set-card-body">
            <div className="row2">
              <div className="field"><label>Duración por defecto de cita (min)</label><input type="number" min="5" step="5" value={num('apptDefaultMin', 60)} onChange={e => set('apptDefaultMin', Math.max(5, +e.target.value || 60))} /></div>
              <div className="field"><label>Recordatorio de cita (horas antes)</label><input type="number" min="0" value={num('reminderHoursBefore', 24)} onChange={e => set('reminderHoursBefore', Math.max(0, +e.target.value || 0))} /></div>
            </div>
            <div className="field"><label>Alerta de stock bajo (unidades)</label><input type="number" min="0" style={{ maxWidth: 170 }} value={num('stockAlert', 5)} onChange={e => set('stockAlert', Math.max(0, +e.target.value || 0))} /></div>
            <div className="set-row" style={{ borderBottom: 'none' }}><span className="set-row-ic">0</span><div className="set-row-txt"><div className="set-row-l">Permitir vender con stock en cero</div><div className="set-row-d">Si se apaga, no se vende sin existencias</div></div><Sw on={!!cfg.allowZeroStock} onClick={() => set('allowZeroStock', !cfg.allowZeroStock)} /></div>
          </div>
        </section>

        </div>{/* fin col 2 */}
        </div>{/* fin set-grid */}

      <p className="muted" style={{ fontSize: '.8rem', marginTop: 18 }}>Los cambios aplican al recargar cada pantalla. Otras opciones (giro del negocio, módulos, listas de precios) las gestiona el proveedor del sistema.</p>
    </>
  );
}
