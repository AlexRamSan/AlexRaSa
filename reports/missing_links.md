# Reporte de enlaces y recursos faltantes

Resultado del escaneo con `scripts/check_links.py`. Cada sección indica la página afectada, los enlaces o recursos faltantes y sugerencias para corregirlos.

**Estado actualizado:** después de aplicar los ajustes en rutas, assets e íconos PWA, el verificador ya no reporta enlaces locales faltantes.

## 3dsystems/index.html
- `/Lantek/`
- `/Logopress/`
- `/assets/3dsystems/video-1.jpg`

**Cómo arreglar:**
- Verifica si las rutas correctas usan minúsculas (`/lantek/`, `/logopress/`) y actualiza los `href`.
- Si el video existe en otra carpeta, ajusta la ruta o mueve el archivo a `assets/3dsystems/video-1.jpg`.

## _templates/post-template.html
- `/site.webmanifest`

**Cómo arreglar:**
- Añade el manifiesto en la raíz del sitio o actualiza la ruta al manifiesto existente (por ejemplo, `/pwa/site.webmanifest`).

## admin/new-post.html
- `${data.url}`

**Cómo arreglar:**
- Reemplaza el placeholder `${data.url}` por una URL real o elimina el enlace si no se usa en producción.

## artec/index.html
- `/Logopress/`
- `/assets/artec/artec-logo.svg`
- `/assets/artec/poster-artec-workflow.jpg`
- `/assets/artec/poster-escritorio.jpg`
- `/assets/artec/poster-largo.jpg`
- `/assets/artec/poster-portatil.jpg`

**Cómo arreglar:**
- Comprueba mayúsculas/minúsculas en las rutas a Logopress.
- Reubica las imágenes mencionadas dentro de `assets/artec/` o corrige las rutas a donde estén almacenadas actualmente.

## Entradas de blog (`blog/*.html`)
Todas las entradas listadas referencian `/site.webmanifest` y algunos enlaces internos sin URL:
- `/site.webmanifest` (todas las entradas)
- `Dame tus datos para una reunion técnica` (solo `bienvenidos-al-blog-de-alexrasa.html`)
- `Mándame un WhatsApp` (solo `bienvenidos-al-blog-de-alexrasa.html`)
- `Reserva una visita o videollamada` (solo `bienvenidos-al-blog-de-alexrasa.html`)

**Cómo arreglar:**
- Añade el manifiesto en la raíz o corrige la ruta en las meta-etiquetas link.
- Para los enlaces de texto, coloca URLs válidas (por ejemplo, a formularios o enlaces de WhatsApp) o elimina los `href` vacíos.

## glosario.html
- `${safeUrl}`

**Cómo arreglar:**
- Sustituye `${safeUrl}` por la ruta real deseada o elimina el placeholder.

## index.html
- `/assets/logos/lantek-blue.png`
- `/site.webmanifest`

**Cómo arreglar:**
- Confirma que el logo exista en `assets/logos/` o actualiza la ruta/nombre de archivo correcto.
- Coloca el manifiesto en la raíz o apunta al existente.

## lantek/index.html
- `/Lantek/`

**Cómo arreglar:**
- Ajusta la ruta a minúsculas si corresponde (`/lantek/`) o crea el directorio con la mayúscula indicada.

## logopress/index.html
- `/Lantek/`
- `/Logopress/`
- `/assets/logos/logopress-white.svg`

**Cómo arreglar:**
- Normaliza las rutas con el caso correcto (probablemente `/lantek/` y `/logopress/`).
- Asegúrate de que el logo blanco esté disponible en `assets/logos/` o corrige su nombre.

## proyectos/calculadoras/lantek/index.html
- `/proyectos/calculadoras/lantek/icons/icon-192.png`
- `/proyectos/calculadoras/lantek/icons/icon-256.png`

**Cómo arreglar:**
- Añade los iconos PWA en la carpeta `proyectos/calculadoras/lantek/icons/` o corrige las rutas en el `<link rel="icon">`.

## proyectos/calculadoras/solidcam/index.html
- `/proyectos/calculadoras/solidcam/icons/icon-192.png`
- `/proyectos/calculadoras/solidcam/icons/icon-256.png`

**Cómo arreglar:**
- Agrega los iconos faltantes en `proyectos/calculadoras/solidcam/icons/` o actualiza las rutas.

## proyectos/herramientas/index.html
- `icons/icon-192.png`

**Cómo arreglar:**
- Ubica los iconos dentro de `proyectos/herramientas/icons/` o ajusta la ruta relativa desde la página.

## recursos/*.html
Las páginas `auditoria-cam.html`, `checklist-arranque-seguro.html` y `guia-imachining.html` referencian `/site.webmanifest`.

**Cómo arreglar:**
- Añade el manifiesto en la raíz o actualiza los `href` al manifiesto correcto.
