FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# 'xlsx' (used by the OCR routes) and its runtime deps get silently dropped by Next's
# standalone-output file tracing — copy them in explicitly rather than fight the tracer.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/xlsx ./node_modules/xlsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/adler-32 ./node_modules/adler-32
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/cfb ./node_modules/cfb
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/codepage ./node_modules/codepage
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/crc-32 ./node_modules/crc-32
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ssf ./node_modules/ssf
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
