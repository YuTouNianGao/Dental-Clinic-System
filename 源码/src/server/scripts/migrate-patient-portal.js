import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(root, '.env') });
const database = process.env.DB_DATABASE || 'dental_clinic_db';
if (database.endsWith('_test')) {
  console.log('这是患者端增量迁移脚本；测试库请使用 db:reset-test 重建 schema。');
  process.exit(0);
}
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database,
  multipleStatements: true,
  charset: 'utf8mb4'
});
try {
  const [rows] = await connection.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='patient_account'",
    [database]
  );
  if (rows.length) {
    console.log('患者端表已存在，跳过迁移。');
    process.exit(0);
  }
  const sql = fs.readFileSync(path.join(root, 'sql/migrations/002_patient_portal.sql'), 'utf8');
  await connection.query(sql);
  console.log('患者端增量迁移完成。');
} finally {
  await connection.end();
}
