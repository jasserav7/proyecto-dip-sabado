import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
try {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });
  const [rows] = await pool.query('SELECT 1 as ok');
  console.log('OK', rows);
} catch (e) {
  console.error('ERROR NAME:', e.name);
  console.error('ERROR CODE:', e.code);
  console.error('ERROR MSG:', e.message);
  console.error(e);
}
