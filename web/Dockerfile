# Base image
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Accept build argument for application profile (default: local)
# Usage: docker build --build-arg APP_PROFILE=uat ...
ARG APP_PROFILE=local

# Copy the appropriate .env file based on APP_PROFILE
# This ensures the correct config is baked into the build
RUN echo "Building with APP_PROFILE=${APP_PROFILE}" && \
    if [ -f ".env.${APP_PROFILE}" ]; then \
        echo "Using .env.${APP_PROFILE}" && \
        cp ".env.${APP_PROFILE}" .env.local; \
    elif [ -f ".env" ]; then \
        echo "Using .env" && \
        cp .env .env.local; \
    elif [ -f ".env.local" ]; then \
        echo "Using existing .env.local"; \
    else \
        echo "WARNING: No .env file found"; \
    fi

# Verify environment file
RUN if [ -f ".env.local" ]; then \
        echo "=== Environment file contents ===" && \
        cat .env.local | grep -v PASSWORD | grep -v SECRET | grep -v KEY || true; \
    fi

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Run the application
CMD ["npm", "start"]
