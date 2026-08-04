# Manual del Administrador

Guía para administradores del sistema. Cómo mantener y actualizar el catálogo.

## 🔧 Tareas del Administrador

El administrador es responsable de:
1. Mantener actualizado el catálogo de productos
2. Agregar/editar vendedores
3. Actualizar términos y condiciones
4. Cambiar parámetros del sistema (tipo de cambio, datos empresa)
5. Revisar historial de cotizaciones
6. Resolver problemas técnicos

## 📊 Modificar el Catálogo (BaseDatos)

### Agregar un Nuevo Producto

1. Abre tu Google Sheets
2. Haz clic en la pestaña **"BaseDatos"**
3. Ve a la última fila con datos
4. Agrega una nueva fila con los datos del producto:

| Cod | Producto | Tamaño | Minimo | Impresion1 | Impresion2 | Material | PrecioSinIVA |
|-----|----------|--------|--------|------------|------------|----------|-------------|
| 25  | Producto Nuevo | Tamaño A | 2000 | Full Color | 1 Cara | Papel | 800000 |

**Notas importantes:**
- **Cod (Columna A):** Número único (usualmente el siguiente número secuencial)
- **Producto, Tamaño, Impresión1, Impresión2, Material:** Deben coincidir EXACTAMENTE con lo que esperan los vendedores
- **PrecioSinIVA:** El precio base sin IVA
- **Filas I-L se calcularán automáticamente** (UnitSinIVA, IVA, TotalConIVA, TotalUnitConIVA)

### Editar un Producto Existente

1. Busca el producto en la hoja "BaseDatos"
2. Modifica los datos que necesites:
   - Tamaño, Mínimo, Impresiones, Material, PrecioSinIVA
3. **NO cambies Cod** (es el identificador único)
4. La fila se **recalculará automáticamente**

### Eliminar un Producto

1. Selecciona la fila completa (haz clic en el número de fila)
2. Haz clic derecho > **Eliminar fila**
3. Confirma la eliminación

**Advertencia:** Si hay cotizaciones históricas que usan este producto, el historial aún contendrá la información.

### Cambiar un Precio

1. Busca el producto en "BaseDatos"
2. Edita la columna **H (PrecioSinIVA)**
3. Los valores en columnas I-L se actualizarán automáticamente
4. Los próximas cotizaciones usarán el nuevo precio

**Nota:** El cambio es retroactivo solo para futuras cotizaciones.

## 👥 Gestionar Vendedores

### Agregar un Nuevo Vendedor

1. Abre la pestaña **"Vendedores"**
2. Ve a la última fila
3. Agrega una nueva entrada:

| Nombre | WhatsApp | Email |
|--------|----------|-------|
| Nuevo Vendedor | 8765-4321 | nuevo@empresa.com |

**Notas:**
- **Nombre:** El que aparecerá en el dropdown de login
- **WhatsApp:** Número de teléfono (aparecerá en PDFs y navbar)
- **Email:** Opcional, pero recomendado

### Editar Datos de Vendedor

1. Busca el vendedor en "Vendedores"
2. Modifica su Nombre, WhatsApp o Email
3. Los cambios afectan inmediatamente al siguiente login

### Cambiar el WhatsApp de un Vendedor

1. Busca al vendedor en "Vendedores"
2. Edita la columna **B (WhatsApp)**
3. La próxima vez que ese vendedor genere un PDF, aparecerá su nuevo WhatsApp

## 📋 Actualizar Términos y Condiciones

### Editar Condiciones de un Producto

1. Abre la pestaña **"Condiciones"**
2. Busca el producto
3. Edita la columna **B (Condiciones)**
4. Puedes usar saltos de línea (\n) para formatear
5. Los cambios aparecerán cuando los vendedores seleccionen ese producto

### Agregar Condiciones para un Nuevo Producto

1. Abre "Condiciones"
2. Agrega una nueva fila:

| Articulo | Condiciones |
|----------|-------------|
| Nuevo Producto | - Condición 1\n- Condición 2\n... |

**Recomendación:** Copia el formato de otros productos para consistencia.

## ⚙️ Parámetros del Sistema

### Cambiar Parámetros

1. Abre la pestaña **"Configuracion"**
2. Edita la columna **B (Valor)** según necesites:

| Parametro | Valor (EDITA ESTO) |
|-----------|-------------------|
| TipoCambio | 512 (cambia si el cambio oficial cambia) |
| IVA | 0.13 (usualmente no cambies, 13%) |
| NombreEmpresa | Tu nombre de empresa |
| Telefono | Tu teléfono de contacto |
| Direccion | Tu dirección |
| CedulaJuridica | Tu cédula/NIT |

Estos valores aparecen en los PDFs de cotización.

### Cambiar Tipo de Cambio

1. Ve a "Configuracion"
2. Edita **TipoCambio** si el valor oficial cambia
3. Todos los vendedores usarán este valor por defecto
4. Los vendedores aún pueden editarlo en el formulario

**Recomendación:** Actualiza diariamente o según variaciones del mercado.

## 📈 Revisar el Historial

### Ver Historial de Cotizaciones

