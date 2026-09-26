Proyecto B — Registro de Convivencia y Remisión a Orientación

Aplicación web para la IED La Victoria que permite registrar situaciones de
convivencia escolar (tipo I, II o III), dar seguimiento con actuaciones y
compromisos, generar remisiones en PDF a Orientación Escolar, y ofrecer una
consulta familiar/estudiantil limitada. Implementa el modelo de datos común
acordado con el salón (`rol`, `usuario`, `curso`, `vigencia`,
`usuario_curso_vigencia`) más las entidades propias del Proyecto B.

Stack: **React + Vite + Bootstrap 5.3** con `axios`, `react-hook-form` y `yup`
(frontend, carpeta `client/`) y **Node.js 22.20.0 o superior + Express + mysql2 +
bcryptjs** sobre **MySQL 8.x / MariaDB** (backend, carpeta `server/`).

## 1. Base de datos

El backend (`server/`) usa `mysql2` y solo se soporta sobre **MySQL 8.x /
MariaDB** (por ejemplo, vía XAMPP).

1. `database/script.sql` — esquema y datos comunes acordados con el salón.
2. `database/02_proyecto_b_convivencia.sql` — tablas propias del Proyecto B
   (`acudiente_estudiante`, `caso_convivencia`, `actuacion`, `evidencia`,
   `remision`, `auditoria`), el rol `Administrador` (ausente del script
   común), el rol `Acudiente` y las cuentas base para poder iniciar sesión
   con cada rol (administrador y acudientes ficticios). **A propósito no
   siembra ningún caso de convivencia de ejemplo**: el repositorio se
   publica con la base limpia de casos, para que cada instalación empiece
   a registrar los suyos desde cero.
3. `database/03_usuario_aplicacion.sql` — usuario `app_convivencia` con el
   que se conecta la API (RNF-05): sobre `auditoria` solo puede consultar e
   insertar, por lo que la auditoría es inalterable desde la aplicación. Un
   caso de convivencia nunca se elimina desde la API (solo se cierra, ver
   sección 6); si alguna vez se depura uno directamente desde la base, el
   motor deja el vínculo de sus registros de auditoría en `NULL`
   (`on delete set null`) y los conserva.
4. `database/04_contrasenas_cifradas.sql` — reemplaza la contraseña de prueba
   en texto plano por su hash bcrypt (RNF-01); sin este paso la API rechaza el
   inicio de sesión.

Por terminal (Git Bash, con XAMPP instalado en `C:\xampp`):

```bash
"/c/xampp/mysql/bin/mysql.exe" -u root < database/script.sql
"/c/xampp/mysql/bin/mysql.exe" -u root < database/02_proyecto_b_convivencia.sql
"/c/xampp/mysql/bin/mysql.exe" -u root < database/03_usuario_aplicacion.sql
"/c/xampp/mysql/bin/mysql.exe" -u root < database/04_contrasenas_cifradas.sql
```

## 2. Backend (`server/`)

```bash
cd server
npm install
npm run dev
```

Configuración en `server/.env` (no se versiona; copie `server/.env.example`
y ajuste si hace falta). Por defecto usa el usuario `app_convivencia` creado por
el script `03`. Si prefiere conectar con `root` (por ejemplo en la sala 23:
`DB_USER=root`, `DB_PASSWORD=123456`; en XAMPP la contraseña va vacía) la
aplicación funciona igual, pero deja de aplicarse la protección de la auditoría
del RNF-05, que depende del usuario restringido. El servidor queda en
`http://localhost:4000`.

**Cifrado de contraseñas (RNF-01).** La API verifica las contraseñas con
`bcrypt`; el script `04` ya cifra la clave de prueba. Si hubiera otras
contraseñas en texto plano en la tabla `usuario`, cífrelas con este comando
(idempotente; usa `root` sin contraseña salvo que defina `DB_ADMIN_USER` y
`DB_ADMIN_PASSWORD` en `.env`):

```bash
cd server
npm run db:cifrar
```

Prueba rápida: `curl http://localhost:4000/api/health` debe responder
`{"ok":true}`.

Endurecimiento: `helmet` (encabezados de seguridad), CORS restringido a
`http://localhost:5173` (cambiable con la variable `CORS_ORIGIN`, separando
varios orígenes con comas), límite de 20 intentos fallidos de inicio de sesión
cada 15 minutos y errores internos sin detalles técnicos hacia el cliente.

Pruebas automatizadas (`vitest` + `supertest`): validan permisos por rol,
alcance sobre los casos, validaciones y el endurecimiento. Necesitan MySQL
encendido con los datos de prueba, y limpian los casos que crean:

```bash
cd server
npm test
```

## 3. Frontend (`client/`)

```bash
cd client
npm install
npm run dev
```

Abra `http://localhost:5173`.

## 4. Usuarios de prueba

Todos con Contrasena `Temporal2026*` (tal como quedó en el script común):

| Rol           | Usuario                                                              |
| ------------- | -------------------------------------------------------------------- |
| Administrador | `admin`                                                            |
| Coordinador   | `coordinador`                                                      |
| Docente       | `docente1`, `docente2`                                           |
| Acudiente     | `acud001` (acudiente de est001 y est002), `acud002`, `acud003` |
| Estudiante    | `est001`, `est016`, `est031`                                   |

