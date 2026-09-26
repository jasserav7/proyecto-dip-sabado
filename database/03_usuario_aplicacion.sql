-- ============================================================
-- PROYECTO B - Usuario de MySQL de la aplicacion (RNF-05)
--
-- Se ejecuta DESPUES de 02_proyecto_b_convivencia.sql, con un usuario
-- administrador de MySQL (root en XAMPP). La API se conecta con este
-- usuario y no con root: sobre la tabla auditoria solo puede consultar
-- e insertar, de modo que el registro de auditoria es inalterable
-- desde la aplicacion. El vinculo con el caso pasa a NULL cuando un caso
-- se elimina porque lo hace el motor (on delete set null), no la app.
--
-- La contrasena es de desarrollo; cambiela en cualquier despliegue real
-- y reflejela en server/.env (DB_USER / DB_PASSWORD).
-- ============================================================

use bdiedlavictoria;

create user if not exists 'app_convivencia'@'localhost' identified by 'Convivencia2026*';

-- Modelo comun y catalogos: solo lectura (su administracion es del Proyecto C)
grant select on rol to 'app_convivencia'@'localhost';
grant select on estado to 'app_convivencia'@'localhost';
grant select on usuario to 'app_convivencia'@'localhost';
grant select on curso to 'app_convivencia'@'localhost';
grant select on vigencia to 'app_convivencia'@'localhost';
grant select on usuario_curso_vigencia to 'app_convivencia'@'localhost';
grant select on configuracion to 'app_convivencia'@'localhost';
grant select on acudiente_estudiante to 'app_convivencia'@'localhost';

-- Entidades propias del Proyecto B
grant select, insert, update, delete on caso_convivencia to 'app_convivencia'@'localhost';
grant select, insert, delete on actuacion to 'app_convivencia'@'localhost';
grant select, insert, delete on evidencia to 'app_convivencia'@'localhost';
grant select, insert, delete on remision to 'app_convivencia'@'localhost';

-- Auditoria: sin UPDATE ni DELETE
grant select, insert on auditoria to 'app_convivencia'@'localhost';
