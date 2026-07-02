import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast } from '../ui.jsx';
import { useAuth } from '../auth.jsx';
import DateField from '../components/DateField.jsx';
import Select from '../components/Select.jsx';
import { businessName } from '../permissions.js';

const slotOf = d => { const h = d.getHours(), m = d.getMinutes(); return `${String(h).padStart(2,'0')}:${m < 30 ? '00' : '30'}`; };
const TIMES = []; for (let h = 9; h < 21; h++) { TIMES.push(`${String(h).padStart(2,'0')}:00`); TIMES.push(`${String(h).padStart(2,'0')}:30`); }
const today = () => new Date().toISOString().slice(0, 10);
const formatApptDate = value => new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
const STATUS_COLORS = {
  agendada: '#7A5C68',
  confirmada: '#8A9A85',
  en_sala: '#C9A66B',
  completada: '#6F8169',
  no_asistio: '#C16B6B',
  cancelada: '#9A8E88',
};

export default function Agenda() {
  const { user } = useAuth();
  const [appts, setAppts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientQ, setClientQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/clients?take=20' + (clientQ.trim() ? '&q=' + encodeURIComponent(clientQ.trim()) : '')).then(setClients).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [clientQ]);
  const [date, setDate] = useState(today());
  const [form, setForm] = useState(null);
  const [sel, setSel] = useState(null);
  const [selStatus, setSelStatus] = useState('agendada');
  const openAppt = a => { setSel(a); setSelStatus(a.status); };

  const load = (day = date) => api.get('/appointments?date=' + (day || today())).then(setAppts);
  useEffect(() => {
    api.get('/catalog/staff').then(s => setStaff(s.filter(x => x.specialty)));
    api.get('/catalog/services').then(setServices);
    api.get('/clients?take=20').then(setClients);
  }, []);
  useEffect(() => { load(date); }, [date]);

  const times = TIMES;

  async function save() {
    try {
      const start = new Date(`${form.date || today()}T${form.time}:00`);
      await api.post('/appointments', { clientId: form.clientId, staffId: form.staffId, serviceId: form.serviceId, start });
      setForm(null); setDate(form.date || today()); load(form.date || today()); toast('Cita agendada', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function setStatus(status) {
    try { await api.patch(`/appointments/${sel.id}/status`, { status }); setSel(null); load(); toast('Estado actualizado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <div className="top">
        <div><h1>Agenda</h1><div className="sub">{new Date((date || today()) + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
        <div className="row">
          {user?.role === 'admin' && (
            <button className="btn ghost" onClick={async () => {
              if (!confirm('¿Enviar por WhatsApp los recordatorios de las citas de hoy y mañana (y felicitaciones de cumpleaños)?')) return;
              try { const r = await api.post('/whatsapp/run-auto'); toast(`Recordatorios enviados · hoy ${r.today}, mañana ${r.tomorrow}, cumpleaños ${r.birthdays}`, 'ok'); }
              catch (e) { toast(e.message, 'bad'); }
            }}>💬 Enviar recordatorios del día</button>
          )}
          <DateField style={{ width: 170 }} value={date} onChange={setDate} />
          <button className="btn" onClick={() => setForm({ clientId: clients[0]?.id, staffId: staff[0]?.id, serviceId: services[0]?.id, date, time: '10:00' })}>Agendar cita</button>
        </div>
      </div>

      <div className="scroll-x">
        <div className="cal" style={{ gridTemplateColumns: `60px repeat(${staff.length}, 1fr)` }}>
          <div className="h" />
          {staff.map(s => <div key={s.id} className="h"><b>{s.name.split(' ')[0]}</b><br /><small className="muted">{s.specialty}</small></div>)}
          {times.map(tm => (
            <Row key={tm} tm={tm} staff={staff} appts={appts} onPick={openAppt} />
          ))}
        </div>
      </div>

      {form && (
        <Modal title="Agendar cita" onClose={() => setForm(null)} width={560}>
          <div className="field"><label>Cliente</label>
            <input placeholder="Buscar cliente por nombre o teléfono..." value={clientQ} onChange={e => setClientQ(e.target.value)} style={{ marginBottom: 6 }} />
            <Select value={form.clientId} onChange={v => setForm({ ...form, clientId: v })} placeholder="Selecciona cliente..."
              options={clients.map(c => ({ value: c.id, label: c.name }))} />
          </div>
          <div className="field"><label>Servicio</label>
            <Select value={form.serviceId} onChange={v => setForm({ ...form, serviceId: v })} options={services.map(s => ({ value: s.id, label: s.name }))} />
          </div>
          <div className="field"><label>Especialista</label>
            <Select value={form.staffId} onChange={v => setForm({ ...form, staffId: v })} options={staff.map(s => ({ value: s.id, label: s.name }))} />
          </div>
          <div className="field"><label>Día</label><DateField inline value={form.date} onChange={v => setForm({ ...form, date: v })} /></div>
          <div className="field"><label>Hora</label>
            <Select value={form.time} onChange={v => setForm({ ...form, time: v })} options={TIMES.map(t => ({ value: t, label: t }))} />
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn" onClick={save}>Agendar</button></div>
        </Modal>
      )}

      {sel && (
        <Modal title={`Cita · ${formatApptDate(sel.start)}`} onClose={() => setSel(null)}>
          <p className="mb"><b>{sel.client?.name}</b> — {sel.service?.name}<br /><span className="muted">{sel.staff?.name}</span></p>
          {sel.client?.phone && (
            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={async () => {
                try { const r = await api.post(`/whatsapp/appointment/${sel.id}/reminder`); toast(r.demo ? 'Enviado (modo demo, ver consola del backend)' : 'Recordatorio enviado por WhatsApp', 'ok'); }
                catch (e) { toast(e.message, 'bad'); }
              }}>💬 Recordatorio automático</button>
              <a className="btn ghost" style={{ flex: 1, justifyContent: 'center' }} target="_blank" rel="noreferrer"
                href={`https://wa.me/${(sel.client.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${sel.client.name.split(' ')[0]} Te recordamos tu cita en ${businessName()} el ${formatApptDate(sel.start)} para ${sel.service?.name}. ¿Nos confirmas? ¡Te esperamos!`)}`}>
                Abrir WhatsApp
              </a>
            </div>
          )}
          <div className="field">
            <label>Estado de la cita</label>
            <Select value={selStatus} onChange={setSelStatus}
              options={['agendada', 'confirmada', 'en_sala', 'completada', 'no_asistio', 'cancelada'].map(s => ({ value: s, label: s.replace('_', ' ') }))} />
          </div>
          <p className="muted" style={{ fontSize: '.82rem' }}>Al marcar <b>completada</b> se descuentan insumos y, si aplica, una sesión del paquete.</p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setSel(null)}>Cancelar</button>
            <button className="btn" onClick={() => setStatus(selStatus)}>Guardar</button>
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
      {staff.map((sp) => {
        const a = appts.find(x => x.staffId === sp.id && slotOf(new Date(x.start)) === tm);
        return (
          <div key={sp.id} className="s">
            {a && <div className="appt" style={{ background: STATUS_COLORS[a.status] || STATUS_COLORS.agendada }} onClick={() => onPick(a)}>
              <b>{new Date(a.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {a.client?.name.split(' ')[0]}</b>
              {a.service?.name}<br /><small>{a.status.replace('_', ' ')}</small>
            </div>}
          </div>
        );
      })}
    </>
  );
}
