FROM node:24-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/.data /app/uploads && chown -R node:node /app

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

USER node

CMD ["node", "src/index.js"]
