import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Agenda from './pages/Agenda.jsx';
import POS from './pages/POS.jsx';
import Caja from './pages/Caja.jsx';
import Packages from './pages/Packages.jsx';
import Expediente from './pages/Expediente.jsx';
import Inventory from './pages/Inventory.jsx';
import Reports from './pages/Reports.jsx';
import Loyalty from './pages/Loyalty.jsx';
import Commissions from './pages/Commissions.jsx';
import Staff from './pages/Staff.jsx';

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;
  const admin = user.role === 'admin';
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/clientes" element={<Clients />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/caja" element={<Caja />} />
        <Route path="/paquetes" element={<Packages />} />
        <Route path="/expediente" element={<Expediente />} />
        <Route path="/inventario" element={<Inventory />} />
        {admin && <Route path="/reportes" element={<Reports />} />}
        {admin && <Route path="/lealtad" element={<Loyalty />} />}
        {admin && <Route path="/comisiones" element={<Commissions />} />}
        {admin && <Route path="/personal" element={<Staff />} />}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
