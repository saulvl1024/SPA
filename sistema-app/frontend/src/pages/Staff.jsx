import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast } from '../ui.jsx';

const empty = { name: '', pin: '', role: 'empleada', specialty: '', commissionRate: 0.10 };

export default function Staff() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null); // {id?, ...}

  const load = () => api.get('/staff').then(setList);
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      if (form.id) await api.put('/staff/' + form.id, form);
      else await api.post('/staff', form);
      setForm(null); load(); toast('Empleada guardada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function remove(s) {
    if (!confirm(`¿Desactivar a ${s.name}? No podrá iniciar sesión (su historial se conserva).`)) return;
    try { await api.del('/staff/' + s.id); load(); toast('Empleada desactivada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <div className="top">
        <div><h1>Personal</h1><div className="sub">Empleadas y claves de acceso</div></div>
        <button className="btn" onClick={() => setForm({ ...empty })}>＋ Nueva empleada</button>
      </div>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Nombre</th><th>Rol</th><th>Especialidad</th><th>Comisión</th><th></th></tr></thead>
          <tbody>
            {list.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td><span className="badge">{s.role === 'admin' ? 'Administrador' : 'Empleada'}</span></td>
                <td>{s.specialty || '—'}</td>
                <td>{Math.round(s.commissionRate * 100)}%</td>
                <td>
                  <span className="link" onClick={() => setForm({ id: s.id, name: s.name, role: s.role, specialty: s.specialty || '', commissionRate: s.commissionRate, pin: '' })}>Editar</span>
                  {' · '}<span className="link" style={{ color: 'var(--bad)' }} onClick={() => remove(s)}>Desactivar</span>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="5" className="empty">Sin empleadas</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id ? 'Editar empleada' : 'Nueva empleada'} onClose={() => setForm(null)}>
          <div className="field"><label>Nombre completo *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row2">
            <div className="field"><label>Rol</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="empleada">Empleada</option><option value="admin">Administrador</option>
              </select></div>
            <div className="field"><label>{form.id ? 'PIN nuevo (opcional)' : 'PIN (4–6 dígitos) *'}</label>
              <input inputMode="numeric" maxLength={6} value={form.pin} placeholder={form.id ? 'dejar vacío = no cambia' : ''} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label>Especialidad (si atiende)</label><input value={form.specialty} placeholder="Faciales, Masajes..." onChange={e => setForm({ ...form, specialty: e.target.value })} /></div>
            <div className="field"><label>Comisión (%)</label><input type="number" value={Math.round(form.commissionRate * 100)} onChange={e => setForm({ ...form, commissionRate: (+e.target.value || 0) / 100 })} /></div>
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}

// DELETE helper (api.js no expone del por defecto)
async function fetchDelete(id) {
  const res = await fetch('/api/staff/' + id, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + localStorage.getItem('seren_token') },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Error');
}
