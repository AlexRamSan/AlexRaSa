// /api/new-post.js
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

    // auth simple
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!ADMIN_KEY || token !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

    const missing = requiredMissing([
      "ADMIN_KEY","GITHUB_TOKEN","GITHUB_REPO_FULLNAME","GITHUB_DEFAULT_BRANCH","SITE_BASE_URL"
    ]);
    if (missing.length) return res.status(500).json({ error: `Missing env vars: ${missing.join(", ")}` });

    const body = await readJson(req);
    let {
      title = "",
      description = "",
      image = "",
      heroImage = "",
      date = "",
      author = "Miguel Ramírez",
      slug = "",
      content = ""
    } = body || {};

    title = String(title).trim();
    description = String(description).trim();
    author = String(author).trim() || "Miguel Ramírez";
    slug = slugify(slug || title);
    if (!date) date = new Date().toISOString().slice(0,10);
    const ogImage = image || heroImage || "/og-image.png";

    // lee template
    const templatePath = path.join(process.cwd(), "_templates", "post-template.html");
    let template;
    try { template = fs.readFileSync(templatePath, "utf8"); }
    catch { template = fallbackTemplate(); }

    const heroBlock = heroImage
      ? `<img src="${escapeHtml(heroImage)}" alt="${escapeHtml(title)}" class="w-full rounded-xl mt-4">`
      : "";

    // Front-matter comentado para no mostrarse en el navegador
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
      .replace("{{content}}", content); // content ya viene en HTML

    const filePath = `blog/${slug}.html`;
    const commitMessage = `chore(blog): add ${slug}.html`;

    const putResp = await githubPutFile({
      ownerRepo: GITHUB_REPO_FULLNAME,
      branch: GITHUB_DEFAULT_BRANCH,
      path: filePath,
      content: pageHtml,
      message: commitMessage,
      token: GITHUB_TOKEN
    });

    const url = `${SITE_BASE_URL.replace(/\/$/,"")}/blog/${slug}.html`;
    return res.status(200).json({ ok: true, path: filePath, url, github: putResp });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

/* ---------------- helpers ---------------- */

async function readJson(req){
  const chunks=[]; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return {}; }
}

function requiredMissing(keys){ return keys.filter(k => !process.env[k]); }

function slugify(s){
  return String(s||"")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"").slice(0,80) || "post";
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function escapeYaml(s){ return String(s).replace(/"/g,'\\"'); }

async function githubPutFile({ ownerRepo, branch, path, content, message, token }){
  // busca sha si existe
  let sha;
  {
    const r = await fetch(`${GH_API}/repos/${ownerRepo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders(token) });
    if (r.ok) sha = (await r.json()).sha;
  }

  const r = await fetch(`${GH_API}/repos/${ownerRepo}/contents/${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { ...ghHeaders(token), "Content-Type":"application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content,"utf8").toString("base64"),
      branch,
      committer: { name:"AlexRaSa Bot", email:"noreply@alexrasa.store" },
      ...(sha ? { sha } : {})
    })
  });
  if (!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`GitHub PUT failed: ${r.status} ${t}`);
  }
  return r.json();
}

function ghHeaders(token){
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "alexrasa-blog"
  };
}

