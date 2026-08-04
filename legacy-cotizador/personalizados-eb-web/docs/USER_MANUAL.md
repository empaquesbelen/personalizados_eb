# Manual del Usuario: Prevendedores

Guía completa para usar el Sistema de Cotización de Personalizados EB.

## 🚀 Empezando

### Acceso al Sistema

1. Abre en tu navegador la URL que te proporcionó el administrador
2. Verás la pantalla de login
3. **Selecciona tu nombre** del dropdown
4. Haz clic en **"Iniciar Sesión"**

Si no ves tu nombre en la lista, contacta al administrador.

## 📝 Crear una Cotización

### Paso 1: Información del Cliente

En la sección **"Cliente"**:

- **Nombre / Empresa** (REQUERIDO): Escribe el nombre de la empresa o cliente
  - Ej: `Casa Manigua S.A.`
  - Ej: `Juan Pérez`

- **Contacto / Atención** (OPCIONAL): Nombre de la persona a contactar
  - Ej: `Ing. Luis García`
  - Ej: `Dpto. de Compras`

### Paso 2: Agregar Productos

1. Usa la barra **"Buscar Combinaciones"**
   - Escribe nombre, tamaño, impresión o material
   - Opcional: filtra por producto y/o tamaño

2. Marca con checkbox las combinaciones que quieres agregar
   - Se irán acumulando en el **Mini Carrito**

3. Haz clic en **"Agregar Seleccionados"**
   - Se crearán automáticamente las filas en la tabla

4. En cada fila, valida los datos cargados y ajusta cantidad si lo necesitas:

   **a) Producto** - Selecciona el tipo de artículo
   - Bolsas Papel
   - Fundas
   - Bandejas
   - Papel Encerado
   - Etc.

   **b) Tamaño** - Se filtrará según el producto elegido
   - Ej: 1/2, 1, 2, 3, etc. (para Bolsas Papel)
   - Ej: 6x10, 8x12, etc. (para Fundas)

   **c) Cantidad** - Cuántas unidades desea
   - Mínimo: El sistema te indicará el mínimo obligatorio
   - Máximo: 10,000,000 unidades
   - **El sistema NO te dejará poner menos del mínimo**

   **d) Impresión 1** - Tipo de impresión principal
   - Full Color 25% Área
   - Full Color
   - 1 Color
   - 2 Colores 25% Área
   - 3 Color

   **e) Impresión 2** - Detalles de impresión (se filtrará según Impresión 1)
   - 1 Cara
   - 2 Cara
   - 3 Color
   - Ninguno

   **f) Material** - Tipo de material (se filtrará automáticamente)
   - Papel
   - BOPP Perlado
   - Cartón
   - Papel Blanca
   - Papel Polikraft

3. **El precio se calcula automáticamente** al completar todos los campos

4. Repite para cada producto que desees incluir en la cotización

### Paso 3: Revisar el Resumen

En la sección **"Resumen de Cotización"**:

- Verás una tabla con todos los productos agregados
- Se muestran:
  - Cantidad mínima del producto
  - Cantidad que ingresaste
  - Precio sin IVA
  - IVA (13%)
  - Precio total con IVA
  - Precio unitario

**Los totales se actualizan automáticamente:**
- **Subtotal (sin IVA):** Suma de todos los precios sin IVA
- **IVA (13%):** El 13% del subtotal
- **TOTAL (con IVA):** Subtotal + IVA
- **Total en USD:** Conversion según tipo de cambio

### Paso 4: Ajustar el Tipo de Cambio (Opcional)

En la **barra superior**, verás un campo **"Tipo de Cambio"**:

- Valor por defecto: **512** (₡512 = $1)
- Puedes **cambiar este valor** según el tipo de cambio del día
- El **Total en USD se recalculará automáticamente**

### Paso 5: Revisar los Términos y Condiciones

En la sección **"Términos y Condiciones"**:

- Aparecerán automáticamente según el **primer producto** que agregaste
- Muestra los términos específicos para ese tipo de producto
- **Revísalos cuidadosamente** para informar al cliente

### Paso 6: Generar el PDF

Cuando todo esté listo:

1. Haz clic en el botón grande **"📄 Generar Cotización PDF"**
2. Se abrirá un cuadro pidiendo confirmación
3. Haz clic en **"Confirmar"**
4. **Se descargará un PDF** con el nombre:
   - Ej: `Cotizacion_Casa_Manigua_2026-03-11_20260311001.pdf`

El PDF incluye:
- ✅ Número de cotización único
- ✅ Fecha de realización
- ✅ Información de la empresa
- ✅ Tu nombre y WhatsApp
- ✅ Datos del cliente
- ✅ Tabla con todos los productos
- ✅ Totales en colones y dólares
- ✅ Tipo de cambio utilizado

## 📱 Historial de Cotizaciones

