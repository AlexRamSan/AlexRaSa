# Guía rápida para implementar los cambios recientes

Esta guía explica cómo poner en producción las correcciones de enlaces, assets y manifiesto PWA realizadas en el repositorio.

## 1. Actualizar el proyecto en tu hosting
- Asegúrate de desplegar **todo el contenido del repositorio** en la raíz del servidor (incluye `site.webmanifest`, íconos PWA y los HTML actualizados).
- Si usas un CDN o caché, limpia/invalida la caché después de subir los archivos para que las rutas actualizadas se sirvan de inmediato.

## 2. Mantener los assets del PWA en la raíz
- Sube los íconos `android-chrome-192x192.png` y `android-chrome-512x512.png` junto con `site.webmanifest` al directorio raíz del sitio. Estas rutas son las que referencia el manifiesto y las páginas HTML (`/android-chrome-192x192.png`, `/android-chrome-512x512.png`, `/site.webmanifest`).
- Si tu hosting obliga a servir los archivos estáticos desde una carpeta (por ejemplo, `/public`), ajusta la configuración del servidor para que esas rutas apunten a los archivos reales sin cambiar sus nombres o ubicaciones.

## 3. Respetar las rutas en minúsculas
- Las páginas de Lantek y Logopress quedaron normalizadas en minúsculas (`/lantek/` y `/logopress/`). Comprueba que tu servidor mantenga esas rutas tal cual; evita redirecciones que cambien mayúsculas/minúsculas para prevenir errores 404 en sistemas sensibles a mayúsculas.

## 4. Verificar imágenes y CTAs corregidos
- Se reemplazaron referencias a imágenes y llamadas a la acción con rutas válidas existentes en el proyecto. Al desplegar, revisa que los assets mencionados en `assets/` y `resources/` se suban completos y con los mismos nombres.
- Si algún proveedor de hosting elimina archivos “huérfanos”, confirma que los PNG/JPG referenciados en las páginas 3D Systems, Artec y blog estén presentes para evitar imágenes rotas.

## 5. Comprobar enlaces locales antes de publicar
- Ejecuta el verificador de enlaces para confirmar que no falten archivos después del despliegue:

  ```bash
  python scripts/check_links.py
  ```

  El script recorre todos los HTML y reporta cualquier `href` o `src` local que no exista. Si ves la salida `No missing local links detected.`, estás listo para publicar.

## 6. Checklist final de publicación
- [ ] Subiste `site.webmanifest` y los íconos PWA a la raíz del dominio.
- [ ] Confirmaste que las rutas `/lantek/` y `/logopress/` se sirven en minúsculas.
- [ ] Todas las imágenes y CTAs de 3D Systems, Artec y el blog cargan correctamente.
- [ ] `python scripts/check_links.py` no muestra referencias faltantes.
- [ ] Refrescaste la caché del CDN/hosting.

Siguiendo estos pasos, las correcciones quedarán disponibles en producción sin enlaces rotos ni assets faltantes.
