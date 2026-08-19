const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Una sola storage: elige la carpeta de Cloudinary según el nombre del campo del formulario.
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: file.fieldname === 'firma' ? 'jej-bodega-pedernales-firmas' : 'jej-bodega-pedernales-fotos',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    resource_type: 'image'
  })
});

const MAX_MB = 5;
const upload = multer({ storage, limits: { fileSize: MAX_MB * 1024 * 1024 } });

// multer-storage-cloudinary deja la URL segura de Cloudinary en file.path — no hay nada más que
// transformar acá (a diferencia de la versión local en disco que armaba la ruta /uploads/... a mano).
function urlArchivo(file) {
  return file ? file.path : null;
}

module.exports = { upload, urlArchivo };
