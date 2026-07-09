// Permisos en el frontend (debe coincidir con el backend lib/permissions.js)

export const ADMIN_ONLY = ['caja', 'gastos', 'finanzas', 'compras', 'lealtad', 'promociones', 'comisiones', 'personal', 'auditoria'];
export const DEFAULT_EMPLOYEE = ['dashboard', 'agenda', 'clientes', 'crm', 'ventas', 'pos', 'checador', 'mesas', 'cocina', 'paquetes', 'expediente', 'inventario'];

// Módulos deshabilitados por el dueño del ERP para esta instalación (feature flags).
let _disabled = [];
export function setDisabledModules(list) { _disabled = Array.isArray(list) ? list : []; }
export function isModuleEnabled(moduleKey) { return !_disabled.includes(moduleKey); }

// Nombre del negocio (configurable). Se usa en menú, tickets y mensajes.
let _businessName = 'Mi Negocio';
export function setBusinessName(name) { if (name) _businessName = name; }
export function businessName() { return _businessName; }

// Tipo de negocio (giro): define qué funciones aplican. spa | tienda | restaurante | servicios | general
let _businessType = 'general';
export function setBusinessType(t) { if (t) _businessType = t; }
export function businessType() { return _businessType; }

// Ajustes finos por giro (usarRecetas, usarVariantes, usarMesas, ...)
let _settings = {};
export function setSettings(s) { _settings = (s && typeof s === 'object') ? s : {}; }
export function setting(key, def = true) { return _settings[key] !== undefined ? _settings[key] : def; }

// Logo del negocio (data URL base64) y datos de marca — para tickets, cotizaciones, etc.
export function businessLogo() { return _settings.logo || ''; }
export function businessInfo() {
  return {
    name: _businessName,
    address: _settings.businessAddress || '',
    phone: _settings.businessPhone || '',
    email: _settings.businessEmail || '',
    rfc: _settings.businessRfc || '',
    legalName: _settings.businessLegalName || '',
    ticketFooter: _settings.ticketFooter || '',
  };
}

// ¿El usuario puede ver/usar un módulo?
export function can(user, moduleKey) {
  if (!user) return false;
  if (_disabled.includes(moduleKey)) return false; // deshabilitado para esta instalación
  if (user.role === 'admin') return true; // admin ve todo lo habilitado
  const perms = Array.isArray(user.perms) && user.perms.length ? user.perms : DEFAULT_EMPLOYEE;
  return perms.includes(moduleKey);
}
