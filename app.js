import { sites, menuGroups, navigationItems } from "./site-registry.js";

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]);

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = new Date().getFullYear();
});

const siteGrid = document.querySelector("[data-site-grid]");
if (siteGrid) {
  siteGrid.innerHTML = sites.map((site) => `
    <article class="site-card site-card-${site.accent} reveal" id="${site.id}">
      <div class="site-card-top"><span>${site.number}</span><span class="status-pill">${escapeHtml(site.status)}</span></div>
      <img class="site-card-icon" src="${site.icon}" width="5500" height="5500" alt="" loading="lazy">
      <div><p class="eyebrow">${escapeHtml(site.kicker)}</p><h3>${escapeHtml(site.name)}</h3><p>${escapeHtml(site.description)}</p></div>
      <span class="site-card-action">${site.requiresAuth ? "Klaar voor toegang" : "Binnenkort verkennen"} <span aria-hidden="true">↗</span></span>
    </article>
  `).join("");
}

const menuToggle = document.querySelector("[data-menu-toggle]");
if (menuToggle) {
  const overlay = document.createElement("div");
  overlay.className = "menu-overlay";
  overlay.dataset.menuOverlay = "";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="menu-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="menu-overlay-title">
      <div class="overlay-head shell">
        <a class="brand overlay-brand" href="/index.html">
          <img src="/ClearBG/DeWilVis-whale-blue.png" width="5500" height="5500" alt="">
          <span>De WilVis</span>
        </a>
        <button class="menu-close" type="button" data-menu-close aria-label="Sluit menu">
          <span></span><span></span>
        </button>
      </div>
      <nav class="overlay-nav shell" aria-label="Alle plekken" id="menu-overlay-title">
        <p class="eyebrow">Alle plekken</p>
        <ol>
          ${navigationItems.map((item, index) => `
            <li>
              <a href="${item.href}" data-overlay-link>
                <span class="overlay-number">${String(index + 1).padStart(2, "0")}</span>
                <span class="overlay-name">${escapeHtml(item.name)}</span>
                <span class="overlay-label">${escapeHtml(item.label)}</span>
                ${item.state !== "live" ? `<span class="overlay-state">${item.state === "private" ? "Besloten" : "Binnenkort"}</span>` : `<span class="overlay-arrow" aria-hidden="true">↗</span>`}
              </a>
            </li>
          `).join("")}
        </ol>
      </nav>
      <p class="overlay-foot shell">Home of De WilVis · Gent, België</p>
    </div>
  `;
  document.body.append(overlay);

  const closeButton = overlay.querySelector("[data-menu-close]");
  let previouslyFocused = null;
  let openedAt = 0;

  const setMenu = (open) => {
    menuToggle.setAttribute("aria-expanded", String(open));
    overlay.hidden = !open;
    document.body.classList.toggle("menu-open", open);
    if (open) {
      openedAt = Date.now();
      previouslyFocused = document.activeElement;
      requestAnimationFrame(() => {
        overlay.classList.add("is-open");
        closeButton.focus();
      });
    } else {
      overlay.classList.remove("is-open");
      previouslyFocused?.focus();
    }
  };

  menuToggle.addEventListener("click", () => setMenu(true));
  closeButton.addEventListener("click", () => {
    if (Date.now() - openedAt > 450) setMenu(false);
  });
  overlay.querySelectorAll("[data-overlay-link]").forEach((link) => link.addEventListener("click", () => setMenu(false)));
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
    if (event.key !== "Tab") return;
    const focusable = [...overlay.querySelectorAll("a[href], button:not([disabled])")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

const menuList = document.querySelector("[data-menu-list]");
const filterRow = document.querySelector("[data-menu-filters]");
const searchInput = document.querySelector("[data-menu-search]");

if (menuList && filterRow && searchInput) {
  let activeFilter = "all";
  let query = "";

  const renderFilters = () => {
    const filters = [{ id: "all", label: "Alles" }, ...menuGroups];
    filterRow.innerHTML = filters.map((filter) => `
      <button type="button" class="filter-chip" data-filter="${filter.id}" aria-pressed="${filter.id === activeFilter}">${escapeHtml(filter.label)}</button>
    `).join("");
  };

  const renderMenu = () => {
    const normalizedQuery = query.trim().toLocaleLowerCase("nl");
    const groups = menuGroups
      .filter((group) => activeFilter === "all" || group.id === activeFilter)
      .map((group) => ({ ...group, items: group.items.filter((item) => item.join(" ").toLocaleLowerCase("nl").includes(normalizedQuery)) }))
      .filter((group) => group.items.length);

    menuList.innerHTML = groups.length ? groups.map((group) => `
      <article class="menu-group" id="menu-${group.id}">
        <header><p class="eyebrow">${escapeHtml(group.label)}</p><h2>${escapeHtml(group.title)}</h2><p>${escapeHtml(group.intro)}</p></header>
        <ul>${group.items.map(([name, details]) => `<li><span class="drink-name">${escapeHtml(name)}</span>${details ? `<span class="drink-detail">${escapeHtml(details)}</span>` : ""}</li>`).join("")}</ul>
        ${group.footnote ? `<p class="menu-footnote">${escapeHtml(group.footnote)}</p>` : ""}
      </article>
    `).join("") : `
      <div class="empty-state"><span aria-hidden="true">○</span><h2>Niets gevonden</h2><p>Probeer een andere naam of toon opnieuw alle drankjes.</p><button class="button button-primary" type="button" data-reset-menu>Wis zoekopdracht</button></div>
    `;
    menuList.setAttribute("aria-busy", "false");
  };

  renderFilters();
  renderMenu();
  filterRow.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    activeFilter = button.dataset.filter;
    renderFilters();
    renderMenu();
    if (activeFilter !== "all") {
      requestAnimationFrame(() => {
        const section = menuList.querySelector(".menu-group");
        if (!section) return;
        const heading = section.querySelector("h2") || section;
        const tools = document.querySelector(".menu-tools");
        const toolsOffset = tools?.getBoundingClientRect().height ?? 0;
        const stickyTop = tools ? parseFloat(getComputedStyle(tools).top) || 0 : 0;
        const targetTop = heading.getBoundingClientRect().top + window.scrollY - stickyTop - toolsOffset - 16;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    }
  });
  searchInput.addEventListener("input", () => {
    query = searchInput.value;
    renderMenu();
  });
  menuList.addEventListener("click", (event) => {
    if (!event.target.closest("[data-reset-menu]")) return;
    query = "";
    activeFilter = "all";
    searchInput.value = "";
    searchInput.focus();
    renderFilters();
    renderMenu();
  });
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealNodes = document.querySelectorAll(".reveal");
if (reduceMotion || !("IntersectionObserver" in window)) {
  revealNodes.forEach((node) => node.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
  revealNodes.forEach((node) => observer.observe(node));
}

const backToTop = document.querySelector(".back-to-top");
if (backToTop) {
  const updateBackToTop = () => backToTop.classList.toggle("is-visible", window.scrollY > 520);
  updateBackToTop();
  window.addEventListener("scroll", updateBackToTop, { passive: true });
}
