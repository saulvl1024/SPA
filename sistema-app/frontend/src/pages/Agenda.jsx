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
const STATUS_LABEL = {
  agendada: 'Agendada', confirmada: 'Confirmada', en_sala: 'En sala',
  completada: 'Completada', no_asistio: 'No asistió', cancelada: 'Cancelada',
};
const monogram = name => (name || '·').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const shiftDay = (dateStr, delta) => {
  const d = new Date((dateStr || today()) + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const Ic = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>
);

export default function Agenda() {
  const { user } = useAuth();
  const [appts, setAppts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientQ, setClientQ] = useState('');
  const [now, setNow] = useState(new Date());
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
  // Reloj para el indicador de "ahora" (se refresca cada minuto)
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);

  const times = TIMES;
  const isToday = date === today();
  const nowSlot = isToday ? slotOf(now) : null;

  // Resumen del día por estado
  const counts = appts.reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; return a; }, {});

  // Sugiere el siguiente hueco (:00 o :30) justo después de que termina un servicio
  function slotAfter(startISO, durationMin) {
    const end = new Date(new Date(startISO).getTime() + (durationMin || 60) * 60000);
    let h = end.getHours(), m = end.getMinutes();
    if (m !== 0 && m !== 30) { if (m < 30) m = 30; else { h += 1; m = 0; } }
    const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return TIMES.includes(t) ? t : TIMES[TIMES.length - 1];
  }

  // Walk-in: el cliente ya está en el negocio y pide otro servicio para después.
  function addAnotherService() {
    const d = new Date(sel.start);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setClientQ(sel.client?.name || '');
    setForm({
      clientId: sel.clientId || sel.client?.id,
      staffId: sel.staffId || sel.staff?.id,
      serviceId: services[0]?.id,
      date: dateStr,
      time: slotAfter(sel.start, sel.service?.durationMin || 60),
      followUpFor: sel.client?.name,
    });
    setSel(null);
  }

  // Clic en un hueco vacío → abre "Agendar cita" con especialista y hora ya puestos
  function openSlot(staffId, tm) {
    setClientQ('');
    setForm({ clientId: clients[0]?.id, staffId, serviceId: services[0]?.id, date, time: tm });
  }

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
        <div>
          <h1>Agenda</h1>
          <div className="sub">{new Date((date || today()) + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <div className="row">
          {user?.role === 'admin' && (
            <button className="btn ghost" onClick={async () => {
              if (!confirm('¿Enviar por WhatsApp los recordatorios de las citas de hoy y mañana (y felicitaciones de cumpleaños)?')) return;
              try { const r = await api.post('/whatsapp/run-auto'); toast(`Recordatorios enviados · hoy ${r.today}, mañana ${r.tomorrow}, cumpleaños ${r.birthdays}`, 'ok'); }
              catch (e) { toast(e.message, 'bad'); }
            }}>
              <Ic d={<><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-4-1L3 21l1.1-4.9a8.4 8.4 0 1 1 16.9-4.6Z" /></>} /> Enviar recordatorios
            </button>
          )}
          <div className="day-nav">
            <button className="day-nav-btn" aria-label="Día anterior" onClick={() => setDate(shiftDay(date, -1))}>
              <Ic d={<path d="M15 18l-6-6 6-6" />} />
            </button>
            <button className={'day-nav-today' + (isToday ? ' on' : '')} onClick={() => setDate(today())}>Hoy</button>
            <button className="day-nav-btn" aria-label="Día siguiente" onClick={() => setDate(shiftDay(date, 1))}>
              <Ic d={<path d="M9 18l6-6-6-6" />} />
            </button>
          </div>
          <DateField style={{ width: 160 }} value={date} onChange={setDate} />
          <button className="btn" onClick={() => setForm({ clientId: clients[0]?.id, staffId: staff[0]?.id, serviceId: services[0]?.id, date, time: '10:00' })}>
            <Ic d={<><path d="M12 5v14M5 12h14" /></>} /> Agendar cita
          </button>
        </div>
      </div>

      {appts.length > 0 && (
        <div className="day-summary">
          <span className="sum-pill total">{appts.length} {appts.length === 1 ? 'cita' : 'citas'}</span>
          {['confirmada', 'en_sala', 'completada', 'no_asistio'].filter(s => counts[s]).map(s => (
            <span key={s} className="sum-pill"><i style={{ background: STATUS_COLORS[s] }} />{counts[s]} {STATUS_LABEL[s].toLowerCase()}</span>
          ))}
        </div>
      )}

      {staff.length === 0 ? (
        <div className="empty-cal">
          <Ic size={28} d={<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>} />
          <p>No hay especialistas con especialidad asignada.</p>
          <span className="muted">Configura el personal para ver la agenda por columnas.</span>
        </div>
      ) : (
        <div className="scroll-x cal-wrap">
          <div className="cal" style={{ gridTemplateColumns: `64px repeat(${staff.length}, minmax(150px, 1fr))` }}>
            <div className="h corner" />
            {staff.map(s => (
              <div key={s.id} className="h staff-h">
                <span className="staff-mono">{monogram(s.name)}</span>
                <span className="staff-meta">
                  <b>{s.name?.split(' ')[0]}</b>
                  <small>{s.specialty || 'Especialista'}</small>
                </span>
              </div>
            ))}
            {times.map((tm, ri) => (
              <Row key={tm} tm={tm} staff={staff} appts={appts} onPick={openAppt} onEmpty={openSlot}
                isNow={tm === nowSlot} rowIndex={ri} />
            ))}
          </div>
        </div>
      )}

      {form && (
        <Modal title={form.followUpFor ? 'Agregar otro servicio' : 'Agendar cita'} onClose={() => setForm(null)} width={560}>
          {form.followUpFor && (
            <p className="muted mb" style={{ fontSize: '.84rem' }}>Servicio adicional para <b>{form.followUpFor}</b>. La hora se sugirió al terminar su servicio anterior; ajústala si hace falta.</p>
          )}
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
          <div className="appt-head">
            <span className="appt-head-mono" style={{ background: STATUS_COLORS[sel.status] || STATUS_COLORS.agendada }}>{monogram(sel.client?.name)}</span>
            <div>
              <b>{sel.client?.name}</b>
              <span className="muted">{sel.service?.name}</span>
            </div>
            <span className="appt-status-chip" style={{ color: STATUS_COLORS[sel.status], background: (STATUS_COLORS[sel.status] || '#888') + '1f' }}>
              {STATUS_LABEL[sel.status] || sel.status}
            </span>
          </div>
          <p className="muted mb" style={{ fontSize: '.84rem' }}>
            {sel.staff?.name}
            {sel.service?.durationMin && <> · {sel.service.durationMin} min · termina ~{new Date(new Date(sel.start).getTime() + sel.service.durationMin * 60000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>

          <button className="btn ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }} onClick={addAnotherService}>
            <Ic d={<><path d="M12 5v14M5 12h14" /></>} /> Agregar otro servicio a {sel.client?.name?.split(' ')[0] || 'este cliente'}
          </button>
          {sel.client?.phone && (
            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={async () => {
                try { const r = await api.post(`/whatsapp/appointment/${sel.id}/reminder`); toast(r.demo ? 'Enviado (modo demo, ver consola del backend)' : 'Recordatorio enviado por WhatsApp', 'ok'); }
                catch (e) { toast(e.message, 'bad'); }
              }}>
                <Ic d={<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-4-1L3 21l1.1-4.9a8.4 8.4 0 1 1 16.9-4.6Z" />} /> Recordatorio automático
              </button>
              <a className="btn ghost" style={{ flex: 1, justifyContent: 'center' }} target="_blank" rel="noreferrer"
                href={`https://wa.me/${(sel.client.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${sel.client.name.split(' ')[0]} Te recordamos tu cita en ${businessName()} el ${formatApptDate(sel.start)} para ${sel.service?.name}. ¿Nos confirmas? ¡Te esperamos!`)}`}>
                Abrir WhatsApp
              </a>
            </div>
          )}
          <div className="field">
            <label>Estado de la cita</label>
            <Select value={selStatus} onChange={setSelStatus}
              options={['agendada', 'confirmada', 'en_sala', 'completada', 'no_asistio', 'cancelada'].map(s => ({ value: s, label: STATUS_LABEL[s] }))} />
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

function Row({ tm, staff, appts, onPick, onEmpty, isNow, rowIndex }) {
  const onHour = tm.endsWith(':00');
  return (
    <>
      <div className={'t' + (onHour ? ' t-hour' : '') + (isNow ? ' t-now' : '')}>{onHour ? tm : ''}</div>
      {staff.map((sp) => {
        const a = appts.find(x => x.staffId === sp.id && slotOf(new Date(x.start)) === tm);
        return (
          <div key={sp.id} className={'s' + (isNow ? ' s-now' : '')}
            onClick={a ? undefined : () => onEmpty(sp.id, tm)}>
            {a ? (
              <div className="appt" style={{ '--acc': STATUS_COLORS[a.status] || STATUS_COLORS.agendada, animationDelay: (rowIndex * 12) + 'ms' }}
                onClick={(e) => { e.stopPropagation(); onPick(a); }}>
                <b>{new Date(a.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {a.client?.name?.split(' ')[0]}</b>
                <span className="appt-svc">{a.service?.name}</span>
                <small className="appt-st">{STATUS_LABEL[a.status] || a.status.replace('_', ' ')}</small>
              </div>
            ) : (
              <span className="slot-add"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
            )}
          </div>
        );
      })}
    </>
  );
}
