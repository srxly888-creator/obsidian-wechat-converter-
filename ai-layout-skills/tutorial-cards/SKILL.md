---
name: tutorial-cards-layout
description: 教程卡片型 skill。强调章节编号、结构化卡片、截图展示和信息扫描效率。
---

# Tutorial Cards Layout Skill

这个 skill 用于把文章排成“教程精修稿”的样子。

## Guardrails

- 可以强化结构，不可以丢正文
- 可以用 hero / part-nav / phone-frame
- 正文仍优先 section-block
- CTA 只能按需生成，不能默认加
- `section-block` 里的特殊内容要尽量保留，包括 `callout`、代码块、表格、嵌套列表；可以增强结构，但不要把这些内容压平成普通段落
