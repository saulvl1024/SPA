import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { can, businessName, businessLogo, setting } from '../permissions.js';
import WelcomeAlerts from './WelcomeAlerts.jsx';

// Menú de usuario (esquina superior derecha): sesión, ajustes y modo oscuro
function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('theme') === 'dark'; } catch { return false; } });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);

  useEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const initials = (user?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const roleLabel = user?.role === 'superadmin' ? 'Proveedor del ERP' : user?.role === 'admin' ? 'Administrador' : (user?.position || 'Empleado');

  const chev = <svg className="usermenu-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
  return (
    <div className="usermenu" ref={ref}>
      <button className={'usermenu-btn' + (open ? ' active' : '')} onClick={() => setOpen(o => !o)} title={user?.name} aria-label="Menú de usuario">{initials}</button>
      {open && (
        <div className="usermenu-pop">
          <div className="usermenu-head">
            <span className="usermenu-avatar">{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div className="usermenu-name">{user?.name}</div>
              <div className="usermenu-role">{roleLabel}</div>
            </div>
          </div>
          <div className="usermenu-sep" />

          <button className="usermenu-item" onClick={() => setDark(d => !d)}>
            <span className="usermenu-il">
              {dark
                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
              Modo oscuro
            </span>
            <span className={'usermenu-switch' + (dark ? ' on' : '')} />
          </button>

          {isAdmin && (
            <button className="usermenu-item" onClick={() => { setOpen(false); nav('/ajustes'); }}>
              <span className="usermenu-il">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>
                Ajustes del sistema
              </span>{chev}
            </button>
          )}
          {user?.role === 'superadmin' && (
            <button className="usermenu-item" onClick={() => { setOpen(false); nav('/sistema'); }}>
              <span className="usermenu-il">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></svg>
                Configuración avanzada
              </span>{chev}
            </button>
          )}

          <div className="usermenu-sep" />
          <button className="usermenu-item danger" onClick={logout}>
            <span className="usermenu-il">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Cerrar sesión
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

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
      <UserMenu />
      <div className="mtop">
        <button className="ham" onClick={() => setOpen(true)}>☰</button>
        <div className="brand">{businessName()}</div>
      </div>
      <div className="layout">
        <aside className={'side' + (open ? ' open' : '')}>
          <div className="side-brand">
            {businessLogo() ? <img className="side-logo" src={businessLogo()} alt={businessName()} /> : <span className="side-logo-fallback">{(businessName() || 'S').slice(0, 1)}</span>}
            <span className="side-brand-name">{businessName()}</span>
          </div>
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
