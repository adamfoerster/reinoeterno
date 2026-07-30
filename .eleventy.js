const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const slugifyLib = require("slugify");
const yaml = require("js-yaml");

const fs = require("fs");
const path = require("path");

const obsidianVault = "../obsidian/";
// const obsidianVault = "../test-vault/";
const distFolder = "./dist";

function slugify(str) {
  return slugifyLib(str, {
    replacement: "_",           // substitui espaço por underline
    lower: true,                // tudo minúsculo
    locale: "pt",               // normaliza acentos
    strict: false,              // não aplica a limpeza automática
  });
}

function slugifyKeep(str) {
  const [target, anchor] = str.split("#")
  return "/" + target.split("/").map(slugify).join("/") + (anchor ? "#" + anchor : "")
}

// Parse the "Notas de Estudo" tag list from the vault markdown table at
// 90. Assets/reinoeterno.online/TagsList.md → [{ pt, desc, tagDisplay, slug }].
// Only tags listed there are shown on the home page; note counts are resolved
// at render time against the `tagMap` collection.
function parseTagsList() {
  const file = path.join(obsidianVault, "90. Assets/reinoeterno.online/TagsList.md");
  const entries = [];
  try {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) continue;
      const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
      if (cells.length < 3) continue;
      const [tag, title, tagline] = cells;
      // Skip the header row and the |---|---| separator row.
      if (tag.toLowerCase() === "tag") continue;
      if (/^:?-+:?$/.test(tag)) continue;
      const tagClean = tag.replace(/^#/, "");
      entries.push({
        pt: title,
        desc: tagline,
        tagDisplay: "#" + tagClean.toUpperCase(),
        slug: slugify(tagClean),
      });
    }
  } catch (e) {
    console.warn(`[notasTags] could not read ${file}:`, e);
  }
  return entries;
}

