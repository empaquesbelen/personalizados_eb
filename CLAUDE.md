# CLAUDE.md — Sistema de Control Interno · Empaques Belén

> Contexto maestro del proyecto. **Leé este archivo primero cada sesión.** No hace falta leer todo el código: este documento + [docs/MAPA_SISTEMA.md](docs/MAPA_SISTEMA.md) + [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) alcanzan para orientarse.

---

## 1. Qué es este proyecto

Sistema **interno de control** para Empaques Belén (Costa Rica). El antiguo cotizador deja de ser "el sistema" y pasa a ser **un módulo** dentro de un sistema mayor con **usuarios, roles y un flujo de aprobación de cotizaciones tipo máquina de estados** (prevendedor → backoffice → admin → diseñador → backoffice).

**Estado actual:** rediseño en curso. Migrando de `Google Sheets + Apps Script + Netlify` hacia **Firebase (Firestore) + React + Netlify**.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Base de datos | **Firebase Firestore** (proyecto `cotizador-personalizados`) |
| Autenticación | **Firebase Auth** — correo + contraseña; roles en Firestore |
| Seguridad | **Firestore Security Rules** (fuente de verdad de permisos) |
| Frontend | **React + Vite** (SPA modular, vistas por rol) |
| Tiempo real | Firestore `onSnapshot` |
| Hosting | **Netlify** (cuenta `empaquesbelen.dev@gmail.com`) |
| Plan Firebase | **Spark (gratis)** por ahora — sin Cloud Functions. Correos: fuera del sistema (Outlook manual). |

**Firebase config** (la `apiKey` web es pública por diseño; la seguridad vive en las Rules): proyecto `cotizador-personalizados`, ver `app/src/lib/firebase.js` cuando exista.

---

## 3. Estructura del repositorio

```
personalizados_EB/
├── CLAUDE.md                  ← este archivo (contexto + reglas)
├── docs/
│   ├── MAPA_SISTEMA.md        ← mapa en grafo (módulos, colecciones, roles, estados)
│   ├── ARQUITECTURA.md        ← modelo de datos, máquina de estados, matriz de permisos
│   ├── CONTEXTO_SISTEMA.md    ← (legacy) referencia del cotizador viejo (Sheets)
│   └── PLAN_MIGRACION.md      ← (legacy) migración de cuentas del sistema viejo
├── .claude/agents/            ← agentes dedicados (frontend, backend, security, qa, data)
├── legacy-cotizador/          ← sistema viejo (Code.gs + web). NO se toca; es referencia e import.
└── app/                       ← EL NUEVO SISTEMA (React + Vite + Firebase) — se crea en Fase 1
```

> Nota: los archivos del sistema viejo (`Code.gs`, `personalizados-eb-web/`, `.txt`) siguen hoy en la raíz y en producción. Se moverán a `legacy-cotizador/` sin romperlos. El Google Sheets de la empresa es la **fuente de importación** de datos hacia Firestore.

---

## 4. ⛔ REGLAS ABSOLUTAS (no romper nunca)

1. **El cotizador es un MÓDULO, no la raíz.** El sistema principal es el control de cotizaciones por estados/roles.
2. **Ninguna transición de estado "en silencio".** Todo cambio de estado se registra en la subcolección `historial_estados` con `usuarioId`, `rol`, `timestamp`, `estadoAnterior`, `estadoNuevo` y `nota`.
3. **Los permisos se hacen cumplir en las Security Rules**, no solo en el frontend. El frontend oculta botones; la **Rule** es la que autoriza. Nunca confiar solo en el cliente.
4. **La máquina de estados manda.** No inventar transiciones fuera del diagrama de [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). Si el flujo cambia, se actualiza ese doc **en el mismo cambio**.
5. **Nunca exponer secretos reales en el cliente.** La `apiKey` web de Firebase es pública y está OK; las **claves de service account / Admin SDK NO** van al frontend ni al repo.
6. **El sistema NO envía correos.** Los correos externos (Outlook) son manuales y están fuera del flujo. No agregar envío de email sin aprobación explícita.
7. **Trazabilidad ante todo.** No borrar cotizaciones físicamente; usar estados/`soft-delete`. Todo lo relevante deja rastro (quién, cuándo, por qué).
8. **Mantener el mapa vivo.** Al agregar una colección, módulo, rol o estado, actualizar [docs/MAPA_SISTEMA.md](docs/MAPA_SISTEMA.md).
9. **No romper producción.** El sistema viejo **ya desplegado** (Netlify + Apps Script + Sheets) sigue vivo **por su cuenta** hasta el cutover — no depende de los archivos locales. Los archivos locales del legacy son **solo referencia/importación** y se pueden reorganizar libremente. No eliminar el Sheets/Apps Script/Netlify **desplegados** sin confirmación.
10. **Dinero = cuidado.** Los cálculos de precio/IVA/tipo de cambio deben ser consistentes y validados; cualquier cambio de fórmula se prueba (agente `qa-test`).

---

## 5. Convenciones

- **Idioma:** UI, comentarios y nombres de dominio en **español**. Constantes de estado en MAYÚSCULAS (`PENDIENTE_ADMIN`).
- **Roles:** `prevendedor`, `backoffice`, `admin`, `disenador`, `superadmin` (sin ñ en el identificador). El `superadmin` gestiona usuarios/roles.
- **Commits/tareas:** una fase = un objetivo claro. Ver roadmap abajo.

---

## 6. Roadmap por fases

- **Fase 0 — Harness** ✅ (este archivo + docs + agentes).
- **Fase 1 — Scaffold:** proyecto React+Vite, conexión Firebase, Auth básica, layout por rol.
- **Fase 2 — Modelo de datos y Security Rules:** colecciones `usuarios`/`cotizaciones`/`catalogo`/`config` + rules por rol.
- **Fase 3 — Máquina de estados:** flujo completo con `historial_estados` y bandejas por rol (tiempo real).
- **Fase 4 — Módulo cotizador:** portar el formulario/cálculo/PDF; resolver tipo de cambio BCCR.
- **Fase 5 — Migración de datos:** importar catálogo/vendedores/condiciones/historial del Sheets a Firestore.
- **Fase 6 — QA + despliegue en Netlify + cutover.**

---

## 7. Agentes dedicados (`.claude/agents/`)

| Agente | Para qué |
|--------|----------|
| `frontend` | React, Vite, componentes, vistas por rol, ruteo, estado UI |
| `backend-firestore` | Modelo de datos, consultas, SDK Firestore, integridad |
| `security-rules` | Firestore/Storage Rules, Auth, roles, permisos |
| `qa-test` | Tests (Vitest), validación de flujos y cálculos |
| `data-migration` | Importar datos del Google Sheets viejo a Firestore |
