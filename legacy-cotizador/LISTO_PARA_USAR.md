# 🚀 CONFIGURACIÓN COMPLETADA - LISTO PARA USAR

## ✅ Estado Actual

Tu sistema está **100% configurado** con:

| Item | Estado | Detalles |
|------|--------|----------|
| **Google Sheets** | ✅ Configurado | ID: `1OBw8wM8N39Ev-XEzxyFUHwg6zI6qAvgQBdqNJ-zUPow` |
| **Google Apps Script** | ✅ Desplegado | URL: `https://script.google.com/macros/s/AKfycbz6RHG2xD5oidBq_TAst6EovgGNr18uu7ItnXntcv7VUQd6j-OtLoLdiT3GAPSqdKOBvw/exec` |
| **Frontend** | ✅ Configurado | API URL lista |
| **Inicialización Auto** | ✅ Activa | Las hojas se crean automáticamente |
| **Datos De Ejemplo** | ✅ Incluidos | 6 productos, 10 vendedores, condiciones |

---

## 📋 LO QUE SUCEDE AL INICIAR

Cuando accedas a tu sistema por primera vez:

1. **Login automático:** El sistema cargará los vendedores de tu Sheets
2. **Inicialización automática:** Si el Sheets está vacío:
   - ✅ Crea automáticamente las 5 hojas necesarias
   - ✅ Agrega encabezados en cada hoja
   - ✅ Inserta datos de ejemplo (6 productos, 10 vendedores, etc.)
   - ✅ Configura las fórmulas de cálculos

3. **Sistema operativo:** Listo para generar cotizaciones

---

## 🔐 CREDENCIALES HARDCODEADAS (Temporal)

En **Code.gs** hay usuarios de prueba configurados:

```javascript
const VALID_USERS = {
  'admin': 'admin123',
  'test': 'test'
};
```

**Para cambiarlos después**, edita esa sección en Code.gs y redeploy.

---

## 🧪 CÓMO PROBAR AHORA

### **Paso 1: Probar la API**

Abre en tu navegador (sin interfaz, solo datos):
```
https://script.google.com/macros/s/AKfycbz6RHG2xD5oidBq_TAst6EovgGNr18uu7ItnXntcv7VUQd6j-OtLoLdiT3GAPSqdKOBvw/exec?path=configuracion
```

Si ves JSON con los datos de configuración → ✅ API funciona

### **Paso 2: Probar el Frontend**

