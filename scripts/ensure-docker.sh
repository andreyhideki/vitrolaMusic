#!/usr/bin/env bash
# Garante que o Docker está disponível antes dos comandos do Makefile.
#
# No WSL2, usa SEMPRE o Docker Desktop do Windows (integração WSL). O Docker
# Engine instalado dentro do WSL (docker-ce) publica as portas só na VM do WSL,
# então o celular/rede não alcança o frontend. Se o daemon conectado não for o
# Docker Desktop, o script para o engine do WSL e inicia o Docker Desktop.
#
# Variáveis:
#   VITROLA_ALLOW_WSL_DOCKER=1   aceita o Docker Engine do WSL (pula a troca)
#   DOCKER_DESKTOP_EXE=...       caminho do "Docker Desktop.exe"
#   DOCKER_WAIT_SECONDS=120      tempo máximo esperando o Docker Desktop subir
set -euo pipefail

command -v docker >/dev/null 2>&1 || { echo "Docker não encontrado. Instale o Docker Desktop ou o Docker Engine."; exit 1; }

is_wsl() { grep -qi microsoft /proc/version 2>/dev/null; }

daemon_os() { timeout 10 docker info --format '{{.OperatingSystem}}' 2>/dev/null || true; }

check_compose() {
  docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 não encontrado."; exit 1; }
}

if ! is_wsl || [ "${VITROLA_ALLOW_WSL_DOCKER:-0}" = "1" ]; then
  [ -n "$(daemon_os)" ] || { echo "Não foi possível conectar ao daemon do Docker. Ele está rodando?"; exit 1; }
  check_compose
  exit 0
fi

# --- WSL2: exige o Docker Desktop -----------------------------------------
os="$(daemon_os)"
case "$os" in
  *"Docker Desktop"*) check_compose; exit 0 ;;
esac

# O Docker Engine do WSL não pode ficar com o /var/run/docker.sock.
if command -v systemctl >/dev/null 2>&1 && \
   { systemctl is-active --quiet docker.service 2>/dev/null || systemctl is-active --quiet docker.socket 2>/dev/null; }; then
  echo "Parando o Docker Engine do WSL (use o Docker Desktop)..."
  sudo systemctl stop docker.socket docker.service
  echo "Dica: para não subir de novo no boot: sudo systemctl disable docker.service docker.socket"
fi

# Sem a integração WSL habilitada para esta distro, o Docker Desktop nunca cria
# o /var/run/docker.sock aqui: avisa já, em vez de esperar o timeout.
check_wsl_integration() {
  local appdata settings distro="${WSL_DISTRO_NAME:-}"
  [ -n "$distro" ] && command -v cmd.exe >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1 || return 0
  appdata="$(cd /mnt/c 2>/dev/null && cmd.exe /c 'echo %APPDATA%' 2>/dev/null | tr -d '\r')" || return 0
  [ -n "$appdata" ] || return 0
  settings="$(wslpath "$appdata" 2>/dev/null)/Docker/settings-store.json"
  [ -f "$settings" ] || return 0
  local default_distro
  default_distro="$(wsl.exe -l -q 2>/dev/null | tr -d '\0\r' | head -n1)"
  python3 -I - "$settings" "$distro" "$default_distro" <<'PY' && return 0
import json, sys
path, distro, default = sys.argv[1:4]
try:
    s = json.load(open(path, encoding="utf-8-sig"))
except Exception:
    sys.exit(0)
if distro in (s.get("IntegratedWslDistros") or []):
    sys.exit(0)
if s.get("EnableIntegrationWithDefaultWslDistro", True) and distro == default:
    sys.exit(0)
sys.exit(1)
PY
  echo "A integração WSL do Docker Desktop está desligada para a distro '$distro'."
  echo "Abra Docker Desktop > Settings > Resources > WSL integration, ative '$distro',"
  echo "clique em 'Apply & restart' e rode o comando de novo."
  exit 1
}
check_wsl_integration

exe="${DOCKER_DESKTOP_EXE:-/mnt/c/Program Files/Docker/Docker/Docker Desktop.exe}"
if [ ! -f "$exe" ]; then
  echo "Docker Desktop não encontrado em: $exe"
  echo "Instale o Docker Desktop no Windows ou defina DOCKER_DESKTOP_EXE."
  exit 1
fi

echo "Iniciando o Docker Desktop..."
# Inicia pelo Windows sem prender o terminal.
( cd /mnt/c && cmd.exe /c start "" "$(wslpath -w "$exe")" >/dev/null 2>&1 ) || "$exe" >/dev/null 2>&1 &

wait_s="${DOCKER_WAIT_SECONDS:-120}"
for ((i = 0; i < wait_s; i += 2)); do
  os="$(daemon_os)"
  case "$os" in
    *"Docker Desktop"*) echo "Docker Desktop pronto."; check_compose; exit 0 ;;
  esac
  sleep 2
done

echo "O Docker Desktop não respondeu em ${wait_s}s (daemon atual: ${os:-nenhum})."
echo "Verifique em Docker Desktop > Settings > Resources > WSL integration se a distro"
echo "'${WSL_DISTRO_NAME:-atual}' está habilitada, e se o docker-ce do WSL não está ativo."
exit 1
