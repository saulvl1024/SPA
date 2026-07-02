import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Modal, toast, money } from '../ui.jsx';
import Select from '../components/Select.jsx';

export default function Packages() {
  const { user } = useAuth();
  const admin = user.role === 'admin' || user.role === 'superadmin';
  const [tpl, setTpl] = useState([]);
  const [active, setActive] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [sell, setSell] = useState(null);
  const [edit, setEdit] = useState(null);   // crear/editar plantilla (admin)
  const [clientQ, setClientQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/clients?take=20' + (clientQ.trim() ? '&q=' + encodeURIComponent(clientQ.trim()) : '')).then(setClients).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [clientQ]);

  const loadTpl = () => api.get('/catalog/packages' + (admin ? '?all=1' : '')).then(setTpl);
  const load = () => api.get('/packages/active').then(setActive);
  useEffect(() => {
    loadTpl();
    api.get('/catalog/services').then(setServices);
    load();
  }, []);

  async function confirmSell() {
    try { await api.post('/packages/sell', sell); setSell(null); load(); toast('Paquete vendido', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function use(id) {
    try { await api.patch(`/packages/${id}/use`); load(); toast('Sesión descontada', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function saveTpl() {
    try {
      if (!edit.name) return toast('Falta el nombre', 'bad');
      if (!(+edit.sessions > 0)) return toast('Las sesiones deben ser mayor a 0', 'bad');
      if (edit.id) await api.put(`/catalog/packages/${edit.id}`, edit);
      else await api.post('/catalog/packages', edit);
      setEdit(null); loadTpl(); toast(edit.id ? 'Paquete actualizado' : 'Paquete creado', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }
  async function toggleActive(p) {
    try { await api.patch(`/catalog/packages/${p.id}/active`, { active: !p.active }); loadTpl(); toast(p.active ? 'Paquete desactivado' : 'Paquete activado', 'ok'); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <div className="top">
        <div><h1>Paquetes de sesiones</h1>
          <div className="sub">{admin ? 'Crea y administra los paquetes que vende tu negocio' : 'Vende y gestiona los paquetes de tus clientes'}</div>
        </div>
        {admin && <button className="btn" onClick={() => setEdit({ name: '', sessions: 10, price: '', validityMonths: 3 })}>Nuevo paquete</button>}
      </div>

      <div className="pkg-grid mb">
        {tpl.map((p, i) => (
          <div key={p.id} className={'pkg-card' + (p.active === false ? ' off' : '')} style={{ '--i': i }}>
            {/* Cabecera: sesiones como protagonista */}
            <div className="pkg-top">
              {p.active === false && <span className="pkg-off-badge">Inactivo</span>}
              <div className="pkg-sessions">{p.sessions}</div>
              <div className="pkg-sessions-lbl">sesiones</div>
            </div>
            {/* Cuerpo */}
            <div className="pkg-body">
              <h3 className="pkg-name">{p.name}</h3>
              <div className="pkg-meta">
                <span className="pkg-validity">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                  {p.validityMonths} {p.validityMonths === 1 ? 'mes' : 'meses'}
                </span>
                <span className="pkg-price">{money(p.price)}</span>
              </div>
              <div className="pkg-actions">
                {p.active !== false && <button className="btn sm" onClick={() => setSell({ packageId: p.id, clientId: clients[0]?.id, serviceId: services[0]?.id, paymentMethod: 'efectivo' })}>Vender</button>}
                {admin && <button className="btn ghost sm" onClick={() => setEdit({ id: p.id, name: p.name, sessions: p.sessions, price: p.price, validityMonths: p.validityMonths })}>Editar</button>}
                {admin && <button className="btn ghost sm" onClick={() => toggleActive(p)}>{p.active === false ? 'Activar' : 'Desactivar'}</button>}
              </div>
            </div>
          </div>
        ))}
        {!tpl.length && <div className="card empty" style={{ gridColumn: '1/-1' }}>{admin ? 'Aún no hay paquetes. Crea el primero con "Nuevo paquete".' : 'No hay paquetes disponibles.'}</div>}
      </div>

      <div className="sec-title">Paquetes activos</div>
      <div className="card scroll-x" style={{ padding: 0 }}>
        <table><thead><tr><th>Cliente</th><th>Paquete</th><th>Progreso</th><th>Sesiones</th><th>Vence</th><th></th></tr></thead><tbody>
          {active.map(p => (
            <tr key={p.id}>
              <td>{p.client?.name}</td><td>{p.package?.name}</td>
              <td style={{ width: 150 }}><div className="progress"><span style={{ width: ((p.total - p.remaining) / p.total * 100) + '%' }} /></div></td>
              <td>{p.total - p.remaining} de {p.total}</td>
              <td>{new Date(p.expiresAt).toLocaleDateString('es-MX')}</td>
              <td>{p.remaining > 0 ? <div className="row-actions" style={{ justifyContent: 'flex-start' }}><button className="btn ghost sm" onClick={() => use(p.id)}>Descontar sesión</button></div> : <span className="muted">Agotado</span>}</td>
            </tr>
          ))}
          {!active.length && <tr><td colSpan="6" className="empty">Sin paquetes activos</td></tr>}
        </tbody></table>
      </div>

      {sell && (
        <Modal title="Vender paquete" onClose={() => setSell(null)}>
          <div className="field"><label>Cliente</label>
            <input placeholder="Buscar cliente..." value={clientQ} onChange={e => setClientQ(e.target.value)} style={{ marginBottom: 6 }} />
            <Select value={sell.clientId} onChange={v => setSell({ ...sell, clientId: v })} placeholder="Selecciona cliente..."
              options={clients.map(c => ({ value: c.id, label: c.name }))} />
          </div>
          <div className="field"><label>Servicio del paquete</label>
            <Select value={sell.serviceId} onChange={v => setSell({ ...sell, serviceId: v })} placeholder="Selecciona servicio..."
              options={services.map(s => ({ value: s.id, label: s.name }))} />
          </div>
          <div className="field"><label>Método de pago</label>
            <Select value={sell.paymentMethod} onChange={v => setSell({ ...sell, paymentMethod: v })}
              options={[{ value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' }, { value: 'transferencia', label: 'Transferencia' }]} />
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setSell(null)}>Cancelar</button><button className="btn" onClick={confirmSell}>Vender y cobrar</button></div>
        </Modal>
      )}

      {edit && (
        <Modal title={edit.id ? 'Editar paquete' : 'Nuevo paquete'} onClose={() => setEdit(null)}>
          <div className="field"><label>Nombre del paquete *</label><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Ej. Paquete Facial 10 sesiones" /></div>
          <div className="row2">
            <div className="field"><label>Número de sesiones *</label><input type="number" min="1" value={edit.sessions} onChange={e => setEdit({ ...edit, sessions: e.target.value })} /></div>
            <div className="field"><label>Precio</label><input type="number" min="0" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} placeholder="0" /></div>
          </div>
          <div className="field"><label>Vigencia (meses)</label><input type="number" min="1" value={edit.validityMonths} onChange={e => setEdit({ ...edit, validityMonths: e.target.value })} />
            <span className="muted" style={{ fontSize: '.78rem' }}>Tiempo que el cliente tiene para usar sus sesiones desde la compra.</span>
          </div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn" onClick={saveTpl}>{edit.id ? 'Guardar cambios' : 'Crear paquete'}</button></div>
        </Modal>
      )}
    </>
  );
}
