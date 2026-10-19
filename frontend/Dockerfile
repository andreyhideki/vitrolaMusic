# Ambiente de desenvolvimento do frontend (Vite). O código é montado por volume (hot reload).
FROM node:20-bookworm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev"]
