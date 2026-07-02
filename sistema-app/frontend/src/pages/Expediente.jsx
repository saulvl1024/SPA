import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, toast, money, initials } from '../ui.jsx';
import { setting } from '../permissions.js';
import Select from '../components/Select.jsx';

const tierOf = p => p >= 3000 ? 'Platino' : p >= 1000 ? 'Oro' : 'Plata';
const age = b => b ? Math.floor((Date.now() - new Date(b).getTime()) / 31557600000) : '—';

const CONDITIONS = ['Embarazo', 'Lactancia', 'Diabetes', 'Hipertensión', 'Marcapasos', 'Epilepsia', 'Cáncer', 'Problemas circulatorios', 'Tiroides'];
const SKIN_TYPES = ['Normal', 'Seca', 'Grasa', 'Mixta', 'Sensible'];
// Parsea los adjuntos (vienen como strings JSON) a objetos {name,type,data}
const parseAtt = (arr) => (arr || []).map(s => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; } }).filter(Boolean);

export default function Expediente() {
  const [params] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState(null);     // {id?, title, evolution}
  const [editHealth, setEditHealth] = useState(null); // borrador del expediente
  const [delNote, setDelNote] = useState(null);
  const [preview, setPreview] = useState(null); // adjunto en vista previa {name,type,data}

  const pick = id => api.get('/clients/' + id).then(setSel);

  useEffect(() => {
    api.get('/clients?take=8').then(c => {
      setClients(c);
      const pre = params.get('cliente');
      if (pre) pick(pre); else if (c[0]) pick(c[0].id);
    });
  }, []); // eslint-disable-line

  // Búsqueda de clientes en el servidor (debounce)
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/clients?take=8' + (q.trim() ? '&q=' + encodeURIComponent(q.trim()) : '')).then(setClients).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = clients; // ya filtrado por el servidor

  function addFiles(e) {
    const files = Array.from(e.target.files || []);
    const current = note.attachments || [];
    if (current.length + files.length > 10) return toast('Máximo 10 archivos', 'bad');
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setNote(n => ({ ...n, attachments: [...(n.attachments || []), { name: f.name, type: f.type, data: reader.result }] }));
      reader.readAsDataURL(f); // base64 data URL
    });
    e.target.value = ''; // permite re-seleccionar el mismo archivo
  }

  async function saveNote() {
    try {
      if (!note.title) return toast('Falta el título', 'bad');
      if (note.id) await api.put(`/clients/notes/${note.id}`, { title: note.title, evolution: note.evolution, attachments: note.attachments || [] });
      else await api.post(`/clients/${sel.id}/notes`, note);
      setNote(null); pick(sel.id); toast('Nota guardada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }

  async function removeNote() {
    try { await api.del(`/clients/notes/${delNote.id}`); setDelNote(null); pick(sel.id); toast('Nota eliminada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  function openHealth() {
    const rec = sel.record || {};
    setEditHealth({
      allergies: rec.allergies || '', contraindications: rec.contraindications || '',
      skinType: rec.skinType || '', conditions: rec.conditions || [], medications: rec.medications || '',
      bloodType: rec.bloodType || '', emergencyContact: rec.emergencyContact || '',
    });
  }

  async function saveHealth() {
    try { await api.put(`/clients/${sel.id}/record`, editHealth); setEditHealth(null); pick(sel.id); toast('Datos clínicos guardados', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  function toggleCond(c) {
    setEditHealth(h => ({ ...h, conditions: h.conditions.includes(c) ? h.conditions.filter(x => x !== c) : [...h.conditions, c] }));
  }

  const notes = (sel?.record?.notes || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const rec = sel?.record || {};
  const hasAlert = rec.allergies || rec.contraindications || (rec.conditions && rec.conditions.length);

  const fld = (k, v) => (
    <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <span className="muted">{k}</span><span style={{ textAlign: 'right', maxWidth: '60%' }}>{v}</span>
    </div>
  );

  return (
    <>
      <div className="top">
        <div><h1>Expediente clínico</h1><div className="sub">Historia clínica y evolución</div></div>
        <div className="row">
          <div style={{ position: 'relative', width: 260 }}>
            <input placeholder="Buscar cliente por nombre..." value={q} onChange={e => setQ(e.target.value)} />
            {q && (
              <div className="card" style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 30, padding: 6 }}>
                {filtered.map(c => <div key={c.id} className="navi" onClick={() => { pick(c.id); setQ(''); }}>{c.name}</div>)}
                {!filtered.length && <div className="muted" style={{ padding: 8 }}>Sin resultados</div>}
              </div>
            )}
          </div>
          {sel && <button className="btn" onClick={() => setNote({ title: '', evolution: '' })}>Nueva nota</button>}
        </div>
      </div>

      {!sel ? <div className="card"><div className="empty">Selecciona un cliente</div></div> : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row" style={{ gap: 20, alignItems: 'center' }}>
              <span className="client-avatar" style={{ width: 76, height: 76, fontSize: '1.7rem' }}>{initials(sel.name)}</span>
              <div style={{ flex: 1 }}>
                <h2 className="serif" style={{ fontSize: '1.6rem' }}>{sel.name}</h2>
                <div className="muted">{age(sel.birth)} años · Cliente desde {sel.createdAt ? new Date(sel.createdAt).getFullYear() : '—'} · <span className={'badge ' + (sel.tag === 'VIP' ? 'bg-gold' : 'bg-ok')}>{sel.tag}</span></div>
              </div>
              <button className="btn ghost" onClick={openHealth}>Editar datos clínicos</button>
            </div>
            {hasAlert && (
              <div className="alert" style={{ marginTop: 14 }}>
                <b>Atención:</b>
                {rec.allergies && <> Alergias: {rec.allergies}.</>}
                {rec.contraindications && <> Contraindicaciones: {rec.contraindications}.</>}
                {rec.conditions && rec.conditions.length > 0 && <> Condiciones: {rec.conditions.join(', ')}.</>}
              </div>
            )}
          </div>

          <div className="grid g2-wide">
            <div className="card">
              <h2 className="serif mb" style={{ fontSize: '1.3rem' }}>Evolución</h2>
              <div className="timeline">
                {notes.map(n => (
                  <div key={n.id} className="tl">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="muted" style={{ fontSize: '.74rem' }}>{new Date(n.date).toLocaleDateString('es-MX')}{n.staff ? ' · ' + n.staff.name : ''}</div>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn ghost xs" title="Editar" onClick={() => setNote({ id: n.id, title: n.title, evolution: n.evolution || '', attachments: parseAtt(n.attachments) })}>Editar</button>
                        <button className="btn ghost xs" title="Eliminar" style={{ color: 'var(--bad)' }} onClick={() => setDelNote(n)}>Eliminar</button>
                      </div>
                    </div>
                    <h4 style={{ fontWeight: 500 }}>{n.title}</h4>
                    <p className="muted">{n.evolution}</p>
                    {(n.attachments || []).length > 0 && (
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                        {parseAtt(n.attachments).map((a, i) => {
                          const isImg = (a.type || '').startsWith('image/');
                          return (
                            <span key={i} onClick={() => setPreview(a)}
                              className="badge" style={{ background: 'var(--line)', color: 'var(--ink)', cursor: 'pointer' }}>
                              {isImg ? '🖼' : '📄'} {a.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {!notes.length && <div className="empty">Sin notas aún</div>}
              </div>
            </div>

            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <h2 className="serif mb" style={{ fontSize: '1.3rem' }}>Datos clínicos</h2>
                {fld('Tipo de piel', rec.skinType || sel.skin || '—')}
                {fld('Alergias', rec.allergies || '—')}
                {fld('Contraindicaciones', rec.contraindications || '—')}
                {fld('Condiciones', rec.conditions && rec.conditions.length ? rec.conditions.join(', ') : '—')}
                {fld('Medicamentos', rec.medications || '—')}
                {fld('Tipo de sangre', rec.bloodType || '—')}
                <div className="row" style={{ justifyContent: 'space-between', padding: '8px 0' }}>
                  <span className="muted">Contacto de emergencia</span><span style={{ textAlign: 'right', maxWidth: '60%' }}>{rec.emergencyContact || '—'}</span>
                </div>
              </div>
              <div className="card">
                <h2 className="serif mb" style={{ fontSize: '1.3rem' }}>Resumen</h2>
                {[
                  ['Teléfono', sel.phone || '—'],
                  ['Email', sel.email || '—'],
                  ['Puntos', `${sel.points || 0} (${tierOf(sel.points || 0)})`],
                  ['Saldo a favor', money(sel.credit)],
                  ['Visitas (ventas)', sel._count?.sales ?? 0],
                ].map(([k, v], i, a) => (
                  <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '9px 0', borderBottom: i < a.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <span className="muted">{k}</span><span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {note && (
        <Modal title={note.id ? 'Editar nota clínica' : 'Nueva nota clínica'} onClose={() => setNote(null)}>
          <div className="field"><label>Título</label><input value={note.title} onChange={e => setNote({ ...note, title: e.target.value })} placeholder="Ej. Radiofrecuencia · sesión 3/6" /></div>
          <div className="field"><label>Evolución / observaciones</label><textarea rows="4" value={note.evolution} onChange={e => setNote({ ...note, evolution: e.target.value })} /></div>
          {setting('usarExpedienteArchivos') && <div className="field">
            <label>Archivos adjuntos (opcional · PDF, imágenes)</label>
            <input type="file" multiple accept="image/*,application/pdf" onChange={addFiles} />
            {(note.attachments || []).length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {note.attachments.map((a, i) => (
                  <span key={i} className="badge" style={{ background: 'var(--line)', color: 'var(--ink)', cursor: 'pointer' }}>
                    <span onClick={() => setPreview(a)}>{(a.type || '').startsWith('image/') ? '🖼' : '📄'} {a.name}</span>
                    <span className="link" style={{ marginLeft: 6, color: 'var(--bad)' }} onClick={() => setNote({ ...note, attachments: note.attachments.filter((_, j) => j !== i) })}>×</span>
                  </span>
                ))}
              </div>
            )}
            <p className="muted" style={{ fontSize: '.76rem', marginTop: 4 }}>Hasta 10 archivos · 12 MB en total.</p>
          </div>}
          <div className="modal-actions"><button className="btn ghost" onClick={() => setNote(null)}>Cancelar</button><button className="btn" onClick={saveNote}>Guardar</button></div>
        </Modal>
      )}

      {delNote && (
        <Modal title="Eliminar nota" onClose={() => setDelNote(null)}>
          <p>¿Eliminar la nota <b>"{delNote.title}"</b>? Esta acción no se puede deshacer.</p>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setDelNote(null)}>Cancelar</button><button className="btn danger" onClick={removeNote}>Eliminar</button></div>
        </Modal>
      )}

      {editHealth && (
        <Modal title="Editar datos clínicos" onClose={() => setEditHealth(null)}>
          <div className="field"><label>Alergias</label><textarea rows="2" value={editHealth.allergies} onChange={e => setEditHealth({ ...editHealth, allergies: e.target.value })} placeholder="Ej. Alérgica a la lidocaína, látex..." /></div>
          <div className="field"><label>Contraindicaciones</label><textarea rows="2" value={editHealth.contraindications} onChange={e => setEditHealth({ ...editHealth, contraindications: e.target.value })} placeholder="Ej. No aplicar calor, evitar zona X..." /></div>
          <div className="field">
            <label>Condiciones / banderas</label>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {CONDITIONS.map(c => (
                <button key={c} type="button" onClick={() => toggleCond(c)} style={{ cursor: 'pointer', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', background: editHealth.conditions.includes(c) ? 'var(--plum)' : 'transparent', color: editHealth.conditions.includes(c) ? '#fff' : 'inherit' }}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid g2">
            <div className="field"><label>Tipo de piel</label>
              <Select value={editHealth.skinType} onChange={v => setEditHealth({ ...editHealth, skinType: v })} placeholder="—"
                options={[{ value: '', label: '—' }, ...SKIN_TYPES.map(s => ({ value: s, label: s }))]} />
            </div>
            <div className="field"><label>Tipo de sangre</label><input value={editHealth.bloodType} onChange={e => setEditHealth({ ...editHealth, bloodType: e.target.value })} placeholder="O+, A−..." /></div>
          </div>
          <div className="field"><label>Medicamentos actuales</label><input value={editHealth.medications} onChange={e => setEditHealth({ ...editHealth, medications: e.target.value })} /></div>
          <div className="field"><label>Contacto de emergencia</label><input value={editHealth.emergencyContact} onChange={e => setEditHealth({ ...editHealth, emergencyContact: e.target.value })} placeholder="Nombre y teléfono" /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setEditHealth(null)}>Cancelar</button><button className="btn" onClick={saveHealth}>Guardar</button></div>
        </Modal>
      )}

      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          {(preview.type || '').startsWith('image/') ? (
            <img src={preview.data} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
          ) : (preview.type || '').includes('pdf') ? (
            <iframe src={preview.data} title={preview.name} style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8 }} />
          ) : (
            <div className="empty">No se puede previsualizar este tipo de archivo.</div>
          )}
          <div className="modal-actions">
            <a className="btn ghost" href={preview.data} download={preview.name}>⬇ Descargar</a>
            <button className="btn" onClick={() => setPreview(null)}>Cerrar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
