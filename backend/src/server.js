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

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Backend Bodega Pedernales JEJ corriendo en puerto ${PORT} — DB: PostgreSQL (Aiven)`);
    });
  } catch (e) {
    console.error('Error al iniciar servidor:', e);
    process.exit(1);
  }
}
startServer();

module.exports = app;
