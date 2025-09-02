---
layout: layout.njk
title: Início
---
Seja bem-vindo ao Reino Eterno Online. Posto aqui alguns textos que produzi, outros que traduzi (sempre com os créditos). Você vai encontrar aqui material para conhecer melhor o cristianismo e crescer na fé.

<iframe id="odysee-iframe" style="width:100%; aspect-ratio:16 / 9;" src="https://odysee.com/%24/embed/%40adamfoerster%3A2%2F5min%3A6?r=GFQxFrqfdUB7yEHYkJszi1a4ad3eEATX" allowfullscreen></iframe>

# Todos os conteúdos
<ul>
{%- for item in collections.all | sort(attribute="fileSlug") -%}
  {%- if item.url != "/" -%}
    <li><a href="{{ item.url }}">{{ item.filePathStem}}</a></li>
  {%- endif -%}
{%- endfor -%}
</ul>

