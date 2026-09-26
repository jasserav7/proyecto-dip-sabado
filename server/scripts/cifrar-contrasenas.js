/**
 * Cifra con bcrypt (10 rondas de sal) las contrasenas que aun estan en texto plano
 * en la tabla usuario (RNF-01). Es idempotente: omite las que ya son un hash bcrypt.
 *
 * Los scripts SQL comunes del salon insertan contrasenas de prueba en texto plano
 * y la aplicacion se conecta con un usuario sin permiso de UPDATE sobre usuario,
 * por eso este script usa credenciales de administrador de MySQL:
 *   DB_ADMIN_USER (por defecto root) y DB_ADMIN_PASSWORD (por defecto vacia, XAMPP).
 *
 * Uso: cd server && npm run db:cifrar
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const RONDAS = 10;

const conexion = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_ADMIN_USER || 'root',
  password: process.env.DB_ADMIN_PASSWORD ?? '',
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306
});

try {
  const [pendientes] = await conexion.query("SELECT id, contrasena FROM usuario WHERE contrasena NOT LIKE '$2%'");
  console.log(`Contrasenas por cifrar: ${pendientes.length}`);

  for (const { id, contrasena } of pendientes) {
    const hash = await bcrypt.hash(contrasena, RONDAS);
    await conexion.query('UPDATE usuario SET contrasena = ? WHERE id = ?', [hash, id]);
  }

  console.log('Listo: todas las contrasenas quedaron cifradas.');
} finally {
  await conexion.end();
}
