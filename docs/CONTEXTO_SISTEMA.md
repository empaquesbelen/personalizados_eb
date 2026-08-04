# 📘 Contexto y Guía Técnica — Sistema de Cotización Empaques Belén

> Documento de referencia maestro del sistema. Sirve para entender **qué es, cómo funciona y de qué depende** el cotizador antes, durante y después de la migración a las cuentas de la empresa.
>
> **Última actualización:** 23 de julio de 2026
> **Estado:** Sistema **LEGACY**. Sigue desplegado y en producción por su cuenta, pero el proyecto **pivotó a Firebase + React** (ver [../CLAUDE.md](../CLAUDE.md)). Este documento queda como **referencia del sistema viejo** y guía para **importar sus datos** a Firestore.
>
> 📁 **Nota de rutas:** los archivos que este documento menciona (`Code.gs`, `personalizados-eb-web/`, etc.) se movieron a **`../legacy-cotizador/`**. Los enlaces internos de abajo apuntan a las rutas originales.

---

## 1. ¿Qué es este sistema?

Es un **cotizador web de productos personalizados** (bolsas, fundas, bandejas, etc.) para la empresa **Empaques Belén**. Lo usan los **prevendedores/vendedores** para:

1. Seleccionar un producto del catálogo (con cascada de filtros: producto → tamaño → impresión → material).
2. Ingresar cantidad y cliente.
3. Calcular precios en tiempo real (con IVA 13% y conversión a dólares).
4. Generar un **PDF de cotización proforma** profesional con logo, términos y datos de pago.
5. Guardar la cotización en un **historial** con número consecutivo.

No tiene contraseñas: el "login" es solo elegir el nombre del vendedor de una lista.

---

## 2. Arquitectura general

```
┌─────────────────────────────┐         ┌──────────────────────────────┐        ┌─────────────────────────┐
│   FRONTEND (sitio estático) │  HTTPS  │  BACKEND (Google Apps Script)│  API   │  BASE DE DATOS          │
│   HTML + CSS + JS vanilla   │ ──────▶ │  Code.gs desplegado como     │ ─────▶ │  Google Sheets          │
│   Alojado en NETLIFY        │  GET    │  "Web App" (URL /exec)       │        │  (5 hojas)              │
└─────────────────────────────┘         └──────────────────────────────┘        └─────────────────────────┘
                                                     │
                                                     │ consulta tipo de cambio (opcional)
                                                     ▼
                                          ┌──────────────────────────┐
                                          │  API del BCCR             │
                                          │  (Banco Central CR)       │
                                          └──────────────────────────┘
```

**Flujo de una petición:** el navegador del vendedor llama a la URL `/exec` del Apps Script pasando `?path=<endpoint>`. El Apps Script lee/escribe en el Google Sheets y devuelve JSON. El frontend nunca habla directamente con Sheets.

---

## 3. Componentes y dónde viven hoy (cuentas personales ⚠️)

| # | Componente | Tecnología | Dónde está hoy | Se migra a la empresa |
|---|-----------|-----------|----------------|:---:|
| 1 | **Base de datos** | Google Sheets (5 hojas) | Cuenta Google **personal** | ✅ |
| 2 | **Backend / API** | Google Apps Script (Web App) | Cuenta Google **personal** | ✅ |
| 3 | **Frontend** | Sitio estático HTML/JS | **Netlify** personal | ✅ |
| 4 | **Repositorio** (si aplica) | Git | GitHub personal *(por confirmar)* | ✅ |
| 5 | **Tipo de cambio** | API BCCR con credenciales públicas compartidas | Externo (no es cuenta tuya) | ⬜ Opcional |
| 6 | **Librería PDF** | jsPDF vía CDN público (cdnjs) | Externo (CDN) | ⬜ No requiere |

