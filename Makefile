.PHONY: setup dev backend frontend test lint clean help

## Default: show help
help:
	@echo "AgentOrch — AI Agent Orchestration Platform"
	@echo ""
	@echo "  make setup      Install all dependencies and initialize the database"
	@echo "  make dev        Start all services for local development"
	@echo "  make backend    Start only the FastAPI backend (hot reload)"
	@echo "  make frontend   Start only the Next.js frontend"
	@echo "  make test       Run the full test suite"
	@echo "  make lint       Run ruff + tsc type checks"
	@echo "  make docker     Start everything via Docker Compose"
	@echo "  make clean      Remove virtual envs, node_modules, and build artifacts"

## Full setup from scratch
setup:
	@echo "→ Setting up AgentOrch..."
	@cp -n .env.example .env 2>/dev/null || true
	@echo "→ Backend: creating venv and installing deps..."
	cd backend && python -m venv .venv && .venv/bin/pip install --quiet -r requirements.txt
	@echo "→ Backend: initializing database..."
	cd backend && .venv/bin/python -c "import asyncio; from backend.database import init_db; asyncio.run(init_db())"
	@echo "→ Frontend: installing Node deps..."
	cd frontend && npm install --silent
	@echo ""
	@echo "✓ Setup complete! Edit .env then run: make dev"

## Start all services concurrently
dev:
	@echo "→ Starting AgentOrch (backend + frontend)..."
	@trap 'kill %1 %2' SIGINT; \
	  (cd backend && .venv/bin/uvicorn main:app --reload --port 8000) & \
	  (cd frontend && npm run dev) & \
	  wait

## Backend only
backend:
	cd backend && .venv/bin/uvicorn main:app --reload --port 8000

## Frontend only
frontend:
	cd frontend && npm run dev

## Run tests
test:
	cd backend && .venv/bin/pytest tests/ -v --tb=short --cov=backend --cov-report=term-missing

## Lint
lint:
	cd backend && .venv/bin/ruff check .
	cd frontend && npx tsc --noEmit

## Docker Compose (production-like local stack)
docker:
	docker compose up --build

## Clean
clean:
	rm -rf backend/.venv backend/__pycache__ backend/**/__pycache__
	rm -rf frontend/node_modules frontend/.next
	rm -f orchid.db orchid_checkpoints.db
	rm -rf .chroma