1. Abre la pestaña **"Historial"**
2. Verás todas las cotizaciones generadas:

| Fecha | Vendedor | Cliente | Productos | Total | TipoCambio |
|-------|----------|---------|-----------|--------|-----------|
| 2026-03-11 10:30:00 | Stephanie | Casa Manigua | [...JSON...] | 1412500 | 512 |

**Columnas:**
- **Fecha:** Cuándo se generó
- **Vendedor:** Quién la creó
- **Cliente:** Para quién es
- **Productos:** JSON con detalles (para analysis futuro)
- **Total:** Monto total en colones
- **TipoCambio:** Rate usado

### Exportar Datos

1. Selecciona las filas que quieres
2. Haz clic en **Archivo > Descargar > CSV**
3. Se descargará para análisis en Excel

### Buscar una Cotización Específica

1. Usa **Ctrl+F** en la hoja "Historial"
2. Busca por nombre del cliente o vendedor
3. Encontrarás la cotización rápidamente

**Nota:** Las cotizaciones se guardan automáticamente, no necesitas hacer nada.

## 🔗 Administrar la API (Apps Script)

### Redeploy de Changes

Si cambias el código en `Code.gs`:

1. Ve a tu Google Apps Script
2. Haz clic en **"Implementar"** > **"Nueva implementación"**
3. Selecciona **"Aplicación web"**
4. Ejecutar como tu cuenta, Acceso: Cualquiera
5. Haz clic en **"Desplegar"**
6. **Copia la nueva URL** si cambió
7. Si cambió, actualiza el frontend `js/config.js`

### Ver Logs

Para debuggear problemas:

1. En el editor Apps Script
2. Haz clic en **"Ejecuciones"** (Executions) en la esquina izquierda
3. Verás todos los requests recientes
4. Haz clic en uno para ver los detalles/logs

### Reinicializar Spreadsheet

Si necesitas recrear la estructura:
1. En el editor Apps Script
2. Al frente de "Selecciona una función", elige `initializeSpreadsheet`
3. Haz clic en el triángulo para ejecutar
4. Esto crea las hojas si no existen

## 🚨 Troubleshooting

### "Error: no autorizado"

**Causa:** El Apps Script no tiene permisos

**Solución:**
1. Redeploy el Web App
2. Asegúrate de seleccionar "Cualquiera" en "Quién tiene acceso"

### "Ruta no encontrada"

**Causa:** Error en el código Apps Script

**Solución:**
1. Revisa que el código esté pegado correctamente
2. Revisa los logs en "Ejecuciones"
3. Recopia el código del archivo Code.gs

### "La hoja no existe"

**Causa:** Falta una hoja o tiene otro nombre

**Solución:**
1. Verifica que existan exactamente estas hojas:
   - BaseDatos
   - Vendedores
   - Condiciones
   - Configuracion
   - Historial
2. Los nombres deben ser **exactamente iguales** (mayúsculas/minúsculas importa)

### Los vendedores no ven cambios

**Causa:** Caché del lado del cliente

**Solución:**
1. Los vendedores deben **cerrar sesión y volver a entrar**
2. O **limpiar caché** del navegador (Ctrl+Shift+Del)
3. El caché expira en 1 hora automáticamente

### El PDF no descarga

**Causa:** Bloqueador de pop-ups o problema con jsPDF

**Solución:**
1. Asegúrate de que el navegador no está bloqueando descargas
2. Intenta en Chrome si estás en otro navegador
3. Revisa que las librerías jsPDF estén cargadas (ver dashboard.html líneas ~280)

## 📈 Mejores Prácticas

### Mantenimiento Diario

- ✅ Actualiza tipo de cambio si es necesario
- ✅ Revisa el historial de cotizaciones
- ✅ Verifica que no haya errores en logs

### Mantenimiento Semanal

- ✅ Actualiza precios si hubo cambios
- ✅ Agrega nuevos productos si aplica
- ✅ Revisa estadísticas de cotizaciones

### Mantenimiento Mensual

- ✅ Revisa productos poco usados
- ✅ Optimiza términos y condiciones
- ✅ Considera agregar vendedores si es necesario
- ✅ Backup de datos (descarga Google Sheets como Excel)

### Backup de Datos

Mensualmente:
1. Abre tu Google Sheets
2. **Archivo > Descargar > Excel (.xlsx)**
3. Guarda en tu computadora como backup

El archivo Excel contendrá todas las hojas y datos.

## 🔐 Seguridad

- **No compartas el Spreadsheet ID** - Solo para administrador
- **No cambies números de Cod** - Pueden romper cotizaciones históricas
- **Valida precios cuidadosamente** - Un error puede costar dinero
- **Respaldo regularmente** - Por si acaso

## 📞 Soporte Técnico

Si algo no funciona:

1. **Revisa los logs:** Apps Script > Ejecuciones
2. **Verifica estructura:** Todas las hojas deben existir con nombres exactos
3. **RecCopia el código:** Quizás se pegó incorrectamente
4. **Contacta soporte:** Si nada funciona

---

**¡Ahora estás listo para administrar el sistema!**