function fallbackTemplate(){
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{title}} — Blog | AlexRaSa</title>
  <meta name="description" content="{{description}}" />
  <meta name="theme-color" content="#0F172A" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="https://alexrasa.store/blog/{{slug}}.html" />
  <link rel="alternate" hreflang="es-MX" href="https://alexrasa.store/blog/{{slug}}.html" />
  <link rel="alternate" hreflang="es" href="https://alexrasa.store/blog/{{slug}}.html" />
  <link rel="alternate" hreflang="x-default" href="https://alexrasa.store/blog/{{slug}}.html" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta property="og:title" content="{{title}} — Ingeniería y soluciones para manufactura" />
  <meta property="og:description" content="{{description}}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://alexrasa.store/blog/{{slug}}.html" />
  <meta property="og:image" content="https://alexrasa.store/og/og-image.png" />
  <meta property="og:site_name" content="AlexRaSa" />
  <meta property="og:locale" content="es_MX" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://cdn.tailwindcss.com" crossorigin />
  <link rel="preload" as="image" href="/assets/hero-industrial.png" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html{scroll-behavior:smooth}
    .reveal{opacity:0;transform:translateY(16px);transition:opacity .6s,transform .6s}
    .reveal.show{opacity:1;transform:none}
    .safe-top{padding-top:env(safe-area-inset-top)}
    .prose{max-width:72ch}
    .prose :where(h1,h2,h3,h4){font-weight:800;color:#0f172a;margin:1.25rem 0 .5rem}
    .prose h1{font-size:2rem}.prose h2{font-size:1.5rem}.prose h3{font-size:1.25rem}
    .prose p{margin:.9rem 0;line-height:1.75;color:#334155}
    .prose a{color:#2563eb;text-decoration:underline}
    .prose img{border-radius:1rem;display:block;margin:1rem 0}
    .prose ul{list-style:disc;padding-left:1.25rem}.prose ol{list-style:decimal;padding-left:1.25rem}
    .prose blockquote{border-left:4px solid #e2e8f0;padding-left:1rem;color:#475569;margin:1rem 0}
    .prose code{background:#f1f5f9;padding:.15rem .35rem;border-radius:.375rem}
    .prose pre{background:#0b1220;color:#e2e8f0;padding:1rem;border-radius:.75rem;overflow:auto}
  </style>
  <!-- GA4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-GDQ8NN6T6Q"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
  gtag('js', new Date()); gtag('config','G-GDQ8NN6T6Q');</script>
</head>
<body class="bg-gray-50 text-gray-800 antialiased">
  <header id="siteHeader" class="safe-top sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
    <div class="max-w-6xl mx-auto px-4">
      <div class="h-16 flex items-center justify-between gap-3">
        <a href="/#inicio" class="flex items-center gap-2" aria-label="Inicio">
          <img src="/assets/logo.png" class="h-10 w-auto" alt="AlexRaSa" />
          <span class="hidden sm:inline text-base font-semibold tracking-tight">AlexRaSa<span class="text-blue-600">.store</span></span>
        </a>
        <nav class="hidden lg:flex items-center gap-6 text-sm">
          <a href="/#sobre-mi" class="hover:text-blue-600">Sobre mí</a>
          <a href="/#soluciones" class="hover:text-blue-600">Soluciones</a>
          <a href="/#videos" class="hover:text-blue-600">Videos</a>
          <a href="/#servicios" class="hover:text-blue-600">Servicios</a>
          <a href="/#recursos" class="hover:text-blue-600">Recursos</a>
          <a href="/#agenda" class="hover:text-blue-600">Agenda</a>
          <a href="/#contacto" class="hover:text-blue-600">Contacto</a>
        </nav>
        <div class="hidden md:flex items-center gap-2">
          <a href="/#soporte" class="px-3 py-2 rounded-md border border-gray-300 text-gray-900 hover:bg-gray-100 text-sm">Soporte</a>
          <a href="/#agenda" class="px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Agendar cita</a>
        </div>
      </div>
    </div>
  </header>

  <section class="relative">
    <div class="absolute inset-0 -z-10">
      <div class="absolute inset-0 bg-[url('/assets/hero-industrial.png')] bg-cover bg-center opacity-70"></div>
      <div class="absolute inset-0 bg-slate-900/60"></div>
    </div>
    <div class="max-w-6xl mx-auto px-4 py-10 md:py-14 text-white">
      <p class="text-xs opacity-80"><a href="/blog/" class="underline">Blog</a> · {{date}} · {{author}}</p>
      <h1 class="mt-2 text-3xl md:text-4xl font-extrabold leading-tight">{{title}}</h1>
      <p class="mt-2 text-white/90 max-w-3xl">{{description}}</p>
      {{hero}}
    </div>
  </section>

  <main class="max-w-4xl mx-auto px-4 py-10">
    <article class="prose">
      {{content}}
    </article>
  </main>

  <footer class="bg-gray-100 py-6 border-t border-gray-300 mt-16 text-center pb-24">
    <div class="max-w-6xl mx-auto px-4 flex flex-col items-center gap-3">
      <div class="flex items-center gap-3">
        <img src="/assets/logo.png" alt="AlexRaSa" class="h-8 w-auto" loading="lazy" />
        <p class="text-sm text-gray-600">© <span id="y"></span> AlexRaSa — Ingeniería, innovación y eficiencia.</p>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-700">
        <a href="/SolidCAM/" class="hover:underline">SolidCAM</a><span>·</span>
        <a href="/lantek/" class="hover:underline">Lantek</a><span>·</span>
        <a href="/logopress/" class="hover:underline">Logopress</a><span>·</span>
        <a href="/artec" class="hover:underline">Artec 3D</a><span>·</span>
        <a href="/3dsystems" class="hover:underline">3D Systems</a>
      </div>
      <a href="/#inicio" class="inline-block mt-3 px-5 py-2 bg-blue-600 text-white text-sm rounded-full shadow hover:bg-blue-700 transition">↑ Volver al inicio</a>
    </div>
    <p class="text-[11px] text-gray-400 mt-2 max-w-4xl mx-auto px-4 leading-tight">
      SolidCAM, Lantek, Logopress, Artec y 3D Systems son marcas registradas…
    </p>
  </footer>

  <script>document.getElementById("y").textContent=new Date().getFullYear();</script>
</body>
</html>`;
}
