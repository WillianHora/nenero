FROM node:22-alpine AS build
WORKDIR /app

ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL}
ENV EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run export:web

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/server/web-server.mjs ./server/web-server.mjs

EXPOSE 8080
USER node
CMD ["node", "server/web-server.mjs"]
