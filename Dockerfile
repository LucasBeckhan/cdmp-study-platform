FROM node:22-alpine
WORKDIR /app

# 生产依赖为零：仅 Node 内置模块
COPY package.json ./
COPY index.html ./
COPY css ./css
COPY js ./js
COPY server ./server
COPY data/vault.js ./data/vault.js
COPY data/content.sha256 ./data/content.sha256

ENV NODE_ENV=production
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8787/api/health || exit 1

CMD ["node", "server/index.mjs"]
