FROM node:20-alpine

WORKDIR /app

# Ensure non-root node user owns application directory and keys mount point
RUN mkdir -p /app/keys && chown -R node:node /app

COPY --chown=node:node package*.json ./
RUN npm install --omit=dev

COPY --chown=node:node . .

# Environment defaults
ENV NODE_ENV=production
ENV PORT=7153
ENV FIREWALLA_IP=192.168.1.1
ENV KEY_DIR=/app/keys

USER node

EXPOSE 7153

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7153/health || exit 1

CMD ["node", "src/server.js"]
