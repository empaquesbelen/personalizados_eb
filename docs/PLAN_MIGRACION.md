# 🚚 Plan de Migración — De cuentas personales a Empaques Belén

> Objetivo: mover **base de datos (Google Sheets)**, **backend (Apps Script)** y **frontend (Netlify)** de tus cuentas personales a cuentas de la empresa, **sin perder datos y sin cortar el servicio** a los vendedores.
>
> Estrategia recomendada: **montar todo nuevo en paralelo en las cuentas de la empresa, probar, y recién ahí “cambiar el switch”.** El sistema viejo sigue funcionando hasta que el nuevo esté verificado.

---

## 🎯 Resumen de lo que se migra

> **Decisiones tomadas (23 jul 2026):** la empresa usará una **cuenta Gmail** propia → haremos **copia** del Sheets (nuevo ID). Frontend en **Netlify de la empresa** publicado **arrastrando la carpeta** (sin GitHub). **Sin dominio propio** → la URL cambia y hay que reavisar a los vendedores.

| # | Pieza | De (personal) | A (empresa) | ¿Cambia de URL/ID? |
|---|-------|---------------|-------------|:---:|
| 1 | Google Sheets (BD) | Tu Google | Gmail de la empresa | Sí (nuevo ID) |
| 2 | Apps Script (API) | Tu Google | Gmail de la empresa | Sí (nueva URL /exec) |
| 3 | Frontend | Netlify personal | Netlify de la empresa | Sí (nueva URL .netlify.app) |
| 4 | Credenciales BCCR | Públicas compartidas | (Opcional) propias de la empresa | Opcional |

*(No hay repositorio GitHub conectado: el sitio se publica arrastrando la carpeta a Netlify.)*

---

## ✅ FASE 0 — Preparación y respaldo (antes de tocar nada)

- [ ] **0.1 Respaldar el Google Sheets de producción.** Abrí el Sheets actual → *Archivo → Descargar → Microsoft Excel (.xlsx)* **y** *Archivo → Hacer una copia*. Guardá ambas. Esta es la única copia de la BD real.
- [ ] **0.2 Respaldar el código del Apps Script.** Ya lo tenés en `Code.gs` en este repo, pero confirmá que sea idéntico al que está desplegado (a veces se editan cosas directo en la web). Copialo tal cual desde el editor de Apps Script.
- [ ] **0.3 Anotar la configuración actual del deploy del Apps Script:** “Ejecutar como” y “Quién tiene acceso” (debe ser *Cualquiera*).
- [ ] **0.4 Anotar la URL actual de Netlify** y si el sitio se despliega **por arrastrar carpeta** o **conectado a GitHub**.
- [ ] **0.5 Confirmar que `cuentas.jpg` y `logo.webp`** (en `personalizados-eb-web/logo/`) son los definitivos de la empresa.

---

## ✅ FASE 1 — Base de datos (Google Sheets) a la cuenta Gmail de la empresa

Vía elegida: **hacer una copia** dentro de la cuenta de la empresa (deja el original intacto como respaldo).

- [ ] 1.1 Desde **tu** cuenta, compartí el Sheets original con el **Gmail de la empresa** como *Editor*.
- [ ] 1.2 Iniciá sesión con el **Gmail de la empresa** y abrí ese Sheets.
- [ ] 1.3 *Archivo → Hacer una copia* → guardarla en el Drive de la empresa (nombre sugerido: `Cotizador Personalizados EB`).
- [ ] 1.4 Verificá que la copia tenga **las 5 hojas** (BaseDatos, Vendedores, Condiciones, Configuracion, Historial) **con todos los datos y las fórmulas** de las columnas I–L, y la **columna M (PrecioEnUsd)** con sus valores "Aplica".
- [ ] 1.5 Copiá el **nuevo ID** del Sheets (está en la URL entre `/d/` y `/edit`).

> 📌 Resultado de la Fase 1: un Google Sheets propiedad de la empresa, con toda la data. Anotá su **ID**.
>
> 💡 Nota: al usar copia, el `Historial` de cotizaciones queda "congelado" hasta el día del cambio. Como haremos el cutover el mismo día, no se pierde nada; solo asegurate de hacer la copia **poco antes** de activar el sistema nuevo.

