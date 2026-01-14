// server.js - BACKEND COMPLETO para Railway
import express from 'express';
import { Pool } from 'pg';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexión DIRECTA a TU Railway PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres:bcZeAuTIzUPGDvgULDfbiOLvJqfOuztE@mainline.proxy.rlwy.net:51542/railway',
  ssl: {
    rejectUnauthorized: false
  }
});

console.log('🔗 Conectando a PostgreSQL Railway...');

// Ruta para guardar mensajes
app.post('/api/guardar', async (req, res) => {
  console.log('📥 Recibiendo:', req.body.texto ? `"${req.body.texto.substring(0, 30)}..."` : 'sin texto');
  
  try {
    const { texto, hcaptcha } = req.body;
    
    if (!texto || texto.trim() === '') {
      return res.json({ success: false, message: '⚠️ Escribe algo primero' });
    }
    
    if (!hcaptcha) {
      return res.json({ success: false, message: '🔒 Completa el captcha' });
    }
    
    const textoLimpio = texto.trim();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'desconocida';
    const userAgent = req.headers['user-agent'] || 'desconocido';
    
    // Intentar INSERT con created_at
    let result;
    try {
      result = await pool.query(
        `INSERT INTO mensajes_captcha 
         (texto, token_captcha, ip_address, user_agent, created_at) 
         VALUES ($1, $2, $3, $4, CURRENT_DATE) 
         RETURNING id, created_at`,
        [textoLimpio, hcaptcha, ip, userAgent]
      );
    } catch (error) {
      // Si falla, intentar SIN created_at
      console.log('⚠️ Intentando sin created_at...');
      result = await pool.query(
        `INSERT INTO mensajes_captcha 
         (texto, token_captcha, ip_address, user_agent) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id`,
        [textoLimpio, hcaptcha, ip, userAgent]
      );
      result.rows[0].created_at = new Date().toISOString().split('T')[0];
    }
    
    console.log('✅ Guardado. ID:', result.rows[0].id);
    
    res.json({
      success: true,
      message: `✅ Guardado: "${textoLimpio}"`,
      id: result.rows[0].id,
      fecha: result.rows[0].created_at
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.json({ 
      success: false, 
      message: '💥 Error del servidor',
      error: error.message 
    });
  }
});

// Ver mensajes
app.get('/api/mensajes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, texto, created_at FROM mensajes_captcha ORDER BY id DESC LIMIT 20'
    );
    res.json({ success: true, mensajes: result.rows });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Salud
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const tablaCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'mensajes_captcha'
      )
    `);
    
    res.json({ 
      status: '✅ OK', 
      database: '✅ Conectado',
      tabla: tablaCheck.rows[0].exists ? '✅ Existe' : '❌ No existe',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ status: '❌ ERROR', error: error.message });
  }
});

// Página principal
app.get('/', (req, res) => {
  res.send(`
    <html>
    <body style="font-family: Arial; padding: 40px;">
      <h1>🚀 Backend Violet Virgo</h1>
      <p>✅ Conectado a PostgreSQL Railway</p>
      <p><a href="/health">Verificar salud</a></p>
      <p><a href="/api/mensajes">Ver mensajes</a></p>
    </body>
    </html>
  `);
});

// Iniciar
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});