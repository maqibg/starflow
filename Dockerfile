# ============================================
# Starflow Docker Build
# ============================================

# Node 20 已停止维护；22.23.4 为 2026-10-21 批漏洞（含 Brotli 越界写 RCE）的修复版本
FROM node:22.23.4-alpine AS base

# Alpine 侧 ca-certificates 需 20261020-r0 起才移除受限根与 emSign 交叉签名链；
# 构建日志打印实际生效版本，避免用"tag 看起来新"代替实证
RUN apk add --no-cache --upgrade ca-certificates && apk info -e ca-certificates

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
# 固定 9.15.9：pnpm 12 默认拦截未授权的依赖构建脚本并以
# ERR_PNPM_IGNORED_BUILDS 失败（prisma/sharp/swc 等需要 postinstall）
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm prisma generate

# ============================================
# Build stage
# ============================================
FROM base AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build application
RUN pnpm build

# ============================================
# Production stage
# ============================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install prisma CLI for migrations
RUN npm install -g prisma@5.22.0

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Set correct permissions for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
