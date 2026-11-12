# Passerelle Manora Live (Raspberry Pi, arm64). Node 24 exécute le TypeScript directement.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    QUEUE_FILE=/data/queue.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
CMD ["node", "src/index.ts"]
