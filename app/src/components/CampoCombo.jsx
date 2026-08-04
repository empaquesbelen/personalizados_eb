// ============================================
// CampoCombo — campo tipo "combobox": selector de valores existentes + texto libre.
// ------------------------------------------------------------
// Ayuda al superadmin a NO duplicar datos: al escribir muestra los valores que
// ya existen en el catálogo para ese campo (para reutilizarlos), y si lo que
// escribe no coincide con ninguno, avisa que es un valor NUEVO (texto libre).
// Controlado: `valor` + `onChange`. `opciones` = lista de valores existentes.
// ============================================
import { useMemo, useRef, useState } from 'react';

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export default function CampoCombo({
  label,
  ayuda,
  valor,
  onChange,
  opciones = [],
  placeholder,
  obligatorio = false,
}) {
  const [abierto, setAbierto] = useState(false);
  const timerRef = useRef(null);

  const filtradas = useMemo(() => {
    const q = norm(valor);
    const base = q ? opciones.filter((o) => norm(o).includes(q)) : opciones;
    return base.slice(0, 50); // techo defensivo para catálogos grandes
  }, [opciones, valor]);

  const existe = useMemo(
    () => Boolean(String(valor || '').trim()) && opciones.some((o) => norm(o) === norm(valor)),
    [opciones, valor],
  );

  function seleccionar(o) {
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange(o);
    setAbierto(false);
  }

  const tieneValor = Boolean(String(valor || '').trim());

  return (
    <label className="campo campo-combo">
      <span>
        {label}
        {obligatorio ? ' *' : ''}
      </span>
      <div className="combo-wrap">
        <input
          type="text"
          value={valor || ''}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto}
          onChange={(e) => {
            onChange(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => {
            // Timeout para permitir el click en una opción antes de cerrar.
            timerRef.current = setTimeout(() => setAbierto(false), 120);
          }}
        />
        {abierto && filtradas.length > 0 && (
          <ul className="combo-lista" role="listbox">
            {filtradas.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  className={`combo-opcion${norm(o) === norm(valor) ? ' activa' : ''}`}
                  onMouseDown={(e) => e.preventDefault()} // evita el blur antes del click
                  onClick={() => seleccionar(o)}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="campo-ayuda">
        {tieneValor &&
          (existe ? (
            <span className="combo-estado combo-estado--existe">Ya existe · se reutiliza</span>
          ) : (
            <span className="combo-estado combo-estado--nuevo">Nuevo valor · se creará</span>
          ))}
        {ayuda ? <span className="combo-ayuda-txt">{ayuda}</span> : null}
      </span>
    </label>
  );
}
