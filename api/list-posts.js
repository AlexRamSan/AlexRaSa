// /api/list-posts.js
const { GITHUB_TOKEN, GITHUB_REPO_FULLNAME, GITHUB_DEFAULT_BRANCH } = process.env;
const GH = "https://api.github.com";

export default async function handler(req, res) {
  try {
    if (!GITHUB_TOKEN || !GITHUB_REPO_FULLNAME || !GITHUB_DEFAULT_BRANCH) {
      return res.status(500).json({ error: "Missing env vars" });
    }
    // lista el folder /blog
    const url = `${GH}/repos/${GITHUB_REPO_FULLNAME}/contents/blog?ref=${encodeURIComponent(GITHUB_DEFAULT_BRANCH)}`;
    const r = await fetch(url, { headers: ghHeaders() });
    if (!r.ok) return res.status(500).json({ error: `GitHub list failed: ${r.status}` });
    const files = (await r.json()).filter(f => f.type === "file" && /\.html?$/i.test(f.name));

    // lee y parsea front-matter comentado de cada archivo
    const items = await Promise.all(files.map(async f => {
      const rf = await fetch(f.download_url, { headers: ghHeaders() });
      const txt = await rf.text();
      const m = txt.match(/^(\s*<!--\s*)?---\s*([\s\S]*?)\s*---(\s*-->)?/);
      const fm = {};
      if (m) {
        m[2].split(/\r?\n/).forEach(line => {
          const i = line.indexOf(":"); if (i === -1) return;
          const k = line.slice(0,i).trim();
          const v = line.slice(i+1).trim().replace(/^"|"$/g,"");
          if (k) fm[k] = v;
        });
      }
      return {
        name: f.name,
        path: f.path,
        title: fm.title || f.name.replace(/\.html?$/,""),
        description: fm.description || "",
        date: fm.date || "",
        image: fm.image || "/og-image.png",
        slug: fm.slug || f.name.replace(/\.html?$/,"")
      };
    }));

    // ordena por fecha desc y responde
    items.sort((a,b)=> (Date.parse(b.date||0)-Date.parse(a.date||0)) || a.name.localeCompare(b.name));
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ ok:true, items });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message||e) });
  }

  function ghHeaders(){
    return {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "alexrasa-blog"
    };
  }
}
