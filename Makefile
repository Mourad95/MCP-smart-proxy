SHELL := /bin/bash

# Install dependencies
install:
	npm install
	cd dashboard && npm install

# Build backend + healthcheck + dashboard
build:
	npm run build:full

# Run the proxy in development mode (TypeScript via ts-node)
dev:
	npm run dev

# Simple command to run the project (build once, then start from dist)
run: build
	npm start

# Run in production mode with production config
start-prod:
	npm run start:prod

# Run tests
test:
	npm test

# Run lints (when eslint config is available)
lint:
	npm run lint || true

# Format backend sources
format:
	npm run format

# Build and run via Docker
docker-build:
	npm run docker:build

docker-run:
	npm run docker:run

docker-compose:
	npm run docker:compose

.PHONY: install build dev run start-prod test lint format docker-build docker-run docker-compose

