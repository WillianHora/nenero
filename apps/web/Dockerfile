FROM node:22-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=2048"

ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL}
ENV EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

COPY . .
RUN npm run export:web
RUN cp apps/web/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js apps/web/dist/pdf.worker.min.js

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/server/web-server.mjs ./server/web-server.mjs

EXPOSE 8080
USER node
CMD ["node", "server/web-server.mjs"]
