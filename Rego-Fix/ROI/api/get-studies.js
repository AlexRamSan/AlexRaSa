// Ruta del archivo: api/get-studies.js

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Solo GET.' });
  }

  try {
    // Si estás usando Vercel KV, Redis o una BD externa, aquí retornas los estudios almacenados.
    // Como fallback seguro para el lab de pruebas:
    return res.status(200).json([]);
  } catch (error) {
    console.error("Error al obtener estudios:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}
