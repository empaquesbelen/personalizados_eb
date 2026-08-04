# 🚀 INSTRUCCIONES DE INICIO RÁPIDO

## Sistema de Cotización - Personalizados EB

Bienvenido al sistema de cotización digital para productos personalizados. Sigue estos pasos para hacerlo funcionar.

---

## ⚡ Resumen Ultra-Rápido (5 minutos)

Si solo quieres empezar rápido:

1. **Paso 1 - Google Sheets:** Crea un Google Sheets, sigue [GOOGLE_SHEETS_SETUP.md](personalizados-eb-web/docs/GOOGLE_SHEETS_SETUP.md)
2. **Paso 2 - Apps Script:** Copia Code.gs, sigue [APPS_SCRIPT_SETUP.md](personalizados-eb-web/docs/APPS_SCRIPT_SETUP.md)
3. **Paso 3 - Configuración:** Actualiza `API_BASE_URL` en `personalizados-eb-web/js/config.js`
4. **Paso 4 - Deploy:** Sube la carpeta `personalizados-eb-web` a Netlify
5. **¡LISTO!** Comparte la URL de Netlify con tus prevendedores

---

## 📋 Guías Detalladas

### Para VENDEDORES (Prevendedores):
👉 Lee: [USER_MANUAL.md](personalizados-eb-web/docs/USER_MANUAL.md)

- Cómo crear cotizaciones
- Cómo generar PDFs
- Validaciones y errores comunes

### Para ADMINISTRADORES:
👉 Lee: [ADMIN_MANUAL.md](personalizados-eb-web/docs/ADMIN_MANUAL.md)

- Actualizar catálogo de productos
- Agregar/editar vendedores
- Cambiar precios y términos
- Revisar historial

### Para CONFIGURACIÓN TÉCNICA:
👉 Lee: [GOOGLE_SHEETS_SETUP.md](personalizados-eb-web/docs/GOOGLE_SHEETS_SETUP.md)

- Crear Google Sheets
- Estructura de datos
- Datos de ejemplo

👉 Lee: [APPS_SCRIPT_SETUP.md](personalizados-eb-web/docs/APPS_SCRIPT_SETUP.md)

- Desplegar Google Apps Script
- Configurar Web App
- Obtener URL de API

---

## 📁 Estructura de Archivos

```
Proyectos Web/2026/personalizados_EB/
├── Code.gs                           ← Código Google Apps Script
└── personalizados-eb-web/            ← Frontend para desplegar en Netlify
    ├── index.html                    ← Página de login
    ├── dashboard.html                ← Página principal
    ├── README.md                     ← Readme del proyec to
    ├── css/
    │   └── styles.css                ← Estilos corporativos
    ├── js/
    │   ├── config.js                 ← Configuración de API (EDITA ESTO)
    │   ├── api.js                    ← Comunicación con Google Apps Script
    │   ├── auth.js                   ← Autenticación
    │   ├── form.js                   ← Lógica del formulario
    │   ├── calculator.js             ← Cálculos de precios
    │   ├── pdf-generator.js          ← Generación de PDF
    │   └── utils.js                  ← Utilidades generales
    └── docs/
        ├── GOOGLE_SHEETS_SETUP.md    ← Setup del Sheets
        ├── APPS_SCRIPT_SETUP.md      ← Setup del Apps Script
        ├── USER_MANUAL.md            ← Manual del usuario
        └── ADMIN_MANUAL.md           ← Manual del admin
```

---

## 🎯 Pasos Detallados de Instalación

### PASO 1: Crear Google Sheets

**Tiempo estimado: 15 minutos**

1. Ve a https://sheets.google.com
2. Crea un nuevo Sheets
3. Nombre: `Cotizador Personalizados EB`
4. Sigue completamente: [GOOGLE_SHEETS_SETUP.md](personalizados-eb-web/docs/GOOGLE_SHEETS_SETUP.md)
5. **Copia y guarda el Spreadsheet ID** (de la URL)

✅ **Checklist:**
- [ ] 5 hojas creadas (BaseDatos, Vendedores, Condiciones, Configuracion, Historial)
- [ ] BaseDatos con al menos 5 productos
- [ ] Vendedores con datos
- [ ] Configuracion completa
- [ ] Spreadsheet ID copiado

