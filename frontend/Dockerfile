# Development stage
FROM node:20-alpine AS development

WORKDIR /frontend

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start Vite dev server with hot reload
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# Production stage - Build
FROM node:20-alpine AS builder

WORKDIR /frontend

COPY package*.json ./
# Use npm ci for reproducible production builds
RUN npm ci --legacy-peer-deps

COPY . .

# Build the application
RUN npm run build

# Production stage - Serve with Nginx
FROM nginx:1.25-alpine AS production

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder stage
COPY --from=builder /frontend/dist /usr/share/nginx/html

# Create a script to handle React Router
RUN echo 'server { \
    listen 80; \
    server_name _; \
    \
    # Gzip compression for better performance \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript; \
    \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    \
    location /api/ { \
        proxy_pass http://backend:8000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]