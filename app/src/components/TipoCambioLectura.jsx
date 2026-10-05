// ============================================
// Tipo de cambio (SOLO lectura) — Módulo Cotizador.
// ------------------------------------------------------------
// El tipo de cambio NO es editable: sale del BCCR en vivo o, si esa consulta
// falla, de config/general (último valor guardado o manual). Se muestra como
// texto de solo lectura, con la fuente y la fecha.
//
// DINERO = CUIDADO (Regla Absoluta #10): si el valor no es del BCCR o quedó
// viejo (ver services/tipoCambio.js), se muestra un aviso visible y el
// cotizador exige confirmarlo antes de generar. Si la consulta en vivo falló,
// `onReintentar` permite volver a consultar sin recargar la página.
// ============================================
import { formatearColones } from '../services/calculo';
import { evaluarTipoCambio, formatearFechaTC } from '../services/tipoCambio';

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

export default function TipoCambioLectura({ config, tipoCambio, fuente, fecha, nota, onReintentar, reintentando = false }) {
  const tc = Number(tipoCambio ?? config?.tipoCambio) || 0;
  const fechaReal = fecha ?? config?.tipoCambioFecha ?? null;
  const fechaFmt = formatearFechaTC(fechaReal);
  const fuenteReal = fuente ?? config?.tipoCambioFuente;
  const esBccr = fuenteReal === 'BCCR';
  const origen = config?.tipoCambioOrigen;

  // El aviso solo aplica al valor con el que se va a cotizar (cuando NO se pasa
  // `nota`). En el detalle, `nota` fija el TC ya congelado de la cotización,
  // que por diseño no cambia.
  const { requiereConfirmacion, motivo } = evaluarTipoCambio({
    tipoCambioFuente: fuenteReal,
    tipoCambioFecha: fechaReal,
  });
  const alerta = !nota && requiereConfirmacion;
  const puedeReintentar = !nota && typeof onReintentar === 'function' && origen && origen !== 'vivo';

  let ayuda = nota;
  if (!ayuda) {
    if (!esBccr) {
      ayuda = 'Valor manual de respaldo — no se pudo obtener el tipo de cambio del BCCR · no editable';
    } else if (origen === 'config') {
      ayuda = `Fuente: BCCR · último valor guardado${fechaFmt ? ` del ${fechaFmt}` : ''}; la consulta en vivo falló · no editable`;
    } else {
      ayuda = `Fuente: BCCR${fechaFmt ? ` · ${fechaFmt}` : ''}${origen === 'vivo' ? ' · en vivo' : ''} · no editable`;
    }
  }

  return (
    <div className="campo tc-lectura" aria-label="Tipo de cambio (no editable)">
      <span>Tipo de cambio</span>
      <div className={`tc-valor${alerta ? ' tc-valor--alerta' : ''}`} role="group">
        <span className="tc-monto">$1 = {formatearColones(tc)}</span>
        <span className="tc-candado" aria-hidden="true">
          {ICONO_CANDADO}
        </span>
      </div>
      <span className="campo-ayuda">{ayuda}</span>
      {alerta && (
        <span className="tc-alerta" role="alert">
          {ICONO_ALERTA}
          {motivo === 'desactualizado'
            ? `Desactualizado (última: ${fechaFmt}). Para cotizar con este valor tendrás que confirmarlo.`
            : 'No es el tipo de cambio del BCCR. Para cotizar con este valor tendrás que confirmarlo.'}
        </span>
      )}
      {puedeReintentar && (
        <button
          type="button"
          className="btn btn-ghost btn-chico tc-reintentar"
          onClick={onReintentar}
          disabled={reintentando}
        >
          {reintentando ? 'Consultando al BCCR…' : 'Reintentar consulta al BCCR'}
        </button>
      )}
    </div>
  );
}
