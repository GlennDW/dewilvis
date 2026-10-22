/** Shared registry for independently deployable De WilVis subsites. */
export const sites = [
  { id: "recipes", number: "01", name: "Recipes", kicker: "Uit de keuken", description: "Recepten die mogen vlekken, veranderen en doorgegeven worden.", href: "https://recipes.dewilvis.be", status: "Nu geopend", state: "live", accent: "coral", requiresAuth: true, icon: "/ClearBG/DeWilVis-whale-blue.png" },
  { id: "lab", number: "02", name: "Lab", kicker: "Proberen mag", description: "Experimenten, prototypes en ideeën die nog geen vaste vorm nodig hebben.", href: "/index.html#lab", status: "In opbouw", accent: "mint", requiresAuth: false, icon: "/ClearBG/DeWilVis-blue.png" },
  { id: "private", number: "03", name: "Private", kicker: "Voor de clan", description: "Onze recepten, bewaarde ideeën en het beheer van de drankkaart.", href: "/private.html", status: "Voor de clan", state: "live", accent: "butter", requiresAuth: true, icon: "/ClearBG/DeWilVis-whale-blue.png" },
  { id: "instagram", number: "04", name: "Instagram Saver", kicker: "Ideeën die blijven", description: "Je bewaarde Reels, samenvattingen en verslagen. Eén bibliotheek, met dezelfde login als Recipes.", href: "https://saver.dewilvis.be", status: "Nu geopend", state: "live", accent: "mint", requiresAuth: true, icon: "/ClearBG/DeWilVis-whale-blue.png" },
];

export const navigationItems = [
  { name: "Home", label: "Welkom bij De WilVis", href: "/index.html", state: "live" },
  { name: "Drankjes", label: "Zoek in de mobiele drankkaart", href: "https://drinks.dewilvis.be/", state: "live" },
  { name: "Portfolio", label: "Logo, UI & UX design", href: "/portfolio/", state: "live" },
  { name: "Recipes", label: "Ontdek onze recepten", href: "https://recipes.dewilvis.be/", state: "live" },
  { name: "Instagram Saver", label: "Je bewaarde ideeën", href: "https://saver.dewilvis.be/", state: "private" },
  { name: "Private", label: "Recepten, bewaarde ideeën en drankbeheer", href: "/private.html", state: "private" },
];
