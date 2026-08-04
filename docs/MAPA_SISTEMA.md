# Mapa del Sistema (grafo) — Control Interno EB

> Vista rápida de módulos, colecciones, roles y estados para orientarse **sin leer todo el código**. Mantener actualizado (Regla Absoluta #8).

---

## 1. Grafo general del sistema

```mermaid
flowchart TB
    subgraph Cliente["Frontend (React + Vite en Netlify)"]
        Auth["Login (Firebase Auth)"]
        Router["Router por rol"]
        MPrev["Módulo Prevendedor<br/>(crear/ver cotizaciones)"]
        MBack["Módulo Backoffice<br/>(bandeja, editar, descartar, aprobar)"]
        MAdmin["Módulo Admin<br/>(aprobar/devolver)"]
        MDis["Módulo Diseñador<br/>(bandeja, en diseño)"]
        MSuper["Módulo Superadmin<br/>(usuarios y roles)"]
        MCotiz["Módulo Cotizador<br/>(formulario + cálculo + PDF)"]
    end

    subgraph Firebase["Firebase (proyecto cotizador-personalizados)"]
        FAuth["Auth: correo+contraseña"]
        FS[("Firestore")]
        Rules["Security Rules<br/>(permisos por rol + estados)"]
    end

    Ext["Outlook (correos manuales,<br/>FUERA del sistema)"]

    Auth --> FAuth
    Router --> MPrev & MBack & MAdmin & MDis & MSuper
    MPrev --> MCotiz
    MBack --> MCotiz
    MPrev & MBack & MAdmin & MDis & MSuper <--> FS
    FS --- Rules
    MDis -.correo manual.-> Ext
```

---

## 2. Colecciones Firestore

```mermaid
erDiagram
    usuarios ||--o{ cotizaciones : "crea (prevendedorId)"
    cotizaciones ||--o{ historial_estados : "registra"
    catalogo }o--o{ cotizaciones : "productos"
    config ||--|| sistema : "singleton"
    condiciones }o--o{ cotizaciones : "términos"
    contadores ||--o{ cotizaciones : "reserva consecutivo (atómico)"

    usuarios { string uid string rol bool activo }
    cotizaciones { string consecutivo string estado uid prevendedorId }
    historial_estados { string estadoAnterior string estadoNuevo uid usuarioId }
    catalogo { string cod string producto number precioSinIVA }
    config { number tipoCambioManual number iva }
    condiciones { string articulo string texto }
    contadores { string prefijo int valor }
```

| Colección | Dueño de escritura | Lectura |
|-----------|--------------------|---------|
| `usuarios` | admin | admin (y cada quien su propio doc) |
| `cotizaciones` | según rol + estado (ver ARQUITECTURA) | según rol |
| `cotizaciones/{id}/historial_estados` | quien hace la transición (append-only) | roles con acceso a la cotización |
| `catalogo` | admin / backoffice | autenticados |
| `config/general` | admin | autenticados |
| `condiciones` | admin / backoffice | autenticados |
| `contadores/{prefijo}` | prevendedor / superadmin (solo incrementos +1; sin delete) | autenticados activos |

---

## 3. Estados (referencia rápida)

`GENERADA → EN_REVISION_BACKOFFICE → PENDIENTE_ADMIN → PENDIENTE_DISENO → EN_DISENO → REVISION_FINAL_BACKOFFICE → COMPLETADA`

Entrada: `GENERADA` (al generar el PDF). Descartar: `GENERADA → ANULADA` (soft-delete, backoffice).
Ciclos de retorno: `PENDIENTE_ADMIN → EN_REVISION_BACKOFFICE` (admin devuelve) · `REVISION_FINAL_BACKOFFICE → EN_DISENO` (backoffice rechaza).

Detalle y matriz de permisos: [ARQUITECTURA.md](ARQUITECTURA.md).

---

## 4. Índice de navegación (dónde está cada cosa)

| Necesito… | Ir a |
|-----------|------|
| Reglas absolutas y visión general | [../CLAUDE.md](../CLAUDE.md) |
| Modelo de datos y máquina de estados | [ARQUITECTURA.md](ARQUITECTURA.md) |
| Cómo funcionaba el cotizador viejo | [CONTEXTO_SISTEMA.md](CONTEXTO_SISTEMA.md) |
| Código del sistema nuevo | `app/` *(desde Fase 1)* |
| Reglas de seguridad | `app/firestore.rules` *(desde Fase 2)* |
| Datos a importar | Google Sheets de la empresa + `legacy-cotizador/` |
