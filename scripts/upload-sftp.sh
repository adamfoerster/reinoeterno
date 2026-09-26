#!/bin/sh
# Envia o conteúdo de dist/ para o servidor via SFTP.
#
#   npm run upload          # envia dist/ como está
#   npm run deploy          # build + upload
#
# O host vem do ~/.ssh/config (alias "reinoeterno"). Para apontar para outro
# lugar sem editar este arquivo: DEPLOY_HOST=... DEPLOY_PATH=... npm run upload
set -eu

HOST="${DEPLOY_HOST:-reinoeterno}"
REMOTE="${DEPLOY_PATH:-/home/reinoeterno/reinoeterno/dist}"

# Pastas de dist/ que nunca devem ir para o ar (nomes de primeiro nível,
# separados por espaço). O build copia imagens do vault inteiro, inclusive de
# notas não publicadas — ver CLAUDE.md, "beforeBuild".
EXCLUDE="50._personal"

cd "$(dirname "$0")/.."

[ -d dist ] || { echo "dist/ não existe. Rode 'npm run build' antes." >&2; exit 1; }

filter() {
  if [ -n "$EXCLUDE" ]; then
    pattern=$(printf '%s\n' $EXCLUDE | sed 's#^#^dist/#' | paste -sd'|' -)
    grep -Ev "$pattern"
  else
    cat
  fi
}

batch=$(mktemp)
trap 'rm -f "$batch"' EXIT

{
  echo "-mkdir \"$REMOTE\""
  find dist -mindepth 1 -type d | filter | sed "s#^dist/#-mkdir \"$REMOTE/#; s#\$#\"#"
  find dist -mindepth 1 -type f | filter | sed "s#^dist/\\(.*\\)\$#put \"dist/\\1\" \"$REMOTE/\\1\"#"
} > "$batch"

echo "Enviando $(grep -c '^put ' "$batch") arquivos para $HOST:$REMOTE"
sftp -b "$batch" "$HOST"
echo "Upload concluído."
