FROM node:22-alpine

# whatsapp-web.js использует Chromium через puppeteer — добавим его в образ.
# Это нужно даже если на старте WA не подключён, чтобы не пересобирать после.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    wget

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8080

CMD ["node", "src/server.js"]
