# ETED Dashboard – Comunicaciones de Proyectos

**Ing. Maloni Alcantara Jimenez · ETED · 2026**

Dashboard de seguimiento de comunicaciones para proyectos de alta tensión. Desplegado como sitio estático en **GitHub Pages** — sin backend, sin base de datos, sin costos de servidor.

---

## 🖥️ Demo en línea

> `https://<tu-usuario>.github.io/<nombre-del-repositorio>/`

---

## 📁 Estructura del repositorio

```
├── index.html       # Página principal (contiene toda la UI)
├── auth.js          # Módulo de autenticación (carga main.js tras login)
├── main.js          # Lógica principal del dashboard (protegido)
├── style.css        # Estilos globales + login + roles
├── data.json        # Datos de proyectos y comunicaciones
├── users.json       # Usuarios con contraseñas hasheadas SHA-256
└── README.md        # Este archivo
```

---

## 🔐 Sistema de autenticación

### Cómo funciona

El acceso al dashboard está protegido por un sistema de login client-side que implementa las siguientes medidas de seguridad:

- **SHA-256 vía Web Crypto API** — las contraseñas nunca se almacenan en texto plano; se hashean con la API nativa del navegador (sin dependencias externas).
- **Carga dinámica de `main.js`** — el archivo con la lógica del dashboard se inyecta en el DOM *únicamente* tras una autenticación exitosa. No aparece en el HTML inicial.
- **Sesión en `sessionStorage`** — la sesión se destruye automáticamente al cerrar el navegador o la pestaña. Expira también a las 8 horas de inactividad.
- **Clave maestra de administrador** — protege el Panel de Administración de usuarios con una clave separada, también hasheada en `users.json`.

> ⚠️ **Limitación conocida de GitHub Pages:** al ser un sitio estático público, el código fuente (incluyendo `auth.js` y `users.json`) es visible en el repositorio. Este sistema protege el *acceso a la interfaz*, no el contenido del repositorio. Para datos sensibles críticos, se recomienda un backend o repositorio privado.

### Credenciales por defecto

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| `admin` | `Admin1234!` | 👑 Admin |
| `maloni` | `Admin1234!` | ✏️ Editor |
| `viewer` | `Viewer2026!` | 👁 Viewer |

**Clave maestra de administrador:** `ETED@AdminKey2026!`

> 🔴 **Cambie todas las contraseñas antes de desplegar en producción.**

---

## 👥 Roles y permisos

| Funcionalidad | 👑 Admin | ✏️ Editor | 👁 Viewer |
|--------------|:--------:|:---------:|:---------:|
| Ver comunicaciones | ✅ | ✅ | ✅ |
| Ver timeline / Gantt | ✅ | ✅ | ✅ |
| Ver proyectos | ✅ | ✅ | ✅ |
| Crear comunicaciones | ✅ | ✅ | ❌ |
| Editar comunicaciones | ✅ | ✅ | ❌ |
| Eliminar comunicaciones | ✅ | ✅ | ❌ |
| Importar / Exportar JSON | ✅ | ✅ | ❌ |
| Crear / editar proyectos | ✅ | ✅ | ❌ |
| Resetear datos | ✅ | ✅ | ❌ |
| Panel de administración | ✅ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ |

---

## 🛠️ Panel de administración

Accesible desde el avatar de usuario en la barra superior (solo rol **Admin**).

Requiere la **clave maestra** para operar. Desde él puede:

- Ver todos los usuarios registrados con su rol y estado.
- **Crear** nuevos usuarios (usuario, nombre, contraseña, rol).
- **Editar** datos y rol de usuarios existentes.
- **Cambiar contraseña** de cualquier usuario.
- **Activar / desactivar** usuarios sin eliminarlos.
- **Eliminar** usuarios permanentemente.
- **Exportar `users.json`** actualizado para subir al repositorio.

> 📌 Los cambios realizados en el Panel Admin se guardan en el `localStorage` del navegador del administrador. Para que sean permanentes en todos los dispositivos, exporte el `users.json` y súbalo al repositorio.

---

## 🚀 Despliegue en GitHub Pages

### Paso 1 — Clonar o subir el repositorio

```bash
git clone https://github.com/<tu-usuario>/<repo>.git
cd <repo>
```

Coloque todos los archivos en la raíz del repositorio (o en la carpeta `/docs`).

### Paso 2 — Cambiar contraseñas antes de publicar

1. Abra `index.html` localmente en su navegador.
2. Inicie sesión como `admin` con la contraseña por defecto.
3. Haga clic en su avatar → **Panel de administración**.
4. Ingrese la clave maestra: `ETED@AdminKey2026!`
5. Edite cada usuario y establezca contraseñas seguras.
6. Exporte el nuevo `users.json` y reemplácelo en el repositorio.
7. Cambie también la clave maestra (ver sección siguiente).

### Paso 3 — Cambiar la clave maestra de administrador

La clave maestra está almacenada como hash SHA-256 en `users.json` (`adminKeyHash`). Para cambiarla:

**Opción A — Desde la consola del navegador:**
```javascript
// Abra DevTools → Consola y ejecute:
const key = "TuNuevaClaveMaestra!";
crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  .then(buf => console.log(
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
  ));
// Copie el hash resultante y reemplácelo en users.json → "adminKeyHash"
```