En la sección **"Últimas Cotizaciones"**:

- Ves las últimas 10 cotizaciones que generaste
- Muestra fecha, cliente, total y estado

## 🛠️ Validaciones y Errores

El sistema validará automáticamente:

### ✅ Validaciones Correctas

- ✓ Nombre del cliente completado
- ✓ Cantidad >= cantidad mínima
- ✓ Todos los campos de producto completados
- ✓ Al menos 1 producto agregado

### ❌ Errores Que Pueden Aparecer

**"Cantidad debe ser menor a {mínimo}"**
- Ingresaste una cantidad menor al mínimo del producto
- Aumenta la cantidad

**"Mínimo para este producto: X"**
- El producto requiere un mínimo de X unidades
- Aumenta la cantidad

**"No se encontró el producto"**
- La combinación de producto+tamaño+impresión+material no existe en la BD
- Revisa que todas las opciones sean correctas
- Contacta al admin si falta un producto

**"Nombre del cliente es requerido"**
- No escribiste el nombre del cliente
- Escríbelo en el campo "Nombre / Empresa"

**"Debes agregar al menos un producto"**
- No hay productos en la cotización
- Marca al menos una combinación en el buscador y usa "Agregar Seleccionados"

**"Error de conexión"**
- Problemas de internet o el servidor no está disponible
- Ve la conexión Wi-Fi
- Si persiste, contacta al administrador

## 💡 Consejos y Trucos

### Limpiar el Formulario

Si cometiste un error y quieres empezar de nuevo:
1. Haz clic en **"🗑️ Limpiar Formulario"**
2. Todos los datos se borran
3. Empiezas de nuevo

### Copiar una Cotización Anterior

Si necesitas hacer una cotización similar a una anterior:
1. Abre el historial y busca la cotización anterior
2. Anota los productos y cantidades
3. Usa esos datos en una nueva cotización

### Productos con Variaciones

Para el mismo cliente con varios productos diferentes:
1. Agrega todos en la misma cotización
2. El total será más grande pero más realista
3. El cliente verá todo junto

### Cambiar Cantidad Mínima

Si un cliente pide menos del mínimo:
1. **NO puedes reducir la cantidad mínima** en el sistema
2. Contacta al administrador para casos especiales
3. Potrebbero haber descuentos por volumen bajo

## 👤 Información de tu Perfil

En la **barra superior**, verás:

- **Vendedor:** Tu nombre
- **WhatsApp:** Tu número de WhatsApp
- **Fecha:** La fecha actual
- **Tipo de Cambio:** El valor que estés usando

Para **cambiar tu perfil** (nombre, WhatsApp, etc.), contacta al administrador.

## 🔐 Seguridad

- **Tu sesión es privada:** Solo tú ves tus datos
- **No requiere contraseña:** Es un sistema interno confiable
- **Tus cotizaciones se guardan:** En el historial cuando las generas
- **Para cerrar sesión:** Haz clic en **"Cerrar Sesión"** (esquina superior derecha)

## 📞 Soporte

Si tienes problemas:

1. **Revisa esta guía** - Es muy completa
2. **Contacta al administrador** - Él puede actualizar productos, precios, etc.
3. **Usa las validaciones** - El sistema te dirá qué está mal

## 📊 Ejemplo Completo

### Escenario: Cotizar para "Casa Manigua"

1. **Acceder** → Selecciona tu nombre → Iniciar sesión
2. **Cliente** → Nombre: "Casa Manigua"
3. **Agregar Producto 1:**
   - Producto: Bolsas Papel
   - Tamaño: 1/2
   - Cantidad: 5000 (mínimo es 4000, OK)
   - Impresión 1: Full Color 25% Área
   - Impresión 2: 1 Cara
   - Material: Papel
4. **Agregar Producto 2:**
   - Producto: Fundas
   - Tamaño: 6x10
   - Cantidad: 6000
   - Impresión 1: Full Color
   - Impresión 2: 1 Cara
   - Material: BOPP Perlado
5. **Revisar resumen** → Subtotal ₡1,250,000 + IVA ₡162,500 = ₡1,412,500 / $2,761.72
6. **Revisar término** → Leer condiciones de Bolsas Papel
7. **Generar PDF** → Confirmar → Se descarga el PDF
8. **Enviar al cliente** → Por email o WhatsApp

## ✅ Checklist Antes de Enviar

- [ ] Nombre del cliente correcto
- [ ] Cantidad >= Mínimo para cada producto
- [ ] Todos los campos de producto completos
- [ ] Revisar el resumen de totales
- [ ] Revisar los términos y condiciones
- [ ] Tipo de cambio correcto
- [ ] Generar y descargar PDF
- [ ] Revisar el PDF antes de enviar
- [ ] Enviar al cliente

---

**¡Listo! Ya sabes cómo usar el cotizador. ¡Buenas ventas!**
