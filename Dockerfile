# Inuberry: the self-hosted image (any Docker host: AWS, Google Cloud, a server in the office).
#
# One image for every install. The browser needs the install's Supabase address and key, so the app
# is built with placeholders and deploy/entrypoint.mjs fills them in from the environment at start,
# then updates the database and runs the server. Install guide: /docs/self-hosting.
#
#   docker build -t inuberry .
#   docker run -p 3000:3000 --env-file .env inuberry
#
# The image holds the built app only: no source files, no source maps.

FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
# Placeholders, replaced at start. (Passing real values here still works for a one-off private build.)
ARG VITE_SUPABASE_URL=__INB_SUPABASE_URL__
ARG VITE_SUPABASE_PUBLISHABLE_KEY=__INB_SUPABASE_KEY__
ARG VITE_SUPABASE_PROJECT_ID=__INB_SUPABASE_PROJECT__
ARG VITE_STRIPE_PUBLISHABLE_KEY=__INB_STRIPE_PK__
ARG VITE_OAUTH_MODE=native
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY \
    VITE_OAUTH_MODE=$VITE_OAUTH_MODE
# The repo's .env files hold the hosted (Lovable) values; they must not end up in the image.
RUN rm -f .env .env.development .env.production && bun run build:node && find .output -name "*.map" -delete

FROM node:22-alpine AS runtime
WORKDIR /app
# psql + bash: database updates on start (scripts/db-migrate.sh).
RUN apk add --no-cache bash postgresql-client
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.output ./.output-template
COPY scripts/db-migrate.sh scripts/db-bootstrap.sh ./scripts/
COPY supabase/migrations ./supabase/migrations
COPY drizzle/migrations ./drizzle/migrations
COPY deploy/entrypoint.mjs deploy/updater.mjs ./deploy/
COPY deploy/email-templates ./deploy/email-templates
COPY --chmod=755 deploy/inuberry /usr/local/bin/inuberry
RUN mkdir -p .output && chown -R node:node /app
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/public/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "deploy/entrypoint.mjs"]
