// /assets/chatbot.js
(() => {
  const BOT_TITLE = "RaSa Assistant";
  const BOT_SUBTITLE = "Manufactura. Directo.";

  const API_CHAT = "/api/chat";
  const API_SEND_LEAD = "/api/sendLead";

  const LS_MESSAGES = "rasa_messages_v3";
  const LS_SESSION = "rasa_session_v3";

  const state = {
    open: false,
    sending: false,
    draft: "",
    focusNext: false,

    messages: [],
    session: {},

    lastLeadPack: null, // { session, final }
  };

  const $ = (sel) => document.querySelector(sel);

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k === "disabled") n.disabled = Boolean(v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, String(v));
    });
    children.forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }

  function loadPersisted() {
    try {
      const m = JSON.parse(localStorage.getItem(LS_MESSAGES) || "[]");
      const s = JSON.parse(localStorage.getItem(LS_SESSION) || "{}");
      if (Array.isArray(m)) state.messages = m.slice(-60);
      if (s && typeof s === "object") state.session = s;
    } catch {}
  }

  function savePersisted() {
    try {
      localStorage.setItem(LS_MESSAGES, JSON.stringify(state.messages.slice(-60)));
      localStorage.setItem(LS_SESSION, JSON.stringify(state.session || {}));
    } catch {}
  }

  function escapeMail(s = "") {
    return encodeURIComponent(String(s).replace(/\r/g, ""));
  }

  function leadToMailto(leadPack) {
    const to = "ramirez.miguel.alejandro@gmail.com";
    const subject = `Lead/RaSa — ${leadPack?.session?.contacto?.empresa || "Nuevo caso"}`;
    const sum = leadPack?.final?.summary_for_miguel || "";
    const missing = Array.isArray(leadPack?.final?.missing_info) ? leadPack.final.missing_info.join(", ") : "";
    const next = leadPack?.final?.next_best_step || "";

    const body = [
      `Resumen:`,
      sum || "(sin resumen)",
      "",
      `Siguiente paso:`,
      next || "(sin sugerencia)",
      "",
      `Faltante:`,
      missing || "(n/a)",
      "",
      `Session JSON:`,
      JSON.stringify(leadPack?.session || {}, null, 2),
    ].join("\n");

    return `mailto:${to}?subject=${escapeMail(subject)}&body=${escapeMail(body)}`;
  }

  function shouldShowSendSummaryButton() {
    const opted = !!state.session?.optedInToRegister;
    const hasContact = !!state.session?.contacto?.email || !!state.session?.contacto?.whatsapp;
    return opted && hasContact;
  }

  function render() {
    let root = $("#rasa-chatbot-root");
    if (!root) {
      root = el("div", { id: "rasa-chatbot-root" });
      document.body.appendChild(root);
    }
    root.innerHTML = "";

    const launcher = el(
      "button",
      {
        class:
          "fixed bottom-5 right-5 z-[9999] rounded-full px-4 py-3 bg-sky-600 text-white shadow-lg hover:bg-sky-700 transition text-sm",
        onclick: () => {
          state.open = !state.open;
          state.focusNext = state.open;
          render();
        },
      },
      [state.open ? "Cerrar" : "Soporte"]
    );
    root.appendChild(launcher);

    if (!state.open) return;

    const header = el(
      "div",
      { class: "flex items-start justify-between gap-3 px-4 py-3 border-b border-white/10 bg-black/40" },
      [
        el("div", {}, [
          el("div", { class: "text-white font-semibold text-sm" }, [BOT_TITLE]),
          el("div", { class: "text-gray-300 text-xs" }, [BOT_SUBTITLE]),
        ]),
        el(
          "button",
          {
            class: "text-gray-300 hover:text-white text-lg leading-none",
            onclick: () => {
              state.open = false;
              render();
            },
            "aria-label": "Cerrar",
          },
          ["×"]
        ),
      ]
    );

    const msgs = el("div", {
      class: "px-4 py-3 space-y-3 overflow-auto",
      style: "max-height: 60vh;",
    });

    state.messages.forEach((m) => {
      const isUser = m.role === "user";
      msgs.appendChild(
        el("div", { class: `flex ${isUser ? "justify-end" : "justify-start"}` }, [
          el(
            "div",
            {
              class:
                (isUser ? "bg-sky-600 text-white" : "bg-white/10 text-gray-100") +
                " rounded-2xl px-3 py-2 text-sm max-w-[88%] whitespace-pre-wrap",
            },
            [m.content]
          ),
        ])
      );
    });

    const footer = el("div", { class: "p-3 border-t border-white/10 bg-black/30" });

    const input = el("textarea", {
      id: "rasa-chat-input",
      class:
        "w-full rounded-xl border border-white/10 bg-white/5 text-white text-sm p-3 outline-none focus:ring-1 focus:ring-sky-500 resize-none",
      rows: "3",
      placeholder: "¿Qué estás haciendo y qué quieres mejorar?",
      oninput: (e) => {
        state.draft = e.target.value;
      },
      onkeydown: (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send(state.draft);
        }
      },
    });

    input.value = state.draft;

    const btnSend = el(
      "button",
      {
        class:
          "mt-2 w-full rounded-xl px-4 py-2 bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed",
        onclick: () => send(state.draft),
        disabled: state.sending,
      },
      [state.sending ? "Enviando…" : "Enviar"]
    );

    const actions = el("div", { class: "mt-2 flex gap-2" });

    const btnFinalize = el(
      "button",
      {
        class:
          "flex-1 text-center rounded-xl px-4 py-2 bg-white/10 text-white text-sm hover:bg-white/15 transition disabled:opacity-60 disabled:cursor-not-allowed",
        onclick: finalizeAndSendLead,
        disabled: state.sending || !shouldShowSendSummaryButton(),
        style: shouldShowSendSummaryButton() ? "" : "display:none;",
        title: "Genera resumen y lo registra",
      },
      ["Enviar resumen"]
    );

    actions.appendChild(btnFinalize);

    if (state.lastLeadPack) {
      actions.appendChild(
        el(
          "a",
          {
            class:
              "flex-1 text-center rounded-xl px-4 py-2 bg-white/10 text-white text-sm hover:bg-white/15 transition",
            href: leadToMailto(state.lastLeadPack),
          },
          ["Enviar por correo"]
        )
      );

      actions.appendChild(
        el(
          "button",
          {
            class:
              "flex-1 text-center rounded-xl px-4 py-2 bg-white/10 text-white text-sm hover:bg-white/15 transition",
            onclick: () => {
              state.lastLeadPack = null;
              render();
            },
          },
          ["Ocultar acciones"]
        )
      );
    }

    footer.appendChild(input);
    footer.appendChild(btnSend);
    footer.appendChild(actions);

    const panel = el(
      "div",
      {
        class:
          "fixed bottom-20 right-5 z-[9999] w-[420px] max-w-[94vw] rounded-2xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-md bg-[#0b1220]/95",
      },
      [header, msgs, footer]
    );

    root.appendChild(panel);

    msgs.scrollTop = msgs.scrollHeight;

    if (state.focusNext) {
      state.focusNext = false;
      setTimeout(() => {
        const ta = $("#rasa-chat-input");
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      }, 0);
    }
  }

  async function send(text) {
    const t = (text || "").trim();
    if (!t || state.sending) {
      state.focusNext = true;
      render();
      return;
    }

    state.sending = true;
    state.messages.push({ role: "user", content: t });

    state.draft = "";
    state.focusNext = true;
    savePersisted();
    render();

    try {
      const r = await fetch(API_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: state.messages,
          input: t,
          session: state.session,
          pagePath: location.pathname,
        }),
      });

      const data = await r.json().catch(() => ({}));
      const reply = (data?.text || "No pude responder. Intenta de nuevo.").trim();
      state.messages.push({ role: "assistant", content: reply });

      if (data?.session) state.session = data.session;

      savePersisted();
      state.focusNext = true;
    } catch {
      state.messages.push({ role: "assistant", content: "Error de red. Reintenta." });
      state.focusNext = true;
    } finally {
      state.sending = false;
      render();
    }
  }

  async function finalizeAndSendLead() {
    if (state.sending) return;

    state.sending = true;
    render();

    try {
      // 1) Finalize
      const r1 = await fetch(API_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: state.messages,
          session: state.session,
          action: "finalize",
          pagePath: location.pathname,
        }),
      });
      const fin = await r1.json().catch(() => ({}));

      if (fin?.session) state.session = fin.session;
      savePersisted();

      // 2) Send to GAS via proxy
      const payload = {
        pagePath: location.pathname,
        session: state.session,
        final: fin?.final || null,
        messages: state.messages.slice(-40),
      };

      const r2 = await fetch(API_SEND_LEAD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const sent = await r2.json().catch(() => ({}));

      const summary = fin?.final?.summary_for_miguel || "";
      const next = fin?.final?.next_best_step || "";

      state.lastLeadPack = { session: state.session, final: fin?.final || null };

      if (summary) state.messages.push({ role: "assistant", content: `Resumen:\n${summary}` });
      if (next) state.messages.push({ role: "assistant", content: `Siguiente paso sugerido:\n${next}` });

      if (sent?.ok === false) {
        state.messages.push({ role: "assistant", content: "Resumen listo. Si quieres, usa “Enviar por correo”." });
      } else {
        state.messages.push({ role: "assistant", content: "Quedó registrado para revisión." });
      }

      savePersisted();
      state.focusNext = true;
    } catch {
      state.messages.push({ role: "assistant", content: "No pude registrar el resumen. Intenta de nuevo." });
      savePersisted();
      state.focusNext = true;
    } finally {
      state.sending = false;
      render();
    }
  }

  // Init
  loadPersisted();

  if (!state.messages.length) {
    state.messages = [
      {
        role: "assistant",
        content: "¿Qué quieres mejorar hoy y en qué proceso? (CNC, lámina, troqueles, escaneo/impresión)",
      },
    ];
    savePersisted();
  }

  render();
})();
