(() => {
  const GRID = document.querySelector("#posts-grid");
  const TPL = document.querySelector("#post-card-tpl");
  const EMPTY = document.querySelector("#empty-msg");
  const PLACEHOLDER = "/assets/blog/placeholder.jpg";

  // Normaliza rutas de imagen
  const normalizeImage = (img) => {
    if (!img || typeof img !== "string") return PLACEHOLDER;
    const s = img.trim();
    if (!s) return PLACEHOLDER;
    if (s.startsWith("http")) return s;
    if (s.startsWith("/")) return s;
    return `/assets/blog/${s}`;
  };

  // Normaliza URL del post
  const normalizeUrl = (u, slug) => {
    if (u && u.startsWith("http")) return u;
    if (u && u.startsWith("/")) return u;
    const safe = (slug || "").replace(/[^a-z0-9\-]/gi, "-").toLowerCase();
    return `/blog/${u || safe || "post"}.html`;
  };

  // Carga posts desde JSON o variable global
  async function loadPosts() {
    if (Array.isArray(window.BLOG_POSTS)) return window.BLOG_POSTS;
    const tryUrls = ["/blog/posts.json", "/data/posts.json", "/posts.json"];
    for (const url of tryUrls) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data) && data.length) return data;
        }
      } catch (_) {}
    }
    return [];
  }

  // Renderiza cada post
  async function render() {
    const posts = await loadPosts();
    if (!posts.length) {
      EMPTY.classList.remove("hidden");
      return;
    }

    posts.forEach((p) => {
      const node = TPL.content.firstElementChild.cloneNode(true);

      const img = node.querySelector("[data-post-img]");
      const links = node.querySelectorAll("[data-post-link]");
      const title = node.querySelector("[data-post-title]");
      const desc = node.querySelector("[data-post-desc]");
      const date = node.querySelector("[data-post-date]");

      const url = normalizeUrl(p.url, p.slug || p.title);
      const imgSrc = normalizeImage(p.image || p.imageUrl);

      img.src = imgSrc;
      img.alt = p.title || "Post del blog";
      img.onerror = () => { img.src = PLACEHOLDER; };

      links.forEach((a) => (a.href = url));
      title.textContent = p.title || "Sin título";
      desc.textContent = p.description || "";
      date.textContent = (p.date || "").slice(0, 10);

      GRID.appendChild(node);
    });
  }

  render();
})();
