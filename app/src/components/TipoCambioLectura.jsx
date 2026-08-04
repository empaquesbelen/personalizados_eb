// ============================================
// Tipo de cambio (SOLO lectura) — Módulo Cotizador.
// ------------------------------------------------------------
// El tipo de cambio NO es editable: sale de config/general (BCCR o manual). Se
// muestra como texto de solo lectura, con la fuente y la fecha si están.
//
// DINERO = CUIDADO (Regla Absoluta #10): si el valor del BCCR quedó viejo,
// mostramos un aviso visible para que nunca se cotice a ciegas con un tipo de
// cambio desactualizado. La antigüedad se mide en días HÁBILES para no dar
// falsos positivos por el fin de semana (el BCCR no publica sáb/dom).
// ============================================
import { formatearColones } from '../services/calculo';

function fmtFecha(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Días hábiles (lun–vie) transcurridos ESTRICTAMENTE entre `fecha` y hoy.
function diasHabilesDesde(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  let n = 0;
  d.setDate(d.getDate() + 1);
  while (d <= hoy) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

const ICONO_CANDADO = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const ICONO_ALERTA = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3.6 21 19H3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="12" cy="16.6" r="1" fill="currentColor" />
  </svg>
);

export default function TipoCambioLectura({ config, tipoCambio, fuente, fecha, nota }) {
  const tc = Number(tipoCambio ?? config?.tipoCambio) || 0;
  const fechaReal = fecha ?? config?.tipoCambioFecha ?? null;
  const fechaFmt = fmtFecha(fechaReal);
  const esBccr = (fuente ?? config?.tipoCambioFuente) === 'BCCR';

  // El aviso de "desactualizado" solo aplica al valor EN VIVO de config (cuando
  // NO se pasa `nota`). En el detalle, `nota` fija el TC ya congelado de la
  // cotización, que por diseño no cambia.
  const stale = !nota && esBccr && diasHabilesDesde(fechaReal) >= 2;

  const ayuda =
    nota ??
    (esBccr
      ? `Fuente: BCCR${fechaFmt ? ` · actualizado ${fechaFmt}` : ''} · no editable`
      : 'Valor manual de respaldo — el tipo de cambio del BCCR aún no se ha cargado · no editable');

  return (
    <div className="campo tc-lectura" aria-label="Tipo de cambio (no editable)">
      <span>Tipo de cambio</span>
      <div className={`tc-valor${stale ? ' tc-valor--alerta' : ''}`} role="group">
        <span className="tc-monto">$1 = {formatearColones(tc)}</span>
        <span className="tc-candado" aria-hidden="true">
          {ICONO_CANDADO}
        </span>
      </div>
      <span className="campo-ayuda">{ayuda}</span>
      {stale && (
        <span className="tc-alerta" role="alert">
          {ICONO_ALERTA}
          Puede estar desactualizado (última: {fechaFmt}). Verificá el tipo de cambio antes de cotizar.
        </span>
      )}
    </div>
  );
}
