const path = require("path");
module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addGlobalData("layout", "layout.njk");
  eleventyConfig.addFilter("urlencode", function(str) {
    return encodeURIComponent(str);
  });
  eleventyConfig.addCollection("folders", function(collectionApi) {
    const folders = new Set();

    collectionApi.getAll().forEach(item => {
      const relativeDir = path.relative("src", path.dirname(item.inputPath));
      const topFolder = relativeDir.split(path.sep)[0]; // pega a pasta de primeiro nível
      if (topFolder) folders.add(topFolder);
    });

    return Array.from(folders).sort();
  });
  return {
    dir: {
      input: "./src/",
      output: "./dist",
      includes: "_includes"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};