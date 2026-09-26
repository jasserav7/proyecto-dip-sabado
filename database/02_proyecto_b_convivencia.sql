-- ============================================================
-- PROYECTO B - Registro de Convivencia y Remision a Orientacion
-- IED La Victoria / CUC - Diplomado TSI 4.0
--
-- Este script se ejecuta DESPUES de database/script.sql (el script
-- comun acordado con el salon: rol, estado, usuario, curso, vigencia,
-- usuario_curso_vigencia, configuracion).
--
-- Agrega:
--   1) El rol "Acudiente" (id 5) al catalogo comun de rol.
--   2) Las entidades propias del Proyecto B: acudiente_estudiante,
--      caso_convivencia, actuacion, evidencia, remision, auditoria.
--   3) Cuentas base (administrador y acudientes ficticios con su
--      vinculo a un estudiante) necesarias para poder iniciar sesion
--      con cada rol desde cero y para que corran las pruebas
--      automaticas (server/tests/api.test.js). A proposito NO se
--      siembra ningun caso_convivencia de ejemplo: los casos reales
--      de convivencia los crea cada instalacion desde la aplicacion,
--      nunca este script (para no llegar a produccion con casos de
--      la fase de pruebas ya cargados).
-- ============================================================

use bdiedlavictoria;

-- ------------------------------------------------------------
-- 1) ROL: Administrador y Acudiente
-- El script comun (database/script.sql) solo trae 1 Coordinador,
-- 2 Docente, 3 Estudiante: NO incluye el rol Administrador que
-- describe el documento de analisis del Proyecto B. Se agrega aqui
-- con id 4, y el rol Acudiente (indispensable para el alcance de
-- este proyecto y ausente del set base) con id 5.
-- ------------------------------------------------------------
insert into rol(id, nombre) values
    (4, 'Administrador'),
    (5, 'Acudiente');

-- ------------------------------------------------------------
-- 2) ACUDIENTE_ESTUDIANTE
-- Vincula un usuario con rol Acudiente con un usuario con rol
-- Estudiante. Un acudiente puede tener mas de un estudiante a cargo.
-- ------------------------------------------------------------
create table acudiente_estudiante(
    id_acudiente int not null,
    id_estudiante int not null,
    constraint pk_acudiente_estudiante primary key(id_acudiente, id_estudiante),
    constraint fk_ae_acudiente foreign key(id_acudiente)
        references usuario(id),
    constraint fk_ae_estudiante foreign key(id_estudiante)
        references usuario(id)
);

-- ------------------------------------------------------------
-- 3) CASO_CONVIVENCIA
-- Registro del hecho: fecha/hora, lugar, descripcion objetiva,
-- clasificacion inicial (I/II/III), quien reporta y estado del caso.
-- ------------------------------------------------------------
create table caso_convivencia(
    id int auto_increment,
    id_estudiante int not null,
    fecha_hecho datetime not null,
    lugar varchar(120) not null,
    descripcion varchar(2000) not null,
    clasificacion varchar(5) not null,      -- 'I', 'II', 'III'
    estado varchar(20) not null default 'Abierto', -- Abierto, En seguimiento, Remitido, Cerrado
    id_usuario_reporta int not null,
    fecha_registro datetime default current_timestamp,
    constraint pk_caso_convivencia primary key(id),
    constraint fk_caso_estudiante foreign key(id_estudiante)
        references usuario(id),
    constraint fk_caso_reporta foreign key(id_usuario_reporta)
        references usuario(id)
);

-- ------------------------------------------------------------
-- 4) ACTUACION (incluye compromisos)
-- Seguimiento: actuaciones, compromisos, responsables, fechas de
-- cumplimiento y trazabilidad de cambios sobre un caso.
-- ------------------------------------------------------------
create table actuacion(
    id int auto_increment,
    id_caso int not null,
    tipo varchar(40) not null,              -- Actuacion, Compromiso, Observacion
    descripcion varchar(2000) not null,
    responsable varchar(120) not null,
    fecha_compromiso date,
    fecha_cumplimiento date,
    estado varchar(20) not null default 'Pendiente', -- Pendiente, Cumplido, Incumplido
    id_usuario_registra int not null,
    fecha_registro datetime default current_timestamp,
    constraint pk_actuacion primary key(id),
    constraint fk_actuacion_caso foreign key(id_caso)
        references caso_convivencia(id),
    constraint fk_actuacion_usuario foreign key(id_usuario_registra)
        references usuario(id)
);

