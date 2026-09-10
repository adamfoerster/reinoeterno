# Reino Eterno

Site estático de [reinoeterno.online](https://reinoeterno.online) — um arquivo
de escritos, traduções, notas de estudo bíblico e páginas de apps.

O conteúdo não mora aqui. Este repositório é o **gerador**: ele lê um vault
pessoal do Obsidian, que fica fora do projeto, e publica dele apenas as notas
marcadas como públicas.

## Requisitos

- **Node 18+** (o desenvolvimento usa a 22). Se você usa nvm:

  ```bash
  nvm use 22
  ```

- O vault do Obsidian em `../obsidian/`, relativo à raiz deste repositório.
  Sem ele o build não tem entrada.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run build` | Build completo: lê o vault e escreve `dist/` |
| `npm run serve` | Build + watch + servidor de desenvolvimento |
| `npm run upload` | Envia `dist/` para o servidor via SFTP |
| `npm run upload:rsync` | Mesmo destino, enviando só o que mudou |
| `npm run deploy` | `build` seguido de `upload` |

Para mexer só em CSS ou markup, sem rebuildar o site inteiro, sirva o `dist/`
já pronto:

```bash
node node_modules/@11ty/eleventy-dev-server/cmd.js --dir=dist --port=8099
```

As páginas referenciam `/assets/...` de forma absoluta, então abrir os arquivos
por `file://` não funciona. Lembre que `assets/styles.css` é a fonte e
`dist/assets/styles.css` é saída de build — editando um sem rodar o build, copie
o arquivo manualmente.

## Deploy

O destino padrão é o alias `reinoeterno` do seu `~/.ssh/config`, na pasta
`/home/reinoeterno/reinoeterno/dist`. Os dois scripts aceitam sobrescrita por
variável de ambiente:

```bash
DEPLOY_HOST=outro-host DEPLOY_PATH=/caminho/remoto npm run upload
```

O `upload:rsync` repassa flags extras para o rsync:

```bash
npm run upload:rsync -- -n        # simulação, não escreve nada
npm run upload:rsync -- --delete  # apaga no servidor o que sumiu do dist/
```

Ele usa `--checksum` porque todo build reescreve os arquivos: sem isso o rsync
compararia datas e reenviaria o site inteiro toda vez.

Os dois scripts pulam `dist/50._personal/`, definido em `EXCLUDE` no topo de
cada um. O build copia imagens do vault inteiro, inclusive de notas **não**
publicadas, e essa pasta é o resultado disso — sem a exclusão, um deploy
publicaria material privado.

## Estrutura

```
.eleventy.js   todo o build: URLs, markdown do Obsidian, coleções, dados globais
_includes/     layouts Nunjucks (layout.njk, minimal.njk)
assets/        CSS e imagens do tema, copiados para dist/
scripts/       upload por SFTP e por rsync
dist/          saída do build — versionada junto com o código
```

`dist/` ser versionado significa que um build gera um diff grande. Confira
`git status dist` antes de rodar, para não enterrar trabalho pendente.

`src/` não participa do build: são cópias antigas de arquivos que hoje vivem no
vault. Editar ali não tem efeito nenhum.

## Publicando uma nota

Tudo é controlado pelo frontmatter da nota, no vault:

| Campo | Efeito |
| --- | --- |
| `published` | Sem um valor verdadeiro aqui, a página não é gerada |
| `title` | `<h1>` e `<title>` da página |
| `tags` | Páginas de tag e as pílulas abaixo do título |
| `chapter-of`, `chapter` | Agrupa notas num livro de vários capítulos e as ordena |
| `pubOrder`, `pubCover`, `description` | Card na seção de Publicações da home |
| `author`, `translator` | Assinatura do card; `translator` marca uma tradução |
| `appUrl`, `appIcon`, `appDesc` | Linha na seção de Apps (junto com a tag `app`) |
| `refs`, `when`, `where`, `refutes`, `source` | Metadados exibidos acima do texto |

Quais tags viram cards de "Notas de Estudo" vem de uma tabela markdown no
próprio vault, em `90. Assets/reinoeterno.online/TagsList.md`.

Os detalhes de como o build resolve URLs, links e backlinks estão em
[CLAUDE.md](CLAUDE.md).

## Versionamento

O projeto segue [versionamento semântico](https://semver.org/lang/pt-BR/) a
partir da 1.0.0, e as mudanças do gerador ficam no [CHANGELOG.md](CHANGELOG.md).
Como o conteúdo vem do vault, o changelog cobre build, layouts, estilos e
scripts — não as notas publicadas.
