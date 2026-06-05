import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, toast, money } from '../ui.jsx';

export default function Packages() {
  const [tpl, setTpl] = useState([]);
  const [active, setActive] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [sell, setSell] = useState(null);

  const load = () => api.get('/packages/active').then(setActive);
  useEffect(() => {
    api.get('/catalog/packages').then(setTpl);
    api.get('/clients').then(setClients);
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

  return (
    <>
      <div className="top"><h1>Paquetes de sesiones</h1></div>
      <div className="grid g3 mb">
        {tpl.map(p => (
          <div key={p.id} className="card" style={{ textAlign: 'center' }}>
            <div className="serif" style={{ fontSize: '2.6rem', color: 'var(--plum)' }}>{p.sessions}</div>
            <h3 style={{ fontWeight: 500 }}>{p.name}</h3>
            <p className="muted mb">Vigencia {p.validityMonths} meses</p>
            <div className="serif" style={{ fontSize: '1.5rem', color: 'var(--plum)' }}>{money(p.price)}</div>
            <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setSell({ packageId: p.id, clientId: clients[0]?.id, serviceId: services[0]?.id, paymentMethod: 'efectivo' })}>Vender</button>
          </div>
        ))}
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
              <td>{p.remaining > 0 ? <span className="link" onClick={() => use(p.id)}>Descontar sesión</span> : <span className="muted">Agotado</span>}</td>
            </tr>
          ))}
          {!active.length && <tr><td colSpan="6" className="empty">Sin paquetes activos</td></tr>}
        </tbody></table>
      </div>

      {sell && (
        <Modal title="Vender paquete" onClose={() => setSell(null)}>
          <div className="field"><label>Cliente</label><select value={sell.clientId} onChange={e => setSell({ ...sell, clientId: e.target.value })}>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label>Servicio del paquete</label><select value={sell.serviceId} onChange={e => setSell({ ...sell, serviceId: e.target.value })}>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="field"><label>Método de pago</label><select value={sell.paymentMethod} onChange={e => setSell({ ...sell, paymentMethod: e.target.value })}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select></div>
          <div className="modal-actions"><button className="btn ghost" onClick={() => setSell(null)}>Cancelar</button><button className="btn" onClick={confirmSell}>Vender y cobrar</button></div>
        </Modal>
      )}
    </>
  );
}
