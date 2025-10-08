const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const slugifyLib = require("slugify");

const obsidianVault = "../../Documents/MegaSync/obisidian-vault/";
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

  function wikilink_images(state) {
    const regex = /\[\[!([^|\]]+)(?:\|([^\]]+))?\]\]/g;
    state.tokens.forEach(token => {
      if (token.type === "inline" && regex.test(token.content)) {
        token.content = token.content.replace(regex, (match, filename, alt) => {
          const altText = alt || path.basename(filename);
          return `<img src="${filename}" alt="${altText}" />`;
        });
      }
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
    .use(markdownItCallouts)
    .use(markdownItFootnote)
    .use(markdownItAnchor, {
      permalink: false,
      slugify: slugify
    })
    .use(markdownItWikiLinks);

  mdLib.core.ruler.push("wikilinks_images", wikilink_images);
  eleventyConfig.setLibrary("md", mdLib);
  // Função para copiar imagens automaticamente
  eleventyConfig.on("beforeBuild", () => {
    const srcDir = obsidianVault;
    const outputDir = distFolder;
    const copyImage = (imgPath) => {
      const srcPath = path.join(srcDir, imgPath);
      const destPath = path.join(outputDir, imgPath);
      if (fs.existsSync(srcPath)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
      }
    };
    eleventyConfig.addPairedShortcode("copyImage", (content, imgPath) => {
      copyImage(imgPath);
      return content;
    });
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
      includes: "../../../projects/reinoeterno/_includes/"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
