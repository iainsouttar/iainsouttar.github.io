---
title: Writing
layout: writing_front
permalink: /writing/
---

# Writing

This is a collection of some reflections on random things. They cover a broad range in length, topic, and pretentiousness. 


Number of pieces: {{ site.writing.size | plus: 1 }}

---

{% for essay in site.writing reversed %}
- {{ essay.date | date: "%Y-%m" }}
  [{{ essay.title }}]({{ essay.url }})
{% endfor %}
- 2020-04 [Ergodicity of multiplicity](./Ergodicity_of_multiplicity.html)

---

Email me with the subject 'subscribe' at **iainsouttar [at] proton [dot] me** to hear about future pieces.
