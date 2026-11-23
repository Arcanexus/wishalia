# One Dockerfile for the four images: docker build --build-arg APP=api|worker|web-app|web-public .
# The build runs on the build machine (no QEMU): the apps are plain JavaScript once built, with no
# native module, so the output works on every target architecture.
ARG NODE_VERSION=24

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build
ARG APP
RUN test -n "$APP" || (echo "build with --build-arg APP=api|worker|web-app|web-public" >&2; exit 1)
ENV PNPM_HOME=/pnpm CI=true
RUN corepack enable
WORKDIR /repo

# Dependencies first, for the layer cache: only the manifests and the lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web-app/package.json apps/web-app/
COPY apps/web-public/package.json apps/web-public/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/metrics/package.json packages/metrics/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm turbo run build --filter "@wishalia/${APP}..."

# Production files of the app only: dist/ (or build/ for SvelteKit) and its runtime dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter "@wishalia/${APP}" deploy --prod /out \
    && if [ -d "apps/${APP}/build" ]; then cp -r "apps/${APP}/build" /out/build; fi


FROM node:${NODE_VERSION}-alpine
ARG APP
ARG VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=${VERSION}

# npm, corepack and yarn are not used at run time: removed, so image scanners do not report their CVEs
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn* \
    && adduser -D -H -u 10001 -s /sbin/nologin wishalia

WORKDIR /app
COPY --from=build --chown=root:root /out/ /app/

# The entry point of each app: dist/main.js (API, worker) or build/ (SvelteKit, adapter-node)
RUN if [ -d build ]; then echo build > .entry; else echo dist/main.js > .entry; fi

USER 10001
EXPOSE 3000 9464
ENV PORT=3000
# exec: node is PID 1 and receives SIGTERM from Kubernetes
CMD ["sh", "-c", "exec node \"$(cat .entry)\""]
