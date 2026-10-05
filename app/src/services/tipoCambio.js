// ============================================
// Antigüedad del tipo de cambio — fuente única para la UI y el cotizador.
// ------------------------------------------------------------
// DINERO = CUIDADO (Regla Absoluta #10): un tipo de cambio viejo descuadra los
// precios de los productos en USD. Si el valor no es del BCCR (manual de
// respaldo) o tiene 2+ días HÁBILES de antigüedad, el cotizador exige una
// confirmación explícita antes de generar. La antigüedad se mide en días
// hábiles para no dar falsos positivos por el fin de semana (el BCCR no publica
// sáb/dom).
// ============================================

export const DIAS_HABILES_TC_VIEJO = 2;

/** dd/MM/yyyy (es-CR); '' si no es una fecha válida. */
export function formatearFechaTC(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Días hábiles (lun–vie) transcurridos ESTRICTAMENTE entre `fecha` y `hoy`. */
export function diasHabilesDesde(fecha, hoy = new Date()) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return 0;
  const fin = new Date(hoy);
  fin.setHours(0, 0, 0, 0);
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  let n = 0;
  d.setDate(d.getDate() + 1);
  while (d <= fin) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/**
 * ¿El tipo de cambio con el que se va a cotizar requiere confirmación?
 * @param {{tipoCambioFuente?:string, tipoCambioFecha?:Date|null}} config
 * @returns {{ requiereConfirmacion:boolean, motivo:'manual'|'desactualizado'|null, diasHabiles:number }}
 */
export function evaluarTipoCambio(config, hoy = new Date()) {
  const fecha = config?.tipoCambioFecha;
  const fechaValida = fecha instanceof Date && !Number.isNaN(fecha.getTime());
  if (config?.tipoCambioFuente !== 'BCCR' || !fechaValida) {
    return { requiereConfirmacion: true, motivo: 'manual', diasHabiles: 0 };
  }
  const diasHabiles = diasHabilesDesde(fecha, hoy);
  const viejo = diasHabiles >= DIAS_HABILES_TC_VIEJO;
  return { requiereConfirmacion: viejo, motivo: viejo ? 'desactualizado' : null, diasHabiles };
}
