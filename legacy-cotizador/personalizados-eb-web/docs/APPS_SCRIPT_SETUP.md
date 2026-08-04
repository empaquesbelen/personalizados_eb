# Guía de Configuración: Google Apps Script

Instrucciones para desplegar la API REST en Google Apps Script.

## 1. Abrir el Editor Apps Script

1. Ve a tu Google Sheets (el que creaste en el paso anterior)
2. Haz clic en **Extensiones > Apps Script**
3. Se abrirá una nueva pestaña con el editor

## 2. Copiar el Código

1. En el editor, verás un archivo `Code.gs` con código de ejemplo
2. **Selecciona todo** el código (Ctrl+A)
3. **Bórralo** (Delete)
4. Copia todo el contenido del archivo `Code.gs` que incluye este proyecto
5. **Pégalo** en el editor (Ctrl+V)
6. **Guarda** el proyecto (Ctrl+S)

## 3. Configurar el Spreadsheet ID

En el archivo `Code.gs`, encontrarás esta línea (línea 4):

```javascript
const SPREADSHEET_ID = 'TU_SPREADSHEET_ID_AQUI';
```

### Reemplazar el ID:

1. Abre tu Google Sheets en otra pestaña
2. **Copia el ID** de la URL:
   - URL: `https://docs.google.com/spreadsheets/d/{COPY_ESTO}/edit`
3. Vuelve al editor de Apps Script
4. Reemplaza `TU_SPREADSHEET_ID_AQUI` con tu ID real

**Ejemplo:**
```javascript
// ANTES:
const SPREADSHEET_ID = 'TU_SPREADSHEET_ID_AQUI';

// DESPUÉS:
const SPREADSHEET_ID = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t';
```

5. Guarda nuevamente (Ctrl+S)

## 4. Desplegar como Web App

### Paso 1: Crear una Implementación

1. En el editor, haz clic en **"Implementar"** (o "Deploy") en la esquina superior derecha
2. Haz clic en **"Nueva implementación"** (o "New Deployment")
3. En **"Selecciona un tipo"**, elige **"Aplicación web"** (Web App)

### Paso 2: Configurar Detalles

- **Ejecutar como:** [Tu email]
- **Quién tiene acceso:** "Cualquiera" (Anyone)
- Haz clic en **"Desplegar"** (Deploy)

### Paso 3: Autorizar Acceso

Se abrirá un cuadro diciendo "Se necesita autorización".
1. Haz clic en **"Autorizar acceso"**
2. Selecciona tu cuenta de Google
3. Haz clic en **"Permitir"** (Allow) cuando se pida permiso

### Paso 4: Copiar la URL

1. Después de desplegar, verás un cuadro con:
   - **Deployment ID**
   - **Web app URL** (lo que necesitas)
2. **Copia la URL completa** (debe ser algo como: `https://script.google.com/macros/d/AKfycbw...`)

## 5. Configurar el Frontend

Ahora necesitas decirle al frontend dónde encontrar la API.

1. Abre el archivo `js/config.js` en tu editor de código
2. Encuentra esta línea (línea 6):

```javascript
const API_BASE_URL = 'https://script.google.com/macros/d/YOUR_SCRIPT_ID_HERE/usercontent/v1';
```

3. Extrae el **Script ID** de tu URL:
   - Si tu URL es: `https://script.google.com/macros/d/AKfycbw...xyz/usercontent/v1`
   - El Script ID es: `AKfycbw...xyz`

4. Reemplaza el contenido:

```javascript
// ANTES:
const API_BASE_URL = 'https://script.google.com/macros/d/YOUR_SCRIPT_ID_HERE/usercontent/v1';

// DESPUÉS:
const API_BASE_URL = 'https://script.google.com/macros/d/AKfycbwblablabla/usercontent/v1';
```

5. **Guarda el archivo**

## 6. Probar la API

Para verificar que todo funciona:

1. En el navegador, abre tu URL Web App en una pestaña privada
2. Agrega `/` al final y luego `?path=configuracion`
3. La URL completa debe ser: `{TU_URL}?path=configuracion`
4. Si ves JSON con los datos de configuración, ¡está funcionando!

**Ejemplo de respuesta correcta:**
```json
{
  "success": true,
  "data": {
    "tipoCambio": 512,
    "iva": 0.13,
    "nombreEmpresa": "Personalizados EB",
    ...
  }
}
```

**Si ves un error:**
- Verifica que el Spreadsheet ID sea correcto
- Verifica que los nombres de las hojas sean exactamente: BaseDatos, Vendedores, etc.
- Verifica que hayas desplegado la versión más reciente

## 7. Redeploy en el Futuro

Cada vez que hagas cambios en el Apps Script:

1. Haz clic en **"Implementar"** > **"Nueva implementación"**
2. O usa una que ya exista y haz clic en el ícono de editar
3. Copia la nueva URL si cambió

**Nota:** Cada nuevo deploy genera una nueva URL. Asegúrate de actualizar el frontend si cambia.

## ✅ Checklist

- [ ] Código Apps Script pegado correctamente
- [ ] SPREADSHEET_ID configurado con tu ID real
- [ ] Web App desplegada como "Cualquiera puede acceder"
- [ ] URL Web App copiada
- [ ] API_BASE_URL en config.js actualizado
- [ ] URL probada en navegador (devuelve JSON con configuracion)

## 🔗 Siguiente Paso

Ahora ve a [README.md](../README.md) para desplegar el frontend en Netlify.

## 🆘 Problemas Comunes

### "Falta SPREADSHEET_ID"
- Asegúrate de haber reemplazado `TU_SPREADSHEET_ID_AQUI` con tu ID real

### "Sheets API not enabled"
- Google automaticamente lo habilita cuando desplegases Web App
- Si aún no funciona, ve a [Google Cloud Console](https://console.cloud.google.com) y habilita Sheets API manualmente

### "No tienes permiso"
- Asegúrate de que en el deploy seleccionaste "Cualquiera" en "Quién tiene acceso"
- Prueba redeploy con esa opción

### "Ruta no encontrada"
- Verifica que el nombre de la ruta en ?path= sea exacto
- Las rutas son: vendedores, productos, tamanos, opciones, condiciones, configuracion, historial
