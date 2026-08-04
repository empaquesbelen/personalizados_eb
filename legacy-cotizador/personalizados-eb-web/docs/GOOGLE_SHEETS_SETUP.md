# Guía de Configuración: Google Sheets

Instrucciones paso a paso para crear y configurar tu Google Sheets con los datos necesarios.

## 1. Crear el Google Sheets

1. Ve a [Google Sheets](https://sheets.google.com)
2. Haz clic en **"+ Crear"** o **"Archivo > Nuevo > Hoja de cálculo"**
3. Nombra tu archivo: `Cotizador_PersonalizadosEB`
4. **Copia y guarda el ID** de la URL:
   - URL: `https://docs.google.com/spreadsheets/d/{ESTE_ES_TU_ID}/edit`
   - Necesitarás este ID en el Apps Script

## 2. Crear las Hojas

El spreadsheet debe tener exactamente 5 hojas (pestañas) con estos nombres:
- **BaseDatos** (catálogo de productos)
- **Vendedores** (lista de vendedores)
- **Condiciones** (términos y condiciones)
- **Configuracion** (parámetros del sistema)
- **Historial** (registro de cotizaciones)

### Para crear una ho ja:
1. Haz clic en **"+"** en la parte inferior
2. Nombra la hoja exactamente como aparece arriba
3. Repite para cada hoja

## 3. Estrutura: Hoja "BaseDatos"

Esta es la hoja más importante. Contiene el catálogo de productos.

### Encabezados (Fila 1):
Copia exactamente estos nombres en la primera fila:

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|-|-|-|
| Cod | Producto | Tamaño | Minimo | Impresion1 | Impresion2 | Material | PrecioSinIVA | UnitSinIVA | IVA | TotalConIVA | TotalUnitConIVA |

### Fórmulas en las columnas (a partir de fila 2):

**Columna I (UnitSinIVA):**
```
=H2/D2
```

**Columna J (IVA):**
```
=H2*0.13
```

**Columna K (TotalConIVA):**
```
=H2+J2
```

**Columna L (TotalUnitConIVA):**
```
=K2/D2
```

Luego selecciona estas celdas y **arrastra hacia abajo** para copiar las fórmulas a todas las filas.

### Datos de Ejemplo:

Aquí hay algunos productos de ejemplo que puedes copiar:

```
Cod | Producto | Tamaño | Minimo | Impresion1 | Impresion2 | Material | PrecioSinIVA
1 | Bolsas Papel | 1/2 | 4000 | Full Color 25% Área | 1 Cara | Papel | 370871.43
2 | Bolsas Papel | 1 | 3000 | Full Color 25% Área | 1 Cara | Papel | 450000
3 | Bolsas Papel | 2 | 2500 | Full Color 25% Área | 1 Cara | Papel | 520000
4 | Fundas | 6x10 | 5000 | Full Color | 1 Cara | BOPP Perlado | 600000
5 | Fundas | 8x12 | 4000 | Full Color | 2 Cara | BOPP Perlado | 750000
6 | Bandejas | Papa Grande | 3000 | 1 Color | 1 Cara | Cartón | 400000
7 | Papel Encerado | 10x15 | 2000 | Sin impresión | N/A | Papel Blanca | 250000
```

**Nota importante:**
- Puedes agregar más filas con más productos
- Los valores de Impresion1, Impresion2 y Material deben coincidir con las opciones en Condiciones
- El sistema buscará coincidencias exactas, así que asegúrate de los valores

## 4. Estructura: Hoja "Vendedores"

Lista de prevendedores del sistema.

### Encabezados (Fila 1):

| A | B | C |
|---|---|---|
| Nombre | WhatsApp | Email |

### Datos de Ejemplo:

```
Nombre | WhatsApp | Email
Stephanie Gonzalez | 7004-9754 | stephanie@empresa.com
Alonso Jimenez | 7118-5913 |
Aaron Soto | 7118-3987 |
Nelson Mora | 7193-3326 |
Emanuel Bustos | 7176-1040 |
Juan Pablo Herrera |  |
Julián Salazar |  |
Diego Segura | 7111-3101 |
Jordan Chacón | 7300-7552 |
Carlos Mejia | 7004-9774 |
```

## 5. Estructura: Hoja "Condiciones"

Términos y condiciones específicos para cada tipo de producto.

### Encabezados (Fila 1):

| A | B |
|---|---|
| Articulo | Condiciones |

### Datos de Ejemplo:

| Articulo | Condiciones |
|----------|-------------|
| Bolsas Papel | Impresión Pequeña escala:\n- Área de impresión 25% de la cara a imprimir... (ver especificación completa abajo) |
| Fundas | - Impresión a una o dos caras según preferencia\n- Forma de pago... (ver abajo) |

**Condiciones para "Bolsas Papel":**
```
Impresión Pequeña escala:
- Área de impresión 25% de la cara a imprimir
- Impresión a una o dos caras según preferencia
- Forma de pago: Adelanto 50% y 50% contra entrega
- Tiempo de entrega: 15 días después de aprobado el arte
- No se imprimen laterales
- No se imprime en color blanco
- Una sola entrega
- El cliente debe aportar el diseño final a imprimir

Impresión Gran escala:
- Área de impresión 25% de la cara a imprimir
- Forma de pago: Adelanto 50% y 50% contra entrega
- Tiempo de entrega: 45 a 60 días
- Una sola entrega
```

**Condiciones para "Fundas":**
```
- Impresión a una o dos caras según preferencia
- Impresión a un color o full color según preferencia
- Forma de pago: Adelanto 50% y 50% contra entrega
- Tiempo de entrega: 22 días
- Una sola entrega
- En la producción puede salir un +/- 5%
- El cliente debe aportar el diseño final a imprimir
```

## 6. Estructura: Hoja "Configuracion"

Parámetros del sistema (tipo de cambio, datos de empresa, etc.).

### Encabezados (Fila 1):

| A | B |
|---|---|
| Parametro | Valor |

### Datos (Fila 2 en adelante):

| Parametro | Valor |
|-----------|-------|
| TipoCambio | 512 |
| IVA | 0.13 |
| NombreEmpresa | Personalizados EB |
| Telefono | (506) 2438-5119 / 2438-0930 |
| Direccion | San Rafael, Alajuela, Costa Rica |
| CedulaJuridica | 3-101-135332 |

**Notas:**
- TipoCambio es el valor por defecto (puedes cambiarlo en el formulario)
- IVA siempre es 0.13 (13%)
- Estos valores aparecen en el PDF de cotización

## 7. Estructura: Hoja "Historial"

Registro automático de cotizaciones generadas. **No necesitas agregarle datos manualmente, se llenan automáticamente.**

### Encabezados (Fila 1):

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Fecha | Vendedor | Cliente | Productos | Total | TipoCambio |

**Esta hoja se llena automáticamente cuando se generan cotizaciones.**

## ✅ Checklist de Configuración

Antes de pasar al Apps Script, verifica:

- [ ] 5 hojas creadas con los nombres exactos
- [ ] BaseDatos tiene encabezados correctos
- [ ] Fórmulas en BaseDatos instaladas (columnas I, J, K, L)
- [ ] Al menos 1 producto agregado en BaseDatos
- [ ] Vendedores con datos agregados
- [ ] Condiciones agregadas para al menos el primer producto
- [ ] Configuracion completada con todos los parámetros
- [ ] Historial vacío (se llenará automáticamente)

## 🔗 Siguiente Paso

Ahora ve a [APPS_SCRIPT_SETUP.md](APPS_SCRIPT_SETUP.md) para configurar Google Apps Script.
