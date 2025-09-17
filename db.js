// backend/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "bd_mtk2",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
