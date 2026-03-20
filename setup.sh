#!/bin/bash
# DSV-CLIQ Setup Script
# Installs all dependencies and starts the development environment

set -e

echo "🚀 Setting up DSV-CLIQ..."

# Check prerequisites
check_command() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌ $1 is required but not installed. Please install it first."
    echo "   $2"
    exit 1
  fi
}

check_command "node" "https://nodejs.org (v20+)"
check_command "pnpm" "npm install -g pnpm"
check_command "docker" "https://docs.docker.com/get-docker/"
check_command "docker" "docker compose (v2) is required"

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js v20+ required. Current: $(node -v)"
  exit 1
fi

echo "✅ Prerequisites checked"

# Copy env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example"
  echo "⚠️  Please edit .env with your actual secrets before starting services"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

echo "✅ Dependencies installed"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
pnpm db:generate

echo "✅ Prisma client generated"

# Start infrastructure
echo "🐳 Starting Docker infrastructure..."
docker compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Wait for PostgreSQL
echo -n "  PostgreSQL..."
until docker compose exec -T postgres pg_isready -U comms &>/dev/null; do
  sleep 2
  echo -n "."
done
echo " ✅"

# Wait for Redis
echo -n "  Redis..."
until docker compose exec -T redis redis-cli ping &>/dev/null; do
  sleep 2
  echo -n "."
done
echo " ✅"

# Run database migrations
echo "🗃️  Running database migrations..."
pnpm db:migrate

echo "✅ Database migrations applied"

echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DSV-CLIQ is ready to run!"
echo ""
echo "  Start all services:     pnpm dev"
echo "  Start web only:         pnpm dev --filter=@comms/web"
echo "  Start infra only:       docker compose up -d"
echo ""
echo "  Services:"
echo "    Web App:              http://localhost:3000"
echo "    Admin Dashboard:      http://localhost:3001"
echo "    Auth Service:         http://localhost:3001/health"
echo "    Chat Service:         http://localhost:3002/health"
echo ""
echo "  Infrastructure:"
echo "    PostgreSQL:           localhost:5432"
echo "    Redis:                localhost:6379"
echo "    Kafka UI:             http://localhost:8080"
echo "    MinIO Console:        http://localhost:9001 (minioadmin/minioadmin)"
echo "    Elasticsearch:        http://localhost:9200"
echo "    Kibana:               http://localhost:5601"
echo "    MailHog:              http://localhost:8025"
echo "    Redis Commander:      http://localhost:8081"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
