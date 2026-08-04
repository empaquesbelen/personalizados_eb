# Apps Script del Tipo de Cambio (nueva API SDDE del BCCR)

> El BCCR descontinuó el método viejo (`wsindicadoreseconomicos.asmx`) el **30/06/2026**.
> Ahora se usa la **API SDDE** (`apim.bccr.fi.cr`), que requiere un **Bearer Token**.
> El token vive SOLO en el Apps Script (servidor de Google), nunca en el navegador.

Este servicio, propiedad de **empaquesbelen.dev@gmail.com**, devuelve el tipo de cambio
de **venta** (indicador 318) como JSON. La app React lo consume.

## ⚠️ Por qué hoy no funciona
La implementación desplegada devuelve `{"success":false,"error":"BCCR no disponible..."}`.
Causa: el token nunca se configuró (o la versión desplegada es vieja). La API del BCCR
está **perfecta** (probada: venta 24/07 = 455.13); el fallo es de configuración del script.

## Actualizar el Apps Script existente (mantiene la misma URL)

1. Logueado como **empaquesbelen.dev@gmail.com**, abrí tu proyecto de Apps Script (el que ya creaste).
2. Reemplazá el contenido de `Code.gs` por el de [`Code.gs`](Code.gs) (versión nueva SDDE).
   **Ya NO hay que pegar el token en el código** (queda seguro fuera del repo).
3. **Guardá el token en Propiedades del script** (en vez de en el código):
   - **Configuración del proyecto** (ícono de engranaje ⚙️ a la izquierda) →
     bajá a **Propiedades del script** → **Agregar propiedad de secuencia de comandos**.
   - Propiedad: `BCCR_TOKEN`  ·  Valor: *(tu token del BCCR)*  →  **Guardar propiedades**.
   - (El token es el que generaste en Indicadores Económicos → Mi Perfil → Generar token.)
4. **Guardá** el código (Ctrl+S). Opcional: en el editor, **Ejecutar → `test_`** y mirá
   **Ver → Registros**; debe imprimir algo como `{valor=455.13, fecha=2026-07-24}`.
5. **Implementar → Administrar implementaciones** → en tu implementación existente, clic en el lápiz ✏️ → **Versión: Nueva versión** → **Implementar**.
   - Esto **mantiene la misma URL `/exec`**, así no hay que reconfigurar nada en la app.
6. **Probá la URL `/exec`** en el navegador. Debe devolver (con la venta del día):
   ```json
   {"success":true,"data":{"tipoCambio":455.13,"fuente":"BCCR","fecha":"2026-07-24"}}
   ```

Con eso, la app toma el tipo de cambio del BCCR **en vivo** (no editable) y los precios
de productos en dólares quedan correctos automáticamente.

## Notas
- El indicador **318** es "Tipo cambio venta" (lo que usaba el legacy). El 317 es compra.
- Cada vez que el token del BCCR cambie/expire, actualizá la propiedad `BCCR_TOKEN` en
  Propiedades del script (no hace falta tocar el código, pero sí redeployar si querés forzar).
- El token NO va al repositorio: vive en Propiedades del script (Google). En la app local, el mismo
  token está en `secrets/bccrToken.txt` (ignorado por git) para el script `tools/actualizarTipoCambio.js`.

## Alternativa (sin Apps Script): job programado
Como la nueva API se puede llamar desde cualquier servidor con el token, otra opción es
correr `node tools/actualizarTipoCambio.js` de forma programada (GitHub Action / Task
Scheduler) para escribir `config/general.tipoCambio` una vez al día. La app lee ese valor.
Elegí una de las dos vías (Apps Script en vivo, o job programado); no hacen falta ambas.
