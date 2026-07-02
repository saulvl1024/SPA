import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money } from '../ui.jsx';
import DateField from '../components/DateField.jsx';
import Select from '../components/Select.jsx';

const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const CATS = ['General', 'Insumos', 'Servicios', 'Nómina', 'Renta', 'Otro'];

export default function Expenses() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [date, setDate] = useState(localISO(new Date()));
  const [expenses, setExpenses] = useState([]);
  const [sales, setSales] = useState([]);
  const [form, setForm] = useState(null);

  const load = () => {
    api.get('/expenses?date=' + date).then(setExpenses);
    api.get('/sales?date=' + date).then(setSales).catch(() => setSales([]));
  };
  useEffect(() => { load(); }, [date]); // eslint-disable-line

  const totalGastos = expenses.reduce((a, e) => a + e.amount, 0);
  const totalVentas = sales.reduce((a, s) => a + s.total, 0);
  const utilidad = totalVentas - totalGastos;

  async function save() {
    try { if (!form.amount) return toast('Monto requerido', 'bad'); await api.post('/expenses', form); setForm(null); load(); toast('Gasto registrado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function remove(id) { try { await api.del('/expenses/' + id); load(); toast('Gasto eliminado', 'ok'); } catch (e) { toast(e.message, 'bad'); } }

  return (
    <>
      <div className="top">
        <div><h1>Caja chica / Gastos</h1><div className="sub">Registra gastos y mira la utilidad del día</div></div>
        <div className="row">
          <DateField style={{ width: 160 }} value={date} onChange={setDate} />
          <button className="btn" onClick={() => setForm({ amount: '', category: 'General', note: '' })}>Nuevo gasto</button>
        </div>
      </div>

      <div className="grid g3 mb">
        <div className="card kpi"><div className="lbl">Ventas del día</div><div className="val">{money(totalVentas)}</div></div>
        <div className="card kpi"><div className="lbl">Gastos del día</div><div className="val">{money(totalGastos)}</div></div>
        <div className="card kpi"><div className="lbl">Utilidad</div><div className="val" style={{ color: utilidad < 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(utilidad)}</div></div>
      </div>

      <div className="card scroll-x" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Hora</th><th>Categoría</th><th>Concepto</th><th>Monto</th>{admin && <th></th>}</tr></thead>
          <tbody>
            {expenses.map(e => (
              <tr key={e.id}>
                <td className="td-date">{new Date(e.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                <td><span className="badge">{e.category}</span></td>
                <td>{e.note || '—'}</td>
                <td>{money(e.amount)}</td>
                {admin && <td><div className="row-actions" style={{ justifyContent: 'flex-start' }}><button className="btn ghost sm" style={{ color: 'var(--bad)' }} onClick={() => remove(e.id)}>Eliminar</button></div></td>}
              </tr>
            ))}
            {!expenses.length && <tr><td colSpan={admin ? 5 : 4} className="empty">Sin gastos este día</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title="Nuevo gasto" onClose={() => setForm(null)}>
          <div className="row2">
            <div className="field"><label>Monto *</label><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field"><label>Categoría</label><Select value={form.category} onChange={v => setForm({ ...form, category: v })} options={CATS.map(c => ({ value: c, label: c }))} /></div>
          </div>
          <div className="field"><label>Concepto / nota</label><input value={form.note} placeholder="Ej. Compra de toallas" onChange={e => setForm({ ...form, note: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}
