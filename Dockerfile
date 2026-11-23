FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY views/ ./views/
COPY public/ ./public/
COPY migrations/ ./migrations/
COPY mcp-server/ ./mcp-server/

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