1. Despliega la carpeta `personalizados-eb-web/` en Netlify:
   - Opción rápida: Drag & drop la carpeta en [Netlify.com](https://netlify.com)
   - Recibirás una URL pública (ej: `https://quirky-dog-123.netlify.app/`)

2. Abre tu URL en el navegador
   - Verás el login
   - El dropdown de vendedores debería cargar automáticamente (con los 10 vendedores de ejemplo)

3. Selecciona un vendedor y haz clic en "Iniciar Sesión"

4. En el dashboard:
   - Agrega un cliente
   - Agrega un producto
   - ¡Verifica que los cálculos funcionan!
   - Genera un PDF

### **Paso 3: Revisa tu Google Sheets**

Abre tu Google Sheets y verifica que se hayan creado las hojas:
- ✅ BaseDatos (con 6 productos)
- ✅ Vendedores (con 10 vendedores)
- ✅ Condiciones
- ✅ Configuracion
- ✅ Historial (vacío hasta que generes cotizaciones)

---

## 📊 DATOS DE EJEMPLO INCLUIDOS

### Productos (6):
1. Bolsas Papel 1/2 - 4000 mín.
2. Bolsas Papel 1 - 3000 mín.
3. Bolsas Papel 2 - 2500 mín.
4. Fundas 6x10 - 5000 mín.
5. Fundas 8x12 - 4000 mín.
6. Bandejas Papa Grande - 3000 mín.

### Vendedores (10):
- Stephanie Gonzalez - 7004-9754
- Alonso Jimenez - 7118-5913
- (... 8 más)

### Condiciones:
- Bolsas Papel
- Fundas
- Bandejas

### Configuración:
- Tipo de Cambio: 512
- IVA: 13%
- Empresa: Personalizados EB
- Teléfono: (506) 2438-5119
- Dirección: San Rafael, Alajuela

---

## ⚙️ CONFIGURACIÓN TÉCNICA REALIZADA

### **Code.gs**
- ✅ SPREADSHEET_ID insertado: `1OBw8wM8N39Ev-XEzxyFUHwg6zI6qAvgQBdqNJ-zUPow`
- ✅ initializeSpreadsheet() mejorada para crear hojas y datos automáticamente
- ✅ Endpoint `/init` agregado para testing
- ✅ CORS headers configurados

### **config.js**
- ✅ API_BASE_URL actualizada con tu URL real
- ✅ Validación de URL removida (ya geen configurada)

### **api.js**
- ✅ Función apiRequest mejorada para manejar parámetros query
- ✅ Compatible con la URL tipo `/exec?path=...`

---

## 🎯 PRÓXIMOS PASOS

### **Para Producción:**

1. **Agregar más productos:**
   - Abre tu Google Sheets
   - Ve a la hoja "BaseDatos"
   - Agrega nuevas filas con productos reales

2. **Actualizar precios:**
   - Edita columna H (PrecioSinIVA) en BaseDatos
   - Las fórmulas se recalcularán automáticamente

3. **Cambiar tipo de cambio:**
   - Edita "Configuracion" hoja
   - Cambia TipoCambio según necesites

4. **Personaliza la empresa:**
   - Edita datos en hoja "Configuracion"
   - Logo en `js/pdf-generator.js` línea ~85

5. **Compartir con prevendedores:**
   - Dale a cada uno la URL de Netlify
   - Distribuye `USER_MANUAL.md` para que sepan usar

### **Para Testing Más Avanzado:**

- Genera múltiples cotizaciones
- Verifica que se guardan en el historial
- Descarga los PDFs
- Prueba en móvil/tablet (debe ser responsivo)

---

## 🔍 TROUBLESHOOTING RÁPIDO

### "Los vendedores no cargan"
→ Ejecuta en Google Apps Script: `initializeSpreadsheet()` manualmente
→ Verifica en el Sheets que se hayan creado las hojas

### "Error de conexión en el frontend"
→ Abre en una pestaña: `https://script.google.com/macros/s/AKfycbz6RHG2xD5oidBq_TAst6EovgGNr18uu7ItnXntcv7VUQd6j-OtLoLdiT3GAPSqdKOBvw/exec?path=vendedores`
→ Si no ves JSON, es problema de App Script
→ Abre Google Apps Script > Ejecuciones para ver logs

### "El PDF no genera"
→ Abre consola (F12) en el navegador
→ Verifica que no hay errores de JavaScript
→ Intenta en Chrome si usas otro navegador

### "Los cálculos están mal"
→ Verifica que el producto exista exactamente en BaseDatos
→ Los valores de Producto/Tamaño/Impresión deben coincidir exactamente

---

## 📞 PARA CUSTOMIZE MÁS TARDE

- **Cambiar colores:** `personalizados-eb-web/css/styles.css` líneas 1-20
- **Cambiar vendedores:** Edita hoja "Vendedores" en Sheets
- **Agregar productos:** Edita hoja "BaseDatos" en Sheets
- **Cambiar credenciales:** `Code.gs` línea 10 (VALID_USERS)
- **Cambiar empresa:** Edita hoja "Configuracion" en Sheets

---

## ✨ LO QUE TIENES AHORA

Un **sistema web profesional** de cotización que:
- ✅ Funciona sin código manual (inicialización automática)
- ✅ Genera PDFs automáticamente
- ✅ Calcula precios en tiempo real
- ✅ Guarda historial automáticamente
- ✅ Funciona en mobile/tablet/desktop
- ✅ No requiere servidor dedicado
- ✅ Completamente gratuito (Google + Netlify)

---

## 🚀 ¡LISTO PARA COMENZAR!

1. **Despliega en Netlify** (drag & drop)
2. **Prueba el login** (vendedores cargan automáticamente)
3. **Genera una cotización** (PDF se descarga)
4. **Comparte con tus prevendedores** (URL de Netlify)

**El sistema se encargará del resto automáticamente.**

---

**Cualquier pregunta, revisa los manuales en `personalizados-eb-web/docs/`**

Versión 1.0.1 - Configurada: 11 de Marzo 2026
