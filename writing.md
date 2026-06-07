---
title: Writing
layout: default
permalink: /writing/
---

# Writing

This is a collection of some of my reflections on random things. They cover a broad range in length, topic and pretentiousness.

Number of pieces: {{ site.writing.size | plus: 1 }}

---

## List

{% for essay in site.writing reversed %}
- {{ essay.date | date: "%Y-%m" }}
  [{{ essay.title }}]({{ essay.url }})
{% endfor %}
- 2020-04 [Ergodicity of multiplicity](./Ergodicity_of_multiplicity.html)
