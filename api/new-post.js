// /api/new-post.js  (Vercel)
// Requiere las envs en Vercel: GITHUB_TOKEN, GITHUB_REPO=AlexRamSan/AlexRaSa, GITHUB_BRANCH=main, ADMIN_KEY

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // --- body JSON robusto (Node puro en Vercel) ---
    const raw = await readRaw(req);
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }

    const auth = req.headers.authorization || '';
    const adminKey = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const { title, description, image, body, date } = payload;
    if (!title || !description || !body) {
      return res.status(400).json({ ok: false, error: 'Missing fields' });
    }

    const slug = slugify(title);
    const ymd = date || new Date().toISOString().slice(0,10);

    const front = [
      '---',
      `title: "${escapeYaml(title)}"`,
      `description: "${escapeYaml(description)}"`,
      image ? `image: "${image}"` : null,
      `date: ${ymd}`,
      '---'
    ].filter(Boolean).join('\n');

    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | Blog — AlexRaSa</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="https://alexrasa.store/blog/posts/${slug}.html">
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="bg-gray-50 text-gray-900">
<main class="max-w-3xl mx-auto px-6 py-10"><article class="prose max-w-none">
${front}
${body}
</article></main>
</body></html>`;

    // --- Commit a GitHub ---
    const token  = process.env.GITHUB_TOKEN;
    const repo   = process.env.GITHUB_REPO;    // AlexRamSan/AlexRaSa
    const branch = process.env.GITHUB_BRANCH || 'main';
    const path   = `blog/posts/${slug}.html`;

    const api = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
    const ghResp = await fetch(api, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'alexrasa-store-bot'
      },
      body: JSON.stringify({
        message: `chore(blog): create ${slug}.html`,
        content: Buffer.from(html, 'utf8').toString('base64'),
        branch,
        committer: { name: 'Blog Bot', email: 'bot@alexrasa.store' }
      })
    });

    const ghText = await ghResp.text();
    if (!ghResp.ok) {
      return res.status(ghResp.status).json({ ok: false, error: 'GitHub commit failed', gh: ghText });
    }

    return res.status(201).json({ ok: true, slug, url: `/blog/posts/${slug}.html` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Server error', detail: String(err) });
  }
}

// ---- helpers ----
async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function slugify(s='') {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,80);
}
function escapeYaml(s=''){ return s.replace(/"/g,'\\"'); }
function escapeHtml(s=''){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
