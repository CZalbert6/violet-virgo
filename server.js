// server.js - Versión FINAL con Astro Priorizado
import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import cors from 'cors';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// ✅ CONEXIÓN POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ VERIFICAR CONEXIÓN Y TABLA AL INICIAR
const verificarConexion = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL CONECTADO');
    
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mensajescaptcha'
      )
    `);
    
    if (!checkTable.rows[0].exists) {
      console.log('⚠️ Tabla no existe, creándola...');
      await client.query(`
        CREATE TABLE mensajescaptcha (
          id SERIAL PRIMARY KEY,
          texto TEXT NOT NULL,
          token_captcha VARCHAR(500),
          ip_address VARCHAR(50),
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ Tabla creada');
    }
    client.release();
  } catch (error) {
    console.error('❌ Error PostgreSQL:', error.message);
  }
};

verificarConexion();

// ✅ RUTA HEALTH (Para que el frontend verifique conexión)
app.get('/health', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW() as time');
    const tableResult = await pool.query('SELECT COUNT(*) as count FROM mensajescaptcha');
    
    res.json({
      status: '✅ OK',
      database: { connected: true, time: dbResult.rows[0].time },
      tabla: { exists: true, registros: parseInt(tableResult.rows[0].count) }
    });
  } catch (error) {
    res.status(500).json({ status: '❌ ERROR', error: error.message });
  }
});

// ✅ RUTA PARA GUARDAR (POSTGRESQL)
app.post('/api/guardar', async (req, res) => {
  const { texto, hcaptcha } = req.body;

  if (!texto || texto.trim() === "") {
    return res.status(400).json({ success: false, message: 'El texto es obligatorio' });
  }

  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'desconocido';

    const query = `
      INSERT INTO mensajescaptcha (texto, token_captcha, ip_address, user_agent) 
      VALUES ($1, $2, $3, $4) RETURNING id, created_at
    `;
    
    const values = [texto.trim(), hcaptcha || null, ip.substring(0, 50), userAgent.substring(0, 500)];
    const result = await pool.query(query, values);
    
    res.json({ success: true, id: result.rows[0].id, fecha: result.rows[0].created_at });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ RUTA PARA OBTENER MENSAJES
app.get('/api/mensajes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM mensajescaptcha ORDER BY id DESC LIMIT 50');
    res.json({ success: true, mensajes: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* COMENTAMOS LA RUTA RAIZ PARA QUE SE MUESTRE TU DISEÑO DE ASTRO
  app.get('/', (req, res) => { ... }); 
*/

// ✅ INICIAR SERVIDOR EN PUERTO 8080
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor en puerto ${PORT} listo para Astro`);
});