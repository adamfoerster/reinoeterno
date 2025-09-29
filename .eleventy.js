const markdownIt = require("markdown-it");

module.exports = async function (eleventyConfig) {
  const { default: markdownItCallouts } = await import("markdown-it-callouts");
  const markdownItFootnote = require("markdown-it-footnote");

  function markdownItWikiLinks(md, options = {}) {
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
        const href = `/${target}/`;
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


  let options = {
    html: true,
    breaks: true,
    linkify: true,
    typographer: true
  };
  let mdLib = markdownIt(options)
    .use(markdownItCallouts)
    .use(markdownItFootnote)
    .use(markdownItWikiLinks);
  eleventyConfig.setLibrary("md", mdLib);
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addGlobalData("layout", "layout.njk");
  eleventyConfig.addFilter("urlencode", function (str) {
    return encodeURIComponent(str);
  });
  eleventyConfig.addFilter("remove_underline", function (str) {
    return str.replaceAll("_", " ");
  })
  eleventyConfig.addFilter("wikilinks_attr", function (str) {
    return markdownItWikiLinks(str);
  })
  eleventyConfig.addGlobalData("eleventyComputed", {
    permalink: data => {
      if (data.published === false || !data.published) {
        return false;
      }
      return data.permalink ?? data.page.filePathStem + "/index.html";
    }
  });
  eleventyConfig.addCollection("tagList", function (collectionApi) {
    let tagSet = new Set();

    collectionApi.getAll()
      .forEach(item => {
        if (item.data.published === false || !item.data.published) return;

        if ("tags" in item.data) {
          let tags = item.data.tags;
          if (typeof tags === "string") {
            tags = [tags];
          }
          tags
            .filter(tag => !["all", "nav", "post"].includes(tag))
            .forEach(tag => tagSet.add(tag));
        }
      }
      );
    return [...tagSet].sort();
  });


  return {
    dir: {
      input: "../../Documents/MegaSync/obisidian-vault/",
      output: "./dist",
      includes: "../../../projects/reinoeterno/_includes/"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};