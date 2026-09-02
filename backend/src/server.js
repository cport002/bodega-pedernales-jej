require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { initDatabase } = require('./database/init');
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const proveedoresRoutes = require('./routes/proveedores');
const materialesRoutes = require('./routes/materiales');
const recepcionesRoutes = require('./routes/recepciones');
const lotesRoutes = require('./routes/lotes');
const despachosRoutes = require('./routes/despachos');
const devolucionesRoutes = require('./routes/devoluciones');
const inventariosRoutes = require('./routes/inventarios');
const reportesRoutes = require('./routes/reportes');
const solicitudesRoutes = require('./routes/solicitudes');
const notificacionesRoutes = require('./routes/notificaciones');

const app = express();
const PORT = process.env.PORT || 3007;
app.set('trust proxy', 1);

const ALLOWED_ORIGINS = [
  'http://localhost:5210', 'http://127.0.0.1:5210',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (origin.endsWith('.onrender.com')) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Demasiados intentos, espere 15 minutos' });
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/materiales', materialesRoutes);
app.use('/api/recepciones', recepcionesRoutes);
app.use('/api/lotes', lotesRoutes);
app.use('/api/despachos', despachosRoutes);
app.use('/api/devoluciones', devolucionesRoutes);
app.use('/api/inventarios', inventariosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/solicitudes', solicitudesRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));

// Aiven (plan gratis) apaga la base de datos por inactividad. Si el backend arranca justo en ese
// momento, la primera conexión falla — sin reintento, el proceso se caía entero y quedaba abajo
// (502/503 en Render) hasta el próximo deploy manual. Se reintenta con espera creciente.
async function startServer() {
  const maxIntentos = 6;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      await initDatabase();
      break;
    } catch (e) {
      if (intento === maxIntentos) {
        console.error(`No se pudo conectar a la base de datos tras ${maxIntentos} intentos:`, e.message);
        process.exit(1);
      }
      const esperaMs = intento * 5000;
      console.warn(`Intento ${intento}/${maxIntentos} de conexión a la BD falló (${e.message}). Reintentando en ${esperaMs / 1000}s...`);
      await new Promise(r => setTimeout(r, esperaMs));
    }
  }
  app.listen(PORT, () => {
    console.log(`Backend Bodega Pedernales JEJ corriendo en puerto ${PORT} — DB: PostgreSQL (Aiven)`);
  });
}
startServer();

module.exports = app;
