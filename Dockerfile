# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
# API URL is baked in at build time (Vite static build).
ARG VITE_API_BASE=http://localhost:8787
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# --- serve stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
