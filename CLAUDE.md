# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Eleventy static site (`reinoeterno.online`) that publishes a subset of a **personal Obsidian vault** as an editorial-style archive of study notes, translations and app pages. Site content and UI are in Portuguese; part of the content (the Promised Land manual) is also in English and Spanish.

## Commands

There are no npm scripts (`npm test` is the unmodified stub) and no test or lint setup.

```bash
npx @11ty/eleventy
```

Full build: reads the vault, writes `dist/`.

```bash
npx @11ty/eleventy --serve
```

Build plus watch and dev server.

```bash
node node_modules/@11ty/eleventy-dev-server/cmd.cjs --dir=dist --port=8099
```

Serve the already-built `dist/` without rebuilding — the fast path for CSS/markup work. Pages reference `/assets/...` absolutely, so `file://` will not work. `.claude/launch.json` starts this same server for the Browser pane.

## Architecture

### The input directory is outside the repo

`dir.input` is `../obsidian/` — a personal vault, not a content folder in this project. Consequences:

- **The vault holds private material** (personal documents, financial PDFs). Publishing is opt-in: `eleventyComputed.permalink` returns `false` for anything whose frontmatter lacks a truthy `published`, so unpublished notes produce no output at all. Never make that gate more permissive.
- `dir.includes` is `../reinoeterno/_includes/` — a path back into this repo from the vault.
- `dist/` **is committed** (~1600 files). Rebuilds produce large diffs; check `git status dist` before running a build so you do not bury or overwrite pending work.
- `src/` in this repo is **not part of the build** — `src/index.md` and `src/tags/tag.md` are stale duplicates of vault files (`index.md`, `90. Assets/tags/tag.md`). Edit the vault copies; the repo ones do nothing.

### `.eleventy.js` is the entire build

Everything below lives in that one file.

**URL scheme.** `slugify()` (slugify lib, `locale: "pt"`, spaces → `_`, lowercase) is applied per path segment by `slugifyKeep()`. So `60. Projects/Promised Land - manual/en/cards.md` becomes `/60._projects/promised_land_-_manual/en/cards/`. The same function generates permalinks, wikilink hrefs and backlink keys — they must stay in agreement, so changing slugification breaks every internal link at once.

A note named `index.md` is the exception: its permalink drops the `index` segment (`…/en/index.md` → `…/en/index.html`, served at `…/en/`), so a link to it must not stay extensionless — `…/en/index` would send the host looking for an `index/` folder. `pageHref()` appends the `.html` and is applied wherever a link is emitted (both markdown-it rules, the `wikilinks_attr` filter, and the backlink source urls); the `backlinks` collection strips it again when building keys, since the page's own url is the folder.

**Obsidian markdown support** is implemented as custom markdown-it inline rules:

- `markdownItWikiLinks` — `[[target]]` / `[[target|alias]]` → `<a href="{slugified}">`.
- `wikilink_images` — `![[path/img.png]]` → `<img loading="lazy">`, **and copies the file from the vault into `dist/` as a side effect of parsing** (via `copyVaultImage`). There is also a `beforeBuild` hook that walks the whole vault for a second image syntax and copies those too. Both write to the hardcoded `distFolder`, so `--output=<other>` moves the HTML but leaves images going to `dist/`.
- `markdownItInternalLinks` — `[texto](80. Bíblia/40. Mateus/Mt 01)` and `![alt](90. Assets/img.png)`. Vault paths contain spaces and drop the `.md`, so markdown-it's own `link`/`image` rules never match them (a bare destination ends at the first space) and the syntax renders literally. This rule runs before both, slugifies the destination with `slugifyKeep()`, and returns `false` for external/absolute/anchor destinations so the stock rules keep handling those. Obsidian's other link style — relative and percent-encoded, `../../11.%20Study%20Notes/Nota.md` — is decoded and resolved against the current note's folder by `vaultPath()`, which reads `inputPath` from markdown-it's `env` (Eleventy passes the page data as `env`).
- `markdownItVerseParagraphs` — a core rule, not an inline one. Bible chapters mark a paragraph division by leaving blank lines before a `###### n`; blank lines leave no trace in the token stream, so it compares each `h6` token's `map` (source lines) against the end of the previous block and inserts a `verse_break` token where there was a gap. Renders as `<span class="verse-break">`, whose only job is to break the continuous verse text (see Styles).
- The `wikilinks_attr` filter applies the same transforms (wikilinks *and* markdown links) to frontmatter fields (`refs`, `when`, `where`, `refutes`) that layouts render above the article body.