### PASO 2: Desplegar Google Apps Script

**Tiempo estimado: 10 minutos**

1. En tu Google Sheets, ve a: **Extensiones > Apps Script**
2. Copia TODO el contenido del archivo `Code.gs` (líneas 1-475)
3. Pégalo en el editor `Code.gs` del Apps Script
4. **Reemplaza** `TU_SPREADSHEET_ID_AQUI` con tu ID real
5. Guarda: **Ctrl+S**
6. Sigue: [APPS_SCRIPT_SETUP.md](personalizados-eb-web/docs/APPS_SCRIPT_SETUP.md) para desplegar

✅ **Checklist:**
- [ ] Código pegado correctamente
- [ ] Spreadsheet ID reemplazado
- [ ] Web App desplegado como "Cualquiera"
- [ ] URL Web App copiada
- [ ] Probado endpoint /configuracion en navegador

### PASO 3: Configurar el Frontend

**Tiempo estimado: 2 minutos**

1. Abre: `personalizados-eb-web/js/config.js`
2. Encuentra la línea:
   ```javascript
   const API_BASE_URL = 'https://script.google.com/macros/d/YOUR_SCRIPT_ID_HERE/usercontent/v1';
   ```
3. Extrae el **Script ID** de tu URL de Apps Script:
   - URL: `https://script.google.com/macros/d/{AQUI_ESTA}/usercontent/v1`
4. Reemplaza `YOUR_SCRIPT_ID_HERE` con tu Script ID
5. **Guarda el archivo**

✅ **Checklist:**
- [ ] API_BASE_URL actualizado
- [ ] Script ID es correcto
- [ ] Archivo guardado

### PASO 4: Desplegar en Netlify

**Tiempo estimado: 5 minutos**

**Opción A: Mediante GitHub (recomendado)**

1. Sube las carpeta `personalizados-eb-web/` a GitHub
2. Ve a https://netlify.com
3. Click en **"New site from Git"**
4. Autoriza GitHub
5. Selecciona tu repositorio
6. **Base directory:** `personalizados-eb-web`
7. Click en **"Deploy"**
8. En 1 minuto tendrás una URL pública (ej: `https://quirky-dog-123.netlify.app/`)

**Opción B: Drag & Drop**

1. Ve a https://netlify.com
2. Arrastra la carpeta completa `personalizados-eb-web/`
3. Se desplegará automáticamente
4. Copia la URL que te da

**Opción C: Local Testing**

1. Abre terminal en `personalizados-eb-web/`
2. Ejecuta:
   ```bash
   python -m http.server 8000
   # o si tienes Node:
   npx http-server
   ```
3. Abre http://localhost:8000 en navegador

✅ **Checklist:**
- [ ] Archivos desplegados
- [ ] Puedes acceder a la URL
- [ ] Ves la página de login

### PASO 5: Prueba Final

**Tiempo estimado: 5 minutos**

1. Abre tu URL desplegada
2. Debería cargar la página de login
3. Haz clic en el dropdown de vendedores
   - ✅ Si ves vendedores: API está funcionando correctamente
   - ❌ Si ves error: Revisa que `API_BASE_URL` sea correcto
4. **Selecciona un vendedor** e Inicia Sesión
5. En el dashboard:
   - Completa Cliente: "Test Company"
   - Agrega un Producto
   - Verifica que se calculan precios
   - Genera un PDF
   - ✅ Si descarga un PDF: ¡TODO FUNCIONA!

---

## 🔗 URLs Importantes

Después de completar la instalación, tendrás estas URLs:

| Componente | URL | Nota |
|------------|-----|------|
| Frontend (Netlify) | `https://tu-nombre.netlify.app/` | Compartir con vendedores |
| Google Apps Script | `https://script.google.com/macros/d/{ID}/usercontent/v1` | Para testing |
| Google Sheets | `https://docs.google.com/spreadsheets/d/{ID}/edit` | Administración |

---

## 🆘 Problemas Comunes

