// /api/new-post.js  — crea el post + sube portada opcional
import fs from "node:fs";
import path from "node:path";

const {
  ADMIN_KEY,
  GITHUB_TOKEN,
  GITHUB_REPO_FULLNAME,   // ej: "AlexRaSa/alexrasa.store"
  GITHUB_DEFAULT_BRANCH,  // ej: "main"
  SITE_BASE_URL           // ej: "https://alexrasa.store"
} = process.env;

const GH_API = "https://api.github.com";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // auth básica
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!ADMIN_KEY || token !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

    const miss = ["ADMIN_KEY","GITHUB_TOKEN","GITHUB_REPO_FULLNAME","GITHUB_DEFAULT_BRANCH","SITE_BASE_URL"]
      .filter(k => !process.env[k]);
    if (miss.length) return res.status(500).json({ error: "Missing env vars: " + miss.join(", ") });

    const body = await readJson(req);
    let {
      title = "",
      description = "",
      content = "",
      author = "Miguel Ramírez",
      date = "",
      slug = "",
      // imagen por URL o hero
      image = "",
      heroImage = "",
      // imagen subida desde admin
      imageData = "",
      imageExt = "",
      imageName = ""
    } = body || {};

    title = String(title).trim();
    description = String(description).trim();
    author = String(author).trim() || "Miguel Ramírez";
    slug = slugify(slug || title);
    if (!date) date = new Date().toISOString().slice(0,10);

    // 1) Portada: si mandan archivo, súbelo a /assets/blog/{slug}.{ext}
    let coverPath = image || heroImage || "";
    if (imageData && imageExt) {
      const safeExt = imageExt.replace(/[^a-z0-9]/gi,'').toLowerCase() || "jpg";
      const assetPath = `assets/blog/${slug}.${safeExt}`;
      await githubPutFile({
        ownerRepo: GITHUB_REPO_FULLNAME,
        branch: GITHUB_DEFAULT_BRANCH,
        path: assetPath,
        content: imageData, // base64 sin prefijo
        message: `chore(blog): add cover for ${slug} (${imageName||""})`,
        token: GITHUB_TOKEN
      });
      coverPath = `/${assetPath}`;
    }
    const ogImage = coverPath || "/og-image.png";

    // 2) Lee template
    const templatePath = path.join(process.cwd(), "_templates", "post-template.html");
    let template;
    try { template = fs.readFileSync(templatePath, "utf8"); }
    catch { template = fallbackTemplate(); }

    // 3) Hero opcional dentro del hero global
    const heroBlock = heroImage
      ? `<img src="${escapeHtml(heroImage)}" alt="${escapeHtml(title)}" class="w-full rounded-xl mt-4">`
      : "";

    // 4) Front-matter comentado + reemplazos
    const pageHtml =
`<!--
---
title: "${escapeYaml(title)}"
description: "${escapeYaml(description)}"
image: "${escapeYaml(ogImage)}"
date: "${escapeYaml(date)}"
author: "${escapeYaml(author)}"
slug: "${escapeYaml(slug)}"
---
-->
` + template
      .replaceAll("{{title}}", escapeHtml(title))
      .replaceAll("{{description}}", escapeHtml(description))
      .replaceAll("{{image}}", escapeHtml(ogImage))
      .replaceAll("{{date}}", escapeHtml(date))
      .replaceAll("{{author}}", escapeHtml(author))
      .replaceAll("{{slug}}", escapeHtml(slug))
      .replace("{{hero}}", heroBlock)
      .replace("{{content}}", content); // HTML ya listo

    // 5) Escribe el archivo del post
    const postPath = `blog/${slug}.html`; // si sirves desde /public, cambia a "public/blog/..."
    await githubPutFile({
      ownerRepo: GITHUB_REPO_FULLNAME,
      branch: GITHUB_DEFAULT_BRANCH,
      path: postPath,
      content: Buffer.from(pageHtml, "utf8").toString("base64"),
      message: `chore(blog): add ${slug}.html`,
      token: GITHUB_TOKEN
    });

    const url = `${SITE_BASE_URL.replace(/\/$/,"")}/blog/${slug}.html`;
    return res.status(200).json({ ok: true, url, path: postPath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

/* ---------- helpers ---------- */
async function readJson(req){ const b=[]; for await (const c of req) b.push(c); try { return JSON.parse(Buffer.concat(b).toString("utf8")); } catch { return {}; } }
function slugify(s){ return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)||"post"; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function escapeYaml(s){ return String(s).replace(/"/g,'\\"'); }
function ghHeaders(t){ return {"Authorization":`Bearer ${t}`,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"alexrasa-blog"}; }
async function githubPutFile({ ownerRepo, branch, path, content, message, token }){
  // sha si existe
  let sha;
  const get = await fetch(`${GH_API}/repos/${ownerRepo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,{headers:ghHeaders(token)});
  if (get.ok) sha = (await get.json()).sha;
  const r = await fetch(`${GH_API}/repos/${ownerRepo}/contents/${encodeURIComponent(path)}`,{
    method:"PUT", headers:{...ghHeaders(token),"Content-Type":"application/json"},
    body: JSON.stringify({ message, content, branch, ...(sha?{sha}:{}) })
  });
  if (!r.ok) throw new Error(`GitHub PUT failed ${r.status}`);
  return r.json();
}
function fallbackTemplate(){ return `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{{title}} — Blog | AlexRaSa</title>
<meta name="description" content="{{description}}"/>
<link rel="preconnect" href="https://cdn.tailwindcss.com" crossorigin><script src="https://cdn.tailwindcss.com"></script>
<style>.prose{max-width:72ch}.prose p{margin:.9rem 0;line-height:1.75;color:#334155}</style>
</head><body class="bg-gray-50 text-gray-800">
<section class="relative">
  <div class="absolute inset-0 -z-10"><div class="absolute inset-0 bg-[url('/assets/hero-industrial.png')] bg-cover bg-center opacity-70"></div><div class="absolute inset-0 bg-slate-900/60"></div></div>
  <div class="max-w-6xl mx-auto px-4 py-12 text-white">
    <p class="text-xs opacity-80"><a href="/blog/" class="underline">Blog</a> · {{date}} · {{author}}</p>
    <h1 class="text-3xl md:text-4xl font-extrabold">{{title}}</h1>
    <p class="mt-2 text-white/90 max-w-3xl">{{description}}</p>
    {{hero}}
  </div>
</section>
<main class="max-w-4xl mx-auto px-4 py-10">
  <figure class="mb-6" id="postCover" hidden><img id="postCoverImg" class="w-full rounded-xl object-cover" alt=""></figure>
  <article class="prose" id="postBody">{{content}}</article>
</main>
<script>(function(){const s="{{image}}";if(s&&s!=="/og-image.png"){const f=document.getElementById('postCover');const i=document.getElementById('postCoverImg');i.src=s;i.alt="{{title}}";f.hidden=false}
const b=document.getElementById('postBody');const h=b.innerHTML.trim();if(h&&!h.match(/<\/?[a-z][\\s\\S]*>/i)){b.innerHTML='<p>'+b.textContent.trim().replace(/\\n{2,}/g,'</p><p>').replace(/\\n/g,'<br>')+'</p>'}})();</script>
</body></html>`; }
