// File: api/new-post.js  (Vercel serverless)
// Node 18+
// Crea blog/posts/slug.html con front-matter y lo commitea al repo por GitHub API

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    // 1) Autenticación simple por clave compartida
    const adminKeyHeader = req.headers.authorization || '';
    const adminKey = adminKeyHeader.startsWith('Bearer ') ? adminKeyHeader.slice(7) : null;

    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // 2) Payload
    const { title, description, image, body, date } = await readJson(req);
    if (!title || !body) {
      return res.status(400).json({ ok: false, error: 'title and body are required' });
    }

    // 3) Slug + fecha
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const isoDate = date || `${yyyy}-${mm}-${dd}`;

    const slug = title
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const content = [
      '---',
      `title: "${escapeYAML(title)}"`,
      `description: "${escapeYAML(description || '')}"`,
      `image: "${(image || '').replace(/"/g, '\\"')}"`,
      `date: "${isoDate}"`,
      '---',
      '',
      body
    ].join('\n');

    // 4) GitHub
    const repo   = process.env.GITHUB_REPO   || 'AlexRamSan/AlexRaSa';
    const branch = process.env.GITHUB_BRANCH || 'main';
    const token  = process.env.GITHUB_TOKEN; // PAT de GitHub con acceso al repo
    if (!token) return res.status(500).json({ ok: false, error: 'Missing GITHUB_TOKEN' });

    const path = `blog/posts/${slug}.html`;
    const api  = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;

    // Evitar sobreescritura si ya existe
    const head = await fetch(api, { headers: ghHeaders(token) });
    if (head.ok) {
      return res.status(409).json({ ok: false, error: 'Post already exists (slug conflict). Change the title.' });
    }

    const commit = await fetch(api, {
      method: 'PUT',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore(blog): create ${slug}.html`,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
        committer: { name: 'Blog Bot', email: 'bot@alexrasa.store' }
      })
    });

    if (!commit.ok) {
      const txt = await commit.text();
      return res.status(500).json({ ok: false, error: 'GitHub commit failed', detail: txt });
    }

    return res.status(201).json({ ok: true, slug, url: `/blog/posts/${slug}.html` });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

function ghHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'User-Agent': 'alexrasa-blog-fn' };
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function escapeYAML(s = '') {
  return String(s).replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}
