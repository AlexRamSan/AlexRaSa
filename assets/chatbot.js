// /assets/chatbot.js
(() => {
  const BOT_TITLE = "RaSa Assistant";
  const BOT_SUBTITLE = "Manufactura. Directo.";

  const API_CHAT = "/api/chat";
  const API_SEND_TICKET = "/api/sendTicket";

  const state = {
    open: false,
    sending: false,
    draft: "",          // <-- guarda lo que escribes
    focusNext: false,   // <-- si true, enfocamos textarea tras render
    messages: [
      {
        role: "assistant",
        content:
          "¿Qué quieres mejorar hoy y en qué proceso? (CNC, lámina, troqueles, etc.)",
      },
    ],
    lastTicket: null,
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

  function escapeMail(s = "") {
    return encodeURIComponent(String(s).replace(/\r/g, ""));
  }

  function ticketToMailto(ticket) {
    const subject = `Soporte manufactura — ${ticket.tema || "Caso"}`;
    const body = [
      `Nombre: ${ticket.nombre || "No especificado"}`,
      `Empresa: ${ticket.empresa || "No especificado"}`,
      `Email: ${ticket.email || "No especificado"}`,
      `WhatsApp: ${ticket.whatsapp || "No especificado"}`,
      `Ciudad/Estado: ${(ticket.ciudad || "No especificado")} / ${(ticket.estado || "No especificado")}`,
      `Industria: ${ticket.industria || "No especificado"}`,
      "",
      `Resumen:`,
      ticket.resumen || "",
      "",
      `Datos técnicos:`,
      ticket.datos_tecnicos || "",
    ].join("\n");

    const to = "ramirez.miguel.alejandro@gmail.com";
    return `mailto:${to}?subject=${escapeMail(subject)}&body=${escapeMail(body)}`;
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
          state.focusNext = state.open; // al abrir, enfoca
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
        state.draft = e.target.value; // <-- guarda borrador
      },
      onkeydown: (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send(state.draft);
        }
      },
    });

    // restaura borrador tras re-render
    input.value = state.draft;

    const btn = el(
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
    if (state.lastTicket) {
      actions.appendChild(
        el(
          "a",
          {
            class:
              "flex-1 text-center rounded-xl px-4 py-2 bg-white/10 text-white text-sm hover:bg-white/15 transition",
            href: ticketToMailto(state.lastTicket),
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
              state.lastTicket = null;
              render();
            },
          },
          ["Ocultar acciones"]
        )
      );
    }

    footer.appendChild(input);
    footer.appendChild(btn);
    if (state.lastTicket) footer.appendChild(actions);

    const panel = el(
      "div",
      {
        class:
          "fixed bottom-20 right-5 z-[9999] w-[420px] max-w-[94vw] rounded-2xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-md bg-[#0b1220]/95",
      },
      [header, msgs, footer]
    );

    root.appendChild(panel);

    // scroll al final
    msgs.scrollTop = msgs.scrollHeight;

    // AUTOFOCUS (después de que el DOM ya existe)
    if (state.focusNext) {
      state.focusNext = false;
      setTimeout(() => {
        const ta = $("#rasa-chat-input");
        if (ta) {
          ta.focus();
          // cursor al final
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      }, 0);
    }
  }

  async function send(text) {
    const t = (text || "").trim();
    if (!t || state.sending) {
      // si está vacío, solo enfoca
      state.focusNext = true;
      render();
      return;
    }

    state.sending = true;
    state.messages.push({ role: "user", content: t });

    // limpia borrador y asegura focus para seguir escribiendo sin click
    state.draft = "";
    state.focusNext = true;

    render();

    try {
      const r = await fetch(API_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: state.messages }),
      });

      const data = await r.json().catch(() => ({}));
      const reply = (data?.text || "No pude responder. Intenta de nuevo.").trim();
      state.messages.push({ role: "assistant", content: reply });

      // tras respuesta, vuelve a enfocar
      state.focusNext = true;

      if (data?.ticket) {
        try {
          await fetch(API_SEND_TICKET, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket: data.ticket }),
          });
          state.lastTicket = data.ticket;
          state.messages.push({
            role: "assistant",
            content:
              "Caso registrado. Si prefieres enviarlo tú desde tu correo, usa el botón “Enviar por correo”.",
          });
        } catch {
          state.lastTicket = data.ticket;
          state.messages.push({
            role: "assistant",
            content: "Tengo el caso listo. Usa “Enviar por correo” para mandarlo.",
          });
        }
      }
    } catch {
      state.messages.push({ role: "assistant", content: "Error de red. Reintenta." });
      state.focusNext = true;
    } finally {
      state.sending = false;
      render();
    }
  }

  render();
})();
