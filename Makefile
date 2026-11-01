# Comandos do ambiente Vitrola Music.
# Requisito: Docker com Compose v2. Use "make help" para ver os alvos.

COMPOSE ?= docker compose

.DEFAULT_GOAL := help
.PHONY: help check-docker up down restart logs ps build shell-api shell-web test typecheck reset local-install clean

help: ## Mostra os comandos disponíveis
	@echo "Vitrola Music - comandos:"
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

check-docker:
	@command -v docker >/dev/null 2>&1 || { echo "Docker não encontrado. Instale o Docker Desktop ou o Docker Engine."; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 não encontrado."; exit 1; }

up: check-docker ## Sobe API e frontend (build + em segundo plano)
	@mkdir -p data/import
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Frontend: http://localhost:5173"
	@echo "  API:      http://localhost:5172/api/health"
	@echo "  Pasta de importação de áudio: ./data/import"
	@echo ""

down: check-docker ## Para os containers
	$(COMPOSE) down

restart: check-docker ## Reinicia os containers
	$(COMPOSE) restart

logs: check-docker ## Acompanha os logs (Ctrl+C para sair)
	$(COMPOSE) logs -f

ps: check-docker ## Mostra o estado dos containers
	$(COMPOSE) ps

build: check-docker ## Reconstrói as imagens
	$(COMPOSE) build

shell-api: check-docker ## Abre um shell dentro do container da API
	$(COMPOSE) exec api sh

shell-web: check-docker ## Abre um shell dentro do container do frontend
	$(COMPOSE) exec web sh

test: check-docker ## Roda os testes da fila do player
	$(COMPOSE) run --rm --no-deps web npm test

typecheck: check-docker ## Verifica os tipos da API e do frontend
	$(COMPOSE) run --rm --no-deps api npm run typecheck
	$(COMPOSE) run --rm --no-deps web npm run typecheck

reset: check-docker ## Recria os containers e os volumes de node_modules (use após mudar dependências)
	$(COMPOSE) down -v
	$(MAKE) up

local-install: ## Alternativa sem Docker: instala as dependências no host
	cd api && npm install
	cd frontend && npm install
	@echo "Para rodar localmente: API em api/ (npm run dev) e frontend em frontend/ (npm run dev)."

clean: check-docker ## Remove containers, volumes e imagens do projeto (não apaga ./data)
	$(COMPOSE) down -v --rmi local
