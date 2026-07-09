import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Modal, toast, money, initials } from '../ui.jsx';
import { setting } from '../permissions.js';
import Select from '../components/Select.jsx';

const tierOf = p => p >= 3000 ? 'Platino' : p >= 1000 ? 'Oro' : 'Plata';
const age = b => b ? Math.floor((Date.now() - new Date(b).getTime()) / 31557600000) : '—';
const monogram = name => (name || '·').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const relDate = d => {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem`;
  if (days < 365) return `Hace ${Math.floor(days / 30)} meses`;
  return `Hace ${Math.floor(days / 365)} año${Math.floor(days / 365) > 1 ? 's' : ''}`;
};

const CONDITIONS = ['Embarazo', 'Lactancia', 'Diabetes', 'Hipertensión', 'Marcapasos', 'Epilepsia', 'Cáncer', 'Problemas circulatorios', 'Tiroides'];
const SKIN_TYPES = ['Normal', 'Seca', 'Grasa', 'Mixta', 'Sensible'];
const BLOOD_TYPES = ['O+', 'O−', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−'];
const NOTE_TEMPLATES = ['Valoración inicial', 'Sesión de seguimiento', 'Control', 'Alta'];
const parseAtt = (arr) => (arr || []).map(s => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; } }).filter(Boolean);

const Ic = ({ d, s = 16 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);

export default function Expediente() {
  const [params] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [note, setNote] = useState(null);
  const [editHealth, setEditHealth] = useState(null);
  const [delNote, setDelNote] = useState(null);
  const [preview, setPreview] = useState(null);

  const pick = id => api.get('/clients/' + id).then(setSel);

  useEffect(() => {
    api.get('/clients?take=8').then(c => {
      setClients(c);
      const pre = params.get('cliente');
      if (pre) pick(pre); else if (c[0]) pick(c[0].id);
    });
  }, []); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/clients?take=8' + (q.trim() ? '&q=' + encodeURIComponent(q.trim()) : '')).then(setClients).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = clients;

  function addFiles(e) {
    const files = Array.from(e.target.files || []);
    const current = note.attachments || [];
    if (current.length + files.length > 10) return toast('Máximo 10 archivos', 'bad');
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = () => setNote(n => ({ ...n, attachments: [...(n.attachments || []), { name: f.name, type: f.type, data: reader.result }] }));
      reader.readAsDataURL(f);
    });
    e.target.value = '';
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

  // Fila de dato clínico (icono + etiqueta + valor); crit resalta lo sensible
  const dl = (icon, label, value, crit) => (
    <div className={'exp-dl' + (crit && value && value !== '—' ? ' crit' : '')}>
      <span className="exp-dl-ic"><Ic d={icon} s={15} /></span>
      <span className="exp-dl-k">{label}</span>
      <span className="exp-dl-v">{value}</span>
    </div>
  );

  return (
    <>
      <div className="top">
        <div><h1>Expediente clínico</h1><div className="sub">Historia clínica y evolución del paciente</div></div>
        <div className="row">
          <div style={{ position: 'relative', width: 260 }}>
            <input placeholder="Buscar paciente por nombre..." value={q} onChange={e => setQ(e.target.value)} />
            {q && (
              <div className="card" style={{ position: 'absolute', top: 48, left: 0, right: 0, zIndex: 30, padding: 6 }}>
                {filtered.map(c => <div key={c.id} className="navi" onClick={() => { pick(c.id); setQ(''); }}>{c.name}</div>)}
                {!filtered.length && <div className="muted" style={{ padding: 8 }}>Sin resultados</div>}
              </div>
            )}
          </div>
          {sel && <button className="btn" onClick={() => setNote({ title: '', evolution: '' })}>
            <Ic d={<><path d="M12 5v14M5 12h14" /></>} /> Nueva nota
          </button>}
        </div>
      </div>

      {!sel ? <div className="card"><div className="empty">Selecciona un paciente</div></div> : (
        <>
          {/* Banner del paciente */}
          <div className="exp-hero">
            <div className={'exp-avatar tier-' + tierOf(sel.points || 0).toLowerCase()}>{initials(sel.name)}</div>
            <div className="exp-hero-main">
              <div className="exp-hero-top">
                <h2 className="exp-name serif">{sel.name}</h2>
                <span className={'badge ' + (sel.tag === 'VIP' ? 'bg-gold' : 'bg-ok')}>{sel.tag}</span>
              </div>
              <div className="exp-vitals">
                <div className="exp-vital"><span>Edad</span><b>{age(sel.birth)}{sel.birth ? ' años' : ''}</b></div>
                <div className="exp-vital"><span>Paciente desde</span><b>{sel.createdAt ? new Date(sel.createdAt).getFullYear() : '—'}</b></div>
                <div className="exp-vital"><span>Visitas</span><b>{sel._count?.sales ?? 0}</b></div>
                <div className="exp-vital"><span>Tipo de piel</span><b>{rec.skinType || sel.skin || '—'}</b></div>
                {rec.bloodType && <div className="exp-vital"><span>Sangre</span><b>{rec.bloodType}</b></div>}
              </div>
            </div>
            <button className="btn ghost exp-edit" onClick={openHealth}>
              <Ic d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} /> Editar datos clínicos
            </button>
          </div>

          {hasAlert && (
            <div className="exp-alert">
              <Ic d={<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>} s={19} />
              <div>
                <b>Alertas clínicas</b>
                <div className="exp-alert-body">
                  {rec.allergies && <span><em>Alergias:</em> {rec.allergies}</span>}
                  {rec.contraindications && <span><em>Contraindicaciones:</em> {rec.contraindications}</span>}
                  {rec.conditions && rec.conditions.length > 0 && (
                    <span className="exp-flags">{rec.conditions.map(c => <i key={c} className="exp-flag">{c}</i>)}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid g2-wide">
            {/* Evolución — la línea de tiempo clínica */}
            <div className="card exp-evo">
              <div className="exp-evo-head">
                <h2 className="serif" style={{ fontSize: '1.35rem', margin: 0 }}>Evolución</h2>
                <span className="exp-evo-count">{notes.length} {notes.length === 1 ? 'nota' : 'notas'}</span>
              </div>

              {notes.length ? (
                <div className="exp-tl">
                  {notes.map((n, i) => {
                    const atts = parseAtt(n.attachments);
                    return (
                      <article key={n.id} className={'exp-tl-item' + (i === 0 ? ' latest' : '')} style={{ '--i': i }}>
                        <span className="exp-tl-node" />
                        <div className="exp-tl-card">
                          <header className="exp-tl-head">
                            <div className="exp-tl-when">
                              <span className="exp-tl-rel">{relDate(n.date)}</span>
                              <span className="exp-tl-date">{new Date(n.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            </div>
                            <div className="exp-tl-actions">
                              <button className="exp-icon-btn" title="Editar" onClick={() => setNote({ id: n.id, title: n.title, evolution: n.evolution || '', attachments: atts })}>
                                <Ic d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} s={15} />
                              </button>
                              <button className="exp-icon-btn danger" title="Eliminar" onClick={() => setDelNote(n)}>
                                <Ic d={<><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>} s={15} />
                              </button>
                            </div>
                          </header>
                          <h4 className="exp-tl-title">{n.title}</h4>
                          {n.evolution && <p className="exp-tl-body">{n.evolution}</p>}
                          {n.staff && (
                            <div className="exp-tl-staff">
                              <span className="exp-tl-mono">{monogram(n.staff.name)}</span>
                              {n.staff.name}
                            </div>
                          )}
                          {atts.length > 0 && (
                            <div className="exp-tl-atts">
                              {atts.map((a, j) => {
                                const isImg = (a.type || '').startsWith('image/');
                                return isImg ? (
                                  <button key={j} className="exp-att exp-att-img" onClick={() => setPreview(a)} title={a.name}>
                                    <img src={a.data} alt={a.name} />
                                  </button>
                                ) : (
                                  <button key={j} className="exp-att exp-att-doc" onClick={() => setPreview(a)} title={a.name}>
                                    <Ic d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>} s={15} />
                                    <span>{a.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="exp-empty">
                  <Ic d={<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>} s={26} />
                  <p>Sin notas de evolución</p>
                  <button className="btn" onClick={() => setNote({ title: '', evolution: '' })}>Registrar la primera</button>
                </div>
              )}
            </div>

            {/* Columna derecha: datos clínicos + resumen */}
            <div className="exp-side">
              <div className="card exp-side-card">
                <h3 className="exp-side-t">Datos clínicos</h3>
                {dl(<><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z" /><circle cx="12" cy="9" r="2.5" /></>, 'Tipo de piel', rec.skinType || sel.skin || '—')}
                {dl(<><path d="M12 22s-8-4.5-8-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-8 11-10 11Z" /></>, 'Alergias', rec.allergies || '—', true)}
                {dl(<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>, 'Contraindicaciones', rec.contraindications || '—', true)}
                {dl(<><path d="M4 4h16v6a8 8 0 0 1-16 0Z" /><path d="M9 20h6" /></>, 'Medicamentos', rec.medications || '—')}
                {dl(<><path d="M3 12h4l2 5 4-12 2 7h6" /></>, 'Tipo de sangre', rec.bloodType || '—')}
                {dl(<><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" /></>, 'Contacto de emergencia', rec.emergencyContact || '—')}
                {rec.conditions && rec.conditions.length > 0 && (
                  <div className="exp-side-flags">{rec.conditions.map(c => <span key={c} className="exp-flag">{c}</span>)}</div>
                )}
              </div>

              <div className="card exp-side-card">
                <h3 className="exp-side-t">Resumen</h3>
                {[
                  ['Teléfono', sel.phone || '—'],
                  ['Email', sel.email || '—'],
                  ['Puntos', `${sel.points || 0} · ${tierOf(sel.points || 0)}`],
                  ['Saldo a favor', money(sel.credit)],
                  ['Visitas (ventas)', sel._count?.sales ?? 0],
                ].map(([k, v]) => (
                  <div key={k} className="exp-sum-row"><span className="exp-sum-k">{k}</span><span className="exp-sum-v">{v}</span></div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {note && (
        <Modal title={note.id ? 'Editar nota clínica' : 'Nueva nota clínica'} onClose={() => setNote(null)}>
          <div className="exp-form">
            <div className="field">
              <label className="field-lbl"><Ic d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} s={14} /> Título de la nota</label>
              <input value={note.title} onChange={e => setNote({ ...note, title: e.target.value })} placeholder="Ej. Radiofrecuencia · sesión 3/6" />
              {!note.id && (
                <div className="note-tpl">
                  {NOTE_TEMPLATES.map(t => (
                    <button key={t} type="button" className="note-tpl-chip" onClick={() => setNote(n => ({ ...n, title: t }))}>{t}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label className="field-lbl"><Ic d={<><path d="M4 6h16M4 12h16M4 18h10" /></>} s={14} /> Evolución / observaciones</label>
              <textarea rows="5" value={note.evolution} onChange={e => setNote({ ...note, evolution: e.target.value })}
                placeholder="Hallazgos, parámetros utilizados, reacción del paciente y plan para la próxima sesión…" />
            </div>
            {setting('usarExpedienteArchivos') && <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-lbl"><Ic d={<><path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 1 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49" /></>} s={14} /> Archivos adjuntos <span className="field-opt">opcional · PDF, imágenes</span></label>
              <label className="exp-drop-file">
                <Ic d={<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 21h16" /></>} s={17} />
                <span>Elegir archivos</span>
                <input type="file" multiple accept="image/*,application/pdf" onChange={addFiles} style={{ display: 'none' }} />
              </label>
              {(note.attachments || []).length > 0 && (
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {note.attachments.map((a, i) => (
                    <span key={i} className="exp-att-chip">
                      <span onClick={() => setPreview(a)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Ic d={(a.type || '').startsWith('image/') ? <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></> : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>} s={14} /> {a.name}
                      </span>
                      <button type="button" className="exp-att-x" onClick={() => setNote({ ...note, attachments: note.attachments.filter((_, j) => j !== i) })}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <p className="muted" style={{ fontSize: '.76rem', marginTop: 6 }}>Hasta 10 archivos · 12 MB en total.</p>
            </div>}
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setNote(null)}>Cancelar</button><button className="btn" onClick={saveNote}>Guardar nota</button></div>
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
          <div className="exp-form">
            <section className="form-sec">
              <div className="form-sec-head">
                <span className="form-sec-ic danger"><Ic d={<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>} s={15} /></span>
                Seguridad clínica
              </div>
              <div className="field"><label className="field-lbl">Alergias</label><textarea rows="2" value={editHealth.allergies} onChange={e => setEditHealth({ ...editHealth, allergies: e.target.value })} placeholder="Ej. Alérgica a la lidocaína, látex…" /></div>
              <div className="field"><label className="field-lbl">Contraindicaciones</label><textarea rows="2" value={editHealth.contraindications} onChange={e => setEditHealth({ ...editHealth, contraindications: e.target.value })} placeholder="Ej. No aplicar calor, evitar zona X…" /></div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-lbl">Condiciones / banderas</label>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {CONDITIONS.map(c => (
                    <button key={c} type="button" onClick={() => toggleCond(c)} className={'exp-cond-btn' + (editHealth.conditions.includes(c) ? ' on' : '')}>{c}</button>
                  ))}
                </div>
              </div>
            </section>

            <section className="form-sec">
              <div className="form-sec-head">
                <span className="form-sec-ic"><Ic d={<><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z" /><circle cx="12" cy="9" r="2.5" /></>} s={15} /></span>
                Perfil clínico
              </div>
              <div className="grid g2">
                <div className="field"><label className="field-lbl">Tipo de piel</label>
                  <Select value={editHealth.skinType} onChange={v => setEditHealth({ ...editHealth, skinType: v })} placeholder="—"
                    options={[{ value: '', label: '—' }, ...SKIN_TYPES.map(s => ({ value: s, label: s }))]} />
                </div>
                <div className="field"><label className="field-lbl">Medicamentos actuales</label><input value={editHealth.medications} onChange={e => setEditHealth({ ...editHealth, medications: e.target.value })} placeholder="Ej. Anticoagulantes…" /></div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-lbl">Tipo de sangre</label>
                <div className="blood-grid">
                  {BLOOD_TYPES.map(b => (
                    <button key={b} type="button" className={'blood-chip' + (editHealth.bloodType === b ? ' on' : '')}
                      onClick={() => setEditHealth(h => ({ ...h, bloodType: h.bloodType === b ? '' : b }))}>{b}</button>
                  ))}
                </div>
              </div>
            </section>

            <section className="form-sec">
              <div className="form-sec-head">
                <span className="form-sec-ic"><Ic d={<><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z" /></>} s={15} /></span>
                Contacto de emergencia
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label className="field-lbl">Nombre y teléfono</label><input value={editHealth.emergencyContact} onChange={e => setEditHealth({ ...editHealth, emergencyContact: e.target.value })} placeholder="Ej. Ana Ruiz · 811 234 5678" /></div>
            </section>
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setEditHealth(null)}>Cancelar</button><button className="btn" onClick={saveHealth}>Guardar datos</button></div>
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
            <a className="btn ghost" href={preview.data} download={preview.name}>
              <Ic d={<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>} s={15} /> Descargar
            </a>
            <button className="btn" onClick={() => setPreview(null)}>Cerrar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
