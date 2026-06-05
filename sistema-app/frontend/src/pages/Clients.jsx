import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // null = cerrado
  const [err, setErr] = useState('');

  const load = (query = '') => api.get('/clients' + (query ? '?q=' + encodeURIComponent(query) : ''))
    .then(setClients).catch(e => setErr(e.message));

  useEffect(() => { load(); }, []);

  async function save() {
    try {
      if (!form.name) return setErr('El nombre es obligatorio');
      await api.post('/clients', form);
      setForm(null); setErr(''); load(q);
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="top">
        <h1>Clientes</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <input placeholder="Buscar..." value={q} style={{ width: 200, margin: 0 }}
            onChange={e => { setQ(e.target.value); load(e.target.value); }} />
          <button className="btn" onClick={() => setForm({ name: '', phone: '', email: '', tag: 'Nueva' })}>＋ Nuevo</button>
        </div>
      </div>

      {err && <div className="card" style={{ color: '#C16B6B', marginBottom: 14 }}>{err}</div>}

      {form && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 className="serif" style={{ marginBottom: 12 }}>Nuevo cliente</h3>
          <input placeholder="Nombre completo *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <select value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })}>
            <option>Nueva</option><option>Frecuente</option><option>VIP</option>
          </select>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn" onClick={save}>Guardar</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Cliente</th><th>Teléfono</th><th>Etiqueta</th><th>Puntos</th><th>Saldo</th></tr></thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.phone || '—'}</td>
                <td><span className="badge">{c.tag}</span></td>
                <td>{c.points}</td><td>{c.credit ? '$' + c.credit : '—'}</td>
              </tr>
            ))}
            {!clients.length && <tr><td colSpan="5" style={{ color: 'var(--muted)' }}>Sin clientes</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
