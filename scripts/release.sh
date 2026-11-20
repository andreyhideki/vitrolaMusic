#!/usr/bin/env bash
# Versão manual (o fluxo normal é o PR do release-please, ver .github/workflows/release-please.yml).
# Prepara uma versão: sobe "version" em api/, frontend/ e mobile/ (package.json + lock),
# faz o commit e cria a tag vX.Y.Z. Não faz push: o push da tag dispara o workflow
# .github/workflows/release.yml, que gera o APK e publica o GitHub Release.
# Uso: scripts/release.sh 0.2.0
set -euo pipefail

version="${1:-}"
version="${version#v}"
if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "Uso: make release VERSION=X.Y.Z (ex.: 0.2.0 ou 0.2.0-beta.1)" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Há alterações sem commit. Faça o commit (ou stash) antes de gerar a versão." >&2
  exit 1
fi
branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "Aviso: você está na branch '$branch', não em 'main'." >&2
fi
if git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  echo "A tag v$version já existe." >&2
  exit 1
fi

for dir in api frontend mobile; do
  (cd "$dir" && npm version "$version" --no-git-tag-version --allow-same-version >/dev/null)
done

# Versão final (sem sufixo): avisa o release-please, senão o próximo PR de versão calcula a partir
# da versão antiga. Pré-releases não mexem no manifesto.
if [[ "$version" != *-* ]]; then
  node -e 'const f=".release-please-manifest.json",m=require("./"+f);m["."]=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(m,null,2)+"\n")' "$version"
  git add .release-please-manifest.json
fi

git add api/package.json api/package-lock.json frontend/package.json frontend/package-lock.json \
  mobile/package.json mobile/package-lock.json
git commit -m "chore: versão $version"
git tag -a "v$version" -m "Vitrola Music $version"

echo ""
echo "  Versão $version pronta (commit + tag v$version)."
echo "  Para publicar (gera o APK no GitHub Actions):"
echo "    git push origin $branch v$version"
echo ""