Frontmatter is parsed through a custom YAML engine that strips Obsidian Templater `<% %>` blocks first, so template notes do not blow up the build.

**Collections** (all skip notes without `published`):

- `tagMap` — tag slug → pages. The main lookup used by tag pages and the home page.
- `tagList` — sorted unique tag names; drives tag page pagination.
- `publications` — home "Publicações" cards. Groups notes sharing a `chapter-of` value into one book card (details taken from the first chapter by `chapter`, linking to that book's tag page), plus standalone notes tagged `publication`. Returns plain objects sorted by `pubOrder` then title.
- `backlinks` — url → array of `{ url, title }` for the pages linking to it, built by re-reading each source file; layouts link the url and show the title (falling back to the file slug). Both syntaxes count: `internalLinkHrefsIn()` scans `[[wikilinks]]` and internal `[texto](caminho)` links and resolves each the same way its render rule does, so the keys match page urls. Sorted by title, because `collectionApi.getAll()` order varies between builds and the "Links para esta página" list would otherwise shuffle.

**Global data.** `notasTags` is parsed out of a **markdown table inside the vault** (`90. Assets/reinoeterno.online/TagsList.md`): only tags listed there appear as cards in the home page's "Notas de Estudo" section, with their Portuguese title and tagline. `notasTagsBySlug` is the same data keyed by slug for tag pages. `layout` is set globally to `layout.njk`, so notes rarely declare one.

### Layouts

`_includes/layout.njk` branches three ways on one file: the **home page** (`page.url == "/"`, with the hero, publications, apps and notes sections written inline), **tag pages** (`tagPage` flag), and everything else (the article view — title, frontmatter metadata line, tags, content, backlinks). `minimal.njk` is the article view without the home-page machinery, used by a handful of notes via `layout: minimal.njk`. `old-layout.njk` is unreferenced.

Tag pages come from `90. Assets/tags/tag.md` **in the vault**, paginating `collections.tagList` one tag per page into `/90._assets/tags/<slug>/`.

### Styles

`assets/` is passthrough-copied, so `assets/styles.css` is the source and `dist/assets/styles.css` is build output. When editing CSS without running a full build, copy it across manually or the served `dist/` will not reflect the change. The stylesheet is a single file organized by section with design tokens (`--accent`, `--rule`, `--serif`/`--sans`/`--mono`, …) at the top; article body styling lives under the `.prose` selectors.

Watch specificity when styling links: `.prose a` beats bare class selectors like `.tag-link`, which is why the link rules carry `:not(.tag):not(.tag-link)`.

Bible chapter notes write each verse as `###### n` followed by the verse text, so `.prose h6` is styled as a superscript verse marker and `.prose h6 + p` is `display: inline` — that pair is what makes a chapter read as continuous text. It relies on every published `h6` being a verse number (true across the vault) and on the adjacency, so nested paragraphs like footnotes stay block-level. Paragraph divisions inside a chapter come from `.verse-break`, an empty block the build emits (see `markdownItVerseParagraphs`) that interrupts the inline run.

## Frontmatter conventions

| Field | Effect |
| --- | --- |
| `published` | Must be truthy or the page is not built at all |
| `title` | Page `<h1>` and `<title>`; falls back to the file slug |
| `tags` | Tag pages, `tagMap`, and the 🔖 pill row under the title |
| `chapter-of`, `chapter` | Groups notes into a multi-chapter book and orders them |
| `pubOrder`, `pubCover`, `description` | Home page publication card: position, cover, blurb |
| `author`, `translator` | Card byline; `translator` marks the entry as a translation |
| `appUrl`, `appIcon`, `appDesc` | Home page "Apps" row (combined with the `app` tag) |
| `refs`, `when`, `where`, `refutes`, `source` | Metadata lines rendered above the article body, wikilinks resolved |