Estas son cuentas base para poder iniciar sesión con cada rol; la base se
publica **sin ningún caso de convivencia precargado** (ver sección 1), así
que la tabla "Casos de convivencia" aparece vacía hasta que se registre el
primer hecho desde la aplicación.

## 5. Autenticación y control de acceso

Por ser un prototipo académico, la autenticación verifica usuario y contraseña
(hash bcrypt de 10 rondas, ver `npm run db:cifrar`) contra la tabla `usuario`, y
el frontend reenvía el id del usuario autenticado en el encabezado `x-user-id`
en cada petición; queda pendiente reemplazar ese encabezado por un token firmado. El backend valida el rol en cada
endpoint (ver `server/src/middleware/auth.js`) y aplica niveles de acceso
distintos al consultar un caso: `completo` (Docente que reportó / Coordinador
/ Administrador), `familiar` (Acudiente vinculado, sin evidencias ni notas
internas) y `propio` (el mismo estudiante, solo estado general). Toda
creación, consulta sensible, cambio de estado, descarga y generación de PDF
queda registrada en la tabla `auditoria`, visible para el Administrador.

Un caso de convivencia **nunca se elimina**, por mínimo o desestimado que
resulte: la API no expone ningún endpoint de borrado para `caso_convivencia`
(`DELETE /api/casos/:id` no existe a propósito). Si un caso queda inconcluso
o sin mérito, Coordinador/Administrador lo cierran cambiando su estado a
`Cerrado` (`PUT /api/casos/:id`); el expediente completo —actuaciones,
evidencias y remisiones— permanece disponible para trazabilidad. Sí puede
eliminarse una actuación puntual mal registrada
(`DELETE /api/casos/:id/actuaciones/:idActuacion`).

## 6. Registro masivo y exportación de expedientes

Además del formulario individual (`CasoForm`), Docente/Coordinador/Administrador
pueden registrar varios hechos a la vez con **carga masiva por CSV**
(`POST /api/casos/carga-masiva`, componente `CargaMasivaCasos.jsx`), con las
mismas reglas del registro individual: un Docente solo puede cargar
estudiantes de sus propios cursos, y cada fila se valida por separado (una
fila con error no descarta las demás). El encabezado esperado del CSV es:

```
identificacion_estudiante,fecha_hecho,lugar,descripcion,clasificacion
```

Desde el expediente de un caso (`CasoDetalle`), Coordinador/Administrador
pueden descargar el expediente completo en dos formatos, sin que ninguno
reemplace la remisión oficial:

- **CSV** (`GET /api/casos/:id/exportar`) — con encabezados de sección,
  fechas en formato legible y filas explícitas cuando una sección está vacía.
- **PDF** (`GET /api/casos/:id/exportar-pdf`, `generarExpedientePDF.js`) —
  documento de uso interno con los mismos datos, marcado explícitamente como
  distinto de la remisión formal a Orientación Escolar (`generarRemisionPDF.js`).

## 7. Notas sobre el modelo de datos

El script común (`database/script.sql`) solo define los roles
`1 Coordinador`, `2 Docente`, `3 Estudiante`. El Documento de Análisis del
Proyecto B asumía además el rol `Administrador`, que no está en el script
compartido por el salón; se agregó con `id 4` y el rol `Acudiente` (ya
previsto en el análisis como adición propia del proyecto) con `id 5`.

## 8. Estructura

```
PROYECTO/
├── database/                          (solo MySQL/MariaDB)
│   ├── script.sql                     (comun al salon)
│   ├── 02_proyecto_b_convivencia.sql  (propio del Proyecto B, sin casos de ejemplo)
│   ├── 03_usuario_aplicacion.sql      (usuario de la API con permisos minimos, RNF-05)
│   └── 04_contrasenas_cifradas.sql    (contrasena de prueba cifrada con bcrypt, RNF-01)
├── docs/                              (prototipo de diseño y documentacion de entrega)
├── img/                               (imagenes de referencia: banner, flyer, logo, fondo de campus)
├── client/                            (frontend React + Vite)
│   ├── public/                        (assets estaticos servidos por Vite: favicons, logo e imagen del colegio)
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── api.js                     (servicios HTTP con axios)
│       ├── App.jsx / App.css / main.jsx
│       ├── constantes.js
│       └── components/                (Login, CasoForm, CasoTable, CasoDetalle, ...)
└── server/                            (backend Express)
    ├── scripts/                       (cifrar-contrasenas.js)
    ├── tests/                         (pruebas automatizadas de la API)
    ├── uploads/{evidencias,remisiones}/  (archivos subidos, no versionados)
    └── src/
        ├── app.js / index.js / db.js
        ├── middleware/, routes/
        └── utils/                     (auditoria, alcance, formato de fechas, generacion de PDF de remision y de expediente)
```

## 9. Respaldo de la base de datos (RNF-09)

```bash
"/c/xampp/mysql/bin/mysqldump.exe" -u root bdiedlavictoria > respaldo_$(date +%F).sql
```

## 10. Lint

```bash
cd client
npm run lint
```

Corre `oxlint` sobre el frontend (configuracion en `.oxlintrc.json`).
