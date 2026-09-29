# Cloud Run image.
#
# Multi-stage so the runtime layer carries no compiler and no dev deps.
# There are no native modules on purpose -- password hashing uses scrypt from
# node:crypto rather than argon2 -- which is why no build toolchain appears
# here and why the image cannot hit a glibc/musl mismatch at runtime.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm ci --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# Cloud Run sends SIGTERM on shutdown. Node as PID 1 ignores it, so the
# container would be force-killed after the grace period instead of draining.
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
# Cloud Run injects PORT; the app binds it and listens on 0.0.0.0.
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
