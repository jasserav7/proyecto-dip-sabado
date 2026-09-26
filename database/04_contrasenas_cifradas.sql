-- ============================================================
-- PROYECTO B - Contrasenas de prueba cifradas con bcrypt (RNF-01)
--
-- Se ejecuta DESPUES de 02_proyecto_b_convivencia.sql, con un usuario
-- administrador de MySQL (root). Los scripts comunes insertan la
-- contrasena de prueba 'Temporal2026*' en texto plano y la API solo
-- acepta hashes bcrypt: este script reemplaza esa clave por su hash
-- (10 rondas), asi el sistema queda listo sin pasos adicionales.
-- Es idempotente. Para cifrar otras contrasenas en texto plano use
-- 'npm run db:cifrar' en la carpeta server.
-- ============================================================

use bdiedlavictoria;

alter table usuario modify contrasena varchar(255) not null;

update usuario
set contrasena = '$2b$10$oZYLGGm17l1xqAfjXvXC7.z51HsgqH9QRGROURMxpwckkMuvTPVhG'
where contrasena = 'Temporal2026*';
