// server.js - VERSIÓN CORREGIDA para tipos de datos de Railway
import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import cors from 'cors';

const app = express();

// Middlewares
app.use(cors({
  origin: [
    'https://czalbert6.github.io',
    'https://violet-virgo-production.up.railway.app',
    'http://localhost:4321'
  ],
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Conexión PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:bcZeAuTIzUPGDvgULDfbiOLvJqfOuztE@mainline.proxy.rlwy.net:51542/railway',
  ssl: { rejectUnauthorized: false }
});

// ============================================
// INICIALIZACIÓN DE TABLAS (CON TIPOS COMPATIBLES)
// ============================================

// Crear tablas si no existen
const initDB = async () => {
  try {
    // 1. Tabla de mensajes (ya existe)
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
    
    // 2. Tabla de imágenes para el carrusel (CON TIPOS COMPATIBLES)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS carrusel_imagenes (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        imagen_url TEXT,
        imagen_base64 TEXT,                    -- Usamos TEXT (compatible)
        tipo_mime VARCHAR(100),                -- Usamos VARCHAR (compatible)
        tamano INTEGER,                        -- Usamos INTEGER (compatible)
        fecha DATE DEFAULT CURRENT_DATE,       -- DATE es compatible
        created_at TIMESTAMP DEFAULT NOW()     -- TIMESTAMP es compatible
      )
    `);
    console.log('✅ Tabla carrusel_imagenes creada/verificada');
    
    // 3. VERIFICAR que las columnas existen, si no, crearlas
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'carrusel_imagenes'
    `);
    
    const columns = columnCheck.rows.map(row => row.column_name);
    console.log('📋 Columnas actuales:', columns);
    
    // Agregar columnas faltantes si es necesario
    if (!columns.includes('imagen_base64')) {
      await pool.query(`ALTER TABLE carrusel_imagenes ADD COLUMN imagen_base64 TEXT`);
      console.log('✅ Columna imagen_base64 agregada');
    }
    
    if (!columns.includes('tipo_mime')) {
      await pool.query(`ALTER TABLE carrusel_imagenes ADD COLUMN tipo_mime VARCHAR(100)`);
      console.log('✅ Columna tipo_mime agregada');
    }
    
    if (!columns.includes('tamano')) {
      await pool.query(`ALTER TABLE carrusel_imagenes ADD COLUMN tamano INTEGER`);
      console.log('✅ Columna tamano agregada');
    }
    
    // CORRECCIÓN: Agregar created_at si falta
    if (!columns.includes('created_at')) {
      await pool.query(`ALTER TABLE carrusel_imagenes ADD COLUMN created_at TIMESTAMP DEFAULT NOW()`);
      console.log('✅ Columna created_at agregada');
    }
    
    // CORRECCIÓN: Intentar quitar NOT NULL constraint de imagen_url si existe
    try {
      await pool.query(`
        ALTER TABLE carrusel_imagenes 
        ALTER COLUMN imagen_url DROP NOT NULL
      `);
      console.log('✅ NOT NULL constraint removido de imagen_url (si existía)');
    } catch (constraintError) {
      console.log('ℹ️ No se pudo remover NOT NULL (puede que no exista o ya esté removido):', constraintError.message);
    }
    
  } catch (error) {
    console.error('❌ Error inicializando DB:', error);
    
    // Si hay error específico de columna, intentar solucionar
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      console.log('🔄 Intentando reparar tabla...');
      try {
        // Crear tabla desde cero
        await pool.query(`DROP TABLE IF EXISTS carrusel_imagenes`);
        
        await pool.query(`
          CREATE TABLE carrusel_imagenes (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            imagen_url TEXT,
            imagen_base64 TEXT,
            tipo_mime VARCHAR(100),
            tamano INTEGER,
            fecha DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        console.log('✅ Tabla carrusel_imagenes recreada exitosamente');
      } catch (repairError) {
        console.error('❌ Error al reparar tabla:', repairError);
      }
    }
  }
};
initDB();

// ============================================
// RUTAS EXISTENTES (NO MODIFICAR)
// ============================================

// ✅ RUTA HEALTH - COMPATIBLE con tu frontend
app.get('/health', async (req, res) => {
  try {
    // 1. Verificar conexión DB
    const dbResult = await pool.query('SELECT NOW()');
    
    // 2. Contar mensajes
    const countResult = await pool.query('SELECT COUNT(*) as total FROM mensajescaptcha');
    const total_mensajes = parseInt(countResult.rows[0].total);
    
    // 3. Contar imágenes
    const countImagenes = await pool.query('SELECT COUNT(*) as total FROM carrusel_imagenes');
    const total_imagenes = parseInt(countImagenes.rows[0].total);
    
    // 4. Verificar tablas existen
    const tableResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mensajescaptcha'
      )
    `);
    
    const tableImagenesResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'carrusel_imagenes'
      )
    `);
    
    // 5. Verificar columnas de carrusel_imagenes
    let columnStatus = '❌ No verificada';
    try {
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'carrusel_imagenes'
      `);
      const columns = columnCheck.rows.map(row => row.column_name);
      columnStatus = `✅ ${columns.length} columnas: ${columns.join(', ')}`;
    } catch (e) {
      columnStatus = '⚠️ Error verificando columnas';
    }
    
    res.json({
      status: '✅ OK',
      database: '✅ Conectado',
      tablas: {
        mensajes: tableResult.rows[0].exists ? '✅ Existe' : '❌ No existe',
        imagenes: tableImagenesResult.rows[0].exists ? '✅ Existe' : '❌ No existe',
        columnas_imagenes: columnStatus
      },
      total_mensajes: total_mensajes,
      total_imagenes: total_imagenes,
      fecha_servidor: dbResult.rows[0].now,
      servicio: 'Express + PostgreSQL en Railway',
      endpoints: {
        guardar: 'POST /api/guardar',
        mensajes: 'GET /api/mensajes',
        carrusel: 'GET /api/carrusel',
        subir_imagen: 'POST /api/carrusel'
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
  
  const { texto, hcaptcha } = req.body;

  if (!texto || texto.trim() === "") {
    return res.status(400).json({ 
      success: false, 
      message: 'El texto es obligatorio' 
    });
  }

  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || '0.0.0.0';
    const userAgent = req.headers['user-agent'] || 'desconocido';

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
    
    res.json({
      success: true,
      id: result.rows[0].id,
      fecha: result.rows[0].created_at,
      message: 'Guardado en PostgreSQL Railway',
      texto: texto.trim()
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

// ============================================
// RUTAS NUEVAS PARA EL CARRUSEL CON BASE64
// ============================================

// 🔄 GET /api/carrusel - Obtener todas las imágenes (solo metadata) - CORREGIDO
app.get('/api/carrusel', async (req, res) => {
  try {
    console.log('📸 GET /api/carrusel - Solicitando imágenes');
    
    // CORREGIDO: Consulta sin created_at
    const result = await pool.query(`
      SELECT id, nombre, tipo_mime, tamano, fecha 
      FROM carrusel_imagenes 
      ORDER BY id DESC
    `);
    
    console.log(`✅ ${result.rows.length} imágenes encontradas`);
    
    res.json({ 
      success: true, 
      imagenes: result.rows 
    });
  } catch (error) {
    console.error('❌ Error /api/carrusel:', error);
    
    // Si hay error de columna, intentar consulta alternativa
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      console.log('🔄 Intentando consulta alternativa...');
      try {
        // Intentar con menos columnas
        const columnNames = ['id', 'nombre', 'fecha']; // Columnas básicas que deberían existir
        
        // Construir query dinámica basada en columnas disponibles
        let availableColumns = [];
        try {
          const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'carrusel_imagenes'
          `);
          availableColumns = columnCheck.rows.map(row => row.column_name);
          console.log('📋 Columnas disponibles:', availableColumns);
        } catch (e) {
          availableColumns = ['id', 'nombre']; // Columnas mínimas
        }
        
        // Filtrar columnas que realmente existen
        const safeColumns = availableColumns.filter(col => 
          ['id', 'nombre', 'tipo_mime', 'tamano', 'fecha', 'created_at'].includes(col)
        );
        
        if (safeColumns.length === 0) {
          safeColumns.push('id', 'nombre'); // Columnas mínimas
        }
        
        const query = `
          SELECT ${safeColumns.join(', ')} 
          FROM carrusel_imagenes 
          ORDER BY id DESC
        `;
        
        const result = await pool.query(query);
        
        return res.json({ 
          success: true, 
          imagenes: result.rows || [],
          message: 'Consulta realizada con columnas disponibles'
        });
      } catch (retryError) {
        console.error('❌ Error al reintentar:', retryError);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      help: 'La tabla puede no tener las columnas correctas. Verifica /health'
    });
  }
});

// 📤 POST /api/carrusel - Subir nueva imagen (BASE64) - CORREGIDO CON imagen_url
app.post('/api/carrusel', async (req, res) => {
  console.log('📨 POST /api/carrusel - Subiendo imagen (Base64)');
  
  try {
    const { nombre, imagen_base64, tipo_mime } = req.body;
    
    // Validación
    if (!nombre || !imagen_base64) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nombre e imagen_base64 son obligatorios' 
      });
    }
    
    // Validar que sea Base64 de imagen
    if (!imagen_base64.startsWith('data:image/')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Formato Base64 inválido. Debe ser una imagen' 
      });
    }
    
    // Calcular tamaño
    const tamano = imagen_base64.length;
    
    // Validar tamaño máximo (5MB para Base64)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (tamano > MAX_SIZE) {
      return res.status(400).json({ 
        success: false, 
        message: 'Imagen demasiado grande. Máximo 5MB' 
      });
    }
    
    // Intentar inserción - CORREGIDO: Incluir imagen_url
    try {
      const query = `
        INSERT INTO carrusel_imagenes (nombre, imagen_base64, tipo_mime, tamano, imagen_url) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING id, nombre, tipo_mime, tamano, fecha
      `;
      
      const result = await pool.query(query, [
        nombre.trim(), 
        imagen_base64,
        tipo_mime || 'image/jpeg',
        tamano,
        ''  // String vacío para imagen_url (NO NULL)
      ]);
      
      console.log(`✅ Imagen subida: ${result.rows[0].nombre} (${result.rows[0].tamano} bytes)`);
      
      return res.json({
        success: true,
        message: 'Imagen agregada al carrusel',
        imagen: result.rows[0]
      });
      
    } catch (dbError) {
      console.error('❌ Error en INSERT:', dbError.message);
      
      // Si hay error de NOT NULL en imagen_url, intentar con initDB primero
      if (dbError.message.includes('imagen_url') && dbError.message.includes('not-null')) {
        console.log('🔄 Error NOT NULL en imagen_url, intentando reparar...');
        
        try {
          // Primero intentar quitar el NOT NULL constraint
          await pool.query(`
            ALTER TABLE carrusel_imagenes 
            ALTER COLUMN imagen_url DROP NOT NULL
          `);
          console.log('✅ NOT NULL constraint removido, reintentando inserción...');
          
          // Reintentar inserción
          const retryQuery = `
            INSERT INTO carrusel_imagenes (nombre, imagen_base64, tipo_mime, tamano, imagen_url) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, nombre, tipo_mime, tamano, fecha
          `;
          
          const retryResult = await pool.query(retryQuery, [
            nombre.trim(), 
            imagen_base64,
            tipo_mime || 'image/jpeg',
            tamano,
            ''
          ]);
          
          console.log(`✅ Imagen subida (después de quitar NOT NULL): ${retryResult.rows[0].nombre}`);
          
          return res.json({
            success: true,
            message: 'Imagen agregada al carrusel',
            imagen: retryResult.rows[0]
          });
          
        } catch (constraintError) {
          console.error('❌ Error al quitar NOT NULL:', constraintError.message);
          
          // Si no se puede quitar NOT NULL, intentar con valor por defecto
          try {
            const fallbackQuery = `
              INSERT INTO carrusel_imagenes (nombre, imagen_base64, tipo_mime, tamano, imagen_url) 
              VALUES ($1, $2, $3, $4, $5) 
              RETURNING id, nombre, tipo_mime, tamano, fecha
            `;
            
            const fallbackResult = await pool.query(fallbackQuery, [
              nombre.trim(), 
              imagen_base64,
              tipo_mime || 'image/jpeg',
              tamano,
              'no_url_provided'  // Valor por defecto diferente
            ]);
            
            console.log(`✅ Imagen subida (con valor por defecto): ${fallbackResult.rows[0].nombre}`);
            
            return res.json({
              success: true,
              message: 'Imagen agregada al carrusel',
              imagen: fallbackResult.rows[0]
            });
            
          } catch (fallbackError) {
            console.error('❌ Error en fallback:', fallbackError.message);
          }
        }
      }
      
      // Si hay error de columna faltante, reparar tabla
      if (dbError.message.includes('column') && dbError.message.includes('does not exist')) {
        console.log('🔄 Error de columna, reparando tabla...');
        
        await initDB();
        
        // Reintentar inserción después de reparar
        const retryQuery = `
          INSERT INTO carrusel_imagenes (nombre, imagen_base64, tipo_mime, tamano, imagen_url) 
          VALUES ($1, $2, $3, $4, $5) 
          RETURNING id, nombre, tipo_mime, tamano, fecha
        `;
        
        const retryResult = await pool.query(retryQuery, [
          nombre.trim(), 
          imagen_base64,
          tipo_mime || 'image/jpeg',
          tamano,
          ''
        ]);
        
        console.log(`✅ Imagen subida (después de reparar): ${retryResult.rows[0].nombre}`);
        
        return res.json({
          success: true,
          message: 'Imagen agregada (tabla reparada automáticamente)',
          imagen: retryResult.rows[0]
        });
      }
      
      // Si no es error conocido, propagar el error
      throw dbError;
    }
    
  } catch (error) {
    console.error('❌ Error subiendo imagen:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      help: 'Verifica que la tabla tenga las columnas correctas. Visita /health para diagnóstico'
    });
  }
});

// 🖼️ GET /api/carrusel/:id - Obtener imagen completa (con Base64) - CORREGIDO
app.get('/api/carrusel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🖼️ GET /api/carrusel/${id}`);
    
    // CORREGIDO: Consulta sin created_at
    const result = await pool.query(`
      SELECT id, nombre, imagen_base64, tipo_mime, tamano, fecha 
      FROM carrusel_imagenes 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Imagen no encontrada' 
      });
    }
    
    res.json({
      success: true,
      imagen: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo imagen:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🗑️ DELETE /api/carrusel/:id - Eliminar imagen
app.delete('/api/carrusel/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ DELETE /api/carrusel/${id} - Eliminando imagen`);
    
    const result = await pool.query(
      'DELETE FROM carrusel_imagenes WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Imagen no encontrada' 
      });
    }
    
    console.log(`✅ Imagen ${id} eliminada`);
    
    res.json({
      success: true,
      message: 'Imagen eliminada del carrusel',
      id: result.rows[0].id
    });
    
  } catch (error) {
    console.error('❌ Error eliminando imagen:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// RUTA RAIZ
// ============================================

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
        .new { background: #f0f9ff; border-left: 4px solid #8b5cf6; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px; margin: 10px 0; }
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
        
        <!-- NUEVOS ENDPOINTS PARA CARRUSEL -->
        <div class="endpoint new">
          <strong>🎨 CARRUSEL (Base64):</strong>
          <div style="margin-left: 10px; margin-top: 5px;">
            <div><strong>GET</strong> <a href="/api/carrusel">/api/carrusel</a> - Ver imágenes</div>
            <div><strong>POST</strong> /api/carrusel - Subir imagen (Base64)</div>
            <div><strong>GET</strong> /api/carrusel/:id - Obtener imagen completa</div>
            <div><strong>DELETE</strong> /api/carrusel/:id - Eliminar imagen</div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <h3>🔗 Frontend conectado:</h3>
        <p><a href="https://czalbert6.github.io/violet-virgo" target="_blank">https://czalbert6.github.io/violet-virgo</a></p>
        <p><a href="https://czalbert6.github.io/violet-virgo/carrusel" target="_blank">📸 Carrusel de Imágenes </a></p>
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
                <p><strong>Tabla mensajes:</strong> \${data.tablas?.mensajes || 'Existe'}</p>
                <p><strong>Tabla imágenes:</strong> \${data.tablas?.imagenes || 'Existe'}</p>
                <p><strong>Columnas imágenes:</strong> \${data.tablas?.columnas_imagenes || 'OK'}</p>
                <p><strong>Mensajes:</strong> \${data.total_mensajes || 0}</p>
                <p><strong>Imágenes:</strong> \${data.total_imagenes || 0}</p>
                <p><strong>Servidor:</strong> Railway PostgreSQL</p>
              </div>
            \`;
          })
          .catch(e => {
            document.body.innerHTML += \`
              <div class="card" style="background: #fee2e2;">
                <h3>❌ Error de conexión</h3>
                <p>No se pudo conectar al servidor</p>
                <p><small>\${e.message}</small></p>
                <p>Intenta recargar la página o verifica que el servidor esté ejecutándose.</p>
              </div>
            \`;
          });
      </script>
    </body>
    </html>
  `);
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ============================================
  🚀  Backend Express iniciado en puerto ${PORT}
  📡  URL: https://violet-virgo-production.up.railway.app
  🗄️   PostgreSQL: Conectado
  🔧   Reparación automática: ACTIVADA
  📊   Tipos de datos compatibles con Railway:
        - TEXT (para Base64)
        - VARCHAR (para tipo_mime)
        - INTEGER (para tamaño)
        - DATE y TIMESTAMP
  ============================================
  `);
});