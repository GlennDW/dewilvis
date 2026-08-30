import { projects } from "./projects.js";

const grid = document.querySelector("[data-portfolio-grid]");
const filters = document.querySelector("[data-portfolio-filters]");
let active = "all";
const options = [["all", "Alles"], ["logo", "Logo"], ["ui", "UI"], ["ux", "UX"]];

const render = () => {
  filters.innerHTML = options.map(([id, label]) => `<button class="portfolio-filter" type="button" data-portfolio-filter="${id}" aria-pressed="${id === active}">${label}</button>`).join("");
  const visible = projects.filter((project) => active === "all" || project.categories.includes(active));
  grid.innerHTML = visible.map((project) => `
    <article class="project-card project-${project.tone}">
      <div class="project-image"><img src="${project.image}" alt="${project.alt}" loading="lazy"></div>
      <div class="project-meta"><div><h3>${project.title}</h3><p>${project.type}</p></div><span>${project.year}</span></div>
    </article>
  `).join("");
  filters.querySelectorAll("[data-portfolio-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      active = button.dataset.portfolioFilter;
      render();
    });
  });
};

render();
