FROM node:20-alpine
RUN apk add --no-cache openssl tzdata

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install all deps (including dev) so prisma generate and build work
RUN npm ci && npm cache clean --force

COPY . .

RUN npx prisma generate
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

CMD ["npm", "run", "docker-start"]
