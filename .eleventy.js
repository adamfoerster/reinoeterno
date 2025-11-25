const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const slugifyLib = require("slugify");

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

module.exports = async function (eleventyConfig) {
  const { default: markdownItCallouts } = await import("markdown-it-callouts");
  const markdownItFootnote = require("markdown-it-footnote");

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
    const wikiLinkRegex = /\[\[([^|]*?)(?:\|([^|]*?))?\]\]/g;
    const newArray = [];
    stringsArray.forEach(element => {
      const el = element.replace(wikiLinkRegex, (match, link, text) => {
        const displayText = text ? text.trim() : link.trim();
        const url = link.trim();
        return `<a href="${slugifyKeep(url)}">${displayText}</a>`;
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
          ? slugifyKeep(target)
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
      if (!/\.(png|jpe?g|gif|svg|webp)$/i.test(filenameRaw)) {
        return false;
      }

      if (!silent) {
        const altText = altRaw || path.basename(filenameRaw);

        // gera o src público com seu slugifyKeep (ex: /90_Assets/pasted_image.png)
        const srcSlug = slugifyKeep(filenameRaw);

        // copia o arquivo do vault para dist (removendo a barra inicial para path.join)
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

  // Backlinks collection
  eleventyConfig.addCollection("backlinks", function (collectionApi) {
    const backlinks = [];
    collectionApi.getAll().forEach(page => {
      if (!page.data.published || page.data.published === false) return;
      try {
        const fileContent = fs.readFileSync(page.inputPath, "utf8");
        const regex = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
        let match;
        while ((match = regex.exec(fileContent)) !== null) {
          const target = match[1].trim();
          let url = slugifyKeep(target);
          if (!url.endsWith("/")) url += "/";
          if (!backlinks[url]) backlinks[url] = new Set();
          backlinks[url].add(page.inputPath);
        }
      } catch (e) {
        console.warn(`[backlinks] Error reading file ${page.inputPath}:`, e);
      }
    });
    return backlinks;
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
    .use(markdownItWikiLinks);

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
  eleventyConfig.addFilter("urlencode", str => encodeURIComponent(str));
  eleventyConfig.addFilter("remove_underline", str => str.replaceAll("_", " "));
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
