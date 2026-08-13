# syntax=docker/dockerfile:1

# Stage 1: Build dependencies (if any)
FROM node:20-alpine AS deps
WORKDIR /app
# Copy only package.json and package-lock.json if present
COPY --link package.json ./
# If you use lock files, uncomment the next line
# COPY --link package-lock.json ./
RUN if [ -f package.json ]; then npm install --production; fi

# Stage 2: Final image
FROM node:20-alpine AS final
WORKDIR /app

# Create a non-root user
RUN addgroup -S pubcast && adduser -S pubcast -G pubcast

# Copy static files (your JS/CSS/HTML assets)
COPY --link . ./

# Copy node_modules from deps stage if present
COPY --from=deps /app/node_modules ./node_modules

USER pubcast

# If you have a server.js or index.js entrypoint, set it here
# For a static frontend, you may want to use a static file server like 'http-server'
# Install http-server if needed
RUN npm install -g http-server

# Expose port 8080 (default for http-server)
EXPOSE 8080

# Start static file server
CMD ["http-server", ".", "-p", "8080"]

# Notes:
# - If your JS files are only frontend assets, this serves them statically.
# - If you have a Node.js backend, change CMD to ["node", "server.js"] or your entrypoint.
# - Make sure to add .git, .env, lock files, and IDE configs to your .dockerignore.
