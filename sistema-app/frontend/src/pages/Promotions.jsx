import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, money, matches } from '../ui.jsx';
import Select from '../components/Select.jsx';

const empty = { code: '', name: '', type: 'percent', value: '', scope: 'general' };
const SCOPE_LABEL = { pos: 'Cupón POS', crm: 'CRM / mensajes', general: 'Producto (checador)' };
const SCOPE_ICON = {
  general: <><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" /></>,
  pos: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  crm: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></>,
};

const Ic = ({ d, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);

export default function Promotions() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);

  const load = () => api.get('/promotions').then(setList);
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      if (!form.code || !form.name) return toast('Código y nombre obligatorios', 'bad');
      if (form.id) await api.put('/promotions/' + form.id, form);
      else await api.post('/promotions', form);
      setForm(null); load(); toast('Promoción guardada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function toggle(p) { await api.put('/promotions/' + p.id, { active: !p.active }); load(); }
  async function remove(p) { if (!confirm('¿Eliminar ' + p.code + '?')) return; await api.del('/promotions/' + p.id); load(); }

  const valLabel = p => p.type === 'percent' ? (p.value || 0) + '%' : money(p.value);
  const activas = list.filter(p => p.active).length;
  const bdays = list.filter(p => p.birthday).length;
  const shown = list.filter(p => (!onlyActive || p.active) && (!q.trim() || matches(p.code || '', q) || matches(p.name || '', q) || matches(SCOPE_LABEL[p.scope || 'general'], q)));

  return (
    <>
      <div className="top">
        <div><h1>Promociones y descuentos</h1><div className="sub">Cupones que se aplican en el punto de venta</div></div>
        <button className="btn" onClick={() => setForm({ ...empty })}><Ic s={15} d={<><path d="M12 5v14M5 12h14" /></>} /> Nueva promoción</button>
      </div>

      <div className="inv-kpis">
        <div className="inv-kpi">
          <span className="inv-kpi-ic gold"><Ic s={18} d={<><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" /></>} /></span>
          <div><b>{list.length}</b><span>Promociones</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic plum"><Ic s={18} d={<><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="M22 4 12 14.01l-3-3" /></>} /></span>
          <div><b>{activas}</b><span>Activas</span></div>
        </div>
        <div className="inv-kpi">
          <span className="inv-kpi-ic gold"><Ic s={18} d={<><path d="M20 21v-8H4v8M4 13V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 7V4M9 4.5a1 1 0 0 0 3 0 1 1 0 0 0 3 0" /></>} /></span>
          <div><b>{bdays}</b><span>De cumpleaños</span></div>
        </div>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search">
          <Ic s={16} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />
          <input placeholder="Buscar por código, descripción o dónde aplica…" value={q} onChange={e => setQ(e.target.value)} />
          {q && <button className="inv-search-x" onClick={() => setQ('')} title="Limpiar"><Ic s={14} d={<><path d="M18 6 6 18M6 6l12 12" /></>} /></button>}
        </div>
        <button className={'inv-filter-chip' + (onlyActive ? ' on' : '')} onClick={() => setOnlyActive(v => !v)}>
          <Ic s={14} d={<><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="M22 4 12 14.01l-3-3" /></>} /> Solo activas
        </button>
        <span className="inv-count">{shown.length} de {list.length}</span>
      </div>

      {shown.length === 0 ? (
        <div className="empty-cal">
          <Ic s={28} d={<><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none" /></>} />
          <p>{list.length ? 'Ninguna promoción coincide' : 'Sin promociones'}</p>
          <span className="muted">Crea la primera (ej. CUMPLE20 = 20%).</span>
        </div>
      ) : (
        <div className="promo-grid">
          {shown.map((p, i) => (
            <div key={p.id} className={'promo-card' + (p.active ? '' : ' off')} style={{ '--i': i }}>
              <div className="promo-stub">
                <b>{valLabel(p)}</b>
                <span>de descuento</span>
              </div>
              <div className="promo-body">
                <div className="promo-top">
                  <span className="promo-code">{p.code}</span>
                  {p.birthday && <span className="promo-bday" title="Cupón de cumpleaños"><Ic s={14} d={<><path d="M20 21v-8H4v8M4 13V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 7V4M9 4.5a1 1 0 0 0 3 0 1 1 0 0 0 3 0" /></>} /></span>}
                </div>
                <div className="promo-name">{p.name}</div>
                <span className="promo-scope"><Ic s={13} d={SCOPE_ICON[p.scope || 'general']} /> {SCOPE_LABEL[p.scope || 'general']}</span>
                <div className="promo-foot">
                  <div className="promo-state">
                    <button type="button" className={'set-switch' + (p.active ? ' on' : '')} onClick={() => toggle(p)} aria-pressed={p.active} title={p.active ? 'Desactivar' : 'Activar'} />
                    <span className={p.active ? 'promo-on' : 'muted'}>{p.active ? 'Activa' : 'Inactiva'}</span>
                  </div>
                  <div className="promo-actions">
                    <button className="icon-btn" title="Editar" onClick={() => setForm({ id: p.id, code: p.code, name: p.name, type: p.type, value: p.value, birthday: p.birthday, scope: p.scope || 'general' })}>
                      <Ic s={15} d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} />
                    </button>
                    <button className="icon-btn danger" title="Eliminar" onClick={() => remove(p)}>
                      <Ic s={15} d={<><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title={form.id ? 'Editar promoción' : 'Nueva promoción'} onClose={() => setForm(null)}>
          <div className="row2">
            <div className="field"><label className="field-lbl">Código *</label><input value={form.code} placeholder="CUMPLE20" onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
            <div className="field"><label className="field-lbl">Tipo</label><Select value={form.type} onChange={v => setForm({ ...form, type: v })} options={[{ value: 'percent', label: 'Porcentaje (%)' }, { value: 'amount', label: 'Monto fijo ($)' }]} /></div>
          </div>
          <div className="field"><label className="field-lbl">Descripción *</label><input value={form.name} placeholder="Regalo de cumpleaños" onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label className="field-lbl">Valor del descuento * {form.type === 'percent' ? '(en %)' : '(en $)'}</label><input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
          <div className="field"><label className="field-lbl">¿Dónde aplica esta promoción?</label>
            <Select value={form.scope || 'general'} onChange={v => setForm({ ...form, scope: v })}
              options={[
                { value: 'general', label: 'Producto en general (se muestra en el checador de precios)' },
                { value: 'pos', label: 'Cupón de descuento en el POS' },
                { value: 'crm', label: 'Mensajes / campañas del CRM' },
              ]} />
            <p className="muted" style={{ fontSize: '.76rem', marginTop: 4 }}>
              {form.scope === 'pos' ? 'Se usa como cupón al cobrar en el punto de venta.'
                : form.scope === 'crm' ? 'Se usa en mensajes y campañas a clientes.'
                : 'El descuento se aplica al producto y se muestra en el checador de precios.'}
            </p>
          </div>
          <button type="button" className={'promo-bday-toggle' + (form.birthday ? ' on' : '')} onClick={() => setForm({ ...form, birthday: !form.birthday })}>
            <span className="promo-bday-ic"><Ic s={16} d={<><path d="M20 21v-8H4v8M4 13V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 7V4M9 4.5a1 1 0 0 0 3 0 1 1 0 0 0 3 0" /></>} /></span>
            <span className="promo-bday-txt">Usar como cupón de cumpleaños<small>Se incluirá en el mensaje automático del CRM</small></span>
            <span className={'set-switch' + (form.birthday ? ' on' : '')} />
          </button>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}
