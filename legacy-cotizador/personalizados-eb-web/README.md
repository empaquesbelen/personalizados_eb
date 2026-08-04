# Sistema de Cotización - Personalizados EB

Sistema web completo para generar cotizaciones de productos personalizados (empaques, artículos promocionales, etc.).

## 📋 Características

- ✅ Interfaz limpia y responsiva (desktop, tablet, mobile)
- ✅ Autenticación simple de vendedores
- ✅ Formulario dinámico con cascada de filtros
- ✅ Cálculos automáticos en tiempo real
- ✅ Generación de PDF profesional
- ✅ Historial de cotizaciones
- ✅ Caché local para rendimiento
- ✅ Sin dependencias externas (vanilla JavaScript)

## 🏗️ Estructura del Proyecto

```
personalizados-eb-web/
├── index.html              # Página de login
├── dashboard.html          # Panel principal de cotización
├── css/
│   └── styles.css          # Estilos corporativos (completo)
├── js/
│   ├── config.js           # Configuración y constantes
│   ├── api.js              # Llamadas a API (Google Apps Script)
│   ├── auth.js             # Autenticación y sesiones
│   ├── form.js             # Lógica del formulario principal
│   ├── calculator.js       # Cálculos de precios y validaciones
│   ├── pdf-generator.js    # Generación de PDF (jsPDF)
│   └── utils.js            # Utilidades generales
└── README.md               # Este archivo
```

## 🚀 Instalación y Despliegue

### Paso 1: Crear Google Sheets

