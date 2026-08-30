import { projects } from "./projects.js";

const grid = document.querySelector("[data-portfolio-grid]");
const filters = document.querySelector("[data-portfolio-filters]");
let active = "all";
const options = [["all", "Alles"], ["logo", "Logo"], ["ui", "UI"], ["ux", "UX"]];

const render = () => {
  filters.innerHTML = options.map(([id, label]) => `<button class="portfolio-filter" type="button" data-portfolio-filter="${id}" aria-pressed="${id === active}">${label}</button>`).join("");
  const visible = projects.filter((project) => active === "all" || project.categories.includes(active));
  grid.innerHTML = visible.map((project) => `
    <${project.href ? "a" : "article"} class="project-card project-${project.tone}"${project.href ? ` href="${project.href}" target="_blank" rel="noreferrer" aria-label="Bekijk ${project.title} website"` : ""}>
      <div class="project-image"><img src="${project.image}" alt="${project.alt}" loading="lazy"></div>
      <div class="project-meta"><div><h3>${project.title}</h3><p>${project.type}</p></div><span>${project.year}${project.href ? " ↗" : ""}</span></div>
    </${project.href ? "a" : "article"}>
  `).join("");
  filters.querySelectorAll("[data-portfolio-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      active = button.dataset.portfolioFilter;
      render();
    });
  });
};

render();
