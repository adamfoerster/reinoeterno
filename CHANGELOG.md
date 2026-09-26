# Changelog

Todas as mudanças relevantes deste projeto são registradas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

Como o site é gerado a partir de um vault do Obsidian que vive fora deste
repositório, **este changelog registra o gerador — build, layouts, estilos e
scripts — e não o conteúdo publicado**. Notas novas ou revisadas no vault não
entram aqui.

## [Não lançado]

## [1.0.0] - 2026-09-09

Primeira versão versionada. O site já estava no ar; esta entrada descreve o
estado do gerador nesse momento e as mudanças feitas ao fixá-lo em 1.0.0.

### Adicionado

- Build Eleventy que lê um vault do Obsidian como diretório de entrada, com
  publicação opt-in: uma nota só vira página se tiver `published` no
  frontmatter.
- Suporte ao markdown do Obsidian via regras próprias do markdown-it —
  wikilinks (`[[nota]]`, `[[nota|texto]]`), imagens embutidas (`![[img.png]]`,
  copiadas do vault para a saída), links internos com espaços e sem extensão
  (`[texto](80. Bíblia/40. Mateus/Mt 01)`) e links relativos percent-encoded.
- Divisão de parágrafos em capítulos bíblicos: versículos marcados como `######`
  são renderizados como texto corrido, com quebras reconstruídas a partir das
  linhas em branco do original.
- Coleções `tagMap`, `tagList`, `publications` e `backlinks`, esta última
  montando a lista "Links para esta página" nas duas sintaxes de link.
- Páginas de tag paginadas, alimentadas por uma tabela de tags mantida no vault.
- Home com hero, seção de Publicações (capítulos agrupados em livros) e Apps.
- Layouts `layout.njk` (home, tags e artigos) e `minimal.njk`.
- Engine de YAML tolerante a blocos Templater (`<% %>`), para que notas-modelo
  não quebrem o build.
- Scripts npm: `build`, `serve`, `upload`, `upload:rsync` e `deploy`.
- Upload por SFTP (`scripts/upload-sftp.sh`) e por rsync
  (`scripts/upload-rsync.sh`), ambos com host e destino configuráveis por
  `DEPLOY_HOST` / `DEPLOY_PATH`.

### Alterado

- Hero da home: novo texto de apoio, sem a versão em inglês, e o botão primário
  agora rola até a seção de Apps em vez de levar às notas de estudo.
- Rodapé: nova assinatura ("Acumulando um tesouro que não pode ser roubado.
  Esperando um reino que não acabará.").
- O upload ignora `dist/50._personal/` por padrão — o build copia imagens do
  vault inteiro, inclusive de notas não publicadas.

### Removido

- Link "Notas de Estudo" do cabeçalho e a seção correspondente da home; as
  páginas de tag continuam existindo e acessíveis.
- Frase "EST. — Soli Deo Gloria" do hero e "Soli Deo Gloria" do rodapé.

### Problemas conhecidos

- `dist/80._biblia/` guarda 262 páginas de um esquema de URL antigo
  (`56_tito/` em vez de `56._tito/`) que nenhum build atual regenera, mas que
  seguem commitadas e no ar.
- As imagens são sempre copiadas para `./dist`, mesmo com `--output` apontando
  para outro lugar.

[Não lançado]: https://github.com/adamfoerster/reinoeterno/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/adamfoerster/reinoeterno/releases/tag/v1.0.0
