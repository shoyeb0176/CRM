---
name: Docs and self-hosted image
description: Public guides at /docs (one content file), the self-hosted Docker image, one-click updater and release feed (v1.4.0)
type: feature
---
- Guides live in ONE file: `src/lib/docs/content.ts` (self-hosting, updates, mcp, faq). Pages `/docs` and `/docs/$slug` render it (`src/components/marketing/docs.tsx`); the MCP tool `inuberry_help` and the assistant (`APP_GUIDE`, `guideEntries()` in `src/lib/ai/app-guide.ts`) search the same text. Change the text there, not in the pages. `/developers/mcp` redirects to `/docs/mcp`.
- The image download name is the constant `SELF_HOST_IMAGE` (with `SELF_HOST_IMAGE_READY`) in `content.ts`: still a placeholder until the registry is chosen.
- Image (`Dockerfile`): built once with placeholders `__INB_SUPABASE_URL__` etc.; `deploy/entrypoint.mjs` copies `.output-template` and fills them from `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, `STRIPE_PUBLISHABLE_KEY`, runs `scripts/db-migrate.sh` when `DATABASE_URL` is set, then starts the server. No source or source maps go in. `inuberry make-admin <email>` inside the container.
- Updater (`deploy/updater.mjs`, same image, Docker socket): `POST /update` (202) pulls the image of the container labelled `inuberry.role=app`, recreates it keeping only the install's own settings, waits for healthy, and puts the previous version back on failure. `GET /status`. The app calls it through `installUpdate` / `updateProgress` (UPDATER_URL, UPDATER_TOKEN).
- Release feed `/api/public/releases` comes from CHANGELOG.md (`src/lib/releases.ts`); write changelog bullets for people, they show in the update pop-up. `.github/workflows/release.yml` publishes `ghcr.io/<owner>/inuberry:<version>` and `:latest` on a `v*` tag.
- Scripts that run in the image keep LF endings (`.gitattributes`).
