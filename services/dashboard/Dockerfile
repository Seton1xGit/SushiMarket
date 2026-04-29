# Используем debian-slim вместо alpine — для puppeteer/Chromium это сильно
# надёжнее. Alpine требует ручной установки 10+ библиотек, и часть из них
# (например, libgobject) не всегда совместима с конкретной версией Chromium.
# Debian + apt-installed chromium — официальная рекомендация puppeteer.

FROM node:22-bookworm-slim

# Зависимости для Chromium и шрифты для рендера WhatsApp Web.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        chromium-sandbox \
        fonts-liberation \
        fonts-noto-color-emoji \
        ca-certificates \
        dbus \
        dumb-init \
        wget \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Папка для WhatsApp-сессии. Volume bind-mount наследует владельца
# с хоста — поэтому работаем под root внутри контейнера, чтобы избежать
# неожиданных прав на host-side файлах.
RUN mkdir -p /app/data

EXPOSE 8080

# dumb-init — корректная обработка SIGTERM, чтобы Chromium-зомби не оставались.
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
