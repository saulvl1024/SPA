import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast } from '../ui.jsx';

const COLORS = ['#7A5C68', '#D9A8A0', '#8A9A85', '#C9A66B'];
const slotOf = d => { const h = d.getHours(), m = d.getMinutes(); return `${String(h).padStart(2,'0')}:${m < 30 ? '00' : '30'}`; };

export default function Agenda() {
  const [appts, setAppts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);
  const [sel, setSel] = useState(null);

  const load = () => api.get('/appointments').then(setAppts);
  useEffect(() => {
    load();
    api.get('/catalog/staff').then(s => setStaff(s.filter(x => x.specialty)));
    api.get('/catalog/services').then(setServices);
    api.get('/clients').then(setClients);
  }, []);

  const times = []; for (let h = 9; h < 21; h++) { times.push(`${String(h).padStart(2,'0')}:00`); times.push(`${String(h).padStart(2,'0')}:30`); }

  async function save() {
    try {
      const start = new Date(); const [h, m] = form.time.split(':');
      start.setHours(+h, +m, 0, 0);
      await api.post('/appointments', { clientId: form.clientId, staffId: form.staffId, serviceId: form.serviceId, start });
      setForm(null); load(); toast('Cita agendada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function setStatus(status) {
    try { await api.patch(`/appointments/${sel.id}/status`, { status }); setSel(null); load(); toast('Estado actualizado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <div className="top">
        <div><h1>Agenda</h1><div className="sub">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
        <button className="btn" onClick={() => setForm({ clientId: clients[0]?.id, staffId: staff[0]?.id, serviceId: services[0]?.id, time: '10:00' })}>＋ Agendar cita</button>
      </div>

      <div className="scroll-x">
        <div className="cal" style={{ gridTemplateColumns: `60px repeat(${staff.length}, 1fr)` }}>
          <div className="h" />
          {staff.map(s => <div key={s.id} className="h"><b>{s.name.split(' ')[0]}</b><br /><small className="muted">{s.specialty}</small></div>)}
          {times.map(tm => (
            <Row key={tm} tm={tm} staff={staff} appts={appts} onPick={setSel} />
          ))}
        </div>
      </div>

      {form && (
        <Modal title="Agendar cita" onClose={() => setForm(null)}>
          <div className="field"><label>Cliente</label><select value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>Servicio</label><select value={form.serviceId} onChange={e => setForm({ ...form, serviceId: e.target.value })}>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="field"><label>Especialista</label><select value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })}>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="field"><label>Hora</label><input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Agendar</button></div>
        </Modal>
      )}

      {sel && (
        <Modal title={`Cita · ${new Date(sel.start).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}`} onClose={() => setSel(null)}>
          <p className="mb"><b>{sel.client?.name}</b> — {sel.service?.name}<br /><span className="muted">{sel.staff?.name}</span></p>
          <p className="muted" style={{ fontSize: '.82rem', marginBottom: 12 }}>Al marcar <b>completada</b> se descuentan insumos y, si aplica, una sesión del paquete.</p>
          <div className="row">
            {['confirmada', 'en_sala', 'completada', 'no_asistio', 'cancelada'].map(s =>
              <button key={s} className="btn ghost sm" onClick={() => setStatus(s)}>{s.replace('_', ' ')}</button>)}
          </div>
        </Modal>
      )}
    </>
  );
}

function Row({ tm, staff, appts, onPick }) {
  return (
    <>
      <div className="t">{tm}</div>
      {staff.map((sp, i) => {
        const a = appts.find(x => x.staffId === sp.id && slotOf(new Date(x.start)) === tm);
        return (
          <div key={sp.id} className="s">
            {a && <div className="appt" style={{ background: COLORS[i % COLORS.length] }} onClick={() => onPick(a)}>
              <b>{new Date(a.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {a.client?.name.split(' ')[0]}</b>{a.service?.name}
            </div>}
          </div>
        );
      })}
    </>
  );
}
