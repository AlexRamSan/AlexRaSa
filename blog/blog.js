(() => {
  const GRID = document.querySelector("#posts-grid");
  const TPL = document.querySelector("#post-card-tpl");
  const EMPTY = document.querySelector("#empty-msg");
  const PLACEHOLDER = "/assets/blog/placeholder.jpg";

  const normalizeImage = (img) => {
    if (!img) return PLACEHOLDER;
    const s = img.trim();
    if (s.startsWith("data:") || s.startsWith("http") || s.startsWith("/")) return s;
    return `/assets/blog/${s}`;
  };

  const slugify = (t = "post") =>
    t.toLowerCase().replace(/[^a-z0-9\-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  const normalizeUrl = (u, slug) => {
    if (u && (u.startsWith("http") || u.startsWith("/"))) return u;
    const safe = slugify(slug || "post");
    return `/blog/${u || safe}.html`;
  };

  async function loadPosts() {
    // 1) fuente dinámica
    try {
      const api = await fetch(`/api/list-posts`, { cache: "no-store" });
      if (api.ok) {
        const j = await api.json();
        if (Array.isArray(j.items) && j.items.length) return j.items;
      }
    } catch {}

    // 2) fallback estático
    const urls = ["/blog/posts.json", "/data/posts.json", "/posts.json"];
    for (const url of urls) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) continue;
        const raw = await r.json();
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.posts) ? raw.posts : [];
        if (arr.length) return arr;
      } catch {}
    }
    return [];
  }

  async function render() {
    const posts = await loadPosts();
    GRID.innerHTML = "";
    EMPTY.classList.add("hidden");

    if (!posts.length) return EMPTY.classList.remove("hidden");

    posts
      .filter(p => !p.draft)
      .sort((a,b) => new Date(b.date||0) - new Date(a.date||0))
      .forEach(p => {
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
        img.onerror = () => { img.src = PLACEHOLDER; };

        links.forEach(a => a.href = url);
        title.textContent = p.title || "Sin título";
        desc.textContent  = p.description || "";
        date.textContent  = (p.date || "").slice(0,10);

        GRID.appendChild(node);
      });
  }

  render();
})();
