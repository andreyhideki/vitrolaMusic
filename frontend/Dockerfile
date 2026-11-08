# Ambiente de desenvolvimento do frontend (Vite). O código é montado por volume (hot reload).
FROM node:24-bookworm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Roda sem privilégios de root (uid 1000). O Vite precisa gravar em node_modules/.vite.
RUN chown -R node:node /app
USER node

EXPOSE 5173
CMD ["npm", "run", "dev"]
