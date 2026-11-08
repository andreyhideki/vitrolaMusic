# Ambiente de desenvolvimento da API. O código é montado por volume (hot reload).
# node:24-bookworm (LTS) já inclui toolchain (python, make, g++), necessária para o better-sqlite3 se não houver binário pré-compilado.
FROM node:24-bookworm

WORKDIR /app

# Instala ferramentas necessárias para download/conversão de áudio.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp==2026.10.26 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Roda sem privilégios de root (uid 1000). O "make up" ajusta o dono de ./data.
RUN chown -R node:node /app
USER node

EXPOSE 5172
CMD ["npm", "run", "dev"]