> ⚠️ **Dato crítico:** la **base de datos real de producción vive SOLO en el Google Sheets en la nube**, no en este repositorio. El código (`Code.gs`) solo contiene 6 productos de *ejemplo* que se usan para inicializar una hoja vacía. **El catálogo real, los precios reales, los vendedores reales y todo el historial de cotizaciones existen únicamente en el Sheets en línea.** Preservar ese Sheets es lo más importante de la migración.

---

## 4. Identificadores y "secretos" incrustados en el código

Estos son los valores que **hay que cambiar** durante la migración. Están hardcodeados en el código:

| Qué | Valor actual | Archivo / línea |
|-----|--------------|-----------------|
| **ID del Google Sheets** | `1OBw8wM8N39Ev-XEzxyFUHwg6zI6qAvgQBdqNJ-zUPow` | [Code.gs:6](Code.gs#L6) |
| **URL del Apps Script (ACTIVA)** | `https://script.google.com/macros/s/AKfycbxxgAqYM8oi-ZduEFn2KWFNnecjhnPoJ10uaEQOX34xf_RmKmKyjfY9qcWRQsbtv52j0g/exec` | [api.js:8](personalizados-eb-web/js/api.js#L8) |
| URL de Apps Script **antigua/obsoleta** (en docs `.txt`, ya NO se usa) | `.../s/AKfycbz6RHG2xD5oidBq_TAst6EovgGNr18uu7ItnXntcv7VUQd6j-OtLoLdiT3GAPSqdKOBvw/exec` | INICIO_AQUI.txt, LISTO_PARA_USAR.md |
| Credenciales públicas BCCR (correo) | `alb.saenz@gmail.com` | [Code.gs:603](Code.gs#L603) |
| Credenciales públicas BCCR (token) | `IL7CLLIAAL` | [Code.gs:604](Code.gs#L604) |
| CDN de jsPDF | `cdnjs.cloudflare.com/.../jspdf 2.5.1` | [dashboard.html:263-264](personalizados-eb-web/dashboard.html#L263) |
| Carpeta que publica Netlify | `personalizados-eb-web` | [netlify.toml](netlify.toml) |

> ⚠️ Hay **dos** URLs de Apps Script en el proyecto. La que realmente usa producción es la de `api.js`. La otra quedó en documentos viejos y confunde: al migrar conviene borrarla de los `.txt`.

---

## 5. Estructura de archivos

```
personalizados_EB/
├── Code.gs                        ← BACKEND: toda la API (Google Apps Script)
├── appsscript.json                ← Manifiesto del Apps Script (scopes, zona horaria)
├── netlify.toml                   ← Config de despliegue (publica personalizados-eb-web/)
├── CONTEXTO_SISTEMA.md            ← (este documento)
├── PLAN_MIGRACION.md              ← Paso a paso de la migración
├── INSTRUCCIONES_INICIO.md        ← Guía original de instalación
├── INICIO_AQUI.txt / LISTO_PARA_USAR.md / RESUMEN_ENTREGA.txt  ← Docs de entrega (contienen la URL vieja)
│
└── personalizados-eb-web/         ← FRONTEND (esto es lo que se sube a Netlify)
    ├── index.html                 ← Solo redirige a dashboard.html
    ├── dashboard.html             ← Página principal (UI + carga de jsPDF por CDN)
    ├── logo/
    │   ├── logo.webp              ← Logo que sale en el PDF
    │   └── cuentas.jpg            ← Imagen con las CUENTAS BANCARIAS que sale en el PDF
    ├── css/
    │   └── styles.css             ← Estilos
    ├── js/
    │   ├── config.js              ← Constantes: caché, validaciones, mensajes, materiales
    │   ├── api.js                 ← ⭐ Comunicación con Apps Script (aquí está la URL /exec)
    │   ├── auth.js                ← "Sesión" del vendedor (sessionStorage)
    │   ├── form.js                ← Controlador principal de la UI del dashboard
    │   ├── calculator.js          ← Cálculo de precios y validaciones
    │   ├── pdf-generator.js       ← Genera el PDF de la cotización
    │   ├── utils.js               ← Utilidades (formato, caché, validación)
    │   └── bootstrap.js           ← Arranca initDashboard()
    └── docs/
        ├── GOOGLE_SHEETS_SETUP.md
        ├── APPS_SCRIPT_SETUP.md
        ├── USER_MANUAL.md
        └── ADMIN_MANUAL.md
```

---

## 6. Modelo de datos (Google Sheets — 5 hojas)

El nombre de las hojas debe ser **exacto** (lo exige `Code.gs`).

### Hoja `BaseDatos` — catálogo de productos y precios
Columnas (orden importa, se leen por posición):

| Col | Nombre | Descripción |
|-----|--------|-------------|
| A | Cod | Código del producto |
| B | Producto | Nombre (ej. "Bolsas Papel") |
| C | Tamaño | Tamaño |
| D | Minimo | Cantidad mínima de compra |
| E | Impresion1 | Tipo de impresión 1 |
| F | Impresion2 | Tipo de impresión 2 (caras) |
| G | Material | Material |
| H | PrecioSinIVA | Precio base sin IVA |
| I | UnitSinIVA | (fórmula) precio unitario sin IVA |
| J | IVA | (fórmula) `H*0.13` |
| K | TotalConIVA | (fórmula) `H+J` |
| L | TotalUnitConIVA | (fórmula) `K/D` |
| **M** | **PrecioEnUsd** | ⚠️ Bandera: si dice **"Aplica"**, el precio de col H está en **dólares** y el backend lo multiplica por el tipo de cambio del BCCR. **Esta columna existe en el Sheets real pero NO la crea el código de inicialización.** |

### Hoja `Vendedores`
| A | B | C |
|---|---|---|
| Nombre | WhatsApp | Email |

### Hoja `Condiciones`
| A | B |
|---|---|
| Articulo | Condiciones (texto multilínea con términos por producto) |

### Hoja `Configuracion` (pares parámetro/valor)
| Parametro | Valor (ejemplo) |
|-----------|-----------------|
| TipoCambio | 512 (respaldo si falla BCCR) |
| IVA | 0.13 |
| NombreEmpresa | Empaques Belén |
| Telefono | (506) 2438-5119 / 2438-0930 |
| Direccion | San Rafael, Alajuela, Costa Rica |
| CedulaJuridica | 3-101-135332 |

### Hoja `Historial` (se escribe automáticamente al generar cotización)
| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Consecutivo | Fecha | Vendedor | Cliente | Productos (JSON) | Total | TipoCambio |

---

## 7. API — endpoints del backend (`Code.gs`)

Todos son peticiones **GET** a la URL `/exec` con `?path=<nombre>`. Devuelven `{ success, data }` o `{ success:false, error }`.

| path | Qué hace |
|------|----------|
| `vendedores` | Lista de vendedores (además sincroniza/renombra vendedores, ver §8) |
| `productos` | Lista de nombres de producto únicos |
| `tamanos?producto=` | Tamaños disponibles para un producto |
| `opciones?producto=&tamano=&impresion1=&impresion2=` | Impresiones y materiales válidos |
| `catalogo-busqueda` | Catálogo completo indexado para búsqueda con autocompletado |
| `condiciones?producto=` | Términos y condiciones del producto (con match flexible) |
| `configuracion` | Datos de empresa + tipo de cambio **en vivo del BCCR** |
| `configuracion-simple` | Igual pero sin llamar al BCCR (debug) |
| `historial?vendedor=` | Últimas 10 cotizaciones de ese vendedor |
| `buscar-producto?...` | Precio de una combinación exacta |
| `buscar-productos-lote?items=` | Precios de varias combinaciones a la vez (JSON) |
| `guardar-cotizacion?...` | Guarda una cotización en el Historial y devuelve el consecutivo |
| `bccr-test` / `urlfetch-test` | Diagnóstico |
| `init` / `reset-init` | Inicializa/reinicia las hojas con datos de ejemplo ⚠️ (`reset-init` **borra** las hojas) |

---

## 8. Lógica de negocio importante (para no romper nada)

- **Conversión USD → CRC:** si la fila del producto tiene `PrecioEnUsd = "Aplica"` (columna M), el backend toma el precio como dólares y lo convierte usando el tipo de cambio de **venta** del BCCR (indicador 318). El valor se cachea 5 minutos. Si el BCCR falla, usa **512** de respaldo.
- **Número consecutivo de cotización:** `[3 letras del vendedor sin tildes] + [ddMM] + [secuencia 2 dígitos]`. Ej.: Stephanie el 23/07 → `STE2307` + `01`, `02`, … Se calcula en [Code.gs:1103](Code.gs#L1103).
- **Renombrado automático de vendedores (`VENDOR_REPLACEMENTS`):** el código reemplaza automáticamente en la hoja `Vendedores`:
  - "odilon rodriguez" → **Juan Pablo Herrera**
  - "michael soto" → **Julián Salazar**
  - y garantiza que ambos existan. Es lógica hardcodeada en [Code.gs:15](Code.gs#L15) — tenerla presente si algún día esos nombres cambian.
- **Precios:** los cálculos finales (IVA, total, unitario) los hace el **Sheets con fórmulas**; el backend solo lee esos valores ya calculados. Por eso las columnas I–L deben tener fórmulas.
- **Caché en el navegador:** el frontend guarda respuestas en `localStorage` (1 hora para catálogo; 5 min para configuración/productos). Tras cambiar precios en el Sheets, puede tardar hasta 1 h en reflejarse (o limpiar caché con Ctrl+Shift+R).
- **Sin autenticación real:** cualquiera con la URL puede usar el sistema y el Web App está desplegado como "Cualquiera puede acceder" (necesario para que el frontend llame sin login). No hay datos sensibles expuestos salvo el catálogo/precios.

---

## 9. Dependencias externas

1. **Google Apps Script + Sheets** — el corazón del sistema (cuenta a migrar).
2. **Netlify** — hosting del frontend (cuenta a migrar).
3. **API BCCR** — tipo de cambio. Usa credenciales **públicas compartidas** (no personales), así que técnicamente no es "tuya", pero conviene registrar las de la empresa para no depender de un tercero.
4. **CDN cdnjs (jsPDF + autoTable)** — genera el PDF en el navegador. Es un CDN público; no requiere cuenta ni migración, pero es una dependencia externa a tener en cuenta.

---

## 10. Riesgos y notas para la migración

- 🔴 **El Sheets es la única copia de la BD real.** Antes de tocar nada: hacer respaldo (Archivo → Hacer una copia / Descargar).
- 🔴 **`reset-init` borra las hojas.** Nunca llamarlo sobre el Sheets de producción.
- 🟠 **Cada nuevo deploy del Apps Script genera una URL `/exec` nueva.** Al migrar, la URL cambiará y hay que actualizarla en `api.js`.
- 🟠 **La URL de Netlify cambiará** si no se transfiere el sitio o no se usa un dominio propio → hay que reavisar a los vendedores.
- 🟠 **Columna M (`PrecioEnUsd`)** existe en el Sheets real pero no en el código de ejemplo: al copiar el Sheets se preserva sola, pero tenerlo en cuenta si se recrea desde cero.
- 🟢 El logo y la imagen de cuentas bancarias ya están en el repo (`personalizados-eb-web/logo/`). Verificar que `cuentas.jpg` tenga las cuentas **de la empresa**.

---

## 11. Glosario rápido de URLs

| Componente | URL |
|-----------|-----|
| Frontend (Netlify) | *(la que tengas hoy)* `https://<algo>.netlify.app/` |
| Backend (Apps Script) | `https://script.google.com/macros/s/AKfycbxxg…j0g/exec` |
| Prueba rápida del backend | `<URL/exec>?path=configuracion` → debe devolver JSON |
| Google Sheets (BD) | `https://docs.google.com/spreadsheets/d/1OBw8wM8N39Ev-XEzxyFUHwg6zI6qAvgQBdqNJ-zUPow/edit` |
