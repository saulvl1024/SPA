import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, money } from '../ui.jsx';
import Select from '../components/Select.jsx';

const empty = { code: '', name: '', type: 'percent', value: '', scope: 'general' };
const SCOPE_LABEL = { pos: 'Cupón POS', crm: 'CRM / mensajes', general: 'Producto (checador)' };

export default function Promotions() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);

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

  const valLabel = p => p.type === 'percent' ? p.value + '%' : money(p.value);

  return (
    <>
      <div className="top">
        <div><h1>Promociones y descuentos</h1><div className="sub">Cupones que se aplican en el punto de venta</div></div>
        <button className="btn" onClick={() => setForm({ ...empty })}>Nueva promoción</button>
      </div>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Código</th><th>Descripción</th><th>Descuento</th><th className="col-sm-hide">Aplica en</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                <td><b>{p.code}</b></td>
                <td>{p.name}</td>
                <td>{valLabel(p)}</td>
                <td className="col-sm-hide"><span className="badge bg-muted">{SCOPE_LABEL[p.scope || 'general']}</span></td>
                <td><span className={'badge ' + (p.active ? 'bg-ok' : '')}>{p.active ? 'Activa' : 'Inactiva'}</span></td>
                <td className="right">
                  <div className="row-actions">
                    <button className="btn ghost sm" onClick={() => setForm({ id: p.id, code: p.code, name: p.name, type: p.type, value: p.value, birthday: p.birthday, scope: p.scope || 'general' })}>Editar</button>
                    <button className="btn ghost sm" onClick={() => toggle(p)}>{p.active ? 'Desactivar' : 'Activar'}</button>
                    <button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => remove(p)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="5" className="empty">Sin promociones. Crea la primera (ej. CUMPLE20 = 20%).</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar promoción' : 'Nueva promoción'} onClose={() => setForm(null)}>
          <div className="row2">
            <div className="field"><label>Código *</label><input value={form.code} placeholder="CUMPLE20" onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
            <div className="field"><label>Tipo</label><Select value={form.type} onChange={v => setForm({ ...form, type: v })} options={[{ value: 'percent', label: 'Porcentaje (%)' }, { value: 'amount', label: 'Monto fijo ($)' }]} /></div>
          </div>
          <div className="field"><label>Descripción *</label><input value={form.name} placeholder="Regalo de cumpleaños" onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Valor del descuento * {form.type === 'percent' ? '(en %)' : '(en $)'}</label><input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
          <div className="field"><label>¿Dónde aplica esta promoción?</label>
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
          <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 4 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!form.birthday} onChange={e => setForm({ ...form, birthday: e.target.checked })} />
            Usar como cupón de cumpleaños (se incluirá en el mensaje del CRM)
          </label>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}
