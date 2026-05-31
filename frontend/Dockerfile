FROM node:24-alpine

# Instalar pnpm globalmente
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./

# Instalar dependencias
RUN pnpm install

# Copiar el resto del código fuente
COPY . .

# Exponer el puerto configurado en Vite
EXPOSE 3000

# Arrancar en modo desarrollo (para que tome los volúmenes)
CMD ["pnpm", "run", "dev"]
