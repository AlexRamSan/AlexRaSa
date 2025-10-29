// /api/list-posts.js — lista posts desde GitHub (repo privado OK)
const { GITHUB_TOKEN, GITHUB_REPO_FULLNAME, GITHUB_DEFAULT_BRANCH } = process.env;
const GH = "https://api.github.com";

export default async function handler(req, res) {
  try {
    assertEnv();

    // lista /blog
    const listURL = `${GH}/repos/${GITHUB_REPO_FULLNAME}/contents/blog?ref=${encodeURIComponent(GITHUB_DEFAULT_BRANCH)}`;
    const listRes = await fetch(listURL, { headers: ghHeaders() });
    if (!listRes.ok) return res.status(500).json({ error: `GitHub list failed: ${listRes.status}` });
    let files = await listRes.json();

    // solo .html y excluye index
    files = files.filter(f => f.type === "file" && /\.html?$/i.test(f.name) && !/^index\.html?$/i.test(f.name));

    // lee cada archivo con Contents API
    const items = await Promise.all(files.map(readFile));

    // orden por fecha desc
    items.sort((a,b) => (Date.parse(b.date||0) - Date.parse(a.date||0)) || a.slug.localeCompare(b.slug));

    res.setHeader("Cache-Control","no-store");
    res.status(200).json({ ok:true, items });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

async function readFile(f){
  const url = `${GH}/repos/${GITHUB_REPO_FULLNAME}/contents/${encodeURIComponent(f.path)}?ref=${encodeURIComponent(GITHUB_DEFAULT_BRANCH)}`;
  const r = await fetch(url, { headers: ghHeaders() });
  if (!r.ok) throw new Error(`read ${f.path} -> ${r.status}`);
  const j = await r.json();
  const txt = Buffer.from(j.content || "", "base64").toString("utf8");

  const m = txt.match(/^(\ufeff|\s*<!--\s*)?---\s*([\s\S]*?)\s*---(\s*-->)?/); // soporta <!-- -->
  const fm = {};
  if (m) {
    (m[2]||"").split(/\r?\n/).forEach(line => {
      const i = line.indexOf(":"); if (i === -1) return;
      const k = line.slice(0,i).trim();
      const v = line.slice(i+1).trim().replace(/^"|"$/g,"");
      if (k) fm[k] = v;
    });
  }
  const slug = fm.slug || f.name.replace(/\.html?$/i,"");
  return {
    name: f.name,
    path: f.path,
    slug,
    url: `/blog/${slug}.html`,
    title: fm.title || slug,
    description: fm.description || "",
    date: fm.date || "",
    image: fm.image && fm.image.trim() ? fm.image : "/og-image.png"
  };
}

function ghHeaders(){ return {"Authorization":`Bearer ${GITHUB_TOKEN}`,"Accept":"application/vnd.github+json","User-Agent":"alexrasa-blog"}; }
function assertEnv(){ const miss=["GITHUB_TOKEN","GITHUB_REPO_FULLNAME","GITHUB_DEFAULT_BRANCH"].filter(k=>!process.env[k]); if(miss.length) throw new Error("Missing env vars: "+miss.join(", ")); }
