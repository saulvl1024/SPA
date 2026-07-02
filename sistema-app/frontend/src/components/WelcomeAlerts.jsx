import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal } from '../ui.jsx';
import Insights from './Insights.jsx';

// Muestra un modal con TODAS las alertas, una vez por sesión al entrar.
export default function WelcomeAlerts() {
  const [alerts, setAlerts] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('seren_alertas_vistas')) return; // ya se mostró en esta sesión
    api.get('/insights').then(d => {
      const a = d.alerts || [];
      setAlerts(a);
      if (a.length) setOpen(true);          // solo abre si hay algo que mostrar
      sessionStorage.setItem('seren_alertas_vistas', '1');
    }).catch(() => {});
  }, []);

  if (!open || !alerts) return null;

  const urgentes = alerts.filter(a => a.severity === 'alta').length;

  return (
    <Modal title="Resumen al iniciar" onClose={() => setOpen(false)}>
      <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
        Tienes {alerts.length} alerta(s){urgentes ? `, ${urgentes} urgente(s)` : ''}. Toca cualquiera para ir al módulo.
      </p>
      <Insights alerts={alerts} onNavigate={() => setOpen(false)} />
      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => setOpen(false)}>Entendido</button>
      </div>
    </Modal>
  );
}
