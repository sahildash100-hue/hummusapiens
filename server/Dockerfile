FROM node:20-alpine

WORKDIR /app

# Install only production deps first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Persisted orders live here; mount a volume at this path.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8787
CMD ["node", "index.js"]
