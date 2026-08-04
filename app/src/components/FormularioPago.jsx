// ============================================
// Formulario de datos de pago (controlado, compartido)
// ------------------------------------------------------------
// UI del método de pago (Contado / Crédito) y sus campos. Se usa en:
//   - el modal de "Solicitar aprobación" (AccionesCotizacion), donde completar
//     los datos es OBLIGATORIO para poder enviar la cotización al admin, y
//   - la sección de pago del detalle (DetalleCotizacion).
// La validación y la normalización viven en services/cotizaciones (fuente
// única): este componente solo pinta el formulario. La casilla "Muestra
// enviada por correo" es la MISMA en ambos métodos (mismo texto y semántica).
// ============================================

export default function FormularioPago({ value, onChange, nombreGrupo = 'pago-metodo' }) {
  const form = value || {};
  const set = (parche) => onChange({ ...form, ...parche });

  return (
    <div className="pago-form">
      <fieldset className="pago-metodo">
        <legend>Método de pago *</legend>
        <label className="pago-radio">
          <input
            type="radio"
            name={nombreGrupo}
            value="contado"
            checked={form.metodo === 'contado'}
            onChange={() => set({ metodo: 'contado' })}
          />
          <span>Contado</span>
        </label>
        <label className="pago-radio">
          <input
            type="radio"
            name={nombreGrupo}
            value="credito"
            checked={form.metodo === 'credito'}
            onChange={() => set({ metodo: 'credito' })}
          />
          <span>Crédito</span>
        </label>
      </fieldset>

      {form.metodo === 'contado' && (
        <div className="pago-detalle">
          <label className="campo">
            <span>N° de comprobante de pago *</span>
            <input
              type="text"
              value={form.comprobante || ''}
              onChange={(e) => set({ comprobante: e.target.value })}
              placeholder="Ej: 00123456"
              autoComplete="off"
            />
          </label>
          <label className="pago-check">
            <input
              type="checkbox"
              checked={Boolean(form.muestraEnviada)}
              onChange={(e) => set({ muestraEnviada: e.target.checked })}
            />
            <span>Muestra enviada por correo</span>
          </label>
        </div>
      )}

      {form.metodo === 'credito' && (
        <div className="pago-detalle">
          <label className="pago-check">
            <input
              type="checkbox"
              checked={Boolean(form.cotizacionAprobada)}
              onChange={(e) => set({ cotizacionAprobada: e.target.checked })}
            />
            <span>Cotización aprobada *</span>
          </label>
          <label className="pago-check">
            <input
              type="checkbox"
              checked={Boolean(form.muestraEnviada)}
              onChange={(e) => set({ muestraEnviada: e.target.checked })}
            />
            <span>Muestra enviada por correo</span>
          </label>
        </div>
      )}

      {!form.metodo && (
        <p className="texto-suave">Elegí Contado o Crédito para completar los datos.</p>
      )}
    </div>
  );
}
