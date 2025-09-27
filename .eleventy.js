
module.exports = function (eleventyConfig) {
  const path = require("path");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addGlobalData("layout", "layout.njk");
  eleventyConfig.addFilter("urlencode", function (str) {
    return encodeURIComponent(str);
  });
  eleventyConfig.addFilter("remove_underline", function (str){
    return str.replaceAll("_", " ");
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
            .filter(tag => !["all", "nav", "post"].includes(tag)) // ignora tags internas
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