1. Ve a [Google Sheets](https://sheets.google.com)
2. Crea un nuevo spreadsheet
3. **Copia el ID del spreadsheet** de la URL: `https://docs.google.com/spreadsheets/d/{AQUI_ESTA_EL_ID}/edit`
4. Sigue la guía de [GOOGLE_SHEETS_SETUP.md](./docs/GOOGLE_SHEETS_SETUP.md) para completar la estructura

### Paso 2: Crear Google Apps Script

1. En tu Google Sheets, ve a **Extensiones > Apps Script**
2. Reemplaza el código con el contenido de `Code.gs`
3. En el archivo `Code.gs`, reemplaza `TU_SPREADSHEET_ID_AQUI` con tu ID real
4. Guarda el proyecto con **Ctrl+S**
5. Sigue la guía de [APPS_SCRIPT_SETUP.md](./docs/APPS_SCRIPT_SETUP.md) para desplegar como Web App

### Paso 3: Configurar el Frontend

1. En `js/config.js`, en la línea de `API_BASE_URL`, reemplaza `YOUR_SCRIPT_ID_HERE` con tu Script ID
   - Puedes obtenerlo de la URL del Web App: `https://script.google.com/macros/d/{SCRIPT_ID}/usercontent/v1`

```javascript
// ANTES (en config.js línea 6):
const API_BASE_URL = 'https://script.google.com/macros/d/YOUR_SCRIPT_ID_HERE/usercontent/v1';

// DESPUÉS (reemplaza YOUR_SCRIPT_ID_HERE):
const API_BASE_URL = 'https://script.google.com/macros/d/AKfycbw...abc123.../usercontent/v1';
```

### Paso 4: Desplegar Frontend en Netlify

Opción A: Usando GitHub
```bash
# 1. Sube la carpeta personalizados-eb-web a un repositorio GitHub
# 2. Ve a https://netlify.com
# 3. Haz click en "New site from Git"
# 4. Autoriza GitHub y selecciona tu repositorio
# 5. Asegúrate de que el directorio base es "personalizados-eb-web"
# 6. Haz click en "Deploy site"
```

Opción B: Usando Drag & Drop
```bash
# 1. Ve a https://netlify.com
# 2. Arrastra la carpeta "personalizados-eb-web" a Netlify
# 3. Se desplegará automáticamente a una URL pública
```

Opción C: Localhost para testing
```bash
# Si tienes Python instalado:
cd personalizados-eb-web
python -m http.server 8000

# Luego abre http://localhost:8000 en tu navegador
```

## 📱 Uso del Sistema

### Flujo Básico

1. **Accede al sistema** usando la URL desplegada
2. **Selecciona tu nombre** del dropdown de vendedores
3. **Completa los datos del cliente**
   - Nombre/Empresa (requerido)
   - Contacto/Atención (opcional)
4. **Agrega productos:**
   - Busca por nombre, tamaño, impresión o material
   - (Opcional) filtra por Producto y Tamaño
   - Marca las combinaciones con checkbox
   - Click en "Agregar Seleccionados"
   - El sistema calcula automáticamente el precio
5. **Revisa el resumen:**
   - Subtotal, IVA y TOTAL se actualizan en tiempo real
   - Puedes ajustar el tipo de cambio (por defecto 512)
6. **Genera el PDF**
   - Click en "Generar Cotización PDF"
   - Confirma y se descargará el archivo
   - El sistema guarda automáticamente en el historial

### Validaciones Automáticas

- ✅ **Cantidad mínima:** No permite cantidades menores al mínimo del producto
- ✅ **Cascada de filtros:** Los tamaños se filtran según el producto, las impresiones según el tamaño, etc.
- ✅ **Campos requeridos:** Valida que todos los datos obligatorios estén completos
- ✅ **Tipo de cambio:** Valida que sea un número válido entre 100-1000

## 🎨 Personalización

### Cambiar Colores Corporativos

En `css/styles.css`, busca `:root` al principio del archivo:

```css
:root {
  --primary-blue: #0066CC;      /* Azul principal */
  --accent-orange: #FF6600;      /* Naranja acento */
  --bg-light: #F5F5F5;           /* Color de fondo */
  --text-dark: #333333;          /* Color de texto */
  /* ... más colores ... */
}
```

### Cambiar Logo

En `js/pdf-generator.js`, línea ~85, hay un placeholder gris para el logo. Puedes:
- Reemplazarlo con un URL de imagen
- O mantener el placeholder según tus preferencias

```javascript
// Línea ~85: Placeholder para logo (rectángulo gris)
doc.setFillColor(200, 200, 200);
doc.rect(margin, yPosition, 30, 20, 'F');
```

### Cambiar Información de Empresa

En hoja "Configuracion" del Google Sheets, edita:
- **NombreEmpresa:** Nombre de tu empresa
- **Telefono:** Teléfono de contacto
- **Direccion:** Dirección física
- **CedulaJuridica:** Número de cédula/NIT

## 🔧 Solución de Problemas

### "Error de conexión con el servidor"

**Causa:** La URL de Google Apps Script no está correcta en `config.js`

**Solución:**
1. Abre tu Google Sheets
2. Ve a **Extensiones > Apps Script**
3. Copia la URL completa de tu Web App desplegado
4. Actualiza `API_BASE_URL` en `js/config.js`

### "Ruta no encontrada"

**Causa:** El Apps Script no está encontrando las rutas correctas

**Solución:**
1. Verifica que en `Code.gs` esté el `SPREADSHEET_ID` correcto
2. Verifica que los nombres de las hojas en el código coincidan exactamente con los nombres en Google Sheets
3. Redeploy el Apps Script (**Implementar > Implementar nuevo** en el editor)

### "Los productos no se cargan"

**Causa:** La hoja "BaseDatos" está vacía o mal estructurada

**Solución:**
1. Abre tu Google Sheets
2. Verifica que la hoja "BaseDatos" existe y contiene datos
3. Verifica que la estructura coincide con la especificación en [GOOGLE_SHEETS_SETUP.md](./docs/GOOGLE_SHEETS_SETUP.md)

### "El PDF no se genera"

**Causa:** Falta algún campo requerido del formulario

**Solución:**
1. Asegúrate de completar:
   - Nombre del cliente
   - Al menos un producto
   - Todos los dropdowns del producto
2. Verifica que las cantidades sean >= Cantidad Mínima

### "La sesión se cierra"

**Causa:** Se borró el sessionStorage del navegador

**Solución:**
1. No cierres la sesión manualmente (a menos que lo necesites)
2. Usa el botón "Cerrar Sesión" del dashboard para salir correctamente

## 📊 Datos de Ejemplo

El sistema viene preconfigurado con:
- **Productos:** Bolsas Papel, Fundas, Bandejas, Papel Encerado, etc.
- **Tamaños:** 1/2, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25
- **Impresiones:** Full Color, 1 Color, 2 Colores, 3 Color, etc.
- **Vendedores:** 10 vendedores predefinidos con WhatsApp
- **Condiciones:** Términos específicos por tipo de producto

Puedes agregar/editar estos en Google Sheets.

## 🔒 Seguridad

- **Autenticación simple:** Sistema interno, sin credenciales robustas requeridas
- **CORS habilitado:** API acepta llamadas desde cualquier origen
- **Validaciones en ambos lados:** Cliente y servidor validan los datos
- **Sin datos sensibles:** El sistema no almacena contraseñas ni datos financieros

**⚠️ Nota:** Este es un sistema para uso interno. No está diseñado para producción pública con altos requisitos de seguridad. Para ambiente de producción, considera:
- Agregar autenticación OAuth
- Usar HTTPS exclusively
- Implementar rate limiting
- Agregar herramientas de auditoría

## 📞 Soporte

Para problemas o preguntas:
1. Revisa [GOOGLE_SHEETS_SETUP.md](./docs/GOOGLE_SHEETS_SETUP.md)
2. Revisa [APPS_SCRIPT_SETUP.md](./docs/APPS_SCRIPT_SETUP.md)
3. Revisa [USER_MANUAL.md](./docs/USER_MANUAL.md)
4. Revisa [ADMIN_MANUAL.md](./docs/ADMIN_MANUAL.md)

## 📝 Licencia

Sistema desarrollado para Personalizados EB. Uso interno únicamente.

---

**Última actualización:** Marzo 2026
**Versión:** 1.0.0
