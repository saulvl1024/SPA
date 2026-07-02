import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../ui.jsx';
import Select from '../components/Select.jsx';

// Panel del DUEÑO del ERP (súper-admin). Solo accesible si iniciaste sesión como superadmin;
// el backend valida el rol. El admin del negocio nunca ve esta ruta.
export default function SystemConfig() {
  const [cfg, setCfg] = useState(null);   // { businessName, disabledModules, modules }
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/system/superadmin/config')
      .then(setCfg)
      .catch(e => setErr(e.message || 'No autorizado'));
  }, []);

  function toggle(modKey) {
    setCfg(c => {
      const dis = c.disabledModules.includes(modKey)
        ? c.disabledModules.filter(m => m !== modKey)
        : [...c.disabledModules, modKey];
      return { ...c, disabledModules: dis };
    });
  }
  function toggleSetting(key) {
    setCfg(c => ({ ...c, settings: { ...c.settings, [key]: !c.settings[key] } }));
  }
  function setSettingValue(key, value) {
    setCfg(c => ({ ...c, settings: { ...c.settings, [key]: value } }));
  }
  // Al elegir un giro, aplica su preset: módulos recomendados + ajustes finos.
  // El super-admin puede afinar cualquier módulo/ajuste después (esto es solo el punto de partida).
  function changeType(t) {
    setCfg(c => {
      const enabled = c.presetModules?.[t] || [];           // opcionales recomendados para el giro
      const core = c.coreKeys || [];                          // core siempre activos
      const allOptional = (c.modules || []).filter(m => !core.includes(m.key)).map(m => m.key);
      // Deshabilita los opcionales que NO están en el preset del giro
      const disabled = allOptional.filter(k => !enabled.includes(k));
      const presetSettings = c.presetSettings?.[t] || {};
      return { ...c, businessType: t, disabledModules: disabled, settings: { ...c.settings, ...presetSettings } };
    });
  }

  async function save() {
    try {
      await api.put('/system/superadmin/config', {
        businessName: cfg.businessName, businessType: cfg.businessType,
        settings: cfg.settings, disabledModules: cfg.disabledModules,
      });
      toast('Configuración guardada. Pide a los usuarios recargar (Ctrl+F5).', 'ok');
    } catch { toast('No se pudo guardar', 'bad'); }
  }

  if (err) return (
    <>
      <div className="top"><h1>Configuración del sistema</h1></div>
      <div className="card"><div className="empty">{err}</div></div>
    </>
  );
  if (!cfg) return <div className="top"><h1>Configuración del sistema</h1></div>;

  return (
    <>
      <div className="top"><div><h1>Configuración del sistema</h1><div className="sub">Proveedor del ERP · módulos por instalación</div></div>
        <button className="btn" onClick={save}>Guardar cambios</button>
      </div>

      <div className="card mb" style={{ maxWidth: 560 }}>
        <div className="grid g2">
          <div className="field"><label>Nombre del negocio</label>
            <input value={cfg.businessName || ''} onChange={e => setCfg({ ...cfg, businessName: e.target.value })} placeholder="Ej. Mi Negocio" />
            <p className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>Aparece en el menú, tickets y mensajes.</p>
          </div>
          <div className="field"><label>Giro del negocio</label>
            <Select value={cfg.businessType || 'general'} onChange={changeType} options={(cfg.businessTypes || []).map(t => ({ value: t.key, label: t.label }))} />
            <p className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>Al cambiar el giro se activan los módulos y funciones recomendados para ese negocio. Puedes ajustar cualquiera abajo manualmente.</p>
          </div>
        </div>
      </div>

      <div className="sec-title">Funciones del sistema</div>
      <p className="muted mb" style={{ fontSize: '.84rem' }}>Afina qué funciones usa este negocio. El giro las preconfigura, pero puedes cambiarlas.</p>
      <div className="card mb" style={{ padding: 0 }}>
        <table style={{ width: '100%' }}>
          <tbody>
            {(cfg.settingDefs || []).map(s => {
              const on = !!cfg.settings?.[s.key];
              return (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sm" onClick={() => toggleSetting(s.key)}
                      style={{ minWidth: 100, background: on ? 'var(--sage)' : 'transparent', color: on ? '#fff' : 'var(--muted)', border: on ? 'none' : '1px solid var(--line)' }}>
                      {on ? '● Sí' : '○ No'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sec-title">Cotizaciones y envíos</div>
      <p className="muted mb" style={{ fontSize: '.84rem' }}>Configura el envío en cotizaciones y el WhatsApp del negocio para enviarlas.</p>
      <div className="card mb">
        <div className="field">
          <label>Envío gratis a partir de ($)</label>
          <input type="number" min="0" placeholder="0 = desactivado"
            value={cfg.settings?.envioGratisDesde ?? ''}
            onChange={e => setSettingValue('envioGratisDesde', e.target.value === '' ? 0 : Math.max(0, +e.target.value || 0))} style={{ maxWidth: 220 }} />
          <span className="muted" style={{ fontSize: '.78rem' }}>Si el subtotal de la cotización alcanza este monto, el envío se pone en gratis automáticamente. Deja 0 para desactivar.</span>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>WhatsApp del negocio</label>
          <input placeholder="Ej. 5218112345678 (con código de país, sin signos)"
            value={cfg.settings?.whatsappNumero ?? ''}
            onChange={e => setSettingValue('whatsappNumero', e.target.value)} style={{ maxWidth: 320 }} />
          <span className="muted" style={{ fontSize: '.78rem' }}>Formato internacional sin “+” ni espacios. Por ahora las cotizaciones se envían abriendo WhatsApp con el mensaje listo; este número se usará cuando se conecte el envío automático.</span>
        </div>
      </div>

      <div className="sec-title">Módulos disponibles</div>
      <p className="muted mb" style={{ fontSize: '.84rem' }}>Apaga los que este cliente no contrató. Los usuarios dejarán de verlos al recargar.</p>
      <div className="card" style={{ padding: 0 }}>
        <table style={{ width: '100%' }}>
          <thead><tr><th>Módulo</th><th style={{ textAlign: 'right' }}>Estado</th></tr></thead>
          <tbody>
            {cfg.modules.map(m => {
              const enabled = !cfg.disabledModules.includes(m.key);
              return (
                <tr key={m.key}>
                  <td>{m.label} {m.core && <span className="badge" style={{ background: 'var(--line)', color: 'var(--muted)', fontSize: '.68rem' }}>esencial</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    {m.core ? (
                      <span className="muted" style={{ fontSize: '.8rem' }}>● Siempre activo</span>
                    ) : (
                      <button className="btn sm" onClick={() => toggle(m.key)}
                        style={{ minWidth: 110, background: enabled ? 'var(--sage)' : 'transparent', color: enabled ? '#fff' : 'var(--muted)', border: enabled ? 'none' : '1px solid var(--line)' }}>
                        {enabled ? '● Activo' : '○ Apagado'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
