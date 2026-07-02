// Módulos del sistema y permisos por defecto.
// El administrador SIEMPRE tiene acceso a todo (no se filtra).

export const MODULES = [
  { key: 'dashboard',   label: 'Dashboard',        adminOnly: false },
  { key: 'agenda',      label: 'Agenda',           adminOnly: false },
  { key: 'clientes',    label: 'Clientes',         adminOnly: false },
  { key: 'crm',         label: 'CRM',              adminOnly: false },
  { key: 'ventas',      label: 'Ventas',           adminOnly: false },
  { key: 'pos',         label: 'Punto de venta',   adminOnly: false },
  { key: 'checador',    label: 'Checador de precios', adminOnly: false },
  { key: 'mesas',       label: 'Mesas',            adminOnly: false },
  { key: 'cocina',      label: 'Cocina (KDS)',     adminOnly: false },
  { key: 'paquetes',    label: 'Paquetes',         adminOnly: false },
  { key: 'expediente',  label: 'Expediente',       adminOnly: false },
  { key: 'inventario',  label: 'Inventario',       adminOnly: false },
  { key: 'stock_almacen', label: 'Editar stock por almacén', adminOnly: false, permOnly: true },
  { key: 'compras',     label: 'Compras',          adminOnly: true },
  { key: 'caja',        label: 'Caja (historial)', adminOnly: true },
  { key: 'gastos',      label: 'Caja chica',       adminOnly: true },
  { key: 'finanzas',    label: 'Finanzas y BI',    adminOnly: true },
  { key: 'lealtad',     label: 'Lealtad',          adminOnly: true },
  { key: 'promociones', label: 'Promociones',      adminOnly: true },
  { key: 'comisiones',  label: 'Comisiones',       adminOnly: true },
  { key: 'personal',    label: 'Personal',         adminOnly: true },
  { key: 'auditoria',   label: 'Auditoría',        adminOnly: true },
];

// Lo que una empleada ve por defecto si no tiene permisos personalizados.
export const DEFAULT_EMPLOYEE = ['dashboard', 'agenda', 'clientes', 'crm', 'ventas', 'pos', 'checador', 'mesas', 'cocina', 'paquetes', 'expediente', 'inventario'];

// Calcula los permisos efectivos de un empleado.
export function effectivePermissions(staff) {
  if (staff.role === 'admin' || staff.role === 'superadmin') return MODULES.map(m => m.key); // acceso total
  if (Array.isArray(staff.permissions) && staff.permissions.length) return staff.permissions;
  return DEFAULT_EMPLOYEE;
}
