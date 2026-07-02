import { Router } from 'express';
import { prisma } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();

// Lista de módulos que el dueño del ERP puede activar/desactivar por instalación.
// Todos los módulos del ERP. Los marcados core:true son esenciales y NO se pueden apagar.
export const TOGGLEABLE_MODULES = [
  { key: 'dashboard',   label: 'Dashboard',        core: true },
  { key: 'agenda',      label: 'Agenda',           core: true },
  { key: 'clientes',    label: 'Clientes',         core: true },
  { key: 'pos',         label: 'Punto de venta',   core: true },
  { key: 'checador',    label: 'Checador de precios' },
  { key: 'inventario',  label: 'Inventario',       core: true },
  { key: 'caja',        label: 'Caja (historial)', core: true },
  { key: 'personal',    label: 'Personal',         core: true },
  { key: 'crm',         label: 'CRM' },
  { key: 'ventas',      label: 'Ventas (cotizaciones)' },
  { key: 'mesas',       label: 'Mesas (restaurante)' },
  { key: 'cocina',      label: 'Pantalla de cocina (KDS)' },
  { key: 'tratos',      label: 'Tratos (pipeline B2B)' },
  { key: 'finanzas',    label: 'Finanzas y BI' },
  { key: 'compras',     label: 'Compras' },
  { key: 'gastos',      label: 'Caja chica / Gastos' },
  { key: 'paquetes',    label: 'Paquetes' },
  { key: 'expediente',  label: 'Expediente' },
  { key: 'lealtad',     label: 'Lealtad' },
  { key: 'promociones', label: 'Promociones' },
  { key: 'comisiones',  label: 'Comisiones' },
  { key: 'auditoria',   label: 'Auditoría' },
];
const CORE_KEYS = TOGGLEABLE_MODULES.filter(m => m.core).map(m => m.key);
const OPTIONAL_KEYS = TOGGLEABLE_MODULES.filter(m => !m.core).map(m => m.key);

// Módulos OPCIONALES recomendados por giro (los core siempre van).
// Al elegir un giro, el super-admin obtiene este conjunto como punto de partida;
// luego puede activar/desactivar cualquier módulo manualmente.
export const PRESET_MODULES = {
  spa:         ['crm', 'paquetes', 'expediente', 'lealtad', 'promociones', 'comisiones', 'finanzas', 'compras', 'gastos'],
  tienda:      ['crm', 'lealtad', 'promociones', 'finanzas', 'compras', 'gastos', 'ventas'],
  restaurante: ['mesas', 'cocina', 'finanzas', 'compras', 'gastos', 'promociones'],
  servicios:   ['crm', 'ventas', 'tratos', 'finanzas', 'compras', 'gastos', 'comisiones'],
  general:     OPTIONAL_KEYS.filter(k => k !== 'checador'), // todos activos excepto extras vendibles
};
// Ajustes finos recomendados por giro
export const PRESET_SETTINGS = {
  spa:         { usarRecetas: true,  usarVariantes: false, usarMesas: false, usarCocina: false, usarExpedienteArchivos: true,  usarCampanas: true,  usarAutomatizaciones: true },
  tienda:      { usarRecetas: false, usarVariantes: true,  usarMesas: false, usarCocina: false, usarExpedienteArchivos: false, usarCampanas: true,  usarAutomatizaciones: true },
  restaurante: { usarRecetas: true,  usarVariantes: true,  usarMesas: true,  usarCocina: true,  usarExpedienteArchivos: false, usarCampanas: false, usarAutomatizaciones: false },
  servicios:   { usarRecetas: false, usarVariantes: false, usarMesas: false, usarCocina: false, usarExpedienteArchivos: false, usarCampanas: true,  usarAutomatizaciones: true },
  general:     { usarRecetas: true,  usarVariantes: false, usarMesas: false, usarCocina: false, usarExpedienteArchivos: true,  usarCampanas: true,  usarAutomatizaciones: true },
};
// Dado un giro, devuelve la lista de módulos OPCIONALES a DESHABILITAR (los que no están en el preset)
export function disabledModulesForType(type) {
  const enabled = new Set(PRESET_MODULES[type] || PRESET_MODULES.general);
  return OPTIONAL_KEYS.filter(k => !enabled.has(k));
}

