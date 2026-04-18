// Legacy snapshot kept temporarily for reference during the source-of-truth migration.
// Runtime now loads ./generated-skills via registry.js. Do not update this file.

const colorPalettes = require('../../ai-layout-skills/_shared/assets/color-palettes.json');
const blockCatalog = require('../../ai-layout-skills/_shared/assets/block-catalog.json');
const wechatSafeStylePrimitives = require('../../ai-layout-skills/_shared/assets/wechat-safe-style-primitives.json');
const schema = require('../../ai-layout-skills/_shared/schema/article-layout.schema.json');
const template = require('../../ai-layout-skills/_shared/templates/article-layout.template.json');

const sourceFirstManifest = require('../../ai-layout-skills/source-first/manifest.json');
const sourceFirstBlocks = require('../../ai-layout-skills/source-first/blocks.json');
const sourceFirstFallback = require('../../ai-layout-skills/source-first/fallback.json');
const sourceFirstExample = require('../../ai-layout-skills/source-first/examples/article.json');

const tutorialCardsManifest = require('../../ai-layout-skills/tutorial-cards/manifest.json');
const tutorialCardsBlocks = require('../../ai-layout-skills/tutorial-cards/blocks.json');
const tutorialCardsFallback = require('../../ai-layout-skills/tutorial-cards/fallback.json');
const tutorialCardsExample = require('../../ai-layout-skills/tutorial-cards/examples/tutorial.json');

const editorialLiteManifest = require('../../ai-layout-skills/editorial-lite/manifest.json');
const editorialLiteBlocks = require('../../ai-layout-skills/editorial-lite/blocks.json');
const editorialLiteFallback = require('../../ai-layout-skills/editorial-lite/fallback.json');
const editorialLiteExample = require('../../ai-layout-skills/editorial-lite/examples/editorial.json');

const skills = [
  {
    id: sourceFirstManifest.id,
    manifest: sourceFirstManifest,
    prompt: `你正在生成“原文增强型”公众号排版。

目标：
- AI 只做轻量结构增强，不改写作者观点。
- 正文主体优先使用 section-block，通过 sectionIndex 引用原文章节。
- 除非原文非常适合，否则不要主动生成教程感很强的 hero、part-nav、phone-frame、cta-card。
- 如果要给出 lead-quote，优先摘取原文中的导语、观点句或总结句，不要重新写一段新文案。

风格原则：
- 更像“普通预览的升级版”，不是教程模板。
- 保留原文节奏和章节顺序。
- 允许轻微导语增强和图片上提，但不能牺牲正文完整性。`,
    blocks: sourceFirstBlocks,
    fallback: sourceFirstFallback,
    skillDoc: `---
name: source-first-layout
description: 原文增强型 skill。强调正文保真、轻量结构增强、AI 失败时本地兜底。
---

# Source-First Layout Skill

这个 skill 用于把文章排成“最接近普通预览”的公众号版式。

## Guardrails

- 优先使用 \`section-block\`
- 不重写正文
- 不默认追加 CTA
- 不默认加入教程式导航
- 图片只做轻度上提，不强行手机壳`,
    examples: [
      { name: 'article.json', value: sourceFirstExample },
    ],
  },
  {
    id: tutorialCardsManifest.id,
    manifest: tutorialCardsManifest,
    prompt: `你正在生成“教程卡片型”公众号排版。

目标：
- 强化结构感、步骤感、案例感。
- 可以积极使用 hero、part-nav、lead-quote、case-block。
- section-block 仍然优先承载正文，但整体需要更像“教程精修稿”。
- 如果有截图或界面图，优先考虑 hero 封面和 phone-frame。

风格原则：
- 用户应该一眼看出这是一篇教程或案例拆解。
- 可以增加结构性块，但不要遗漏后半段内容。
- 优先做“封面概览 -> 导语摘要 -> 分章节正文 -> 可选截图块”。`,
    blocks: tutorialCardsBlocks,
    fallback: tutorialCardsFallback,
    skillDoc: `---
name: tutorial-cards-layout
description: 教程卡片型 skill。强调章节编号、结构化卡片、截图展示和信息扫描效率。
---

# Tutorial Cards Layout Skill

这个 skill 用于把文章排成“教程精修稿”的样子。

## Guardrails

- 可以强化结构，不可以丢正文
- 可以用 hero / part-nav / phone-frame
- 正文仍优先 section-block
- CTA 只能按需生成，不能默认加`,
    examples: [
      { name: 'tutorial.json', value: tutorialCardsExample },
    ],
  },
  {
    id: editorialLiteManifest.id,
    manifest: editorialLiteManifest,
    prompt: `你正在生成“轻杂志型”公众号排版。

目标：
- 让文章更像编辑排版过的内容稿，而不是教程模板。
- 优先体现标题气质、导语节奏、留白和图文呼吸感。
- 弱化教程式导航和手机框。
- 如果原文适合，可用强 lead-quote、masthead 式 hero、较轻的章节节奏。

风格原则：
- 更少教程感，更强 editorial 感。
- 不要把每一段都卡片化。
- 允许图文穿插，但不牺牲正文完整性。`,
    blocks: editorialLiteBlocks,
    fallback: editorialLiteFallback,
    skillDoc: `---
name: editorial-lite-layout
description: 轻杂志型 skill。强调导语、留白、编辑感节奏和更克制的图文关系。
---

# Editorial Lite Layout Skill

这个 skill 用于把文章排成“轻杂志型”的内容稿。

## Guardrails

- 强调节奏和留白，不要每段都卡片化
- 不默认教程导航
- 不默认手机壳
- lead-quote 可以更强，但不能改写观点`,
    examples: [
      { name: 'editorial.json', value: editorialLiteExample },
    ],
  },
].sort((left, right) => {
  const leftOrder = Number(left?.manifest?.order || 999);
  const rightOrder = Number(right?.manifest?.order || 999);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return String(left?.manifest?.label || left?.id).localeCompare(String(right?.manifest?.label || right?.id), 'zh-Hans-CN');
});

module.exports = {
  shared: {
    version: wechatSafeStylePrimitives.version || colorPalettes.version || '2026.03.25-alpha.1',
    schema,
    template,
    blockCatalog,
    colorPalettes,
    wechatSafeStylePrimitives,
  },
  skills,
};
