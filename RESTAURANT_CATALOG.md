# Restaurant platform admin catalog

`src/data/restaurantPlatformProjects.js` contains only the two SAVORA drafts. It does not change the existing portfolio seed or any production record.

`node src/scripts/prepareRestaurantDemoProjects.js` previews the exact target identities without connecting to a provider. `--inspect` reads only matching records from the existing Google provider. After owner approval of the concrete catalog changes, `--apply-drafts --backup-dir=/absolute/private/output/path` writes only these two unpublished drafts. A small private before snapshot contains only the catalog fields that can change; no client, billing, message or file data is copied. Repeating preparation preserves a published release and rejects unrelated repository/slug conflicts.

The existing admin portfolio editor can review these drafts using normal permissions and persistence. Publish only after the new storefront and operations deployment, hostname ownership, login, guest order, order tracking and kitchen transitions have passed live tests. Update the existing Aurelia entry by its stable slug to `https://bar.mspixelpulse.com` only after bar passes HTTPS and route checks. Do not force the full portfolio seed, change real portal projects, or copy restaurant data into the agency production sheets.

Restaurant orders use their own isolated database; the agency continues to use Google Sheets and Google Drive. Authentication secrets, database URLs, owner login sessions and customer information must never appear in public portfolio content.
