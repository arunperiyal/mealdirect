FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application code (.dockerignore keeps .env, tests and local data out)
COPY src ./src
COPY scripts ./scripts

# The node image ships an unprivileged "node" user
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
