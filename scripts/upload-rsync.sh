#!/bin/sh
# Alternativa ao upload por SFTP: envia só o que mudou (o servidor tem rsync).
#
#   npm run upload:rsync             # envia as diferenças
#   npm run upload:rsync -- --delete # + apaga no servidor o que não existe mais em dist/
#   npm run upload:rsync -- -n       # simulação, não escreve nada
set -eu

HOST="${DEPLOY_HOST:-reinoeterno}"
REMOTE="${DEPLOY_PATH:-/home/reinoeterno/reinoeterno/dist}"
EXCLUDE="50._personal"

cd "$(dirname "$0")/.."

[ -d dist ] || { echo "dist/ não existe. Rode 'npm run build' antes." >&2; exit 1; }

# --checksum porque todo build reescreve os arquivos (mtime novo mesmo com
# conteúdo idêntico); sem ele o rsync reenviaria o dist/ inteiro toda vez.
set -- -avz --checksum "$@"
for dir in $EXCLUDE; do
  set -- "$@" --exclude "$dir/"
done

echo "Sincronizando dist/ com $HOST:$REMOTE"
rsync "$@" dist/ "$HOST:$REMOTE/"
echo "Upload concluído."