module.exports = async function (eleventyConfig) {
  // Strip Obsidian Templater syntax (<% %>) from frontmatter before Eleventy parses it,
  // so files like template notes don't cause invalid date/field errors.
  eleventyConfig.setFrontMatterParsingOptions({
    engines: {
      yaml: (s) => yaml.load(s.replace(/<%[\s\S]*?%>/g, "null")),
    },
  });

  const { default: markdownItCallouts } = await import("markdown-it-callouts");
  const markdownItFootnote = require("markdown-it-footnote");

  // Um destino é externo (e fica como está) quando tem protocolo, começa com
  // "//", é absoluto ("/…") ou é só uma âncora ("#…"). O resto é caminho do
  // vault e passa por slugifyKeep(), igual aos wikilinks e aos permalinks.
  function isExternalHref(href) {
    return /^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(href);
  }

  // Obsidian também escreve links relativos e percent-encoded
  // ("../../11.%20Study%20Notes/Nota.md"). Decodifica e resolve contra a pasta
  // da nota atual, para chegar sempre a um caminho a partir da raiz do vault.
  // `inputPath` vem do env do markdown-it (o Eleventy passa os dados da página).
  function vaultPath(dest, inputPath) {
    let clean = dest;
    try {
      clean = decodeURI(dest);
    } catch (e) {
      // destino não é uma URI válida; usa como veio
    }
    if (!/^\.{1,2}\//.test(clean) || !inputPath) return clean;
    const noteDir = path.posix.dirname(
      inputPath.replace(/\\/g, "/").substring(obsidianVault.length)
    );
    return path.posix.normalize(path.posix.join(noteDir, clean));
  }

  // Uma nota "…/pt/index.md" vira "…/pt/index.html" no dist (o permalink tira
  // o segmento "index"), então o link precisa da extensão: sem ela a
  // hospedagem procura a pasta "…/pt/index/", que não existe.
  function pageHref(href) {
    return href.replace(/\/index(?=$|#)/, "/index.html");
  }

  function internalHref(dest, inputPath) {
    // O ".md" pode vir antes de uma âncora: "Nota.md#seção".
    return pageHref(slugifyKeep(vaultPath(dest, inputPath).replace(/\.md(?=$|#)/i, "")));
  }

  const imageExtRegex = /\.(png|jpe?g|gif|svg|webp)$/i;
  const wikiLinkRegex = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
  // [texto](caminho do vault) — o destino pode conter espaços; o prefixo
  // descarta embeds (![…]) e wikilinks ([[…]]).
  const mdLinkRegex = /(^|[^!\[])\[([^\[\]]+)\]\(([^()]+)\)/g;

  // Alvos internos citados no texto, nas duas sintaxes, resolvidos para href
  // do mesmo jeito que as regras de render resolvem — senão os backlinks não
  // batem com a url das páginas.
  function internalLinkHrefsIn(text, inputPath) {
    const hrefs = [];
    let match;
    wikiLinkRegex.lastIndex = 0;
    while ((match = wikiLinkRegex.exec(text)) !== null) {
      hrefs.push(pageHref(slugifyKeep(match[1].trim())));
    }
    mdLinkRegex.lastIndex = 0;
    while ((match = mdLinkRegex.exec(text)) !== null) {
      const dest = match[3].trim();
      if (dest && !isExternalHref(dest)) hrefs.push(internalHref(dest, inputPath));
    }
    return hrefs;
  }

  // Copia uma imagem do vault para dist/ no caminho já slugificado e devolve o
  // src público. Efeito colateral do parsing, como no ![[wikilink]] de imagem.
  function copyVaultImage(filenameRaw) {
    const srcSlug = slugifyKeep(filenameRaw);
    const srcPath = path.join(obsidianVault, filenameRaw);
    const destPath = path.join(distFolder, srcSlug.replace(/^\/+/, ""));
    try {
      if (fs.existsSync(srcPath)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        console.log(`[eleventy] copied image: ${filenameRaw} -> ${srcSlug}`);
      } else {
        console.warn(`[eleventy] imagem não encontrada: ${srcPath}`);
      }
    } catch (e) {
      console.warn(`[eleventy] erro ao copiar imagem ${filenameRaw}:`, e);
    }
    return srcSlug;
  }

  function replaceWikiLinks(text) {
    let stringsArray = [];
    if (!text) {
      return text;
    }
    if (typeof text == 'object') {
      stringsArray = text;
    } else {
      stringsArray.push(text);
    }
    const attrWikiLinkRegex = /\[\[([^|]*?)(?:\|([^|]*?))?\]\]/g;
    const newArray = [];
    stringsArray.forEach(element => {
      const el = element
        .replace(attrWikiLinkRegex, (match, link, text) => {
          const displayText = text ? text.trim() : link.trim();
          const url = link.trim();
          return `<a href="${pageHref(slugifyKeep(url))}">${displayText}</a>`;
        })
        .replace(mdLinkRegex, (match, before, text, dest) => {
          const url = dest.trim();
          const href = isExternalHref(url) ? url : internalHref(url);
          return `${before}<a href="${href}">${text.trim()}</a>`;
        });
      newArray.push(el);
    });
    return newArray;
  }

  // ---- Markdown config ----
  function markdownItWikiLinks(md) {
    md.inline.ruler.after("link", "wikilink", function (state, silent) {
      const start = state.pos;
      if (state.src.slice(start, start + 2) !== "[[") return false;
      const end = state.src.indexOf("]]", start);
      if (end === -1) return false;
      if (!silent) {
        const content = state.src.slice(start + 2, end);
        const [targetRaw, aliasRaw] = content.split("|");
        const target = targetRaw.trim();
        const alias = aliasRaw ? aliasRaw.trim() : target;
        const href = target.indexOf("http") == -1
          ? pageHref(slugifyKeep(target))
          : target;
        const tokenOpen = state.push("link_open", "a", 1);
        tokenOpen.attrs = [["href", href]];
        const textToken = state.push("text", "", 0);
        textToken.content = alias;
        state.push("link_close", "a", -1);
      }
      state.pos = end + 2;
      return true;
    });
  }

  // Links markdown para notas do vault: [Mateus](80. Bíblia/40. Mateus/Mt 01).
  // Caminhos do vault têm espaços e não têm extensão, então as regras "link" e
  // "image" do markdown-it nem chegam a reconhecê-los (o destino termina no
  // primeiro espaço) e o texto sai literal. Esta regra roda antes delas,
  // resolve o destino com slugifyKeep() — o mesmo dos permalinks e wikilinks —
  // e devolve `false` para destinos externos, deixando o padrão intacto.
  function markdownItInternalLinks(md) {
    md.inline.ruler.before("link", "internal_md_link", function (state, silent) {
      const start = state.pos;
      const isImage = state.src.charCodeAt(start) === 0x21 /* ! */;
      const bracket = isImage ? start + 1 : start;
      if (state.src.charCodeAt(bracket) !== 0x5B /* [ */) return false;
      // "!" já consumido como texto: é um embed que a regra recusou acima, não
      // um link — não vale gerar "!<a…>".
      if (!isImage && start > 0 && state.src.charCodeAt(start - 1) === 0x21) return false;
      // ![[imagem]] é do wikilink_image, que roda antes desta regra.
      if (isImage && state.src.charCodeAt(bracket + 1) === 0x5B) return false;

      const max = state.posMax;
      const labelStart = bracket + 1;
      const labelEnd = state.md.helpers.parseLinkLabel(state, bracket, true);
      if (labelEnd < 0) return false;
      if (state.src.charCodeAt(labelEnd + 1) !== 0x28 /* ( */) return false;

      // Destinos de vault nunca têm parênteses, então o primeiro ")" fecha.
      const close = state.src.indexOf(")", labelEnd + 2);
      if (close === -1 || close > max) return false;

      let dest = state.src.slice(labelEnd + 2, close).trim();
      let title = "";
      const withTitle = /^(.*?)\s+"([^"]*)"$/.exec(dest);
      if (withTitle) {
        dest = withTitle[1].trim();
        title = withTitle[2];
      }
      if (!dest || isExternalHref(dest)) return false;
      const inputPath = state.env && state.env.page && state.env.page.inputPath;
      if (isImage && !imageExtRegex.test(dest)) return false;

      if (!silent) {
        if (isImage) {
          const alt = state.src.slice(labelStart, labelEnd) || path.basename(dest);
          const token = state.push("image", "img", 0);
          token.attrs = [
            ["src", copyVaultImage(vaultPath(dest, inputPath))],
            ["alt", alt],
            ["loading", "lazy"]
          ];
          token.content = alt;
          if (title) token.attrs.push(["title", title]);
          // renderInlineAsText percorre children; nunca podem ficar nulos.
          token.children = [Object.assign(new state.Token("text", "", 0), { content: alt })];
        } else {
          state.pos = labelStart;
          state.posMax = labelEnd;
          const tokenOpen = state.push("link_open", "a", 1);
          tokenOpen.attrs = [["href", internalHref(dest, inputPath)]];
          if (title) tokenOpen.attrs.push(["title", title]);
          state.md.inline.tokenize(state);
          state.push("link_close", "a", -1);
        }
      }

      state.pos = close + 1;
      state.posMax = max;
      return true;
    });
  }

  // Capítulos bíblicos: cada versículo é "###### n" seguido do texto, e o
  // capítulo é renderizado como texto corrido (ver .prose h6 no styles.css).
  // A convenção do vault marca início de parágrafo deixando linhas em branco
  // antes do versículo — sem elas, os versículos são do mesmo parágrafo. Como
  // linha em branco não sobrevive ao parser, compara o `map` (linhas de
  // origem) do versículo com o fim do bloco anterior e insere um separador
  // em bloco, que quebra o texto corrido.
  function markdownItVerseParagraphs(md) {
    md.core.ruler.push("verse_paragraph", function (state) {
      const tokens = state.tokens;
      let prevEnd = null;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (
          token.type === "heading_open" && token.tag === "h6" &&
          token.map && prevEnd !== null && token.map[0] > prevEnd
        ) {
          const brk = new state.Token("verse_break", "", 0);
          brk.block = true;
          tokens.splice(i, 0, brk);
          i++;
        }
        if (token.map) prevEnd = Math.max(prevEnd ?? 0, token.map[1]);
      }
    });
    md.renderer.rules.verse_break = () => '<span class="verse-break"></span>\n';
  }

  function wikilink_images(md) {
    // registra um inline rule antes dos links
    md.inline.ruler.before("link", "wikilink_image", function (state, silent) {
      const src = state.src;
      const start = state.pos;

      // precisa começar com "![["
      if (src.charCodeAt(start) !== 0x21 /* ! */) return false;
      if (src.slice(start + 1, start + 3) !== "[[") return false;

      // tenta casar a estrutura ![[caminho|alt]] ou ![[caminho]]
      const match = /^!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(src.slice(start));
      if (!match) return false;

      const wholeMatch = match[0];
      const filenameRaw = match[1].trim();
      const altRaw = match[2] ? match[2].trim() : "";

      // só processa imagens com extensões comuns
      if (!imageExtRegex.test(filenameRaw)) {
        return false;
      }

      if (!silent) {
        const altText = altRaw || path.basename(filenameRaw);

        // gera o src público e copia o arquivo do vault para dist
        const srcSlug = copyVaultImage(filenameRaw);

        // cria token de imagem real
        const token = state.push("image", "img", 0);
        token.attrs = [
          ["src", srcSlug],
          ["alt", altText],
          ["loading", "lazy"]
        ];
        token.content = altText;

        // cria children (necessário para evitar o erro de .length em renderInlineAsText)
        const Token = state.Token || (state.md && state.md.Token);
        if (Token) {
          const textToken = new Token("text", "", 0);
          textToken.content = altText;
          token.children = [textToken];
        } else {
          // fallback mínimo: assegura que children não seja null
          token.children = [{ type: "text", content: altText }];
        }
      }

      // avança a posição do parser
      state.pos += wholeMatch.length;
      return true;
    });
  }


  // cria um mapa: slug_da_tag => [array de páginas]
  eleventyConfig.addCollection("tagMap", function (collectionApi) {
    const map = {};
    collectionApi.getAll().forEach(item => {
      if (item.data && (item.data.published === false || !item.data.published)) return;

      const tags = item.data && item.data.tags
        ? (Array.isArray(item.data.tags) ? item.data.tags : [item.data.tags])
        : [];
      tags.forEach(t => {
        const key = slugify(t); // normaliza
        if (!map[key]) map[key] = [];
        map[key].push(item);
      });
    });
    return map;
  });

  // Publications shown on the home "Publicações" section: one card per book.
  // Two kinds of book are supported, both surfaced just by tagging:
  //   1. Multi-chapter book — notes sharing a `chapter-of` value (the book's
  //      title). They collapse to one card whose details come from the first
  //      chapter (by `chapter` order); it links to the chapter-list tag page
  //      (the `chapter-of` slug matches the chapters' per-book tag).
  //   2. Standalone book — a published note tagged `publication` that has no
  //      `chapter-of` and isn't a loose part of a book. Links to its own page.
  // Returns normalized plain objects, sorted by `pubOrder`, then title.
  eleventyConfig.addCollection("publications", function (collectionApi) {
    const all = collectionApi.getAll().filter(i => i.data && i.data.published);
    const tagsOf = d => (d.tags ? (Array.isArray(d.tags) ? d.tags : [d.tags]) : []);
    const authorsOf = a => (a ? (Array.isArray(a) ? a.filter(Boolean).join(", ") : String(a)) : "").trim();
    const chapterNum = p => {
      const c = p.data ? p.data.chapter : undefined;
      const n = (c === 0 || c) ? Number(c) : NaN;
      return Number.isNaN(n) ? Infinity : n;
    };
    // A translation has a `translator`; otherwise it is an authored book.
    const kindOf = (translator, author) => translator
      ? "Tradução · " + (authorsOf(author) || authorsOf(translator))
      : "Livro · Autoral";

    const entries = [];

    // 1. Multi-chapter books: group notes sharing a `chapter-of` value.
    const books = {};
    for (const item of all) {
      const co = item.data["chapter-of"];
      if (co) (books[co] = books[co] || []).push(item);
    }
    const bookSlugs = new Set(Object.keys(books).map(slugify));
    for (const [title, chaps] of Object.entries(books)) {
      chaps.sort((a, b) => chapterNum(a) - chapterNum(b));
      const fromChaps = field => {
        for (const c of chaps) {
          const v = c.data[field];
          if (v != null && v !== "") return v;
        }
        return undefined;
      };
      entries.push({
        url: `/90._assets/tags/${slugify(title)}/`,
        title,
        kind: kindOf(fromChaps("translator"), fromChaps("author")),
        desc: fromChaps("description") || "",
        cover: fromChaps("pubCover") || fromChaps("cover") || "",
        order: fromChaps("pubOrder") ?? 999,
      });
    }

    // 2. Standalone publications: tagged `publication`, no `chapter-of`, and not
    //    a loose member of a book (i.e. not carrying a book's per-book tag).
    for (const item of all) {
      const d = item.data;
      if (d["chapter-of"]) continue;
      if (!tagsOf(d).some(t => String(t).toLowerCase() === "publication")) continue;
      if (tagsOf(d).some(t => bookSlugs.has(slugify(String(t))))) continue;
      entries.push({
        url: item.url,
        title: d.title || item.fileSlug,
        kind: kindOf(d.translator, d.author),
        desc: d.description || d.pubDesc || "",
        cover: d.pubCover || d.cover || "",
        order: d.pubOrder ?? 999,
      });
    }

    return entries.sort((a, b) =>
      a.order !== b.order ? a.order - b.order : a.title.localeCompare(b.title, "pt")
    );
  });

  // Backlinks collection — url da página → [{ url, title }] de quem aponta
  // para ela; os layouts mostram o título e linkam pela url.
  eleventyConfig.addCollection("backlinks", function (collectionApi) {
    const backlinks = {};
    collectionApi.getAll().forEach(page => {
      if (!page.data.published || page.data.published === false) return;
      try {
        const fileContent = fs.readFileSync(page.inputPath, "utf8");
        const source = {
          url: pageHref(slugifyKeep(page.inputPath.substring(obsidianVault.length).replaceAll(".md", ""))),
          title: page.data.title || page.fileSlug,
        };

        for (const href of internalLinkHrefsIn(fileContent, page.inputPath)) {
          // Remove anchors from the target to get the base page url; a página
          // de um "index.md" tem url da pasta, sem o index.html.
          let url = href.split("#")[0].replace(/index\.html$/, "");
          if (!url.endsWith("/")) url += "/";
          if (!backlinks[url]) backlinks[url] = new Map();
          backlinks[url].set(source.url, source);
        }
      } catch (e) {
        console.warn(`[backlinks] Error reading file ${page.inputPath}:`, e);
      }
    });

    // A ordem de getAll() varia entre builds; ordena por título para a seção
    // "Links para esta página" sair sempre igual.
    const sorted = {};
    for (const url of Object.keys(backlinks).sort()) {
      sorted[url] = [...backlinks[url].values()].sort((a, b) =>
        a.title.localeCompare(b.title, "pt") || a.url.localeCompare(b.url, "pt")
      );
    }
    return sorted;
  });

  // ---- Normalização de tags ----
  eleventyConfig.addCollection("tagList", function (collectionApi) {
    let tagSet = new Set();
    let collectionsByTag = {};

    collectionApi.getAll().forEach(item => {
      if (item.data.published === false || !item.data.published) return;

      if ("tags" in item.data) {
        let tags = Array.isArray(item.data.tags) ? item.data.tags : [item.data.tags];
        tags
          .filter(tag => !["all", "nav", "post"].includes(tag))
          .forEach(tag => {
            // Normaliza a tag
            let normalized = tag.toLowerCase();
            tagSet.add(normalized);

            // Adiciona o item à collection normalizada
            if (!collectionsByTag[normalized]) {
              collectionsByTag[normalized] = [];
            }
            collectionsByTag[normalized].push(item);
          });
      }
    });
    return [...tagSet].sort();
  });

  let options = {
    html: true,
    breaks: true,
    linkify: true,
    typographer: true
  };
  let mdLib = markdownIt(options)
    .use(wikilink_images)
    .use(markdownItCallouts)
    .use(markdownItFootnote)
    .use(markdownItAnchor, {
      permalink: false,
      slugify: slugify
    })
    .use(markdownItWikiLinks)
    .use(markdownItInternalLinks)
    .use(markdownItVerseParagraphs);

  eleventyConfig.setLibrary("md", mdLib);
  // Função para copiar imagens automaticamente
  eleventyConfig.on("beforeBuild", () => {
    const srcDir = obsidianVault;
    const outputDir = distFolder;
    const mdRegex = /\.md$/i;
    const wikiImgRegex = /\[\[!([^|\]]+)(?:\|([^\]]+))?\]\]/g;

    // varredura recursiva simples para encontrar todos os .md
    function walkDir(dir, filelist = []) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(full, filelist);
        } else if (entry.isFile() && mdRegex.test(entry.name)) {
          filelist.push(full);
        }
      }
      return filelist;
    }

    const mdFiles = walkDir(srcDir);
    const imagesToCopy = new Set();

    for (const mdFile of mdFiles) {
      const content = fs.readFileSync(mdFile, "utf8");
      let m;
      while ((m = wikiImgRegex.exec(content)) !== null) {
        const imgPath = m[1].trim().replace(/^\/+/, "");
        imagesToCopy.add(imgPath);
      }
    }

    for (const imgRel of imagesToCopy) {
      const srcPath = path.join(srcDir, imgRel);
      const destPath = path.join(outputDir, imgRel);
      if (fs.existsSync(srcPath)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        console.log(`[eleventy] copied image: ${imgRel}`);
      } else {
        console.warn(`[eleventy] imagem referenciada não encontrada: ${imgRel}`);
      }
    }
  });


  // ---- Outras configs ----
  eleventyConfig.addPassthroughCopy("assets");
  // eleventyConfig.addPlugin(pageAssetsPlugin, {
  //   mode: "parse",
  //   postsMatching: "src/posts/*/*.md",
  // });
  eleventyConfig.addGlobalData("layout", "layout.njk");
  const notasTags = parseTagsList();
  eleventyConfig.addGlobalData("notasTags", notasTags);
  // Same data keyed by slug, so a tag page can look up its title/tagline directly.
  eleventyConfig.addGlobalData(
    "notasTagsBySlug",
    Object.fromEntries(notasTags.map(e => [e.slug, e]))
  );
  eleventyConfig.addFilter("urlencode", str => encodeURIComponent(str));
  eleventyConfig.addFilter("remove_underline", str => str.replaceAll("_", " "));
  // Normalize a frontmatter author (YAML list or string) into a comma-separated string.
  eleventyConfig.addFilter("authors", function (a) {
    if (!a) return "";
    return (Array.isArray(a) ? a.filter(Boolean).join(", ") : String(a)).trim();
  });
  // Extract a 4-digit year from a frontmatter date (Date object or string); "" if absent/invalid.
  eleventyConfig.addFilter("year", function (d) {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    return isNaN(date.getTime()) ? "" : date.getFullYear();
  });
  eleventyConfig.addFilter("wikilinks_attr", function (str) {
    return replaceWikiLinks(str);
  })
  eleventyConfig.addFilter("markdown_inline", function (str) {
    if (!str) return str;
    return mdLib.renderInline(str);
  });
  eleventyConfig.addFilter("linkify_tags", function (tags) {
    if (!tags) return "";
    const tagList = Array.isArray(tags) ? tags : [tags];
    return tagList
      .filter(tag => !["all", "nav", "post"].includes(tag))
      .map(tag => {
        const slug = slugify(tag.replaceAll(" ", "_"));
        return `<a href="/90._assets/tags/${slug}/" class="tag-link">${tag}</a>`;
      })
      .join(", ");
  });
  eleventyConfig.addFilter("sortByTitle", function (posts) {
    if (!posts || !Array.isArray(posts)) return posts;
    return posts.slice().sort((a, b) => {
      const titleA = (a.data.title || a.fileSlug || "").toLowerCase();
      const titleB = (b.data.title || b.fileSlug || "").toLowerCase();
      return titleA.localeCompare(titleB, 'pt');
    });
  });
  // Order notes by their `chapter` frontmatter (numeric) when present, falling
  // back to title. Notes without a `chapter` sort after those with one.
  eleventyConfig.addFilter("sortByChapter", function (posts) {
    if (!posts || !Array.isArray(posts)) return posts;
    const chapterNum = p => {
      const c = p.data ? p.data.chapter : undefined;
      const n = (c === 0 || c) ? Number(c) : NaN;
      return Number.isNaN(n) ? Infinity : n;
    };
    return posts.slice().sort((a, b) => {
      const ca = chapterNum(a), cb = chapterNum(b);
      if (ca !== cb) return ca - cb;
      const titleA = (a.data.title || a.fileSlug || "").toLowerCase();
      const titleB = (b.data.title || b.fileSlug || "").toLowerCase();
      return titleA.localeCompare(titleB, 'pt');
    });
  });
  eleventyConfig.addGlobalData("eleventyComputed", {
    permalink: data => {
      if (data.published === false || !data.published) {
        return false;
      }
      if (data.pagination && data.pagination.items && data.tag) {
        // Estamos dentro da página de tag
        return `90._assets/tags/${slugify(data.tag.replaceAll(" ", "_"))}/index.html`;
      }
      // Quebra o caminho em pastas e aplica slugify
      let parts = data.page.filePathStem.replaceAll(" ", "_").split("/").map(slugifyKeep);

      // Se o último segmento for "index", remove-o
      if (parts[parts.length - 1] === "/index") {
        parts.pop();
      }

      // Se não houver partes, significa que é o index da raiz
      if (parts.length === 1 && parts[0] == "/") {
        return "/index.html";
      }

      return `/${parts.join("/")}/index.html`;
    }
  });

  return {
    dir: {
      input: obsidianVault,
      output: distFolder,
      includes: "../reinoeterno/_includes/"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
