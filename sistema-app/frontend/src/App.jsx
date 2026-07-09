import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { can, setDisabledModules, setBusinessName, setBusinessType, setSettings } from './permissions.js';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import PublicMenu from './pages/PublicMenu.jsx';
import Layout from './components/Layout.jsx';
import SystemConfig from './pages/SystemConfig.jsx';
import Settings from './pages/Settings.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import CRM from './pages/CRM.jsx';
import Ventas from './pages/Ventas.jsx';
import Agenda from './pages/Agenda.jsx';
import POS from './pages/POS.jsx';
import PriceCheck from './pages/PriceCheck.jsx';
import Caja from './pages/Caja.jsx';
import Expenses from './pages/Expenses.jsx';
import Packages from './pages/Packages.jsx';
import Expediente from './pages/Expediente.jsx';
import Inventory from './pages/Inventory.jsx';
import Loyalty from './pages/Loyalty.jsx';
import Promotions from './pages/Promotions.jsx';
import Commissions from './pages/Commissions.jsx';
import Staff from './pages/Staff.jsx';
import Finance from './pages/Finance.jsx';
import Purchases from './pages/Purchases.jsx';
import Audit from './pages/Audit.jsx';
import Tables from './pages/Tables.jsx';
import Kitchen from './pages/Kitchen.jsx';

const ROUTES = [
  { path: '/', key: 'dashboard', el: <Dashboard /> },
  { path: '/agenda', key: 'agenda', el: <Agenda /> },
  { path: '/clientes', key: 'clientes', el: <Clients /> },
  { path: '/crm', key: 'crm', el: <CRM /> },
  { path: '/ventas', key: 'ventas', el: <Ventas /> },
  { path: '/pos', key: 'pos', el: <POS /> },
  { path: '/checador', key: 'checador', el: <PriceCheck /> },
  { path: '/mesas', key: 'mesas', el: <Tables /> },
  { path: '/cocina', key: 'cocina', el: <Kitchen /> },
  { path: '/paquetes', key: 'paquetes', el: <Packages /> },
  { path: '/expediente', key: 'expediente', el: <Expediente /> },
  { path: '/inventario', key: 'inventario', el: <Inventory /> },
  { path: '/compras', key: 'compras', el: <Purchases /> },
  { path: '/caja', key: 'caja', el: <Caja /> },
  { path: '/gastos', key: 'gastos', el: <Expenses /> },
  { path: '/finanzas', key: 'finanzas', el: <Finance /> },
  { path: '/lealtad', key: 'lealtad', el: <Loyalty /> },
  { path: '/promociones', key: 'promociones', el: <Promotions /> },
  { path: '/comisiones', key: 'comisiones', el: <Commissions /> },
  { path: '/personal', key: 'personal', el: <Staff /> },
  { path: '/auditoria', key: 'auditoria', el: <Audit /> },
];

// Ruta especial del dueño del ERP (no usa el sistema de permisos normal)
const SYSTEM_ROUTE = { path: '/sistema', el: <SystemConfig /> };

export default function App() {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);

  // Al iniciar sesión, carga los módulos deshabilitados de esta instalación
  useEffect(() => {
    if (!user) return;
    api.get('/system/config')
      .then(c => { setDisabledModules(c.disabledModules || []); setBusinessName(c.businessName); setBusinessType(c.businessType); setSettings(c.settings); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [user]);

  // Menú público (NFC/QR): accesible sin iniciar sesión
  if (window.location.pathname === '/menu') {
    return <Routes><Route path="/menu" element={<PublicMenu />} /></Routes>;
  }

  if (!user) return <Login />;
  if (!ready) return null; // breve: evita parpadeo de módulos antes de aplicar la config
  // Primera ruta a la que el usuario sí tiene acceso (para el fallback)
  const home = ROUTES.find(r => can(user, r.key))?.path || '/';
  return (
    <Layout>
      <Routes>
        {ROUTES.filter(r => can(user, r.key)).map(r => (
          <Route key={r.path} path={r.path} element={r.el} />
        ))}
        {user.role === 'superadmin' && <Route path={SYSTEM_ROUTE.path} element={SYSTEM_ROUTE.el} />}
        {(user.role === 'admin' || user.role === 'superadmin') && <Route path="/ajustes" element={<Settings />} />}
        <Route path="*" element={<Navigate to={home} />} />
      </Routes>
    </Layout>
  );
}
