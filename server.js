// server.js - Versión FINAL para Railway (Puerto 8080)
import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import cors from 'cors';

const app = express();

// Configuración de Middlewares
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// Conexión a Base de Datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 1. RUTA DE SALUD (Verificación de Tabla)
app.get('/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW()');
    const tablaCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mensajescaptcha'
      )
    `);
    
    res.json({ 
      status: '✅ OK', 
      database: '✅ Conectado',
      tabla: tablaCheck.rows[0].exists ? '✅ Existe' : '❌ No existe',
      fecha_servidor: dbTest.rows[0].now
    });
  } catch (error) {
    res.status(500).json({ status: '❌ ERROR', error: error.message });
  }
});

// 2. RUTA PARA GUARDAR MENSAJES
app.post('/api/guardar', async (req, res) => {
  const { texto, hcaptcha } = req.body;

  if (!texto || texto.trim() === "") {
    return res.status(400).json({ success: false, message: 'El texto es obligatorio' });
  }

  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'desconocido';

    const query = `
      INSERT INTO mensajescaptcha (texto, token_captcha, ip_address, user_agent, created_at) 
      VALUES ($1, $2, $3, $4, CURRENT_DATE) 
      RETURNING id, created_at
    `;
    
    const values = [texto.trim(), hcaptcha || null, ip, userAgent];
    const result = await pool.query(query, values);

    res.json({
      success: true,
      id: result.rows[0].id,
      fecha: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Error en INSERT:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. RUTA PARA VER MENSAJES
app.get('/api/mensajes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM mensajescaptcha ORDER BY id DESC LIMIT 50');
    res.json({ success: true, mensajes: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// RUTA RAIZ
app.get('/', (req, res) => {
  res.send('<h1>Backend Violet Virgo funcionando 🚀</h1>');
});

// --- CAMBIO CLAVE AQUÍ ---
// Escuchamos en el puerto 8080 que es el que Railway espera
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor activo y escuchando en el puerto ${PORT}`);
});