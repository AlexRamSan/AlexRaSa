(() => {
  const state = {
    open: false,
    busy: false,
    messages: [
      { role: "assistant", content: "¿Qué quieres lograr hoy: más leads, soporte, o agendar una llamada?" }
    ],
  };

  const css = `
  .ar-chat-btn{position:fixed;right:18px;bottom:18px;z-index:9999;border:0;border-radius:999px;padding:12px 14px;cursor:pointer;box-shadow:0 10px 25px rgba(0,0,0,.25);font:600 14px system-ui}
  .ar-chat-box{position:fixed;right:18px;bottom:72px;width:360px;max-width:calc(100vw - 36px);height:520px;max-height:calc(100vh - 110px);background:#0b1220;color:#e5e7eb;border:1px solid rgba(255,255,255,.12);border-radius:16px;z-index:9999;display:none;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;font:14px system-ui}
  .ar-chat-box.open{display:flex;flex-direction:column}
  .ar-chat-head{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:space-between}
  .ar-chat-title{font-weight:700}
  .ar-chat-close{background:transparent;border:0;color:#e5e7eb;font-size:18px;cursor:pointer}
  .ar-chat-log{padding:12px;gap:10px;display:flex;flex-direction:column;overflow:auto;flex:1}
  .ar-bubble{max-width:85%;padding:10px 12px;border-radius:14px;line-height:1.35;white-space:pre-wrap;word-break:break-word}
  .ar-a{align-self:flex-start;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10)}
  .ar-u{align-self:flex-end;background:rgba(59,130,246,.18);border:1px solid rgba(59,130,246,.35)}
  .ar-chat-foot{border-top:1px solid rgba(255,255,255,.12);padding:10px;display:flex;gap:8px}
  .ar-chat-input{flex:1;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#e5e7eb;padding:10px 12px;outline:none}
  .ar-chat-send{border:0;border-radius:12px;padding:10px 12px;cursor:pointer;font-weight:700}
  .ar-chat-send:disabled{opacity:.6;cursor:not-allowed}
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.className = "ar-chat-btn";
  btn.textContent = "Chat";
  document.body.appendChild(btn);

  const box = document.createElement("div");
  box.className = "ar-chat-box";
  box.innerHTML = `
    <div class="ar-chat-head">
      <div>
        <div class="ar-chat-title">AlexRaSa Assistant</div>
        <div style="opacity:.8;font-size:12px">Rápido, directo, sin novela.</div>
      </div>
      <button class="ar-chat-close" aria-label="Cerrar">×</button>
    </div>
    <div class="ar-chat-log" role="log" aria-live="polite"></div>
    <div class="ar-chat-foot">
      <input class="ar-chat-input" type="text" placeholder="Escribe tu pregunta…" />
      <button class="ar-chat-send">Enviar</button>
    </div>
  `;
  document.body.appendChild(box);

  const log = box.querySelector(".ar-chat-log");
  const closeBtn = box.querySelector(".ar-chat-close");
  const input = box.querySelector(".ar-chat-input");
  const send = box.querySelector(".ar-chat-send");

  function render() {
    log.innerHTML = "";
    state.messages.forEach(m => {
      const b = document.createElement("div");
      b.className = `ar-bubble ${m.role === "user" ? "ar-u" : "ar-a"}`;
      b.textContent = m.content;
      log.appendChild(b);
    });
    log.scrollTop = log.scrollHeight;
    send.disabled = state.busy;
    btn.textContent = state.open ? "Cerrar" : "Chat";
  }

  function toggle(open) {
    state.open = typeof open === "boolean" ? open : !state.open;
    box.classList.toggle("open", state.open);
    render();
    if (state.open) setTimeout(() => input.focus(), 0);
  }

  async function ask(text) {
    const t = (text || "").trim();
    if (!t || state.busy) return;

    state.messages.push({ role: "user", content: t });
    state.busy = true;
    render();

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: state.messages }),
      });
      const data = await r.json();
      state.messages.push({ role: "assistant", content: data.text || "No pude responder. Intenta otra vez." });
    } catch {
      state.messages.push({ role: "assistant", content: "Error de conexión. No eres tú… bueno, esta vez no." });
    } finally {
      state.busy = false;
      render();
    }
  }

  btn.addEventListener("click", () => toggle());
  closeBtn.addEventListener("click", () => toggle(false));
  send.addEventListener("click", () => ask(input.value).then(() => (input.value = "")));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ask(input.value).then(() => (input.value = ""));
    }
  });

  render();
})();