### Error: "Error de conexión con el servidor"

**Causa:** `API_BASE_URL` es incorrecta

**Solución:**
1. Abre `js/config.js`
2. Verifica que no incluya `YOUR_SCRIPT_ID_HERE` sin reemplazar
3. Verifica que el Script ID sea correcto
4. Redeploy en Netlify (Ctrl+Shift+R para limpiar caché)

### Error: "Vendedores no cargan"

**Causa:** Google Apps Script no está respondiendo

**Solución:**
1. Abre la URL directamente con `?path=vendedores`
2. Si no ves JSON: El Apps Script no fue desplegado correctamente
3. Redeploy el Apps Script con "Cualquiera" en acceso

### El PDF no descarga

**Causa:** Navegador bloqueando descargas o falta librería jsPDF

**Solución:**
1. Intenta en Chrome
2. En dashboard.html, verifica que CDNs de jsPDF/autoTable estén presentes (líneas ~280)
3. Abre consola (F12) para ver errores

### La sesión se cierra inmediatamente

**Causa:** SessionStorage no está soportado

**Solución:**
1. Asegúrate de no estar en navegación privada/incógnito
2. Intenta en Chrome o Firefox
3. Limpia caché del navegador

---

## 📞 Próximos Pasos

### Después de instalar:

1. **Para Vendedores:** Comparte la URL y la guía [USER_MANUAL.md](personalizados-eb-web/docs/USER_MANUAL.md)
2. **Para Administrador:** Lee [ADMIN_MANUAL.md](personalizados-eb-web/docs/ADMIN_MANUAL.md)
3. **Personalización:** Edita colores en `css/styles.css` y datos en Google Sheets

---

## ✨ Características Que Obtienes

✅ **Login con dropdown** de vendedores
✅ **Form dinámico** con cascada de filtros
✅ **Cálculos en tiempo real** (precios, IVA, USD)
✅ **Generación de PDF** profesional
✅ **Historial automático** de cotizaciones
✅ **Caché local** para rendimiento
✅ **Responsivo** (desktop, tablet, mobile)
✅ **Sin dependencias complejas** (vanilla JS)
✅ **Colores corporativos** azul y naranja

---

## 🎓 Documentación Completa

| Documento | Para Quién | Contenido |
|-----------|-----------|----------|
| [README.md](personalizados-eb-web/README.md) | Todos | Overvi de proyecto, features, troubleshooting |
| [USER_MANUAL.md](personalizados-eb-web/docs/USER_MANUAL.md) | Vendedores | Cómo usar el sistema, crear cotizaciones |
| [ADMIN_MANUAL.md](personalizados-eb-web/docs/ADMIN_MANUAL.md) | Administrador | Gestionar catálogo, vendedores, precios |
| [GOOGLE_SHEETS_SETUP.md](personalizados-eb-web/docs/GOOGLE_SHEETS_SETUP.md) | Técnico | Crear y estructurar Google Sheets |
| [APPS_SCRIPT_SETUP.md](personalizados-eb-web/docs/APPS_SCRIPT_SETUP.md) | Técnico | Desplegar Google Apps Script |

---

**¿Necesitas ayuda?** Lee el documento correspondiente a tu rol (Vendedor, Admin, o Técnico).

**¿Algo no funciona?** Ve a [README.md](personalizados-eb-web/README.md) sección "Solución de Problemas".

---

## ✅ Checklist Final

Antes de compartir con vendedores:

- [ ] Google Sheets creado con 5 hojas
- [ ] Datos de ejemplo agregados
- [ ] Google Apps Script desplegado
- [ ] Frontend desplegado en Netlify
- [ ] API_BASE_URL configurado correctamente
- [ ] Login funciona (vendedores cargan)
- [ ] Dashboard funciona (calcula precios)
- [ ] PDF se descarga correctamente
- [ ] Historial se guarda automáticamente
- [ ] Documentación compartida con usuarios

---

**¡Felicidades! Tu sistema está listo. 🎉**

Comparte la URL de Netlify con tus prevendedores y que generen cotizaciones.

**Última actualización:** Marzo 2026 | **Versión:** 1.0.0
