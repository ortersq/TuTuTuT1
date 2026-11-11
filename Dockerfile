# ==============================================================================
# Production Dockerfile for Binance Futures Quant Lab
# Multi-stage build: Node.js 20 builder -> Lightweight Nginx Alpine server
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies (including devDependencies needed for build)
RUN npm ci --silent || npm install --silent

# Copy all source files
COPY . .

# Build production bundle
RUN npm run build

# Stage 2: Production Nginx Server
FROM nginx:alpine

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
