# Comandos do ambiente Vitrola Music.
# Requisito: Docker com Compose v2. Use "make help" para ver os alvos.

COMPOSE ?= docker compose

.DEFAULT_GOAL := help
.PHONY: help check-docker fix-perms token up down restart logs ps build shell-api shell-web test typecheck audit reset local-install clean

help: ## Mostra os comandos disponíveis
	@echo "Vitrola Music - comandos:"
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# No WSL2 garante o Docker Desktop (inicia se preciso) em vez do Docker Engine do WSL.
check-docker:
	@bash scripts/ensure-docker.sh

fix-perms: check-docker ## Ajusta o dono de ./data e das pastas geradas para o usuário dos containers (uid 1000)
	@mkdir -p data/import
	$(COMPOSE) build
	$(COMPOSE) run --rm --no-deps --user root api chown -R node:node /app/data
	$(COMPOSE) run --rm --no-deps --user root web sh -c 'chown -R node:node /app/dev-dist /app/dist 2>/dev/null || true'

token: ## Mostra o token de acesso (gerado na 1ª execução da API)
	@if [ -n "$$AUTH_TOKEN" ]; then echo "$$AUTH_TOKEN"; \
	elif [ -f data/auth-token.txt ]; then cat data/auth-token.txt; \
	elif grep -qs '^AUTH_TOKEN=.' .env; then grep '^AUTH_TOKEN=' .env | cut -d= -f2-; \
	else echo "Token ainda não gerado. Rode 'make up' primeiro."; fi

up: fix-perms ## Sobe API e frontend (build + em segundo plano)
	$(COMPOSE) up -d
	@echo ""
	@echo "  Frontend: http://localhost:5173"
	@echo "  API:      http://localhost:5172/api/health"
	@echo "  Pasta de importação de áudio: ./data/import"
	@echo "  Token de acesso: make token"
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

audit: check-docker ## Verifica vulnerabilidades (npm audit) e pacotes desatualizados (npm outdated) em api/, frontend/ e mobile/
	-$(COMPOSE) run --rm --no-deps api sh -c 'npm audit; npm outdated'
	-$(COMPOSE) run --rm --no-deps web sh -c 'npm audit; npm outdated'
	-cd mobile && { npm audit; npm outdated; }

reset: check-docker ## Recria os containers e os volumes de node_modules (use após mudar dependências)
	$(COMPOSE) down -v
	$(MAKE) up

local-install: ## Alternativa sem Docker: instala as dependências no host
	cd api && npm install
	cd frontend && npm install
	@echo "Para rodar localmente: API em api/ (npm run dev) e frontend em frontend/ (npm run dev)."

clean: check-docker ## Remove containers, volumes e imagens do projeto (não apaga ./data)
	$(COMPOSE) down -v --rmi local

# ---------- APK Android (mobile/) ----------
# Roda no host: precisa de Node, JDK 21 e Android SDK (ANDROID_HOME). Não usa Docker.
APK_DEBUG := mobile/android/app/build/outputs/apk/debug/app-debug.apk
# No WSL2 o adb do Linux não enxerga USB: usa o adb.exe do Windows (ADB=... para trocar).
ADB ?= $(shell command -v adb.exe 2>/dev/null || ls /mnt/c/Android/Sdk/platform-tools/adb.exe /mnt/c/Users/*/AppData/Local/Android/Sdk/platform-tools/adb.exe 2>/dev/null | head -1 || echo adb)
ifeq ($(strip $(ADB)),)
ADB := adb
endif

.PHONY: check-android mobile-install mobile-test mobile-typecheck apk apk-install

check-android:
	@command -v java >/dev/null 2>&1 || { echo "JDK não encontrado. Instale o JDK 21."; exit 1; }
	@[ -n "$$ANDROID_HOME" ] || [ -f mobile/android/local.properties ] || { echo "Android SDK não encontrado: defina ANDROID_HOME."; exit 1; }
	@[ -d mobile/node_modules ] || (cd mobile && npm install)

mobile-install: ## APK: instala as dependências de mobile/ (use após mudar dependências)
	cd mobile && npm install

mobile-test: check-android ## APK: testa a API local (api/src pelos adaptadores Android)
	cd mobile && npm test

mobile-typecheck: check-android ## APK: verifica tipos de mobile/ (inclui frontend/src e api/src reaproveitados)
	cd mobile && npm run typecheck

apk: check-android ## APK: gera o APK de debug (mobile/android/.../app-debug.apk)
	cd mobile && npm run apk
	@echo ""
	@echo "  APK: $(APK_DEBUG)"
	@echo "  Instalar no celular (USB): make apk-install"
	@echo ""

apk-install: ## APK: instala o APK de debug no aparelho conectado via adb
	@case "$(ADB)" in *.exe) apk="$$(wslpath -w $(APK_DEBUG))";; *) apk="$(APK_DEBUG)";; esac; \
	"$(ADB)" install -r "$$apk"
