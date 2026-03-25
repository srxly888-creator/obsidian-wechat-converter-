import { describe, expect, it } from 'vitest';

const {
  normalizeAiSettings,
  getAiProviderIssues,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  extractImageRefsFromHtml,
  extractMarkdownSections,
  extractMarkdownSignals,
  buildFallbackLayout,
  normalizeArticleLayout,
  normalizeLayoutGenerationMeta,
  deriveArticleLayoutStateForSelection,
  getArticleLayoutSelectionState,
  generateArticleLayout,
  AiLayoutSchemaError,
  renderArticleLayoutHtml,
  AiLayoutTimeoutError,
} = require('../services/ai-layout');

describe('ai-layout service', () => {
  it('should normalize ai settings with safe defaults', () => {
    const normalized = normalizeAiSettings({
      enabled: true,
      providers: [{ id: 'provider-1', apiKey: 'secret' }],
    });

    expect(normalized.enabled).toBe(true);
    expect(normalized.defaultStylePack).toBe('tech-green');
    expect(normalized.providers).toHaveLength(1);
    expect(normalized.providers[0].model).toBe('gpt-4.1-mini');
    expect(normalized.articleLayoutsByPath).toEqual({});
  });

  it('should report provider readiness issues clearly', () => {
    const incompleteProvider = {
      id: 'provider-1',
      name: '测试 Provider',
      baseUrl: '',
      apiKey: '',
      model: '',
      enabled: true,
    };

    expect(getAiProviderIssues(incompleteProvider)).toEqual([
      'missing-base-url',
      'missing-api-key',
      'missing-model',
    ]);
    expect(isAiProviderRunnable(incompleteProvider)).toBe(false);
    expect(summarizeAiProviderIssues(incompleteProvider)).toContain('缺少 Base URL');
  });

  it('should require https for runnable providers', () => {
    const provider = {
      id: 'provider-1',
      name: '测试 Provider',
      baseUrl: 'http://example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };

    expect(getAiProviderIssues(provider)).toContain('invalid-base-url');
    expect(isAiProviderRunnable(provider)).toBe(false);
    expect(summarizeAiProviderIssues(provider)).toContain('HTTPS');
  });

  it('should extract image refs from rendered figures', () => {
    const refs = extractImageRefsFromHtml(`
      <section>
        <figure><img src="https://example.com/cover.png" alt="封面图"><figcaption>封面图</figcaption></figure>
        <figure><img src="https://example.com/detail.png" alt="细节图"></figure>
      </section>
    `);

    expect(refs).toHaveLength(2);
    expect(refs[0].id).toBe('image-1');
    expect(refs[0].caption).toBe('封面图');
    expect(refs[1].id).toBe('image-2');
  });

  it('should extract markdown sections while skipping frontmatter', () => {
    const structure = extractMarkdownSections(`---
title: 示例
---

前言段落。

## 第一部分

第一段。

- 要点一
- 要点二

## 第二部分

第二段。
`);

    expect(structure.sections).toHaveLength(2);
    expect(structure.sections[0].title).toBe('第一部分');
    expect(structure.sections[0].paragraphs[0]).toContain('第一段');
    expect(structure.sections[0].bulletGroups[0]).toEqual(['要点一', '要点二']);
    expect(structure.introParagraphs[0]).toContain('前言段落');
  });

  it('should render structured layout json into inline html', () => {
    const html = renderArticleLayoutHtml({
      stylePack: 'tech-green',
      title: '测试文章',
      blocks: [
        { type: 'hero', eyebrow: 'AI Layout', title: '测试标题', subtitle: '测试副标题', coverImageId: 'image-1', variant: 'cover-right' },
        { type: 'lead-quote', text: '一句重点摘要', note: '附加说明' },
        { type: 'case-block', caseLabel: 'CASE 01', title: '案例标题', summary: '案例摘要', bullets: ['第一点'], imageIds: ['image-1'], highlight: '重点高亮' },
      ],
    }, {
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.png', alt: 'cover', caption: '封面' }],
    });

    expect(html).toContain('测试标题');
    expect(html).toContain('一句重点摘要');
    expect(html).toContain('https://example.com/cover.png');
    expect(html).toContain('重点高亮');
  });

  it('should extract markdown structure signals for prompt building', () => {
    const signals = extractMarkdownSignals(`
# AI 编排实践

这是一段导语。

## 第一部分

- 第一点
- 第二点

## 第二部分

这里是正文解释。
    `);

    expect(signals.sectionTitles).toEqual(['AI 编排实践', '第一部分', '第二部分']);
    expect(signals.leadParagraphs[0]).toContain('这是一段导语');
    expect(signals.bulletGroups[0]).toEqual(['第一点', '第二点']);
  });

  it('should build fallback layout with tutorial-friendly blocks', () => {
    const layout = buildFallbackLayout({
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是一段导语。

- 第一点
- 第二点

## 第二部分
这里是总结。
      `,
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/1.png', caption: '截图 1', alt: '截图 1' }],
    });

    expect(layout.blocks[0].type).toBe('hero');
    expect(layout.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'cta-card')).toBe(false);
  });

  it('should merge sparse ai output with fallback section blocks without forcing cta', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'lead-quote', text: '模型只给了一句摘要' },
      ],
    }, {
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是一段导语。

## 第二部分
这里是补充说明。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    expect(layout.blocks.length).toBeGreaterThan(1);
    expect(layout.blocks[0].type).toBe('hero');
    expect(layout.blocks[1].type).toBe('part-nav');
    expect(layout.blocks[2].type).toBe('lead-quote');
    expect(layout.blocks.some((block) => block.type === 'hero')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'cta-card')).toBe(false);
  });

  it('should honor the user-selected style pack over ai-returned style pack', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'hero', title: '文章标题' },
      ],
    }, {
      title: '文章标题',
      markdown: `
## 第一部分
正文一。
      `,
      stylePack: 'ocean-blue',
      imageRefs: [],
    });

    expect(layout.stylePack).toBe('ocean-blue');
  });

  it('should render different colors when a non-green style pack is selected', () => {
    const html = renderArticleLayoutHtml({
      stylePack: 'ocean-blue',
      title: '测试文章',
      blocks: [
        { type: 'hero', eyebrow: 'AI Layout', title: '测试标题', subtitle: '测试副标题', variant: 'cover-right' },
      ],
    }, {
      imageRefs: [],
    });

    expect(html).toContain('#2c6bed');
    expect(html).not.toContain('#14b37d');
  });

  it('should recommend editorial-lite for essay-like content signals', () => {
    const layout = normalizeArticleLayout({
      articleType: 'article',
      title: '写作经验复盘',
      blocks: [
        { type: 'lead-quote', text: '这是开头的一句观点。' },
      ],
    }, {
      title: '写作经验复盘',
      markdown: `
## 为什么我后来改了写法
这里是第一段正文。

## 写作中的一个误区
这里是第二段正文。
      `,
      imageRefs: [],
    });

    expect(layout.resolved.layoutFamily).toBe('editorial-lite');
  });

  it('should render editorial-lite with a more magazine-like section rhythm', () => {
    const html = renderArticleLayoutHtml({
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'graphite-rose',
      },
      stylePack: 'graphite-rose',
      title: '经验复盘',
      blocks: [
        { type: 'hero', eyebrow: 'Editorial Layout', title: '经验复盘', subtitle: '更轻、更有呼吸感的版式。', variant: 'cover-left' },
        { type: 'section-block', sectionIndex: 0, title: '第一部分', paragraphs: ['这里是正文。'] },
      ],
    }, {
      imageRefs: [],
    });

    expect(html).toContain('Editorial Layout');
    expect(html).toContain('Part 01');
    expect(html).toContain('#cc5f82');
    expect(html).not.toContain('SECTION 01');
  });

  it('should derive a new color variant from an existing generated layout without rerunning ai', () => {
    const derivedState = deriveArticleLayoutStateForSelection({
      version: 1,
      updatedAt: Date.now(),
      sourceHash: '123',
      providerId: 'provider-1',
      model: 'deepseek-chat',
      selection: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'tech-green',
      },
      resolved: {
        layoutFamily: 'editorial-lite',
        colorPalette: 'tech-green',
      },
      recommendedLayoutFamily: 'editorial-lite',
      recommendedColorPalette: 'graphite-rose',
      stylePack: 'tech-green',
      status: 'ready',
      lastError: '',
      lastAttemptStatus: 'success',
      generationMeta: {
        layoutFamilyLabel: '轻杂志型',
        colorPaletteLabel: '科技绿',
        stylePackLabel: '科技绿',
        blockOrigins: [{ index: 0, type: 'hero', source: 'ai', label: '经验复盘' }],
      },
      layoutJson: {
        articleType: 'article',
        selection: {
          layoutFamily: 'editorial-lite',
          colorPalette: 'tech-green',
        },
        resolved: {
          layoutFamily: 'editorial-lite',
          colorPalette: 'tech-green',
        },
        recommendedLayoutFamily: 'editorial-lite',
        recommendedColorPalette: 'graphite-rose',
        stylePack: 'tech-green',
        layoutFamily: 'editorial-lite',
        title: '经验复盘',
        summary: '这是一句摘要。',
        blocks: [
          { type: 'hero', title: '经验复盘' },
          { type: 'section-block', sectionIndex: 0, title: '第一部分' },
        ],
      },
    }, {
      layoutFamily: 'editorial-lite',
      colorPalette: 'graphite-rose',
    });

    expect(derivedState).toBeTruthy();
    expect(derivedState.selection.colorPalette).toBe('graphite-rose');
    expect(derivedState.resolved.colorPalette).toBe('graphite-rose');
    expect(derivedState.stylePack).toBe('graphite-rose');
    expect(derivedState.layoutJson.stylePack).toBe('graphite-rose');
    expect(derivedState.layoutJson.blocks).toHaveLength(2);
    expect(derivedState.generationMeta.colorPaletteLabel).toBe('石墨玫瑰');
  });

  it('should let auto selection reuse migrated legacy cache entries', () => {
    const migratedEntry = {
      lastSelectionKey: 'tutorial-cards::tech-green',
      selectionStates: {
        'tutorial-cards::tech-green': {
          version: 1,
          updatedAt: Date.now(),
          sourceHash: '123',
          stylePack: 'tech-green',
          status: 'ready',
          layoutJson: {
            articleType: 'tutorial',
            stylePack: 'tech-green',
            blocks: [{ type: 'hero', title: '历史缓存' }],
          },
        },
      },
    };

    expect(getArticleLayoutSelectionState(migratedEntry, {
      layoutFamily: 'auto',
      colorPalette: 'auto',
    })?.layoutJson?.blocks?.[0]?.title).toBe('历史缓存');
    expect(getArticleLayoutSelectionState(migratedEntry, {
      layoutFamily: 'auto',
      colorPalette: 'tech-green',
    })?.stylePack).toBe('tech-green');
  });

  it('should keep schema-sized part nav, bullets and image ids during normalization', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        {
          type: 'part-nav',
          items: Array.from({ length: 6 }, (_, index) => ({
            label: `PART ${String(index + 1).padStart(2, '0')}`,
            text: `第 ${index + 1} 节`,
          })),
        },
        {
          type: 'case-block',
          caseLabel: 'CASE 01',
          title: '案例标题',
          bullets: Array.from({ length: 6 }, (_, index) => `要点 ${index + 1}`),
          imageIds: ['image-1', 'image-2', 'image-3', 'image-4'],
        },
      ],
    }, {
      title: '长导航测试',
      markdown: '## 第一节\n正文',
      stylePack: 'tech-green',
      imageRefs: [
        { id: 'image-1', src: 'https://example.com/1.png', alt: '1', caption: '1' },
        { id: 'image-2', src: 'https://example.com/2.png', alt: '2', caption: '2' },
        { id: 'image-3', src: 'https://example.com/3.png', alt: '3', caption: '3' },
        { id: 'image-4', src: 'https://example.com/4.png', alt: '4', caption: '4' },
      ],
    });

    const partNavBlock = layout.blocks.find((block) => block.type === 'part-nav');
    const caseBlock = layout.blocks.find((block) => block.type === 'case-block');

    expect(partNavBlock?.items).toHaveLength(6);
    expect(caseBlock?.bullets).toHaveLength(6);
    expect(caseBlock?.imageIds).toHaveLength(4);
  });

  it('should preserve more sections in fallback layout and avoid phone frame for normal images', () => {
    const layout = buildFallbackLayout({
      title: '标签入门',
      markdown: `
## 第一部分
第一段内容。

## 第二部分
第二段内容。

## 第三部分
第三段内容。

## 第四部分
第四段内容。
      `,
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/cover.jpg', caption: '封面图', alt: '封面图' }],
    });

    expect(layout.blocks.filter((block) => block.type === 'section-block')).toHaveLength(4);
    expect(layout.blocks.some((block) => block.type === 'phone-frame')).toBe(false);
  });

  it('should keep later sections when ai output only covers the front half', () => {
    const markdown = Array.from({ length: 14 }, (_, index) => `## 第${index + 1}部分\n第${index + 1}段内容。`).join('\n\n');
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'hero', title: '长文测试' },
        { type: 'section-block', sectionIndex: 0 },
        { type: 'section-block', sectionIndex: 1 },
        { type: 'section-block', sectionIndex: 2 },
      ],
    }, {
      title: '长文测试',
      markdown,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    expect(layout.blocks.filter((block) => block.type === 'section-block')).toHaveLength(14);
    expect(layout.blocks.some((block) => block.type === 'section-block' && block.title === '第14部分')).toBe(true);
  });

  it('should not duplicate intro singleton blocks from fallback when ai already provides them', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'hero', title: '文章标题', subtitle: '导语' },
        { type: 'lead-quote', text: '一句重点摘要' },
      ],
    }, {
      title: '文章标题',
      markdown: `
## 第一部分
正文一。

## 第二部分
正文二。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    expect(layout.blocks.filter((block) => block.type === 'hero')).toHaveLength(1);
    expect(layout.blocks.filter((block) => block.type === 'lead-quote')).toHaveLength(1);
    expect(layout.blocks.filter((block) => block.type === 'part-nav')).toHaveLength(1);
  });

  it('should keep source section order before deferred ai tail blocks', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'hero', title: '文章标题', subtitle: '导语' },
        { type: 'lead-quote', text: '一句重点摘要' },
        { type: 'section-block', sectionIndex: 0 },
        { type: 'section-block', sectionIndex: 1 },
        { type: 'case-block', title: '今日挑战', summary: '补充练习' },
      ],
    }, {
      title: '文章标题',
      markdown: `
## 第一部分
正文一。

## 第二部分
正文二。

## 第三部分
正文三。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    const typesAndTitles = layout.blocks.map((block) => `${block.type}:${block.title || block.text || ''}`);
    expect(typesAndTitles.slice(0, 2)).toEqual([
      'hero:文章标题',
      'part-nav:',
    ]);
    expect(typesAndTitles[2]).toBe('lead-quote:一句重点摘要');
    expect(typesAndTitles[3]).toBe('section-block:第一部分');
    expect(typesAndTitles[4]).toBe('section-block:第二部分');
    expect(typesAndTitles[5]).toBe('section-block:第三部分');
    expect(typesAndTitles[6]).toBe('case-block:今日挑战');
  });

  it('should map ai case blocks back to source sections when titles match', () => {
    const layout = normalizeArticleLayout({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      blocks: [
        { type: 'case-block', title: '第二部分', summary: '模型摘要', bullets: ['模型要点'] },
      ],
    }, {
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是第一部分原文。

## 第二部分
这是第二部分原文。
- 原始要点
      `,
      stylePack: 'tech-green',
      imageRefs: [],
    });

    const mapped = layout.blocks.find((block) => block.type === 'section-block' && block.title === '第二部分');
    expect(mapped).toBeTruthy();
    expect(mapped.paragraphs.join(' ')).toContain('这是第二部分原文');
    expect(mapped.bulletGroups[0]).toContain('原始要点');
  });

  it('should keep generation meta when restoring cached article layouts', () => {
    const meta = normalizeLayoutGenerationMeta({
      providerName: 'DeepSeek',
      providerModel: 'deepseek-chat',
      sectionCount: 3,
      imageCount: 2,
      finalBlockCount: 4,
      fallbackBlockCount: 1,
      fallbackUsed: true,
      blockOrigins: [
        { index: 0, type: 'hero', source: 'ai', label: '封面卡' },
        { index: 1, type: 'cta-card', source: 'fallback', label: '收尾卡' },
      ],
    }, {
      blocks: [{ type: 'hero' }, { type: 'cta-card' }],
    });

    expect(meta.providerName).toBe('DeepSeek');
    expect(meta.fallbackUsed).toBe(true);
    expect(meta.blockOrigins[1].source).toBe('fallback');
  });

  it('should return generation meta and fallback info for sparse model output', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'lead-quote', text: '模型只给了一句摘要' },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这是一段导语。

## 第二部分
这里是补充说明。
      `,
      stylePack: 'tech-green',
      imageRefs: [{ id: 'image-1', src: 'https://example.com/1.png', alt: '截图', caption: '截图' }],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.layoutJson.blocks.length).toBeGreaterThan(1);
    expect(result.generationMeta.providerName).toBe('测试 Provider');
    expect(result.generationMeta.imageCount).toBe(1);
    expect(result.generationMeta.fallbackUsed).toBe(true);
    expect(result.generationMeta.blockOrigins.some((item) => item.source === 'fallback')).toBe(true);
  });

  it('should preserve schema validation warnings in generation meta', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'lead-quote', text: '模型给了一句摘要', extraField: 'should-warn' },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.generationMeta.schemaValidation.issueCount).toBeGreaterThan(0);
    expect(result.generationMeta.schemaValidation.fatal).toBe(false);
  });

  it('should infer missing block types from structured ai payloads', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { blockType: 'hero', title: '文章标题', subtitle: '导语' },
                  { blockType: 'lead-quote', text: '一句重点摘要' },
                  { blockType: 'section-block', sectionIndex: 0 },
                ],
              }),
            },
          },
        ],
      }),
    });

    const result = await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: `
## 第一部分
这里是正文。
      `,
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    expect(result.layoutJson.blocks[0].type).toBe('hero');
    expect(result.layoutJson.blocks[1].type).toBe('lead-quote');
    expect(result.layoutJson.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(result.generationMeta.schemaValidation.issueCount).toBe(0);
  });

  it('should throw schema error when ai payload is fatally invalid', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                articleType: 'tutorial',
                stylePack: 'tech-green',
                title: 'AI 编排实践',
                summary: '一句摘要',
                blocks: [
                  { type: 'unknown-block' },
                ],
              }),
            },
          },
        ],
      }),
    });

    await expect(generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    })).rejects.toMatchObject({
      name: 'AiLayoutSchemaError',
      code: 'ai-layout-schema-invalid',
    });

    try {
      await generateArticleLayout({
        provider,
        title: 'AI 编排实践',
        markdown: '这是一段导语。',
        stylePack: 'tech-green',
        imageRefs: [],
        fetchImpl,
        timeoutMs: 2000,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AiLayoutSchemaError);
      expect(error.schemaValidation.fatal).toBe(true);
      expect(error.generationMeta.schemaValidation.issueCount).toBeGreaterThan(0);
    }
  });

  it('should truncate oversized markdown before sending provider request', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    let requestBody = null;
    const longMarkdown = `# 标题\n\n${'长内容 '.repeat(5000)}\n\n## 尾部\n${'收尾 '.repeat(1000)}`;
    const fetchImpl = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  articleType: 'tutorial',
                  stylePack: 'tech-green',
                  title: 'AI 编排实践',
                  summary: '一句摘要',
                  blocks: [
                    { type: 'lead-quote', text: '模型只给了一句摘要' },
                  ],
                }),
              },
            },
          ],
        }),
      };
    };

    await generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: longMarkdown,
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 2000,
    });

    const userMessage = requestBody.messages[1].content;
    expect(userMessage.length).toBeLessThan(longMarkdown.length);
    expect(userMessage).toContain('内容已截断');
    expect(userMessage).toContain('原文如下');
  });

  it('should convert aborted provider requests into timeout errors', async () => {
    const provider = {
      id: 'p1',
      name: '测试 Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      model: 'test-model',
      enabled: true,
    };
    const fetchImpl = (_url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new Error('signal is aborted without reason'));
      }, { once: true });
    });

    await expect(generateArticleLayout({
      provider,
      title: 'AI 编排实践',
      markdown: '这是一段导语。',
      stylePack: 'tech-green',
      imageRefs: [],
      fetchImpl,
      timeoutMs: 10,
    })).rejects.toMatchObject({
      name: 'AiLayoutTimeoutError',
      code: 'ai-layout-timeout',
      message: 'AI 请求超时（1s）',
    });

    try {
      await generateArticleLayout({
        provider,
        title: 'AI 编排实践',
        markdown: '这是一段导语。',
        stylePack: 'tech-green',
        imageRefs: [],
        fetchImpl,
        timeoutMs: 10,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AiLayoutTimeoutError);
      expect(error.timeoutMs).toBe(10);
    }
  });
});
