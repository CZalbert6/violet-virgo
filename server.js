import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const { Pool } = pkg;
const app = express();

/* =========================
   CONFIGURACIÓN BASE
========================= */

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida");
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET no está definido");
  process.exit(1);
}

/* =========================
   FUNCIONES AUXILIARES
========================= */

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/* =========================
   CONEXIÓN A POSTGRESQL
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log("✅ PostgreSQL conectado correctamente"))
  .catch(err => {
    console.error("❌ Error conectando a PostgreSQL:", err);
    process.exit(1);
  });

/* =========================
   CREAR TABLA SI NO EXISTE
========================= */

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Tabla usuarios verificada");
  } catch (error) {
    console.error("❌ Error creando tabla:", error);
  }
}

initDB();

/* =========================
   RUTA DE HEALTH CHECK
========================= */

app.get("/health", async (req, res) => {
  try {
    const dbResult = await pool.query("SELECT NOW()");
    const userCount = await pool.query("SELECT COUNT(*) FROM usuarios");
    
    res.json({
      status: "OK",
      timestamp: new Date(),
      database: "conectado",
      usuarios: parseInt(userCount.rows[0].count),
      db_time: dbResult.rows[0].now
    });
  } catch (error) {
    res.status(500).json({ 
      status: "ERROR", 
      database: "desconectado",
      error: error.message 
    });
  }
});

/* =========================
   RUTA DE PRUEBA
========================= */

app.get("/", (req, res) => {
  res.json({ 
    message: "Servidor funcionando correctamente 🚀",
    endpoints: {
      health: "GET /health",
      register: "POST /register",
      login: "POST /login",
      perfil: "GET /perfil (token requerido)"
    }
  });
});

/* =========================
   REGISTRO
========================= */

app.post("/register", async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    // Validar campos obligatorios
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Validar formato de email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "El email no tiene un formato válido" });
    }

    // Validar longitud de contraseña
    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar usuario
    const result = await pool.query(
      "INSERT INTO usuarios (nombre, email, password) VALUES ($1, $2, $3) RETURNING id, nombre, email, created_at",
      [nombre, email, hashedPassword]
    );

    res.status(201).json({
      message: "Usuario registrado correctamente",
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Error en registro:", error);
    
    // Email duplicado
    if (error.code === '23505') { 
      return res.status(400).json({ 
        error: "El email ya está registrado" 
      });
    }
    
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar campos
    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios" });
    }

    // Buscar usuario
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" }); // 401 es más apropiado
    }

    const user = result.rows[0];

    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Generar token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      message: "Login exitoso",
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email
      }
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/* =========================
   MIDDLEWARE JWT
========================= */

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ error: "Token requerido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Token inválido o expirado" });
  }
}

/* =========================
   RUTA PROTEGIDA
========================= */

app.get("/perfil", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre, email, created_at FROM usuarios WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Error en /perfil:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/* =========================
   INICIAR SERVIDOR
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📡 Endpoints disponibles:`);
  console.log(`   GET  /health`);
  console.log(`   POST /register`);
  console.log(`   POST /login`);
  console.log(`   GET  /perfil (token required)`);
});