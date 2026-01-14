// server.js - Versión CORREGIDA para PostgreSQL en Railway
import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import cors from 'cors';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// ✅ CONEXIÓN POSTGRESQL CORREGIDA
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:bcZeAuTIzUPGDvgULDfbiOLvJqfOuztE@mainline.proxy.rlwy.net:51542/railway',
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ VERIFICAR CONEXIÓN AL INICIAR
const verificarConexion = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL CONECTADO');
    
    // Verificar si la tabla existe
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mensajescaptcha'
      )
    `);
    
    if (!checkTable.rows[0].exists) {
      console.log('⚠️  Tabla no existe, creándola...');
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

// Ejecutar verificación
verificarConexion();

// ✅ RUTA HEALTH MEJORADA
app.get('/health', async (req, res) => {
  try {
    // 1. Verificar conexión a DB
    const dbResult = await pool.query('SELECT NOW() as time, version() as version');
    
    // 2. Verificar tabla
    const tableResult = await pool.query(`
      SELECT COUNT(*) as count FROM mensajescaptcha
    `);
    
    res.json({
      status: '✅ OK',
      database: {
        connected: true,
        time: dbResult.rows[0].time,
        version: dbResult.rows[0].version.split(' ')[1]
      },
      tabla: {
        exists: true,
        registros: parseInt(tableResult.rows[0].count)
      },
      servicio: 'Express + PostgreSQL',
      url: 'https://violet-virgo-production.up.railway.app'
    });
    
  } catch (error) {
    console.error('Error en /health:', error);
    res.status(500).json({
      status: '❌ ERROR',
      error: error.message,
      ayuda: 'Verifica que la tabla mensajescaptcha exista en PostgreSQL'
    });
  }
});

// ✅ RUTA PARA GUARDAR (POSTGRESQL)
app.post('/api/guardar', async (req, res) => {
  console.log('📨 Recibiendo POST a /api/guardar');
  console.log('Body:', req.body);
  
  const { texto, hcaptcha } = req.body;

  // Validación
  if (!texto || texto.trim() === "") {
    return res.status(400).json({ 
      success: false, 
      message: 'El texto es obligatorio' 
    });
  }

  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'desconocido';

    // ✅ QUERY CORREGIDA PARA POSTGRESQL
    const query = `
      INSERT INTO mensajescaptcha 
      (texto, token_captcha, ip_address, user_agent) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, created_at
    `;
    
    const values = [
      texto.trim(), 
      hcaptcha || null, 
      ip.substring(0, 50),  // PostgreSQL VARCHAR(50)
      userAgent.substring(0, 500) // Evitar textos muy largos
    ];
    
    console.log('📝 Ejecutando query con valores:', values);
    
    const result = await pool.query(query, values);
    
    console.log('✅ Insert exitoso. ID:', result.rows[0].id);
    
    res.json({
      success: true,
      id: result.rows[0].id,
      fecha: result.rows[0].created_at,
      mensaje: 'Guardado en PostgreSQL'
    });
    
  } catch (error) {
    console.error('❌ Error en INSERT PostgreSQL:', error);
    console.error('Detalles:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      detalle: error.detail || 'Error al guardar en PostgreSQL',
      code: error.code
    });
  }
});

// ✅ RUTA PARA OBTENER MENSAJES
app.get('/api/mensajes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, texto, created_at, ip_address 
      FROM mensajescaptcha 
      ORDER BY id DESC 
      LIMIT 50
    `);
    
    res.json({ 
      success: true, 
      total: result.rows.length,
      mensajes: result.rows 
    });
  } catch (error) {
    console.error('Error en GET /api/mensajes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ✅ RUTA RAIZ SIMPLE
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>PostgreSQL en Railway</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
        h1 { color: #333; }
        .status { 
          background: #f0f9ff; 
          padding: 20px; 
          border-radius: 10px; 
          margin: 20px auto; 
          max-width: 600px;
        }
        a { 
          display: inline-block; 
          margin: 10px; 
          padding: 10px 20px; 
          background: #3b82f6; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px;
        }
        code { background: #f1f5f9; padding: 2px 5px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>🚀 PostgreSQL + Express en Railway</h1>
      
      <div class="status">
        <h3>Endpoints disponibles:</h3>
        <p><a href="/health">/health</a> - Estado del sistema</p>
        <p><a href="/api/mensajes">/api/mensajes</a> - Ver mensajes</p>
        <p><code>POST /api/guardar</code> - Guardar mensaje</p>
        
        <h3>Base de datos:</h3>
        <p><strong>Tabla:</strong> mensajescaptcha</p>
        <p><strong>URL:</strong> ${process.env.DATABASE_URL ? '✅ Configurada' : '❌ No configurada'}</p>
      </div>
      
      <script>
        // Verificar salud automáticamente
        fetch('/health')
          .then(r => r.json())
          .then(data => {
            const statusDiv = document.querySelector('.status');
            statusDiv.innerHTML += \`
              <h3>Estado actual:</h3>
              <p>Database: \${data.database?.connected ? '✅ Conectado' : '❌ Error'}</p>
              <p>Tabla: \${data.tabla?.exists ? '✅ Existe' : '❌ No existe'}</p>
              <p>Registros: \${data.tabla?.registros || 0}</p>
            \`;
          })
          .catch(e => console.error(e));
      </script>
    </body>
    </html>
  `);
});

// ✅ INICIAR SERVIDOR
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 Servidor iniciado en puerto ${PORT}
  📡 URL: https://violet-virgo-production.up.railway.app
  🗄️  PostgreSQL: ${process.env.DATABASE_URL ? 'Configurada' : 'Usando string hardcodeado'}
  `);
});