// /api/new-post.js
import fs from 'node:fs';
import path from 'node:path';

const {
  ADMIN_KEY,
  GITHUB_TOKEN,
  GITHUB_REPO_FULLNAME,   // ej: "AlexRaSa/alexrasa.store"
  GITHUB_DEFAULT_BRANCH,  // ej: "main"
  SITE_BASE_URL           // ej: "https://alexrasa.store"
} = process.env;

const GH_API = 'https://api.github.com';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Seguridad simple por header
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (!ADMIN_KEY || token !== ADMIN_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!GITHUB_TOKEN || !GITHUB_REPO_FULLNAME || !GITHUB_DEFAULT_BRANCH) {
      return res.status(500).json({ error: 'Missing env vars' });
    }

    const body = await readJson(req);
    // Campos esperados desde /admin/new-post.html
    let {
      title = '',
      description = '',
      image = '',
      heroImage = '',
      date = '',
      author = 'Miguel Ramírez',
      slug = '',
      content = ''
    } = body || {};

    // Saneos
    title = String(title).trim();
    description = String(description || '').trim();
    author = String(author || 'Miguel Ramírez').trim();
    slug = slugify(slug || title);
    if (!date) date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const ogImage = image || heroImage || '/og-image.png';

    // Carga template del repo: /_templates/post-template.html
    const templatePath = path.join(process.cwd(), '_templates', 'post-template.html');
    let template;
    try {
      template = fs.readFileSync(templatePath, 'utf8');
    } catch {
      // Fallback: mini template embebido por si olvidas el archivo
      template = fallbackTemplate();
    }

    const heroBlock = heroImage
      ? `<img src="${heroImage}" alt="${escapeHtml(title)}" class="w-full aspect-[16/9] object-cover rounded-xl mb-6">`
      : '';

    const pageHtml =
      `---\n` +
      `title: "${escapeYaml(title)}"\n` +
      `description: "${escapeYaml(description)}"\n` +
      `image: "${escapeYaml(ogImage)}"\n` +
      `date: "${escapeYaml(date)}"\n` +
      `author: "${escapeYaml(author)}"\n` +
      `slug: "${escapeYaml(slug)}"\n` +
      `---\n` +
      template
        .replaceAll('{{title}}', escapeHtml(title))
        .replaceAll('{{description}}', escapeHtml(description))
        .replaceAll('{{image}}', escapeHtml(ogImage))
        .replaceAll('{{date}}', escapeHtml(date))
        .replaceAll('{{author}}', escapeHtml(author))
        .replaceAll('{{slug}}', escapeHtml(slug))
        .replace('{{hero}}', heroBlock)
        .replace('{{content}}', content); // el contenido ya es HTML

    const filePath = `blog/${slug}.html`;
    const commitMessage = `chore(blog): add ${slug}.html`;

    // Crea o actualiza archivo en GitHub
    const putResp = await githubPutFile({
      ownerRepo: GITHUB_REPO_FULLNAME,
      branch: GITHUB_DEFAULT_BRANCH,
      path: filePath,
      content: pageHtml,
      message: commitMessage,
      token: GITHUB_TOKEN
    });

    const url = `${SITE_BASE_URL?.replace(/\/$/, '')}/blog/${slug}.html`;
    return res.status(200).json({ ok: true, path: filePath, url, github: putResp });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

/* -------------------- helpers -------------------- */

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return {}; }
}

function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&nbsp;&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}
function escapeYaml(s) {
  // Comillas ya puestas; solo escapamos comillas internas
  return String(s).replace(/"/g, '\\"');
}

async function githubPutFile({ ownerRepo, branch, path, content, message, token }) {
  // Verifica si existe para incluir sha en update
  const getUrl = `${GH_API}/repos/${ownerRepo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  let sha = undefined;
  {
    const r = await fetch(getUrl, { headers: ghHeaders(token) });
    if (r.ok) {
      const j = await r.json();
      sha = j.sha;
    }
  }

  const putUrl = `${GH_API}/repos/${ownerRepo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
    committer: { name: 'AlexRaSa Bot', email: 'noreply@alexrasa.store' },
    ...(sha ? { sha } : {})
  };

  const r = await fetch(putUrl, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(()=>'');
    throw new Error(`GitHub PUT failed: ${r.status} ${t}`);
  }
  return r.json();
}

function ghHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'alexrasa-blog'
  };
}

function fallbackTemplate() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{{title}} — Blog | AlexRaSa</title>
  <meta name="description" content="{{description}}">
  <link rel="canonical" href="https://alexrasa.store/blog/{{slug}}.html" />
  <meta property="og:title" content="{{title}} — AlexRaSa" />
  <meta property="og:description" content="{{description}}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://alexrasa.store/blog/{{slug}}.html" />
  <meta property="og:image" content="{{image}}" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/assets/site.css">
  <style>
    .prose {max-width: 72ch}
    .prose :where(h1,h2,h3,h4){font-weight:700;color:#0f172a;margin:1.5rem 0 .75rem}
    .prose h1{font-size:2rem} .prose h2{font-size:1.5rem} .prose h3{font-size:1.25rem}
    .prose p{margin:.9rem 0;line-height:1.75;color:#334155}
    .prose a{color:#0ea5e9;text-decoration:underline}
    .prose img{border-radius:1rem;display:block;margin:1rem 0}
    .prose ul{list-style:disc;padding-left:1.25rem;margin:.75rem 0}
    .prose ol{list-style:decimal;padding-left:1.25rem;margin:.75rem 0}
    .prose blockquote{border-left:4px solid #e2e8f0;padding-left:1rem;color:#475569;margin:1rem 0}
    .prose code{background:#f1f5f9;padding:.15rem .35rem;border-radius:.375rem}
    .prose pre{background:#0b1220;color:#e2e8f0;padding:1rem;border-radius:.75rem;overflow:auto}
    .container{max-width:72rem}
  </style>
</head>
<body class="bg-slate-50 text-slate-900 antialiased">
  <header class="bg-slate-900 text-white">
    <div class="container mx-auto px-6 py-5 flex items-center justify-between">
      <a href="/" class="font-semibold">AlexRaSa</a>
      <nav class="flex gap-4 text-sm">
        <a href="/SolidCAM/" class="hover:underline">SolidCAM</a>
        <a href="/lantek/" class="hover:underline">Lantek</a>
        <a href="/logopress/" class="hover:underline">Logopress</a>
        <a href="/3dsystems/" class="hover:underline">3D Systems</a>
        <a href="/blog/" class="font-semibold underline">Blog</a>
      </nav>
    </div>
  </header>

  <main class="container mx-auto px-6 py-10">
    <article class="prose mx-auto">
      <p class="text-xs text-slate-500">{{date}} · por {{author}}</p>
      <h1 class="mb-2">{{title}}</h1>
      <p class="text-slate-600 mb-6">{{description}}</p>
      {{hero}}
      {{content}}
    </article>
    <hr class="my-12 border-slate-200">
  </main>

  <footer class="bg-slate-100">
    <div class="container mx-auto px-6 py-10 text-sm text-slate-600">
      © <span id="y"></span> AlexRaSa. Ingeniería y soluciones para manufactura.
    </div>
  </footer>
  <script>document.getElementById('y').textContent = new Date().getFullYear();</script>
</body>
</html>`;
}
