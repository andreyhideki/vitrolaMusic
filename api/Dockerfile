# Ambiente de desenvolvimento da API. O código é montado por volume (hot reload).
# node:20-bookworm já inclui toolchain (python, make, g++), necessária para o better-sqlite3 se não houver binário pré-compilado.
FROM node:20-bookworm

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

EXPOSE 3001
CMD ["npm", "run", "dev"]
