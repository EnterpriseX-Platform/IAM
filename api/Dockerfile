# Base image
FROM golang:1.25-alpine AS builder

# Install Oracle Instant Client dependencies and build tools
RUN apk add --no-cache libaio libnsl libc6-compat curl unzip build-base gcc

# Download and install Oracle Instant Client
WORKDIR /opt/oracle
RUN curl -o instantclient-basiclite.zip https://download.oracle.com/otn_software/linux/instantclient/instantclient-basiclite-linuxx64.zip && \
    unzip instantclient-basiclite.zip && \
    rm -f instantclient-basiclite.zip && \
    cd /opt/oracle/instantclient* && \
    rm -f *jdbc* *occi* *mysql* *README *jar uidrvci genezi adrci && \
    mkdir -p /etc/ld.so.conf.d && \
    echo /opt/oracle/instantclient* > /etc/ld.so.conf.d/oracle-instantclient.conf && \
    ldconfig || true

# Set Oracle environment variables
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_26:$LD_LIBRARY_PATH

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Accept build argument for application profile (default: local)
# Usage: docker build --build-arg APP_PROFILE=uat ...
ARG APP_PROFILE=local

# Copy the appropriate .env file based on APP_PROFILE
# If .env.{APP_PROFILE} exists, use it. Otherwise fallback to .env or .env.local
RUN echo "Building with APP_PROFILE=${APP_PROFILE}" && \
    if [ -f ".env.${APP_PROFILE}" ]; then \
        echo "Using .env.${APP_PROFILE}" && \
        cp ".env.${APP_PROFILE}" .env; \
    elif [ -f ".env" ]; then \
        echo "Using .env" && \
        cat .env; \
    elif [ -f ".env.local" ]; then \
        echo "Using .env.local" && \
        cp .env.local .env; \
    else \
        echo "WARNING: No .env file found - will rely on environment variables"; \
    fi

# Verify .env was created
RUN if [ -f ".env" ]; then \
        echo "=== .env file contents (passwords masked) ===" && \
        cat .env | grep -v PASSWORD | grep -v SECRET | grep -v KEY || true; \
    else \
        echo "No .env file in final build"; \
    fi

# Debug: Verify file structure and go.mod
RUN echo "=== Verifying build environment ===" && \
    pwd && \
    ls -la && \
    echo "=== go.mod content ===" && \
    cat go.mod && \
    echo "=== core directory structure ===" && \
    ls -la core/ && \
    echo "=== middleware directory ===" && \
    ls -la core/middleware/ && \
    echo "=== Go version ===" && \
    go version && \
    echo "=== Go env ===" && \
    go env GO111MODULE GOPATH GOMODCACHE

# Ensure Go module mode is enabled
ENV GO111MODULE=on

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o main .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates libaio libnsl libc6-compat

# Copy Oracle Instant Client from builder
COPY --from=builder /opt/oracle /opt/oracle
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_26:$LD_LIBRARY_PATH

WORKDIR /root/

# Copy binary and env config from builder
COPY --from=builder /app/main .
COPY --from=builder /app/.env* ./

EXPOSE 8080

CMD ["./main"]
