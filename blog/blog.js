(() => {
  const GRID = document.querySelector("#posts-grid");
  const TPL = document.querySelector("#post-card-tpl");
  const EMPTY = document.querySelector("#empty-msg");
  const PLACEHOLDER = "/assets/blog/placeholder.jpg";
  const TS = Date.now(); // evita caché

  // Normaliza rutas de imagen
  const normalizeImage = (img) => {
    if (!img || typeof img !== "string") return PLACEHOLDER;
    const s = img.trim();
    if (!s) return PLACEHOLDER;
    if (s.startsWith("data:")) return s;
    if (s.startsWith("http")) return s;
    if (s.startsWith("/")) return s;
    return `/assets/blog/${s}`;
  };

  // Normaliza URL del post
  const slugify = (t="post") =>
    t.toLowerCase().replace(/[^a-z0-9\-]/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const normalizeUrl = (u, slug) => {
    if (u && (u.startsWith("http") || u.startsWith("/"))) return u;
    const safe = slugify(slug || "post");
    return `/blog/${u || safe}.html`;
  };

  // Carga posts desde JSON o variable global
  async function loadPosts() {
    if (Array.isArray(window.BLOG_POSTS)) return window.BLOG_POSTS;

    const urls = [
      `/blog/posts.json?t=${TS}`,
      `/data/posts.json?t=${TS}`,
      `/posts.json?t=${TS}`
    ];

    for (const url of urls) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) continue;
        const raw = await r.json();
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.posts) ? raw.posts : [];
        if (arr.length) return arr;
      } catch (e) {
        // continúa con la siguiente ruta
      }
    }
    console.warn("Blog: no se encontró posts.json en ninguna ruta.");
    return [];
  }

  // Renderiza cada post
  async function render() {
    const posts = await loadPosts();

    // limpia grid
    GRID.innerHTML = "";
    EMPTY.classList.add("hidden");

    if (!posts.length) {
      EMPTY.classList.remove("hidden");
      return;
    }

    // orden por fecha desc y filtra borradores si existen
    posts
      .filter(p => !p.draft)
      .sort((a,b) => new Date(b.date||0) - new Date(a.date||0))
      .forEach((p) => {
        const node = TPL.content.firstElementChild.cloneNode(true);

        const img   = node.querySelector("[data-post-img]");
        const links = node.querySelectorAll("[data-post-link]");
        const title = node.querySelector("[data-post-title]");
        const desc  = node.querySelector("[data-post-desc]");
        const date  = node.querySelector("[data-post-date]");

        const url    = normalizeUrl(p.url, p.slug || p.title);
        const imgSrc = normalizeImage(p.image || p.imageUrl);

        img.src = imgSrc;
        img.alt = p.title || "Post del blog";
        img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER; };

        links.forEach((a) => (a.href = url));
        title.textContent = p.title || "Sin título";
        desc.textContent  = p.description || "";
        date.textContent  = (p.date || "").slice(0, 10);

        GRID.appendChild(node);
      });
  }

  render();
})();
