(function () {
  const POPUP_ID = "cncExpressPopup";
  const CLOSE_ICON_ID = "cncExpressCloseIcon";
  const NO_THANKS_ID = "cncExpressNoThanks";
  const DELAY_MS = 15000; // 15 segundos después de cargar la página
  const EXCLUDED_PREFIXES = [
    "/programa-cnc-express",
    "/calc",
    "/pwa/calc",
    "/proyectos/calculadoras",
    "/proyectos/herramientas",
    "/blog/widget/calculadora",
    "/blog/calculadoras",
  ];

  function shouldSkip() {
    const path = window.location.pathname || "";
    return EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function ensurePopup() {
    if (getElement(POPUP_ID)) return null;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div
        id="${POPUP_ID}"
        class="fixed inset-0 z-50 hidden items-center justify-center bg-black/60"
      >
        <div class="mx-4 max-w-md rounded-2xl bg-slate-900 p-6 shadow-2xl border border-slate-700">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold tracking-wide text-teal-400 uppercase">
                Nuevo programa
              </p>
              <h2 class="mt-1 text-xl font-bold text-white">
                Optimiza 1 proceso CNC en 7 días
              </h2>
            </div>
            <button
              id="${CLOSE_ICON_ID}"
              class="text-slate-400 hover:text-slate-200 transition"
              aria-label="Cerrar"
              type="button"
            >
              ✕
            </button>
          </div>

          <img
            src="/assets/blog/optimiza-tu-proceso-cnc-con-cnc-expres.png"
            alt="Programa CNC Exprés — Optimización de 1 proceso en 7 días"
            class="mt-4 w-full rounded-xl border border-slate-800"
            loading="lazy"
          />

          <p class="mt-3 text-sm text-slate-300">
            Analizo contigo un proceso clave, bajamos tiempos de ciclo y te dejo una
            plantilla reutilizable para tu planta. Todo medido en horas y pesos.
          </p>

          <ul class="mt-3 space-y-1 text-xs text-slate-300">
            <li>• Diagnóstico y optimización de 1 pieza/proceso</li>
            <li>• Plantilla estandarizada para repetir el éxito</li>
            <li>• Enfoque en tiempos de ciclo, estabilidad y vida de herramienta</li>
          </ul>

          <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <a
              href="https://www.alexrasa.store/programa-cnc-express"
              class="inline-flex flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold
                     bg-teal-500 text-slate-950 hover:bg-teal-400 transition"
            >
              Ver detalles del programa
            </a>
            <button
              id="${NO_THANKS_ID}"
              class="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4"
              type="button"
            >
              No por ahora
            </button>
          </div>
        </div>
      </div>
    `.trim();

    const popupNode = wrapper.firstElementChild;
    document.body.appendChild(popupNode);
    return popupNode;
  }

  function openPopup() {
    const popup = getElement(POPUP_ID);
    if (!popup) return;
    popup.classList.remove("hidden");
    popup.classList.add("flex");
  }

  function closePopup() {
    const popup = getElement(POPUP_ID);
    if (!popup) return;
    popup.classList.add("hidden");
    popup.classList.remove("flex");
  }

  if (shouldSkip()) return;

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.body) return;

    const popup = ensurePopup();
    if (!popup) return;

    const closeIcon = getElement(CLOSE_ICON_ID);
    const noThanks = getElement(NO_THANKS_ID);

    if (closeIcon) {
      closeIcon.addEventListener("click", function () {
        closePopup();
      });
    }

    if (noThanks) {
      noThanks.addEventListener("click", function () {
        closePopup();
      });
    }

    popup.addEventListener("click", function (e) {
      if (e.target === popup) {
        closePopup();
      }
    });

    setTimeout(openPopup, DELAY_MS);
  });
})();
