
module.exports = function(eleventyConfig) {
  const path = require("path");
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addGlobalData("layout", "layout.njk");
  eleventyConfig.addFilter("urlencode", function(str) {
    return encodeURIComponent(str);
  });
  eleventyConfig.addGlobalData("eleventyComputed", {
    permalink: data => {
      if (data.published === false) {
        return false; // não gera saída
      }
      return data.permalink ?? data.page.filePathStem + "/index.html";
    }
  });

  return {
    dir: {
      input: "../../Documents/MegaSync/obisidian-vault/",
      output: "./dist",
      includes: "../../../projects/reinoeterno/src/_includes/"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};