FROM node:20-slim

# Instalar OpenSSL para Prisma e curl para healthcheck
RUN apt-get update && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm ci --only=production

# Copiar código fonte
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json nest-cli.json ./

# Gerar Prisma Client
RUN npx prisma generate

# Build
RUN npm run build

# Copiar arquivos estáticos
COPY public ./public

# Criar diretório para mídia (será montado via volume)
RUN mkdir -p data/media

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/main.js"]
