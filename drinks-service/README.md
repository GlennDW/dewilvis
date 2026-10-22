# Drinks — De WilVis

An independently deployable Cloudflare Worker for the public drinks menu and its private editor. The source lives in this website repository; Recipes and Saver remain in their existing repository.

## Architecture

- Public menu: `https://drinks.dewilvis.be/drinks.html` (the root redirects here).
- Private hub: `https://dewilvis.be/private.html` links Recipes, Saver and drinks management; each application enforces its own authenticated access.
- Management: `https://drinks.dewilvis.be/manage/`.
- Cloudflare D1 database `dewilvis-drinks` stores categories and drink availability, names and descriptions. Both Glenn and Karen edit the same household menu.
- The `AUTH_SERVICE` service binding calls the existing `recipe-keeper` Worker. Password validation, login rate limits, sessions and logout remain owned by Recipes. The existing `dw_session` HttpOnly cookie covers `dewilvis.be` and its subdomains. Existing shared Recipes/Saver sessions work here too; older host-only Recipes sessions require signing in once on this site.
- Editing requires a verified Glenn/Karen session, the exact application Origin, and the shared session's CSRF token. Updates use versions to reject concurrent overwrites. No credentials or session tokens go into browser storage.
- `/api/menu` is public and returns available drinks only. The original website's `drinks.html` also reads this endpoint, with credential-free CORS allowed only for `https://dewilvis.be` and `https://www.dewilvis.be`. Failed loads show a retry state; unavailable drinks never reappear from a static fallback.
- The initial migration imports the existing 53 drinks once. Later releases must never reimport or reset that list. Unavailable drinks remain editable and can be restored.
- Static assets are copied from a strict allowlist. Worker source, tests, database files and configuration are never included in the public asset bundle.

Names, details and category changes are saved immediately. Availability changes affect the next public page load or tab refocus; an already open page does not poll continuously. Turning a base drink off does not automatically turn cocktails containing it off. The old PDF remains an historical asset; the current menu no longer advertises it as a current download.

## Development and verification

From this directory:

```sh
npm ci
npm run check
npm test
npm run deploy:check
```

The tests run real local Worker/D1 routes with a fake authentication service. They verify access controls, shared-cookie forwarding, CSRF, input validation, public menu filtering, concurrency, CORS, session renewal and logout. They never use production accounts or databases. A dry-run builds the deployable bundle without publishing.

To preview the complete interface with disposable in-memory data:

```sh
npm run build
node tests/preview.mjs
```

Open `http://127.0.0.1:8795/manage/`, select Glenn, and use password `preview`. That fake login exists only in the preview test harness; it is never bundled or enabled in production. Restarting the preview discards all its changes.

`npm run dev` starts Wrangler with the production service-binding configuration; it needs a separately configured local Recipes Worker to exercise real authentication. Use the disposable preview for ordinary UI work.

## First production release

The code is prepared, but no production database or domain has been provisioned. Publishing is a separate release step. Do not publish the website's new links until the drinks Worker is live.

1. In the same Cloudflare account as `recipe-keeper`, create **a new database** using `npx wrangler d1 create dewilvis-drinks`. Replace `REPLACE_WITH_NEW_DRINKS_DATABASE_ID` in `wrangler.jsonc` with its returned ID. Never substitute the Recipes or Saver database ID.
2. Review and commit the intentional changes, finish the existing website merge, push, and verify that the checkout matches the fetched remote revision. The GitHub workflow runs the checks but does not publish or store Cloudflare credentials.
3. Run the verification commands above. Review migration `0001_menu.sql`: on this first release only it creates and fills the new drinks database.
4. Apply migrations with `npx wrangler d1 migrations apply dewilvis-drinks --remote`.
5. Run `npm run build`, then `npx wrangler deploy --message <full-git-revision>`. The custom-domain route provisions `drinks.dewilvis.be` in the existing Cloudflare zone. The deployment needs access to the existing `recipe-keeper` service binding.
6. Verify signed-out management requests return 401, both real accounts can manage drinks, and an availability change appears on the public menu. Restore any temporary test changes. Only then publish the main website links/API consumer.

For later releases, export a separate private database backup **before** migrations, for example `npx wrangler d1 export dewilvis-drinks --remote --output backups/pre-release.sql` after creating the ignored `backups` directory. Preserve each backup under a unique name outside Git. Apply only new migrations, then build and deploy with the source revision. Never run the initial SQL directly against a populated database. Code rollback does not undo database migrations or menu edits.

Cloudflare credentials remain outside Git. There are no new passwords, Mac services, Tailscale dependencies or changes to Recipes/Saver deployments.

Cloudflare reference: [HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/) and [D1 Worker bindings](https://developers.cloudflare.com/d1/worker-api/).
