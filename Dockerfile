# syntax=docker/dockerfile:1

# ---- deps: ставим зависимости отдельно для кэша слоёв ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: собираем standalone-сервер ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* вшиваются в клиентский бандл во время `next build`, поэтому
# их нужно передать как build-args (в Dokploy → вкладка Build, секция Args).
# Серверные секреты (ANTHROPIC_API_KEY, BGG_API_TOKEN) сюда НЕ кладём —
# они нужны только в рантайме и задаются как Environment в Dokploy.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runner: минимальный образ только с нужными файлами ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Порт берётся из env. Дефолт 3000 можно поменять на этапе сборки
# (--build-arg PORT=8080) или переопределить в рантайме (-e PORT=8080) —
# standalone server.js слушает process.env.PORT.
ARG PORT=3000
ENV PORT=${PORT}
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# public и static не входят в standalone-сервер по умолчанию — копируем вручную.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE ${PORT}
CMD ["node", "server.js"]
