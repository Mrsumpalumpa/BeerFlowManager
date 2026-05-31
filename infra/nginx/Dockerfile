# Stage 1: Compilar frontend
FROM node:24-alpine AS build

# Instalar pnpm globalmente
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar archivos de dependencias del frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml* frontend/.npmrc* ./
RUN pnpm install

# Copiar el resto del código fuente del frontend (evitando node_modules de desarrollo del host)
COPY frontend/src ./src
COPY frontend/public ./public
COPY frontend/tsconfig* ./
COPY frontend/vite.config.ts ./
COPY frontend/eslint.config.js ./
COPY frontend/index.html ./

# Generar variables de entorno de producción temporales para la compilación de Vite
ARG VITE_BEERFLOW_WS_URL=ws://localhost:8080
ARG VITE_TAP_MANAGEMENT_URL=http://localhost:8080/api/taps
ARG VITE_BILLING_URL=http://localhost:8080/api/billing
ARG VITE_TAP_MANAGEMENT_WS_URL=ws://localhost:8080/ws/admin

ENV VITE_BEERFLOW_WS_URL=$VITE_BEERFLOW_WS_URL
ENV VITE_TAP_MANAGEMENT_URL=$VITE_TAP_MANAGEMENT_URL
ENV VITE_BILLING_URL=$VITE_BILLING_URL
ENV VITE_TAP_MANAGEMENT_WS_URL=$VITE_TAP_MANAGEMENT_WS_URL

RUN pnpm vite build

# Stage 2: Servir con Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
