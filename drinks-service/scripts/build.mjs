import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
const output = new URL('../dist/', import.meta.url);
const root = new URL('../../', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Explicit allowlist: never publish source, configuration, database files or tests.
for (const file of ['drinks.html', 'private.html', 'private.js', 'app.js', 'site-registry.js', 'styles.css', 'DeWilVis-drinks.png', 'favicon.ico']) {
  await cp(new URL(file, root), new URL(file, output));
}
await mkdir(new URL('ClearBG/', output));
for (const file of ['DeWilVis-whale-blue.png', 'DeWilVis-whale-white.png']) {
  await cp(new URL(`ClearBG/${file}`, root), new URL(`ClearBG/${file}`, output));
}
await cp(new URL('../public/manage/', import.meta.url), new URL('manage/', output), { recursive: true });
// This independently hosted subsite links back to the main house for other pages.
for (const file of ['drinks.html', 'private.html', 'app.js', 'site-registry.js']) {
  const path = new URL(file, output);
  let source = await readFile(path, 'utf8');
  if (['drinks.html', 'private.html'].includes(file)) source = source.replaceAll('href="index.html"', 'href="https://dewilvis.be/"').replaceAll('https://drinks.dewilvis.be/manage/', '/manage/');
  if (file === 'app.js') source = source.replaceAll('href="/index.html"', 'href="https://dewilvis.be/"');
  if (file === 'site-registry.js') source = source.replace(/href: "\/(?!drinks.html)([^"]*)"/g, 'href: "https://dewilvis.be/$1"');
  await writeFile(path, source);
}
