import { describe, expect, it } from 'vitest';

const {
  normalizeAiSettings,
  getAiProviderIssues,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  extractImageRefsFromHtml,
  extractMarkdownSignals,
  buildFallbackLayout,
  normalizeArticleLayout,
  normalizeLayoutGenerationMeta,
  generateArticleLayout,
  AiLayoutSchemaError,
  renderArticleLayoutHtml,
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
    expect(layout.blocks.some((block) => block.type === 'case-block')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'cta-card')).toBe(true);
  });

  it('should merge sparse ai output with fallback blocks', () => {
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
    expect(layout.blocks[0].type).toBe('lead-quote');
    expect(layout.blocks.some((block) => block.type === 'hero')).toBe(true);
    expect(layout.blocks.some((block) => block.type === 'cta-card')).toBe(true);
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
});
