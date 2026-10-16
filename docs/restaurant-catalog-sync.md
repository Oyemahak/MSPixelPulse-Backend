# Restaurant catalog synchronization

## Scope and verified baseline

The public API at `https://api.mspixelpulse.com/api/public/projects` returned 14
published projects on 2026-10-16, with no published SAVORA or Aurelia entry.
The agency frontend therefore supplies these demonstrations from its public
catalog fallback. The frontend and API use the same canonical identities:

- SAVORA: `savora-kitchen-table`, **SAVORA — Restaurant Platform**.
- Storefront: `https://restaurant.mspixelpulse.com`.
- Operations: `https://orders.restaurant.mspixelpulse.com`, owner protected with
  an isolated public Demo operator workspace.
- Aurelia: `aurelia-restaurant-bar`, **Aurelia Restaurant & Bar**,
  `https://bar.mspixelpulse.com`.

The public list consolidates exact SAVORA repository/slug identities into one
storefront project. The operations public detail URL resolves to the published
canonical project. This never creates a published project, deletes a record,
changes a stable ID, or alters the authenticated admin/project API. A conflicting
repository identity is preserved rather than rebranded or hidden.

## Existing persistent catalog records

No production provider writes were performed for this release. Do not run the
full portfolio seed with force enabled. No Google configuration, schema, OAuth,
session, or application authentication changes are required.

`node src/scripts/prepareRestaurantDemoProjects.js` is a provider-free dry run.
It now prepares one unpublished SAVORA draft, never another operations draft.
`--inspect` reads only the canonical SAVORA target using the configured provider.
The existing `--apply-drafts --backup-dir=/absolute/private/outside/repo` workflow
can fill empty fields in a nonpublished draft, but preserves all nonempty
owner-managed metadata and all published records. `reviewFields` lists conflicts
for explicit review; publication remains an authenticated admin action.

If persistent metadata needs updating later, open the existing canonical record
in the authenticated MSPixelPulse admin project editor and review the public
fields in `src/data/restaurantPlatformProjects.js`. Keep the operations record,
application and repository. The public projection already omits its separate
card, so unpublishing or deleting it is unnecessary. Existing assignments,
requirements, billing, evidence, messages and files must remain untouched.

## Public metadata and screenshots

`publicRestaurantProjects.js` updates only public presentation after the existing
published-only, public-field selection. It adds derived `operationsUrl` and
`operationsAccess` fields without storing new schema fields. Existing publication,
featured, display-order and unrelated metadata remain intact. It uses the agency
frontend assets under `/projects/mockups/` and `/projects/screenshots/` for the
current chef-hat storefront, desktop/mobile operations demo and Aurelia mockup.
Deploy the matching frontend assets before verifying these URLs in production.

## Verification and release handoff

- Run `npm test`, syntax checks for changed JS, and `git diff --check`.
- This API has no lint, TypeScript or build script; report those as not applicable.
- Controller tests verify published-only reads, private-field exclusion,
  nonmutating consolidation, canonical aliasing, missing/unpublished 404s and
  conflicting repository preservation.
- After deployment, verify health still reports Google + Google Drive, all 14
  unrelated public records remain unchanged, and the frontend shows one SAVORA
  card plus separate Aurelia. Actual admin CRUD did not change and was not used
  as a production mutation test.
- Rollback: redeploy the previous API commit. There are no data migrations or
  production writes to reverse.