// Giros disponibles. Cada uno trae un preset de ajustes recomendados.
export const BUSINESS_TYPES = [
  { key: 'general',     label: 'General' },
  { key: 'spa',         label: 'Spa / Estética' },
  { key: 'tienda',      label: 'Tienda / Retail' },
  { key: 'restaurante', label: 'Restaurante' },
  { key: 'servicios',   label: 'Servicios' },
];
// Definición de los ajustes finos (para pintarlos en el panel)
export const SETTING_DEFS = [
  { key: 'usarRecetas',   label: 'Usar recetas de insumos por servicio' },
  { key: 'usarVariantes', label: 'Usar variantes de producto (talla/color/sabor)' },
  { key: 'usarMesas',     label: 'Gestión de mesas (restaurante)' },
  { key: 'usarCocina',    label: 'Pantalla de cocina / comandas (KDS)' },
  { key: 'usarExpedienteArchivos', label: 'Permitir adjuntar archivos en expediente' },
  { key: 'usarCampanas',          label: 'Campañas de marketing (CRM)' },
  { key: 'usarAutomatizaciones',  label: 'Automatizaciones del CRM (recordatorios, cumpleaños)' },
  { key: 'usarAlmacenes',         label: 'Multi-almacén / sucursales (stock por almacén)' },
];

// Módulos que son "extras" vendibles: vienen DESHABILITADOS por defecto.
// El super-admin los activa manualmente cuando el cliente los contrata.
const EXTRA_MODULES = ['checador'];

async function getConfig() {
  let cfg = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) cfg = await prisma.systemConfig.create({ data: { id: 'singleton', disabledModules: EXTRA_MODULES } });
  return cfg;
}

// ¿Es el dueño del ERP? Ahora se identifica por ROL en el token (login propio de superadmin).
function isSuperAdmin(req) {
  return req.user?.role === 'superadmin';
}

// Ajustes finos por defecto (cada uno controla una función concreta)
export const DEFAULT_SETTINGS = {
  usarRecetas: true,      // recetas de insumos por servicio (spa) — apagar en tienda/restaurante simple
  usarVariantes: false,   // variantes de producto (talla/color/sabor)
  usarMesas: false,       // gestión de mesas (restaurante)
  usarCocina: false,      // pantalla de cocina / comandas (KDS)
  usarExpedienteArchivos: true,
  usarCampanas: true,            // pestaña Campañas del CRM
  usarAutomatizaciones: true,    // pestaña Automatización del CRM + envíos automáticos
  usarAlmacenes: false,          // multi-almacén/sucursales (off por defecto: la mayoría tiene 1)
  envioGratisDesde: 0,           // cotizaciones: umbral $ para envío gratis automático (0 = desactivado)
  whatsappNumero: '',            // número de WhatsApp del negocio (formato internacional, ej. 5218112345678) para enviar cotizaciones
};
function mergeSettings(s) { return { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) }; }

// Lee los ajustes del negocio (con defaults aplicados). Usable desde otras rutas.
export async function getSettings() {
  const cfg = await getConfig();
  return mergeSettings(cfg.settings);
}

// Config pública (para que el frontend adapte la UI). Requiere sesión.
r.get('/config', auth, async (_req, res) => {
  const cfg = await getConfig();
  res.json({
    businessName: cfg.businessName || null,
    businessType: cfg.businessType || 'general',
    settings: mergeSettings(cfg.settings),
    disabledModules: cfg.disabledModules || [],
  });
});

// ¿El usuario actual es súper-admin? (para mostrar el panel)
r.get('/superadmin/check', auth, (req, res) => res.json({ superadmin: isSuperAdmin(req) }));

// Panel de configuración (solo súper-admin): ver módulos y su estado
r.get('/superadmin/config', auth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'No autorizado' });
  const cfg = await getConfig();
  res.json({
    businessName: cfg.businessName || '', businessType: cfg.businessType || 'general',
    settings: mergeSettings(cfg.settings), disabledModules: cfg.disabledModules || [],
    modules: TOGGLEABLE_MODULES, settingDefs: SETTING_DEFS, businessTypes: BUSINESS_TYPES,
    // Presets por giro: qué módulos deshabilitar y qué ajustes aplicar al elegir cada giro
    presetModules: PRESET_MODULES, presetSettings: PRESET_SETTINGS, coreKeys: CORE_KEYS,
  });
});

// Guardar configuración (solo súper-admin)
r.put('/superadmin/config', auth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'No autorizado' });
  const { businessName, businessType, settings, disabledModules } = req.body;
  const cfg = await getConfig();
  // Nunca permitir deshabilitar módulos esenciales, aunque vengan en la petición
  const cleanDisabled = Array.isArray(disabledModules)
    ? disabledModules.filter(k => !CORE_KEYS.includes(k))
    : undefined;
  const updated = await prisma.systemConfig.update({
    where: { id: cfg.id },
    data: {
      businessName: businessName !== undefined ? (businessName || null) : undefined,
      businessType: businessType !== undefined ? (businessType || 'general') : undefined,
      settings: settings !== undefined ? mergeSettings(settings) : undefined,
      disabledModules: cleanDisabled,
    },
  });
  res.json({ businessName: updated.businessName, businessType: updated.businessType, settings: mergeSettings(updated.settings), disabledModules: updated.disabledModules });
});

export default r;
