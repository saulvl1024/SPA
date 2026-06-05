import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast } from '../ui.jsx';

export default function Expediente() {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null); // cliente con expediente
  const [note, setNote] = useState(null);

  useEffect(() => { api.get('/clients').then(c => { setClients(c); if (c[0]) pick(c[0].id); }); }, []);
  const pick = id => api.get('/clients/' + id).then(setSel);

  const filtered = clients.filter(c => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  async function saveNote() {
    try { await api.post(`/clients/${sel.id}/notes`, note); setNote(null); pick(sel.id); toast('Nota agregada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <div className="top">
        <div><h1>Expediente clínico</h1></div>
        <div style={{ position: 'relative', width: 260 }}>
          <input placeholder="Buscar cliente..." value={q} onChange={e => setQ(e.target.value)} />
          {q && (
            <div className="card" style={{ position: 'absolute', top: 46, left: 0, right: 0, zIndex: 30, padding: 6 }}>
              {filtered.map(c => <div key={c.id} className="navi" onClick={() => { pick(c.id); setQ(''); }}>{c.name}</div>)}
              {!filtered.length && <div className="muted" style={{ padding: 8 }}>Sin resultados</div>}
            </div>
          )}
        </div>
      </div>

      {!sel ? <div className="card"><div className="empty">Selecciona un cliente</div></div> : (
        <>
          <div className="card mb">
            <h2 className="serif" style={{ fontSize: '1.5rem' }}>{sel.name}</h2>
            <div className="muted">{sel.tag} · {sel.phone || '—'} · {sel.points} pts</div>
            {sel.record?.allergies && <div className="alert" style={{ marginTop: 12 }}>⚠ <b>Alergias:</b> {sel.record.allergies}</div>}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="sec-title" style={{ margin: 0 }}>Evolución</div>
            <button className="btn sm" onClick={() => setNote({ title: '', evolution: '' })}>＋ Nueva nota</button>
          </div>
          <div className="card">
            <div className="timeline">
              {(sel.record?.notes || []).slice().reverse().map(n => (
                <div key={n.id} className="tl">
                  <div className="muted" style={{ fontSize: '.74rem' }}>{new Date(n.date).toLocaleDateString('es-MX')}</div>
                  <h4 style={{ fontWeight: 500 }}>{n.title}</h4>
                  <p className="muted">{n.evolution}</p>
                </div>
              ))}
              {!(sel.record?.notes || []).length && <div className="empty">Sin notas aún</div>}
            </div>
          </div>
        </>
      )}

      {note && (
        <Modal title="Nueva nota clínica" onClose={() => setNote(null)}>
          <div className="field"><label>Título</label><input value={note.title} onChange={e => setNote({ ...note, title: e.target.value })} placeholder="Ej. Radiofrecuencia · sesión 3/6" /></div>
          <div className="field"><label>Evolución / observaciones</label><textarea rows="4" value={note.evolution} onChange={e => setNote({ ...note, evolution: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setNote(null)}>Cancelar</button><button className="btn" onClick={saveNote}>Guardar</button></div>
        </Modal>
      )}
    </>
  );
}