-- ------------------------------------------------------------
-- 5) EVIDENCIA
-- Metadatos de archivos adjuntos (el archivo fisico se guarda fuera
-- del directorio publico; aqui solo se referencia su nombre tecnico).
-- ------------------------------------------------------------
create table evidencia(
    id int auto_increment,
    id_caso int not null,
    nombre_tecnico varchar(255) not null,   -- nombre aleatorio en disco
    nombre_original varchar(255) not null,
    tipo_archivo varchar(50),
    nivel_acceso varchar(20) not null default 'restringido', -- general, restringido
    fecha_carga datetime default current_timestamp,
    id_usuario_carga int not null,
    constraint pk_evidencia primary key(id),
    constraint fk_evidencia_caso foreign key(id_caso)
        references caso_convivencia(id),
    constraint fk_evidencia_usuario foreign key(id_usuario_carga)
        references usuario(id)
);

-- ------------------------------------------------------------
-- 6) REMISION
-- Remision a Orientacion Escolar: PDF numerado con copia
-- trazable en el expediente del estudiante.
-- ------------------------------------------------------------
create table remision(
    id int auto_increment,
    id_caso int not null,
    numero varchar(30) not null,
    fecha_generacion datetime default current_timestamp,
    id_usuario_genera int not null,
    ruta_pdf varchar(255) not null,
    constraint pk_remision primary key(id),
    constraint uq_remision_numero unique(numero),
    constraint fk_remision_caso foreign key(id_caso)
        references caso_convivencia(id),
    constraint fk_remision_usuario foreign key(id_usuario_genera)
        references usuario(id)
);

-- ------------------------------------------------------------
-- 7) AUDITORIA
-- Registra creacion, consulta sensible, cambio de estado,
-- descarga y generacion de PDF.
-- ------------------------------------------------------------
create table auditoria(
    id int auto_increment,
    id_caso int,
    id_usuario_responsable int not null,
    tipo_accion varchar(60) not null,       -- CREACION, CONSULTA_SENSIBLE, CAMBIO_ESTADO, DESCARGA, GENERACION_PDF
    detalle varchar(255),
    fecha_hora datetime default current_timestamp,
    constraint pk_auditoria primary key(id),
    constraint fk_auditoria_caso foreign key(id_caso)
        references caso_convivencia(id) on delete set null,
    constraint fk_auditoria_usuario foreign key(id_usuario_responsable)
        references usuario(id)
);

-- ============================================================
-- CUENTAS BASE (Proyecto B) — sin casos de convivencia de ejemplo
-- ============================================================

-- ------------------------------------------------------------
-- ADMINISTRADOR (rol 4): cuenta inicial para poder entrar al sistema
-- por primera vez y administrar el resto de usuarios/roles.
-- ------------------------------------------------------------
insert into usuario(
    id, identificacion, usuario, contrasena, nombre, apellido, email, id_estado, id_rol
) values
    (2, '10000002', 'admin', 'Temporal2026*', 'Laura', 'Fernandez', 'admin@iedlavictoria.edu.co', 1, 4);

-- ------------------------------------------------------------
-- ACUDIENTES ficticios (rol 5) y su vinculo con algunos estudiantes
-- de Curso1A (ids 1001-1015) y Curso1B (ids 1016-1030). Se conservan
-- (no son "casos de convivencia") porque son la unica forma de iniciar
-- sesion como Acudiente antes de que el Proyecto C cargue acudientes
-- reales, y porque el vinculo acud001–est001 lo usan las pruebas
-- automaticas (server/tests/api.test.js).
-- ------------------------------------------------------------
insert into usuario(
    id, identificacion, usuario, contrasena, nombre, apellido, email, id_estado, id_rol
) values
    (5001, '80000001', 'acud001', 'Temporal2026*', 'Mercedes', 'Vargas', 'acud001@iedlavictoria.edu.co', 1, 5),
    (5002, '80000002', 'acud002', 'Temporal2026*', 'Roberto', 'Castillo', 'acud002@iedlavictoria.edu.co', 1, 5),
    (5003, '80000003', 'acud003', 'Temporal2026*', 'Ines', 'Barrios', 'acud003@iedlavictoria.edu.co', 1, 5);

insert into acudiente_estudiante(id_acudiente, id_estudiante) values
    (5001, 1001),
    (5001, 1002),
    (5002, 1016),
    (5003, 1031);

-- No se siembra ningun caso_convivencia/actuacion/auditoria de ejemplo:
-- cada instalacion (y cada corrida de pruebas) crea y descarta los suyos
-- desde la aplicacion, para que el repositorio nunca llegue a produccion
-- con casos ya registrados en la fase de pruebas.
