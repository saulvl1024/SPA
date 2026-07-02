import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { can, businessName, setting } from '../permissions.js';
import WelcomeAlerts from './WelcomeAlerts.jsx';

const groups = [
  { title: 'Operación', items: [
    { to: '/', key: 'dashboard', label: 'Dashboard', end: true },
    { to: '/agenda', key: 'agenda', label: 'Agenda' },
    { to: '/clientes', key: 'clientes', label: 'Clientes' },
    { to: '/crm', key: 'crm', label: 'CRM' },
    { to: '/ventas', key: 'ventas', label: 'Ventas' },
    { to: '/pos', key: 'pos', label: 'Punto de venta' },
    { to: '/checador', key: 'checador', label: 'Checador de precios' },
    { to: '/mesas', key: 'mesas', label: 'Mesas' },
    { to: '/cocina', key: 'cocina', label: 'Cocina' },
  ]},
  { title: 'Servicios', items: [
    { to: '/paquetes', key: 'paquetes', label: 'Paquetes' },
    { to: '/expediente', key: 'expediente', label: 'Expediente' },
    { to: '/inventario', key: 'inventario', label: 'Inventario' },
    { to: '/compras', key: 'compras', label: 'Compras' },
  ]},
  { title: 'Negocio', items: [
    { to: '/caja', key: 'caja', label: 'Caja (historial)' },
    { to: '/gastos', key: 'gastos', label: 'Caja chica / Gastos' },
    { to: '/finanzas', key: 'finanzas', label: 'Finanzas y BI' },
    { to: '/lealtad', key: 'lealtad', label: 'Lealtad' },
    { to: '/promociones', key: 'promociones', label: 'Promociones' },
    { to: '/comisiones', key: 'comisiones', label: 'Comisiones' },
    { to: '/personal', key: 'personal', label: 'Personal' },
    { to: '/auditoria', key: 'auditoria', label: 'Auditoría' },
  ]},
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const admin = user?.role === 'admin';

  // Filtra módulos por permisos del usuario y ajustes por giro (ej. Mesas solo si usarMesas)
  const visibleGroups = groups
    .map(g => ({ ...g, items: g.items.filter(i => can(user, i.key)
      && (i.key !== 'mesas' || setting('usarMesas', false))
      && (i.key !== 'cocina' || setting('usarCocina', false))) }))
    .filter(g => g.items.length);

  return (
    <>
      <div className="mtop">
        <button className="ham" onClick={() => setOpen(true)}>☰</button>
        <div className="brand">{businessName()}</div>
      </div>
      <div className="layout">
        <aside className={'side' + (open ? ' open' : '')}>
          <div className="brand">{businessName()}</div>
          {visibleGroups.map(g => (
            <div key={g.title}>
              <div className="navg">{g.title}</div>
              {g.items.map(i => (
                <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setOpen(false)}
                  className={({ isActive }) => 'navi' + (isActive ? ' active' : '')}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
          {/* Solo el dueño del ERP (superadmin) ve esto */}
          {user?.role === 'superadmin' && (
            <div>
              <div className="navg">Proveedor</div>
              <NavLink to="/sistema" onClick={() => setOpen(false)} className={({ isActive }) => 'navi' + (isActive ? ' active' : '')}>⚙ Configuración del sistema</NavLink>
            </div>
          )}
          <div className="side-foot">
            <div>{user?.name}</div>
            <div className="muted" style={{ fontSize: '.75rem' }}>{user?.role === 'superadmin' ? 'Proveedor del ERP' : admin ? 'Administrador' : (user?.position || 'Empleado')}</div>
            <div className="logout" onClick={logout}>Cerrar sesión</div>
          </div>
        </aside>
        {open && <div className="backdrop" onClick={() => setOpen(false)} />}
        <main className="main">{children}</main>
      </div>
      <WelcomeAlerts />
    </>
  );
}
