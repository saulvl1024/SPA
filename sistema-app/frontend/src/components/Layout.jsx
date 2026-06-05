import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const groups = [
  { title: 'Operación', items: [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/agenda', label: 'Agenda' },
    { to: '/clientes', label: 'Clientes' },
    { to: '/pos', label: 'Punto de venta' },
    { to: '/caja', label: 'Caja / Corte' },
  ]},
  { title: 'Servicios', items: [
    { to: '/paquetes', label: 'Paquetes' },
    { to: '/expediente', label: 'Expediente' },
    { to: '/inventario', label: 'Inventario' },
  ]},
  { title: 'Negocio (admin)', admin: true, items: [
    { to: '/reportes', label: 'Reportes' },
    { to: '/lealtad', label: 'Lealtad' },
    { to: '/comisiones', label: 'Comisiones' },
    { to: '/personal', label: 'Personal' },
  ]},
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const admin = user?.role === 'admin';

  return (
    <>
      <div className="mtop">
        <button className="ham" onClick={() => setOpen(true)}>☰</button>
        <div className="brand">SPA</div>
      </div>
      <div className="layout">
        <aside className={'side' + (open ? ' open' : '')}>
          <div className="brand">SPA</div>
          {groups.filter(g => !g.admin || admin).map(g => (
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
          <div className="side-foot">
            <div>{user?.name}</div>
            <div className="muted" style={{ fontSize: '.75rem' }}>{admin ? 'Administrador' : 'Empleada'}</div>
            <div className="logout" onClick={logout}>Cerrar sesión</div>
          </div>
        </aside>
        {open && <div className="backdrop" onClick={() => setOpen(false)} />}
        <main className="main">{children}</main>
      </div>
    </>
  );
}
