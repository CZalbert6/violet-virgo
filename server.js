// server.js - VERSIÓN COMPATIBLE con tu frontend Astro
import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import cors from 'cors';

const app = express();

// Middlewares - IMPORTANTE: Habilita CORS para GitHub Pages
app.use(cors({
  origin: [
    'https://czalbert6.github.io',
    'https://violet-virgo-production.up.railway.app',
    'http://localhost:4321'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Conexión PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:bcZeAuTIzUPGDvgULDfbiOLvJqfOuztE@mainline.proxy.rlwy.net:51542/railway',
  ssl: { rejectUnauthorized: false }
});

// Crear tabla si no existe
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mensajescaptcha (
        id SERIAL PRIMARY KEY,
        texto TEXT NOT NULL,
        token_captcha VARCHAR(500),
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabla mensajescaptcha lista');
  } catch (error) {
    console.error('❌ Error inicializando DB:', error);
  }
};
initDB();

// ✅ RUTA HEALTH - COMPATIBLE con tu frontend
app.get('/health', async (req, res) => {
  try {
    // 1. Verificar conexión DB
    const dbResult = await pool.query('SELECT NOW()');
    
    // 2. Contar mensajes (tu frontend espera 'total_mensajes')
    const countResult = await pool.query('SELECT COUNT(*) as total FROM mensajescaptcha');
    const total_mensajes = parseInt(countResult.rows[0].total);
    
    // 3. Verificar tabla existe
    const tableResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mensajescaptcha'
      )
    `);
    
    res.json({
      status: '✅ OK',
      database: '✅ Conectado',
      tabla: tableResult.rows[0].exists ? '✅ Existe' : '❌ No existe',
      total_mensajes: total_mensajes, // ← Esto es lo que tu frontend necesita
      fecha_servidor: dbResult.rows[0].now,
      servicio: 'Express + PostgreSQL en Railway',
      endpoints: {
        guardar: 'POST /api/guardar',
        mensajes: 'GET /api/mensajes'
      }
    });
    
  } catch (error) {
    console.error('Error /health:', error);
    res.status(500).json({
      status: '❌ ERROR',
      error: error.message,
      ayuda: 'Revisa la conexión a PostgreSQL'
    });
  }
});

// ✅ RUTA GUARDAR - COMPATIBLE con tu frontend
app.post('/api/guardar', async (req, res) => {
  console.log('📨 POST /api/guardar recibido');
  console.log('Body:', req.body);
  
  const { texto, hcaptcha } = req.body;

  // Validación como espera tu frontend
  if (!texto || texto.trim() === "") {
    return res.status(400).json({ 
      success: false, 
      message: 'El texto es obligatorio' 
    });
  }

  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'desconocido';

    // Query PostgreSQL
    const query = `
      INSERT INTO mensajescaptcha 
      (texto, token_captcha, ip_address, user_agent) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, created_at
    `;
    
    const values = [
      texto.trim(), 
      hcaptcha || null, 
      ip.substring(0, 50),
      userAgent.substring(0, 500)
    ];
    
    const result = await pool.query(query, values);
    
    // Respuesta que espera tu frontend
    res.json({
      success: true,
      id: result.rows[0].id,
      fecha: result.rows[0].created_at,
      message: 'Guardado en PostgreSQL Railway',
      texto: texto.trim() // ← Añadido para mostrar en frontend
    });
    
  } catch (error) {
    console.error('❌ Error /api/guardar:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al guardar en PostgreSQL',
      error: error.message,
      code: error.code
    });
  }
});

// ✅ RUTA MENSAJES - COMPATIBLE
app.get('/api/mensajes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, texto, created_at 
      FROM mensajescaptcha 
      ORDER BY id DESC 
      LIMIT 100
    `);
    
    res.json({ 
      success: true, 
      total: result.rows.length,
      mensajes: result.rows 
    });
  } catch (error) {
    console.error('Error /api/mensajes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ✅ RUTA RAIZ con información
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Backend PostgreSQL - Railway</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
        h1 { color: #333; }
        .card { background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .endpoint { background: #e2e8f0; padding: 10px; border-radius: 5px; margin: 5px 0; }
        .success { color: #10b981; }
        .info { color: #3b82f6; }
      </style>
    </head>
    <body>
      <h1>🚀 Backend PostgreSQL en Railway</h1>
      <p class="info">Servidor Express conectado a PostgreSQL</p>
      
      <div class="card">
        <h3>📡 Endpoints disponibles:</h3>
        <div class="endpoint"><strong>GET</strong> <a href="/health">/health</a> - Estado del sistema</div>
        <div class="endpoint"><strong>POST</strong> /api/guardar - Guardar mensajes</div>
        <div class="endpoint"><strong>GET</strong> <a href="/api/mensajes">/api/mensajes</a> - Ver mensajes</div>
      </div>
      
      <div class="card">
        <h3>🔗 Frontend conectado:</h3>
        <p><a href="https://czalbert6.github.io/violet-virgo" target="_blank">https://czalbert6.github.io/violet-virgo</a></p>
      </div>
      
      <script>
        // Verificar estado automáticamente
        fetch('/health')
          .then(r => r.json())
          .then(data => {
            document.body.innerHTML += \`
              <div class="card">
                <h3>✅ Estado actual:</h3>
                <p><strong>Base de datos:</strong> \${data.database || 'Conectado'}</p>
                <p><strong>Tabla:</strong> \${data.tabla || 'Existe'}</p>
                <p><strong>Mensajes guardados:</strong> \${data.total_mensajes || 0}</p>
                <p><strong>Servidor:</strong> Railway PostgreSQL</p>
              </div>
            \`;
          })
          .catch(e => {
            document.body.innerHTML += \`
              <div class="card" style="background: #fee2e2;">
                <h3>❌ Error de conexión</h3>
                <p>\${e.message}</p>
              </div>
            \`;
          });
      </script>
    </body>
    </html>
  `);
});

// Iniciar servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ============================================
  🚀  Backend Express iniciado en puerto ${PORT}
  📡  URL: https://violet-virgo-production.up.railway.app
  🗄️   PostgreSQL: Conectado
  🌐  Frontend: https://czalbert6.github.io/violet-virgo
  ============================================
  `);
});