**Opción B — Herramienta online:** use [emn178.github.io/online-tools/sha256.html](https://emn178.github.io/online-tools/sha256.html) (sin enviar la clave a ningún servidor).

### Paso 4 — Activar GitHub Pages

1. En GitHub, vaya a **Settings → Pages**.
2. En *Source*, seleccione la rama `main` y carpeta `/root` (o `/docs`).
3. Haga clic en **Save**.
4. En unos minutos el sitio estará en `https://<usuario>.github.io/<repo>/`.

### Paso 5 — Subir los cambios

```bash
git add .
git commit -m "chore: deploy dashboard con auth configurada"
git push origin main
```

---

## 📊 Funcionalidades del dashboard

### Vista Lista
Tabla completa de comunicaciones con:
- Filtros por texto libre, actor, canal, tipo e información de estatus.
- Ordenamiento por cualquier columna.
- Edición inline directamente en la fila.
- Exportación a `.txt` y `.json`.
- Cálculo automático de días laborables (excluye sábados y domingos).
- Alertas visuales para comunicaciones con días excedidos.

### Vista Timeline / Gantt
- Banda SVG temporal con escala mensual o semanal.
- Línea vertical marcando el día de hoy.
- Tabla de datos complementaria con columnas configurables.
- Opción de ocultar columnas vacías automáticamente.

### Vista Proyectos
- Tarjetas por proyecto con nombre, descripción y fecha de inicio.
- Creación y edición de proyectos con configuración de umbral de días.
- Soporte para múltiples proyectos en paralelo.

---

## 📂 Formato de `data.json`

```json
{
  "version": "1.0",
  "config": {
    "umbralDias": 10
  },
  "proyectos": [
    {
      "id": "proj-001",
      "nombre": "Nombre del proyecto",
      "descripcion": "Descripción",
      "fechaInicio": "2025-01-01",
      "estado": "activo",
      "contratista": {
        "nombre": "KEPCO"
      },
      "comunicaciones": [
        {
          "id": "com-001",
          "correlativo": "C-001",
          "fecha": "2025-01-09",
          "interaccion": "KEPCO",
          "canal": "digital",
          "tipoInformacion": "Técnica",
          "descripcion": "Descripción del mensaje",
          "documento": "archivo.pdf",
          "fechaFinal": null,
          "estatus": "No iniciado",
          "nota": ""
        }
      ]
    }
  ]
}
```

### Valores válidos

| Campo | Opciones |
|-------|----------|
| `canal` | `digital` · `fisico` |
| `tipoInformacion` | `Técnica` · `Requerimiento` · `Respuesta` · `Seguimiento` · `Instrucción` · `Entrega física` · `Aclaración` · `Solicitud` |
| `estatus` | `No iniciado` · `En curso` · `Retrasado` · `Por sellar` · `Completado` · `Sellado` · `Por despachar` · `Despachado` |

---

## 🧮 Lógica de días laborables

El dashboard calcula automáticamente los días laborables (lunes a viernes) según estas reglas:

1. Si hay `fecha` **y** `fechaFinal` → días entre ambas fechas.
2. Si solo hay `fecha` y el estatus es activo (`No iniciado`, `En curso`, `Retrasado`) → días desde `fecha` hasta hoy.
3. Cualquier otro caso → sin cálculo (`—`).

**Colores de alerta** (configurables por proyecto):
- 🟢 Verde: dentro del umbral.
- 🟡 Naranja: ≥ 80% del umbral.
- 🔴 Rojo: excede el umbral.

---

## 🔄 Flujo de datos (sin backend)

```
Carga inicial
    │
    ▼
auth.js verifica sessionStorage
    │
    ├─── Sesión válida ──► carga main.js dinámicamente
    │
    └─── Sin sesión ────► muestra pantalla de login
                              │
                              ▼
                        verifica usuario contra users.json
                        (hash SHA-256 via Web Crypto)
                              │
                              ▼
                        sesión en sessionStorage (8h TTL)
                              │
                              ▼
                        carga main.js + aplica rol en <body>

main.js
    │
    ├─ loadData() → localStorage → data.json (fallback)
    ├─ render()   → topbar, stats, vista activa
    └─ saveToLocalStorage() → persiste cambios en el navegador
```

---

## 🧰 Tecnologías utilizadas

| Tecnología | Uso |
|------------|-----|
| HTML5 / CSS3 | Estructura y estilos |
| JavaScript ES2022 (vanilla) | Lógica completa sin frameworks |
| Web Crypto API (`crypto.subtle`) | Hashing SHA-256 de contraseñas |
| `sessionStorage` | Sesión de usuario |
| `localStorage` | Persistencia de datos y usuarios |
| SVG nativo | Timeline / Gantt |
| Google Fonts (DM Sans, DM Mono) | Tipografía |
| GitHub Pages | Hosting estático gratuito |

---

## 🤝 Contribuciones y soporte

Proyecto interno de **ETED – Empresa de Transmisión Eléctrica Dominicana**.  
Desarrollado por **Ing. Maloni Alcantara Jimenez**.

Para reportar errores o solicitar mejoras, abra un *Issue* en el repositorio o contacte directamente al desarrollador.

---

*ETED Dashboard © 2026 — Todos los derechos reservados.*