---

## ✅ FASE 2 — Backend (Google Apps Script) a la cuenta de la empresa

- [ ] 2.1 Con el **correo de la empresa**, andá a [script.google.com](https://script.google.com) → *Nuevo proyecto*. (O desde el Sheets nuevo: *Extensiones → Apps Script*.)
- [ ] 2.2 Borrá el contenido y **pegá todo `Code.gs`** de este repo.
- [ ] 2.3 En la línea 6, poné el **nuevo ID del Sheets** (el de la Fase 1):
      `const SPREADSHEET_ID = 'NUEVO_ID_AQUI';`
- [ ] 2.4 Copiá también el manifiesto `appsscript.json` (scopes y zona horaria). Si no ves el archivo, activá *Configuración → Mostrar “appsscript.json”*.
- [ ] 2.5 Guardá (Ctrl+S).
- [ ] 2.6 *Implementar → Nueva implementación → Aplicación web*:
  - **Ejecutar como:** la cuenta de la empresa.
  - **Quién tiene acceso:** *Cualquiera*.
- [ ] 2.7 **Autorizá los permisos** cuando lo pida (aparece “Se necesita autorización” → Permitir). Usa los scopes de Sheets y solicitudes externas.
- [ ] 2.8 Copiá la **nueva URL `/exec`**.
- [ ] 2.9 Probala en el navegador: `NUEVA_URL/exec?path=configuracion` → debe devolver JSON con la config. Probá también `?path=vendedores`.

> 📌 Resultado de la Fase 2: la API corriendo en la cuenta de la empresa. Anotá la **nueva URL /exec**.

---

## ✅ FASE 3 — Frontend (actualizar y desplegar)

- [ ] 3.1 En [personalizados-eb-web/js/api.js:8](personalizados-eb-web/js/api.js#L8) reemplazá la URL vieja por la **nueva URL /exec** de la Fase 2.
- [ ] 3.2 (Limpieza recomendada) Borrá/actualizá la **URL vieja** que aparece en `INICIO_AQUI.txt`, `LISTO_PARA_USAR.md` y `RESUMEN_ENTREGA.txt` para evitar confusiones futuras.
- [ ] 3.3 Crear una **cuenta Netlify de la empresa** (podés iniciar sesión en netlify.com con el **Gmail de la empresa** con "Sign up with Google").
- [ ] 3.4 Publicar **arrastrando la carpeta** `personalizados-eb-web/` a la zona de *"drag & drop"* de Netlify (Sites → arrastrar). En ~1 minuto da una URL nueva `https://<nombre>.netlify.app/`.
- [ ] 3.5 (Opcional) Cambiar el nombre del sitio en *Site settings → Change site name* a algo memorable (ej. `cotizador-eb.netlify.app`).
- [ ] 3.6 Probar el sitio nuevo de punta a punta (ver Fase 5).

> 💡 Como no hay GitHub conectado, **cada futuro cambio se publica volviendo a arrastrar la carpeta** (o con *Deploys → Drag and drop*). Es simple pero manual — tenelo presente para actualizaciones futuras.

> 📌 Resultado de la Fase 3: el frontend de la empresa apuntando al backend de la empresa.

---

## ✅ FASE 4 — (Opcional) Credenciales propias del BCCR

- [ ] 4.1 Registrar un correo de la empresa en el servicio de indicadores del BCCR y obtener su **token**.
- [ ] 4.2 Reemplazar `BCCR_DEFAULT_EMAIL` y `BCCR_DEFAULT_TOKEN` en [Code.gs:603-604](Code.gs#L603).
- [ ] 4.3 Redeploy del Apps Script. *(Si no se hace, el sistema sigue funcionando con las credenciales públicas actuales.)*

---

## ✅ FASE 5 — Pruebas de aceptación (antes de anunciar)

Probá en el sitio nuevo:
- [ ] 5.1 Cargan los **vendedores** en el selector.
- [ ] 5.2 Cascada producto → tamaño → impresión → material funciona.
- [ ] 5.3 El **precio se calcula** y coincide con lo esperado (incluí un producto con `PrecioEnUsd = Aplica` para verificar la conversión a colones).
- [ ] 5.4 El **tipo de cambio** aparece (idealmente “BCCR”, no el 512 de respaldo).
- [ ] 5.5 Se **genera el PDF** con logo, tabla, términos y la hoja de cuentas bancarias.
- [ ] 5.6 Al generar, la cotización **queda guardada en el Historial** del Sheets nuevo con su consecutivo.
- [ ] 5.7 Revisar la consola del navegador (F12) sin errores rojos.

---

## ✅ FASE 6 — Cambio (cutover) y cierre

- [ ] 6.1 Comunicar a los vendedores la **nueva URL** (o, si usaste dominio propio y lo apuntaste, no hace falta).
- [ ] 6.2 Dejar el sistema viejo activo unos días como respaldo.
- [ ] 6.3 Confirmar que las cotizaciones nuevas entran al Sheets **de la empresa** (no al viejo).
- [ ] 6.4 **Desconectar lo viejo:** despublicar/eliminar el sitio Netlify personal y **archivar** (no borrar aún) el Sheets/Apps Script personales.
- [ ] 6.5 Guardar en un lugar de la empresa (gestor de contraseñas / documento interno) todos los accesos: correo Google de la empresa, cuenta Netlify, dominio, IDs y URLs nuevos.
- [ ] 6.6 Pasado ~1 mes sin incidentes, eliminar definitivamente los recursos personales.

---

## 📋 Lo que necesito de vos para ayudarte (checklist de insumos)

Para poder acompañarte en cada paso y editar el código correctamente, necesito que me confirmes / consigas:

### Decisiones (ya definidas ✅)
- ~~¿Cuenta Google de la empresa?~~ → **Gmail propio de la empresa** → copia del Sheets (Fase 1).
- ~~¿Dónde alojar el frontend?~~ → **Netlify de la empresa** (arrastrando la carpeta).
- ~~¿Dominio propio?~~ → **No**, se usa la URL de Netlify → hay que reavisar a los vendedores.
- ~~¿Deploy actual?~~ → **Arrastrando la carpeta** (sin GitHub).

### Datos / accesos que debés conseguir
1. El **correo Gmail de la empresa** y su contraseña/acceso (para crear ahí el Sheets, el Apps Script y la cuenta Netlify). Si aún no existe, crearlo.
2. La **URL actual de Netlify** en producción (para reavisar a los vendedores con la nueva).
3. Confirmar que **`cuentas.jpg`** (las cuentas bancarias que salen en el PDF) son las de la empresa; si no, pasame la imagen nueva.
4. (Opcional) Si querés BCCR propio: el **correo + token** que registres en el BCCR.
5. La lista de **vendedores a reavisar** con la nueva URL (o el grupo de WhatsApp donde compartirla).

> Cuando tengas el **Gmail de la empresa** listo, avisame y arrancamos por la Fase 0 (respaldo) y la Fase 1 (copia del Sheets). Yo me encargo de editar `api.js` (nueva URL) y `Code.gs` (nuevo ID) apenas tengamos esos dos valores.

### Lo que yo hago con eso
- Edito `api.js` con la nueva URL `/exec` y `Code.gs` con el nuevo `SPREADSHEET_ID`.
- Limpio las URLs viejas de los documentos.
- Te preparo, si querés, un repo listo para GitHub + Netlify de la empresa.
- Te guío en vivo en cada fase y validamos las pruebas de la Fase 5.

---

## ⏱️ Estimación de esfuerzo

| Fase | Tiempo aprox. |
|------|---------------|
| 0 – Respaldo | 15 min |
| 1 – Sheets | 15–30 min |
| 2 – Apps Script | 20–30 min |
| 3 – Frontend | 20–40 min (más si hay dominio propio) |
| 4 – BCCR (opcional) | 15 min |
| 5 – Pruebas | 20 min |
| 6 – Cutover | Repartido en unos días |

**Total activo: ~2 horas** de trabajo, más días de convivencia viejo/nuevo por seguridad.
