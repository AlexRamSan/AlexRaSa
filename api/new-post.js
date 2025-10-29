// File: api/new-post.js
// Runtime: Vercel serverless (Node 18+)

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    // 1) Verifica que venga el token de Netlify Identity
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: 'Missing Identity token' });
    }

    // 2) Valida el token contra tu sitio de Netlify Identity
    const identityURL = 'https://alexrasa.netlify.app/.netlify/identity/user';
    const identResp = await fetch(identityURL, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!identResp.ok) {
      return res.status(401).json({ ok: false, error: 'Invalid Identity token' });
    }

    const user = await identResp.json();
    const email = (user && user.email) || '';
    const allowList = (process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    if (!allowList.includes(email.toLowerCase())) {
      return res.status(403).json({ ok: false, error: 'User not allowed' });
    }

    // 3) Lee el payload
    const { title, description, image, body, date } = await req.json?.() || await (async () => await req.body ? JSON.parse(req.body) : {})();

    if (!title || !body) {
      return res.status(400).json({ ok: false, error: 'title and body are required' });
    }

    // 4) Genera slug y contenido con front-matter
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

    const fm = [
      '---',
      `title: "${escapeYAML(title)}"`,
      `description: "${escapeYAML(description || '')}"`,
      `image: "${(image || '').replace(/"/g, '\\"')}"`,
      `date: "${isoDate}"`,
      '---',
      '',
      body
    ].join('\n');

    // 5) Commit al repo vía GitHub API
    const repo = process.env.GITHUB_REPO || 'AlexRamSan/AlexRaSa';
    const tokenGH = process.env.GITHUB_TOKEN; // repo scope

    if (!tokenGH) {
      return res.status(500).json({ ok: false, error: 'Missing GITHUB_TOKEN env var' });
    }

    const path = `blog/posts/${slug}.html`;
    const putURL = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`;
    const contentB64 = Buffer.from(fm, 'utf8').toString('base64');

    // Evita sobrescribir si existe: consulta primero
    const headResp = await fetch(putURL, { headers: { Authorization: `Bearer ${tokenGH}`, 'User-Agent': 'vercel-fn' } });
    if (headResp.ok) {
      return res.status(409).json({ ok: false, error: 'Post already exists (slug conflict). Change the title.' });
    }

    const commitResp = await fetch(putURL, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokenGH}`,
        'User-Agent': 'vercel-fn',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `chore(blog): create post ${slug}.html`,
        content: contentB64,
        branch: process.env.GITHUB_BRANCH || 'main',
        committer: {
          name: 'Blog Bot',
          email: 'bot@alexrasa.store'
        }
      })
    });

    if (!commitResp.ok) {
      const txt = await commitResp.text();
      return res.status(500).json({ ok: false, error: 'GitHub commit failed', detail: txt });
    }

    return res.status(201).json({ ok: true, slug, path, url: `/blog/posts/${slug}.html` });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// Util: escapar comillas/line breaks en YAML simple
function escapeYAML(s = '') {
  return String(s).replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}
