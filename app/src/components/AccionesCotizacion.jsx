// ============================================
// Acciones de transición de una cotización + modal (compartido).
// ------------------------------------------------------------
// Extrae el patrón de Bandeja.jsx (botones de transición según rol + modal de
// nota obligatoria cuando `requiereNota`, y confirm() para acciones de peligro)
// para reutilizarlo tal cual en la Bandeja y en el Detalle. Ejecuta la
// transición con services/cotizaciones.transicionarCotizacion (atómica, con su
// evento espejo — Regla Absoluta #2).
//
// Cuando la transición trae `requierePago` (backoffice enviando a aprobación
// del admin), el modal incrusta el formulario de pago y NO deja confirmar hasta
// que los datos obligatorios estén completos (validarPago). El pago viaja en el
// MISMO writeBatch que el cambio de estado.
// ============================================
import { useState } from 'react';
import {
  transicionarCotizacion,
  pagoPorDefecto,
  normalizarPago,
  validarPago,
  describirPago,
} from '../services/cotizaciones';
import { transicionesPermitidas } from '../constants/dominio';
import FormularioPago from './FormularioPago';

export default function AccionesCotizacion({
  cot,
  perfil,
  rol,
  variante = 'inline', // 'inline' (fila de bandeja) | 'bloque' (detalle)
  onError, // (mensaje|null) => void — para mostrar el error donde convenga
  onHecho, // (transicion) => void — callback al completar la transición
  vacio = null, // qué renderizar cuando el rol no tiene acciones en este estado
}) {
  const acciones = transicionesPermitidas(cot.estado, rol);
  const [accionPendiente, setAccionPendiente] = useState(null); // la transición elegida
  const [nota, setNota] = useState('');
  const [pago, setPago] = useState(pagoPorDefecto());
  const [ejecutando, setEjecutando] = useState(false);

  async function ejecutar(transicion, notaTexto = '', pagoTexto = undefined) {
    setEjecutando(true);
    onError?.(null);
    try {
      await transicionarCotizacion({
        cotizacionId: cot.id,
        estadoNuevo: transicion.a,
        usuario: { id: perfil.id, rol },
        nota: notaTexto,
        pago: pagoTexto,
      });
      setAccionPendiente(null);
      setNota('');
      onHecho?.(transicion);
    } catch (e) {
      console.error(e);
      onError?.('No se pudo ejecutar la acción: ' + (e.message || e));
    } finally {
      setEjecutando(false);
    }
  }

  function onAccion(transicion) {
    // Abrimos el modal cuando la nota es obligatoria u opcional, o cuando la
    // transición exige datos de pago. Si no, es acción directa (con confirm
    // para las de peligro).
    if (transicion.requiereNota || transicion.notaOpcional || transicion.requierePago) {
      setNota('');
      // Precargamos el pago actual de la cotización (para no perder lo ya cargado).
      if (transicion.requierePago) setPago({ ...pagoPorDefecto(), ...(cot.pago || {}) });
      setAccionPendiente(transicion);
      return;
    }
    if (transicion.tono === 'peligro') {
      if (!window.confirm(`¿Confirmás "${transicion.accion}" esta cotización?`)) return;
    }
    ejecutar(transicion);
  }

  function confirmar() {
    const t = accionPendiente;
    const notaUser = nota.trim();
    if (t.requierePago) {
      // El pago viaja normalizado + su descripción queda en la nota del evento
      // (traza para el admin — Regla Absoluta #7).
      const pagoNorm = normalizarPago(pago);
      const partes = [`Pago: ${describirPago(pagoNorm)}`];
      if (notaUser) partes.push(notaUser);
      ejecutar(t, partes.join(' — '), pagoNorm);
      return;
    }
    ejecutar(t, notaUser);
  }

  if (acciones.length === 0) return vacio;

  const esBloque = variante === 'bloque';
  const claseBtn = esBloque ? 'btn' : 'btn btn-chico';
  const claseWrap = esBloque ? 'acciones-bloque' : 'acciones-wrap';

  // Estado de validación del modal activo.
  const errorPago = accionPendiente?.requierePago ? validarPago(pago) : '';
  // El error rojo solo se muestra si ya eligieron método pero falta su dato; si
  // no hay método, el propio formulario ya guía y el botón queda deshabilitado.
  const mostrarErrorPago = Boolean(accionPendiente?.requierePago && pago.metodo && errorPago);
  const notaFaltante = accionPendiente?.requiereNota && !nota.trim();
  const confirmDeshabilitado = ejecutando || notaFaltante || Boolean(errorPago);

  return (
    <>
      <div className={claseWrap}>
        {acciones.map((t) => (
          <button
            key={t.a}
            type="button"
            className={`${claseBtn} btn-${t.tono || 'primario'}`}
            disabled={ejecutando}
            onClick={() => onAccion(t)}
          >
            {t.accion}
          </button>
        ))}
      </div>

      {/* Modal de acción (nota y/o datos de pago) */}
      {accionPendiente && (
        <div className="modal-overlay" onClick={() => !ejecutando && setAccionPendiente(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={accionPendiente.accion}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{accionPendiente.accion}</h3>
            <p className="modal-detalle">Cliente: {cot.cliente?.nombre || '—'}</p>

            {accionPendiente.requierePago && (
              <>
                <p className="modal-detalle">
                  Completá los datos de pago obligatorios para enviar la cotización al admin.
                </p>
                <FormularioPago value={pago} onChange={setPago} nombreGrupo="pago-aprobacion" />
              </>
            )}

            <label className="campo">
              <span>Nota {accionPendiente.requiereNota ? '(obligatoria)' : '(opcional)'}</span>
              <textarea
                rows={accionPendiente.requierePago ? 2 : 4}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Escribí el motivo o comentario…"
                autoFocus={!accionPendiente.requierePago}
              />
            </label>

            {mostrarErrorPago && (
              <div className="alerta-error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1" fill="currentColor" />
                </svg>
                <span>{errorPago}</span>
              </div>
            )}

            <div className="modal-acciones">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAccionPendiente(null)}
                disabled={ejecutando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`btn btn-${accionPendiente.tono || 'primario'}`}
                disabled={confirmDeshabilitado}
                onClick={confirmar}
              >
                {ejecutando ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
