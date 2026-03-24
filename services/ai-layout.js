const {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutBlockConstraintLines,
  validateAiLayoutPayload,
} = require('./ai-layout-skill-bundle');

const AI_LAYOUT_SCHEMA_VERSION = 1;

const AI_PROVIDER_KINDS = {
  OPENAI_COMPATIBLE: 'openai-compatible',
};

const AI_STYLE_PACKS = {
  'tech-green': {
    id: 'tech-green',
    label: '科技绿',
    description: '信息卡与案例教程风格，适合产品介绍、操作指南和案例拆解。',
    tokens: {
      accent: '#14b37d',
      accentDeep: '#0f8f64',
      accentSoft: '#e8faf4',
      text: '#24323d',
      muted: '#66737f',
      border: '#dbe7e1',
      surface: '#ffffff',
      surfaceSoft: '#f5f8f7',
      quoteBg: '#f4f7f6',
    },
  },
};

function createDefaultAiSettings() {
  return {
    enabled: false,
    defaultProviderId: '',
    defaultStylePack: 'tech-green',
    includeImagesInLayout: true,
    requestTimeoutMs: 45000,
    providers: [],
    articleLayoutsByPath: {},
  };
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeAiProvider(raw = {}) {
  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const kind = typeof raw.kind === 'string' && raw.kind.trim()
    ? raw.kind.trim()
    : AI_PROVIDER_KINDS.OPENAI_COMPATIBLE;
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '未命名 Provider',
    kind,
    baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl.trim()
      ? raw.baseUrl.trim().replace(/\/+$/, '')
      : 'https://api.openai.com/v1',
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : 'gpt-4.1-mini',
    enabled: raw.enabled !== false,
  };
}

function getAiProviderIssues(provider = {}) {
  const issues = [];
  const baseUrl = coerceString(provider.baseUrl);
  const apiKey = coerceString(provider.apiKey);
  const model = coerceString(provider.model);

  if (!baseUrl) {
    issues.push('missing-base-url');
  } else if (!/^https:\/\//i.test(baseUrl)) {
    issues.push('invalid-base-url');
  }

  if (!apiKey) issues.push('missing-api-key');
  if (!model) issues.push('missing-model');
  if (provider.enabled === false) issues.push('disabled');

  return issues;
}

function isAiProviderRunnable(provider = {}) {
  const issues = getAiProviderIssues(provider);
  return !issues.some((issue) => issue !== 'disabled');
}

function summarizeAiProviderIssues(provider = {}) {
  const issues = getAiProviderIssues(provider);
  if (!issues.length) return '配置完整';

  const labels = {
    'missing-base-url': '缺少 Base URL',
    'invalid-base-url': 'Base URL 必须是 HTTPS',
    'missing-api-key': '缺少 API Key',
    'missing-model': '缺少模型名',
    disabled: '已停用',
  };
  return issues.map((issue) => labels[issue] || issue).join(' / ');
}

function getLayoutBlockLabel(block = {}) {
  return coerceString(
    block.title
    || block.caseLabel
    || block.text
    || block.caption
    || block.buttonText
    || block.imageId
    || block.type
  );
}

function getLayoutBlockKey(block = {}) {
  return `${coerceString(block.type)}:${getLayoutBlockLabel(block)}`;
}

function normalizeGenerationBlockOrigin(raw = {}, fallbackIndex = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw.source === 'fallback' ? 'fallback' : 'ai';
  const type = coerceString(raw.type);
  if (!type) return null;
  return {
    index: clampNumber(raw.index, fallbackIndex, 0, 99),
    type,
    source,
    label: coerceString(raw.label || type),
  };
}

function normalizeLayoutGenerationMeta(raw = {}, layoutJson = null) {
  const blockOrigins = Array.isArray(raw?.blockOrigins)
    ? raw.blockOrigins
      .map((item, index) => normalizeGenerationBlockOrigin(item, index))
      .filter(Boolean)
    : [];
  const derivedFallbackCount = blockOrigins.filter((item) => item.source === 'fallback').length;
  const finalBlockCount = clampNumber(
    raw?.finalBlockCount,
    layoutJson?.blocks?.length || blockOrigins.length || 0,
    0,
    99
  );
  const fallbackBlockCount = clampNumber(
    raw?.fallbackBlockCount,
    derivedFallbackCount,
    0,
    finalBlockCount
  );

  return {
    providerName: coerceString(raw?.providerName),
    providerModel: coerceString(raw?.providerModel),
    stylePackLabel: coerceString(raw?.stylePackLabel),
    headingCount: clampNumber(raw?.headingCount, 0, 0, 999),
    sectionCount: clampNumber(raw?.sectionCount, 0, 0, 999),
    leadParagraphCount: clampNumber(raw?.leadParagraphCount, 0, 0, 999),
    bulletGroupCount: clampNumber(raw?.bulletGroupCount, 0, 0, 999),
    imageCount: clampNumber(raw?.imageCount, 0, 0, 999),
    aiBlockCount: clampNumber(raw?.aiBlockCount, Math.max(0, finalBlockCount - fallbackBlockCount), 0, 99),
    finalBlockCount,
    fallbackUsed: raw?.fallbackUsed === true || fallbackBlockCount > 0,
    fallbackBlockCount,
    fallbackBlockTypes: Array.isArray(raw?.fallbackBlockTypes)
      ? raw.fallbackBlockTypes.map((item) => coerceString(item)).filter(Boolean).slice(0, 6)
      : [],
    schemaValidation: normalizeSchemaValidation(raw?.schemaValidation),
    blockOrigins,
  };
}

function normalizeSchemaValidation(raw = {}) {
  const issues = Array.isArray(raw?.issues)
    ? raw.issues
      .map((item) => ({
        path: coerceString(item?.path),
        message: coerceString(item?.message),
        fatal: item?.fatal === true,
      }))
      .filter((item) => item.path || item.message)
      .slice(0, 12)
    : [];
  const issueCount = clampNumber(raw?.issueCount, issues.length, 0, 99);
  const fatal = raw?.fatal === true || issues.some((item) => item.fatal);
  return {
    isValid: raw?.isValid === true && issueCount === 0,
    fatal,
    issueCount,
    issues,
  };
}

class AiLayoutSchemaError extends Error {
  constructor(message, schemaValidation, generationMeta = null) {
    super(message);
    this.name = 'AiLayoutSchemaError';
    this.code = 'ai-layout-schema-invalid';
    this.schemaValidation = normalizeSchemaValidation(schemaValidation);
    this.generationMeta = generationMeta;
  }
}

function normalizeArticleLayoutState(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const layoutJson = raw.layoutJson && typeof raw.layoutJson === 'object' ? raw.layoutJson : null;
  if (!layoutJson) return null;
  return {
    version: clampNumber(raw.version, AI_LAYOUT_SCHEMA_VERSION, 1, 999),
    updatedAt: clampNumber(raw.updatedAt, Date.now(), 0, 9999999999999),
    sourceHash: typeof raw.sourceHash === 'string' ? raw.sourceHash : '',
    providerId: typeof raw.providerId === 'string' ? raw.providerId : '',
    model: typeof raw.model === 'string' ? raw.model : '',
    stylePack: typeof raw.stylePack === 'string' ? raw.stylePack : 'tech-green',
    status: raw.status === 'schema-error' ? 'schema-error' : (raw.status === 'error' ? 'error' : 'ready'),
    lastError: typeof raw.lastError === 'string' ? raw.lastError : '',
    lastAttemptStatus: raw.lastAttemptStatus === 'schema-error'
      ? 'schema-error'
      : (raw.lastAttemptStatus === 'error' ? 'error' : (raw.lastAttemptStatus === 'success' ? 'success' : 'idle')),
    lastAttemptError: typeof raw.lastAttemptError === 'string' ? raw.lastAttemptError : '',
    lastAttemptAt: clampNumber(raw.lastAttemptAt, 0, 0, 9999999999999),
    lastAttemptSchemaValidation: normalizeSchemaValidation(raw.lastAttemptSchemaValidation),
    generationMeta: normalizeLayoutGenerationMeta(raw.generationMeta, layoutJson),
    layoutJson,
  };
}

function truncateMarkdownForPrompt(markdown = '', maxChars = 12000) {
  const content = String(markdown || '').trim();
  if (!content || content.length <= maxChars) return content;
  const headLength = Math.max(2000, Math.floor(maxChars * 0.72));
  const tailLength = Math.max(800, maxChars - headLength);
  const head = content.slice(0, headLength).trimEnd();
  const tail = content.slice(-tailLength).trimStart();
  return [
    head,
    '',
    '[内容已截断，为了控制请求规模，这里省略了中间部分正文。]',
    '',
    tail,
  ].join('\n');
}

function normalizeAiSettings(raw = {}) {
  const defaults = createDefaultAiSettings();
  const providers = Array.isArray(raw.providers) ? raw.providers.map(normalizeAiProvider) : defaults.providers;
  const articleLayoutsByPath = {};
  if (raw.articleLayoutsByPath && typeof raw.articleLayoutsByPath === 'object') {
    for (const [path, value] of Object.entries(raw.articleLayoutsByPath)) {
      if (!path || typeof path !== 'string') continue;
      const normalized = normalizeArticleLayoutState(value);
      if (normalized) {
        articleLayoutsByPath[path] = normalized;
      }
    }
  }

  let defaultProviderId = typeof raw.defaultProviderId === 'string' ? raw.defaultProviderId : defaults.defaultProviderId;
  if (defaultProviderId && !providers.some((provider) => provider.id === defaultProviderId && provider.enabled !== false)) {
    defaultProviderId = '';
  }

  return {
    enabled: raw.enabled === true,
    defaultProviderId,
    defaultStylePack: AI_STYLE_PACKS[raw.defaultStylePack] ? raw.defaultStylePack : defaults.defaultStylePack,
    includeImagesInLayout: raw.includeImagesInLayout !== false,
    requestTimeoutMs: clampNumber(raw.requestTimeoutMs, defaults.requestTimeoutMs, 5000, 180000),
    providers,
    articleLayoutsByPath,
  };
}

function getStylePackList() {
  return Object.values(AI_STYLE_PACKS).map((pack) => ({
    value: pack.id,
    label: pack.label,
    description: pack.description,
  }));
}

function getStylePackById(id) {
  return AI_STYLE_PACKS[id] || AI_STYLE_PACKS['tech-green'];
}

function listEnabledAiProviders(aiSettings = {}) {
  return Array.isArray(aiSettings.providers)
    ? aiSettings.providers.filter((provider) => provider.enabled !== false && isAiProviderRunnable(provider))
    : [];
}

function resolveAiProvider(aiSettings = {}, providerId = '') {
  const providers = listEnabledAiProviders(aiSettings);
  if (providerId) {
    const matched = providers.find((provider) => provider.id === providerId);
    if (matched) return matched;
  }
  if (aiSettings.defaultProviderId) {
    const matched = providers.find((provider) => provider.id === aiSettings.defaultProviderId);
    if (matched) return matched;
  }
  return providers[0] || null;
}

function extractJsonPayload(text) {
  const content = String(text || '').trim();
  if (!content) throw new Error('AI 未返回内容');

  const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i) || content.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : content;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI 返回结果不是有效 JSON');
  }
  return candidate.slice(firstBrace, lastBrace + 1);
}

function coerceString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function toTextArray(value, limit = 6) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function toImageIdArray(value, imageIds, limit = 4) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceString(item))
    .filter((item) => imageIds.has(item))
    .slice(0, limit);
}

function normalizeLayoutBlock(block, imageIds, index) {
  if (!block || typeof block !== 'object') return null;
  const type = coerceString(block.type);
  if (!type) return null;

  if (type === 'hero') {
    return {
      type,
      eyebrow: coerceString(block.eyebrow),
      title: coerceString(block.title),
      subtitle: coerceString(block.subtitle),
      coverImageId: imageIds.has(coerceString(block.coverImageId)) ? coerceString(block.coverImageId) : '',
      variant: ['cover-right', 'cover-left'].includes(block.variant) ? block.variant : 'cover-right',
    };
  }

  if (type === 'part-nav') {
    const items = Array.isArray(block.items)
      ? block.items.map((item, itemIndex) => ({
        label: coerceString(item?.label || `PART ${String(itemIndex + 1).padStart(2, '0')}`),
        text: coerceString(item?.text || item?.title),
      })).filter((item) => item.text).slice(0, 4)
      : [];
    return items.length ? { type, items } : null;
  }

  if (type === 'lead-quote') {
    const text = coerceString(block.text || block.quote);
    if (!text) return null;
    return {
      type,
      text,
      note: coerceString(block.note),
    };
  }

  if (type === 'case-block') {
    const title = coerceString(block.title);
    const summary = coerceString(block.summary);
    if (!title && !summary) return null;
    return {
      type,
      caseLabel: coerceString(block.caseLabel || `CASE ${String(index + 1).padStart(2, '0')}`),
      title,
      summary,
      bullets: toTextArray(block.bullets, 5),
      imageIds: toImageIdArray(block.imageIds, imageIds, 3),
      highlight: coerceString(block.highlight),
    };
  }

  if (type === 'phone-frame') {
    const imageId = coerceString(block.imageId);
    if (!imageIds.has(imageId)) return null;
    return {
      type,
      imageId,
      caption: coerceString(block.caption),
    };
  }

  if (type === 'cta-card') {
    const title = coerceString(block.title);
    const body = coerceString(block.body);
    if (!title && !body) return null;
    return {
      type,
      title,
      body,
      buttonText: coerceString(block.buttonText || '继续阅读'),
      note: coerceString(block.note),
    };
  }

  return null;
}

function summarizeText(value, maxLength = 80) {
  const text = coerceString(value).replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~#>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMarkdownSignals(markdown = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  const headings = [];
  const bulletGroups = [];
  const paragraphs = [];
  let currentParagraph = [];
  let currentBullets = [];

  const flushParagraph = () => {
    const text = stripMarkdown(currentParagraph.join(' ').trim());
    if (text) paragraphs.push(text);
    currentParagraph = [];
  };

  const flushBullets = () => {
    if (currentBullets.length) bulletGroups.push(currentBullets);
    currentBullets = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushBullets();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushBullets();
      headings.push({
        level: headingMatch[1].length,
        text: stripMarkdown(headingMatch[2]),
      });
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      currentBullets.push(stripMarkdown(bulletMatch[1]));
      continue;
    }

    currentParagraph.push(line);
  }

  flushParagraph();
  flushBullets();

  const leadParagraphs = paragraphs.slice(0, 3);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const sectionTitles = headings.filter((item) => item.level <= 3).map((item) => item.text).slice(0, 6);
  return {
    headings,
    sectionTitles,
    paragraphs,
    leadParagraphs,
    bulletGroups,
    lastParagraph,
  };
}

function buildFallbackLayout(context = {}) {
  const title = coerceString(context.title || '未命名文章');
  const stylePack = coerceString(context.stylePack || 'tech-green');
  const imageRefs = Array.isArray(context.imageRefs) ? context.imageRefs : [];
  const signals = extractMarkdownSignals(context.markdown || '');
  const firstImageId = imageRefs[0]?.id || '';
  const secondImageId = imageRefs[1]?.id || '';
  const leadText = summarizeText(signals.leadParagraphs[0] || signals.paragraphs[0] || '');
  const leadNote = summarizeText(signals.leadParagraphs[1] || '');
  const partItems = signals.sectionTitles.slice(0, 3).map((text, index) => ({
    label: `PART ${String(index + 1).padStart(2, '0')}`,
    text,
  }));

  const headBlocks = [];
  const bodyBlocks = [];
  headBlocks.push({
    type: 'hero',
    eyebrow: signals.sectionTitles[0] ? 'AI Layout Draft' : 'AI Article Layout',
    title,
    subtitle: leadText || summarizeText(signals.lastParagraph || title, 64),
    coverImageId: firstImageId,
    variant: 'cover-right',
  });

  if (partItems.length >= 2) {
    headBlocks.push({ type: 'part-nav', items: partItems });
  }

  if (leadText) {
    headBlocks.push({
      type: 'lead-quote',
      text: leadText,
      note: leadNote,
    });
  }

  const sectionTitles = signals.sectionTitles.length ? signals.sectionTitles : ['核心内容'];
  sectionTitles.slice(0, 2).forEach((heading, index) => {
    const bullets = signals.bulletGroups[index] || [];
    const paragraph = signals.paragraphs[index + 1] || signals.paragraphs[index] || '';
    bodyBlocks.push({
      type: 'case-block',
      caseLabel: `CASE ${String(index + 1).padStart(2, '0')}`,
      title: heading,
      summary: summarizeText(paragraph, 96),
      bullets: bullets.slice(0, 4),
      imageIds: index === 0 && firstImageId ? [firstImageId] : (index === 1 && secondImageId ? [secondImageId] : []),
      highlight: bullets[0] ? summarizeText(bullets[0], 48) : '',
    });
  });

  if (firstImageId) {
    bodyBlocks.push({
      type: 'phone-frame',
      imageId: secondImageId || firstImageId,
      caption: imageRefs[1]?.caption || imageRefs[0]?.caption || '示意截图',
    });
  }

  const ctaBlock = {
    type: 'cta-card',
    title: signals.sectionTitles[0] ? `继续阅读：${signals.sectionTitles[0]}` : '继续阅读',
    body: summarizeText(signals.lastParagraph || leadText || title, 88),
    buttonText: '整理后发布',
    note: '本版式为 AI 辅助生成，可继续调整后复制或同步到公众号。',
  };

  const blocks = [...headBlocks, ...bodyBlocks].slice(0, 5);
  blocks.push(ctaBlock);

  return {
    version: AI_LAYOUT_SCHEMA_VERSION,
    articleType: signals.sectionTitles.length >= 2 ? 'tutorial' : 'article',
    stylePack,
    title,
    summary: summarizeText(leadText || signals.lastParagraph || title, 90),
    blocks: blocks.filter(Boolean).slice(0, 6),
  };
}

function mergeBlocksWithFallback(aiBlocks = [], fallbackBlocks = []) {
  return mergeBlocksWithFallbackDetailed(aiBlocks, fallbackBlocks).map((entry) => entry.block);
}

function mergeBlocksWithFallbackDetailed(aiBlocks = [], fallbackBlocks = []) {
  const merged = [];
  const seenKeys = new Set();
  const fallbackCta = fallbackBlocks.find((block) => block?.type === 'cta-card') || null;
  const addBlock = (block, source) => {
    if (!block || !block.type) return;
    const dedupeKey = getLayoutBlockKey(block);
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);
    merged.push({ block, source });
  };
  aiBlocks.forEach((block) => addBlock(block, 'ai'));
  fallbackBlocks.filter((block) => block?.type !== 'cta-card').forEach((block) => addBlock(block, 'fallback'));
  const limited = merged.slice(0, 5);
  const limitedKeys = new Set(limited.map((entry) => getLayoutBlockKey(entry.block)));
  if (fallbackCta) {
    const ctaKey = getLayoutBlockKey(fallbackCta);
    if (!limitedKeys.has(ctaKey)) {
      limited.push({ block: fallbackCta, source: 'fallback' });
    }
  }
  return limited.slice(0, 6);
}

function normalizeArticleLayout(rawLayout = {}, context = {}) {
  const imageIds = new Set((context.imageRefs || []).map((image) => image.id));
  const requestedStylePack = coerceString(rawLayout.stylePack || context.stylePack || 'tech-green');
  const normalizedAiBlocks = Array.isArray(rawLayout.blocks)
    ? rawLayout.blocks
      .map((block, index) => normalizeLayoutBlock(block, imageIds, index))
      .filter(Boolean)
    : [];
  const fallbackLayout = buildFallbackLayout({
    title: rawLayout.title || context.title,
    markdown: context.markdown,
    stylePack: requestedStylePack,
    imageRefs: context.imageRefs,
  });
  const blocks = mergeBlocksWithFallback(normalizedAiBlocks, fallbackLayout.blocks);

  return {
    version: AI_LAYOUT_SCHEMA_VERSION,
    articleType: coerceString(rawLayout.articleType || fallbackLayout.articleType || 'article'),
    stylePack: AI_STYLE_PACKS[requestedStylePack] ? requestedStylePack : 'tech-green',
    title: coerceString(rawLayout.title || context.title || fallbackLayout.title),
    summary: coerceString(rawLayout.summary || fallbackLayout.summary),
    blocks,
  };
}

function createLayoutGenerationMeta({
  provider,
  stylePack,
  signals,
  imageRefs = [],
  normalizedAiBlocks = [],
  mergedEntries = [],
  schemaValidation = null,
}) {
  const stylePackInfo = getStylePackById(stylePack);
  const fallbackEntries = mergedEntries.filter((entry) => entry.source === 'fallback');
  return {
    providerName: coerceString(provider?.name),
    providerModel: coerceString(provider?.model),
    stylePackLabel: stylePackInfo?.label || '',
    headingCount: signals.headings.length,
    sectionCount: signals.sectionTitles.length,
    leadParagraphCount: signals.leadParagraphs.length,
    bulletGroupCount: signals.bulletGroups.length,
    imageCount: Array.isArray(imageRefs) ? imageRefs.length : 0,
    aiBlockCount: normalizedAiBlocks.length,
    finalBlockCount: mergedEntries.length,
    fallbackUsed: fallbackEntries.length > 0,
    fallbackBlockCount: fallbackEntries.length,
    fallbackBlockTypes: Array.from(new Set(fallbackEntries.map((entry) => entry.block?.type).filter(Boolean))).slice(0, 6),
    schemaValidation: normalizeSchemaValidation(schemaValidation),
    blockOrigins: mergedEntries.map((entry, index) => ({
      index,
      type: coerceString(entry.block?.type),
      source: entry.source === 'fallback' ? 'fallback' : 'ai',
      label: getLayoutBlockLabel(entry.block),
    })),
  };
}

function buildLayoutResult(rawLayout = {}, context = {}) {
  const validation = validateAiLayoutPayload(rawLayout);
  const requestedStylePack = coerceString(rawLayout.stylePack || context.stylePack || 'tech-green');
  if (validation.fatal) {
    const generationMeta = createLayoutGenerationMeta({
      provider: context.provider,
      stylePack: requestedStylePack,
      signals: context.signals || extractMarkdownSignals(context.markdown || ''),
      imageRefs: context.imageRefs,
      normalizedAiBlocks: [],
      mergedEntries: [],
      schemaValidation: validation,
    });
    throw new AiLayoutSchemaError(`AI 返回的布局结果未通过 schema 校验（${validation.issueCount} 项）`, validation, generationMeta);
  }

  const imageIds = new Set((context.imageRefs || []).map((image) => image.id));
  const normalizedAiBlocks = Array.isArray(rawLayout.blocks)
    ? rawLayout.blocks
      .map((block, index) => normalizeLayoutBlock(block, imageIds, index))
      .filter(Boolean)
    : [];
  const fallbackLayout = buildFallbackLayout({
    title: rawLayout.title || context.title,
    markdown: context.markdown,
    stylePack: requestedStylePack,
    imageRefs: context.imageRefs,
  });
  const mergedEntries = mergeBlocksWithFallbackDetailed(normalizedAiBlocks, fallbackLayout.blocks);
  const layoutJson = {
    version: AI_LAYOUT_SCHEMA_VERSION,
    articleType: coerceString(rawLayout.articleType || fallbackLayout.articleType || 'article'),
    stylePack: AI_STYLE_PACKS[requestedStylePack] ? requestedStylePack : 'tech-green',
    title: coerceString(rawLayout.title || context.title || fallbackLayout.title),
    summary: coerceString(rawLayout.summary || fallbackLayout.summary),
    blocks: mergedEntries.map((entry) => entry.block),
  };

  return {
    layoutJson,
    generationMeta: createLayoutGenerationMeta({
      provider: context.provider,
      stylePack: layoutJson.stylePack,
      signals: context.signals || extractMarkdownSignals(context.markdown || ''),
      imageRefs: context.imageRefs,
      normalizedAiBlocks,
      mergedEntries,
      schemaValidation: validation,
    }),
  };
}

function extractImageRefsFromHtml(html) {
  if (typeof document === 'undefined' || !html) return [];
  const container = document.createElement('div');
  container.innerHTML = html;
  const figures = Array.from(container.querySelectorAll('figure'));
  const refs = [];

  figures.forEach((figure, index) => {
    const img = figure.querySelector('img');
    if (!img || !img.src || img.alt === 'logo') return;
    const caption = figure.querySelector('figcaption')?.textContent?.trim() || img.alt || `配图 ${index + 1}`;
    refs.push({
      id: `image-${index + 1}`,
      src: img.src,
      alt: img.alt || caption,
      caption,
    });
  });

  return refs;
}

function buildLayoutMessages({ title, markdown, stylePack, imageRefs = [] }) {
  const stylePackInfo = getStylePackById(stylePack);
  const signals = extractMarkdownSignals(markdown);
  const promptMarkdown = truncateMarkdownForPrompt(markdown);
  const imageSummary = imageRefs.length
    ? imageRefs.map((image) => `- ${image.id}: ${image.caption}`).join('\n')
    : '- 无可用图片';
  const headingSummary = signals.sectionTitles.length
    ? signals.sectionTitles.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '- 无明显标题结构';
  const leadSummary = signals.leadParagraphs.length
    ? signals.leadParagraphs.map((item, index) => `${index + 1}. ${summarizeText(item, 90)}`).join('\n')
    : '- 无可提取导语';
  const bulletSummary = signals.bulletGroups.length
    ? signals.bulletGroups.slice(0, 2).map((group, groupIndex) => `组 ${groupIndex + 1}: ${group.slice(0, 4).join(' / ')}`).join('\n')
    : '- 无明显列表信息';

  return [
    {
      role: 'system',
      content: AI_LAYOUT_SKILL_SYSTEM_LINES.join('\n'),
    },
    {
      role: 'user',
      content: [
        `文章标题：${title || '未命名文章'}`,
        `风格包：${stylePackInfo.label}`,
        `风格说明：${stylePackInfo.description}`,
        '',
        '可用图片：',
        imageSummary,
        '',
        '文章结构摘要：',
        '标题大纲：',
        headingSummary,
        '导语候选：',
        leadSummary,
        '列表信息：',
        bulletSummary,
        '',
        '请输出一个 JSON 对象，包含：',
        ...AI_LAYOUT_OUTPUT_FIELDS.map((field) => `- ${field}`),
        '',
        'block 约束：',
        ...getAiLayoutBlockConstraintLines(),
        '',
        '优先生成 4 到 6 个 block，适合教程/案例类公众号文章。',
        '',
        '原文如下：',
        promptMarkdown,
      ].join('\n'),
    },
  ];
}

function readChatCompletionContent(data) {
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error('AI 响应缺少 message');
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
      .trim();
  }
  throw new Error('AI 响应格式无法识别');
}

async function requestOpenAICompatibleLayout({
  provider,
  title,
  markdown,
  stylePack,
  imageRefs,
  timeoutMs,
  fetchImpl,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        messages: buildLayoutMessages({ title, markdown, stylePack, imageRefs }),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI 请求失败 (${response.status}): ${text || response.statusText}`);
    }

    const data = await response.json();
    const content = readChatCompletionContent(data);
    const jsonPayload = extractJsonPayload(content);
    return JSON.parse(jsonPayload);
  } finally {
    clearTimeout(timer);
  }
}

async function generateArticleLayout({
  provider,
  title,
  markdown,
  stylePack = 'tech-green',
  imageRefs = [],
  timeoutMs = 45000,
  fetchImpl = globalThis.fetch,
}) {
  if (!provider) throw new Error('未找到可用的 AI Provider');
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持 AI 网络请求');
  if (!markdown || !String(markdown).trim()) throw new Error('文章内容为空，无法进行 AI 编排');
  const signals = extractMarkdownSignals(markdown);

  let rawLayout;
  switch (provider.kind) {
    case AI_PROVIDER_KINDS.OPENAI_COMPATIBLE:
      rawLayout = await requestOpenAICompatibleLayout({
        provider,
        title,
        markdown,
        stylePack,
        imageRefs,
        timeoutMs,
        fetchImpl,
      });
      break;
    default:
      throw new Error(`暂不支持的 AI Provider 类型: ${provider.kind}`);
  }

  return buildLayoutResult(rawLayout, {
    title,
    stylePack,
    imageRefs,
    markdown,
    provider,
    signals,
  });
}

async function testAiProviderConnection(provider, fetchImpl = globalThis.fetch) {
  const result = await generateArticleLayout({
    provider,
    title: '连接测试',
    markdown: '这是一个连接测试。请输出最小可用的教程排版 JSON。',
    stylePack: 'tech-green',
    imageRefs: [],
    timeoutMs: 15000,
    fetchImpl,
  });
  return !!result?.layoutJson?.blocks?.length;
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function renderArticleLayoutHtml(layout, { imageRefs = [] } = {}) {
  const stylePack = getStylePackById(layout?.stylePack);
  const tokens = stylePack.tokens;
  const imageMap = new Map(imageRefs.map((image) => [image.id, image]));
  const wrapperStyle = [
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
    `color:${tokens.text}`,
    'font-size:16px',
    'line-height:1.8',
    'padding:24px 18px',
    `background:${tokens.surface}`,
  ].join(';');

  const cardStyle = [
    `background:${tokens.surface}`,
    `border:1px solid ${tokens.border}`,
    'border-radius:18px',
    'padding:18px',
    'margin:18px 0',
    'box-shadow:0 10px 30px -24px rgba(0,0,0,0.18)',
  ].join(';');

  const renderImage = (imageId, extraStyle = '') => {
    const image = imageMap.get(imageId);
    if (!image) return '';
    const style = [
      'display:block',
      'width:100%',
      'height:auto',
      'border-radius:14px',
      extraStyle,
    ].filter(Boolean).join(';');
    return `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || image.caption)}" style="${style}">`;
  };

  const blocksHtml = (layout.blocks || []).map((block, index) => {
    if (block.type === 'hero') {
      const imageHtml = block.coverImageId ? renderImage(block.coverImageId, 'max-width:116px;flex:0 0 116px;') : '';
      const contentHtml = [
        block.eyebrow ? `<div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:${tokens.accentDeep};text-transform:uppercase;margin-bottom:10px;">${escapeHtml(block.eyebrow)}</div>` : '',
        block.title ? `<h1 style="margin:0 0 10px;font-size:28px;line-height:1.2;color:${tokens.text};">${escapeHtml(block.title)}</h1>` : '',
        block.subtitle ? `<p style="margin:0;color:${tokens.muted};font-size:14px;line-height:1.7;">${escapeHtml(block.subtitle)}</p>` : '',
      ].join('');
      const flexDirection = block.variant === 'cover-left' ? 'row-reverse' : 'row';
      return `<section style="${cardStyle};padding:22px;">
        <div style="display:flex;flex-direction:${flexDirection};gap:16px;align-items:center;">
          <div style="flex:1 1 auto;min-width:0;">${contentHtml}</div>
          ${imageHtml}
        </div>
        <div style="height:10px;margin-top:18px;background:${tokens.accent};border-radius:999px;"></div>
      </section>`;
    }

    if (block.type === 'part-nav') {
      const itemsHtml = block.items.map((item) => `
        <div style="flex:1 1 0;min-width:0;padding:12px 10px;border:1px solid ${tokens.border};border-radius:14px;background:${tokens.surfaceSoft};">
          <div style="font-size:10px;font-weight:700;color:${tokens.accentDeep};letter-spacing:0.8px;text-transform:uppercase;">${escapeHtml(item.label)}</div>
          <div style="margin-top:8px;font-size:13px;font-weight:600;color:${tokens.text};line-height:1.45;">${escapeHtml(item.text)}</div>
        </div>
      `).join('');
      return `<section style="margin:16px 0 8px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;">${itemsHtml}</div>
      </section>`;
    }

    if (block.type === 'lead-quote') {
      return `<section style="margin:18px 0;padding:18px;border-radius:16px;background:${tokens.quoteBg};border:1px solid ${tokens.border};">
        <div style="font-size:18px;font-weight:700;line-height:1.7;color:${tokens.text};">${escapeHtml(block.text)}</div>
        ${block.note ? `<div style="margin-top:10px;font-size:12px;color:${tokens.muted};">${escapeHtml(block.note)}</div>` : ''}
      </section>`;
    }

    if (block.type === 'case-block') {
      const imagesHtml = block.imageIds.map((imageId) => `<div style="margin-top:14px;">${renderImage(imageId)}</div>`).join('');
      const bulletsHtml = block.bullets.length
        ? `<ul style="margin:12px 0 0 18px;padding:0;color:${tokens.text};">${block.bullets.map((bullet) => `<li style="margin:6px 0;">${escapeHtml(bullet)}</li>`).join('')}</ul>`
        : '';
      return `<section style="margin:26px 0;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="font-size:28px;font-weight:800;color:${tokens.accent};line-height:1;">${String(index + 1).padStart(2, '0')}</div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${tokens.muted};text-transform:uppercase;">${escapeHtml(block.caseLabel)}</div>
        </div>
        ${block.title ? `<h2 style="margin:0 0 8px;font-size:22px;line-height:1.35;color:${tokens.text};">${escapeHtml(block.title)}</h2>` : ''}
        ${block.summary ? `<p style="margin:0;color:${tokens.muted};">${escapeHtml(block.summary)}</p>` : ''}
        ${block.highlight ? `<div style="margin-top:12px;padding:10px 12px;border-left:4px solid ${tokens.accent};background:${tokens.accentSoft};border-radius:10px;color:${tokens.accentDeep};font-weight:600;">${escapeHtml(block.highlight)}</div>` : ''}
        ${bulletsHtml}
        ${imagesHtml}
      </section>`;
    }

    if (block.type === 'phone-frame') {
      return `<section style="margin:24px auto;max-width:380px;padding:14px;border:1px solid ${tokens.border};border-radius:42px;background:#111;box-shadow:0 20px 40px -28px rgba(0,0,0,0.45);">
        <div style="width:42%;height:18px;margin:0 auto 14px;border-radius:999px;background:#000;"></div>
        <div style="background:#fff;border-radius:28px;padding:10px;overflow:hidden;">
          ${renderImage(block.imageId, 'border-radius:22px;')}
        </div>
        ${block.caption ? `<div style="margin-top:10px;font-size:12px;text-align:center;color:#d7e2dd;">${escapeHtml(block.caption)}</div>` : ''}
      </section>`;
    }

    if (block.type === 'cta-card') {
      return `<section style="${cardStyle};background:linear-gradient(135deg, ${tokens.accentSoft} 0%, #ffffff 100%);">
        ${block.title ? `<h3 style="margin:0 0 8px;font-size:20px;color:${tokens.text};">${escapeHtml(block.title)}</h3>` : ''}
        ${block.body ? `<p style="margin:0;color:${tokens.muted};">${escapeHtml(block.body)}</p>` : ''}
        <div style="margin-top:14px;display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:999px;background:${tokens.accent};color:#fff;font-weight:700;font-size:14px;">${escapeHtml(block.buttonText || '继续阅读')}</div>
        ${block.note ? `<div style="margin-top:10px;font-size:12px;color:${tokens.muted};">${escapeHtml(block.note)}</div>` : ''}
      </section>`;
    }

    return '';
  }).join('');

  return `<section style="${wrapperStyle}">${blocksHtml}</section>`;
}

module.exports = {
  AI_LAYOUT_SCHEMA_VERSION,
  AI_LAYOUT_SKILL_VERSION,
  AI_PROVIDER_KINDS,
  AI_STYLE_PACKS,
  createDefaultAiSettings,
  normalizeAiSettings,
  normalizeAiProvider,
  getAiProviderIssues,
  isAiProviderRunnable,
  summarizeAiProviderIssues,
  normalizeArticleLayoutState,
  normalizeSchemaValidation,
  getStylePackList,
  getStylePackById,
  listEnabledAiProviders,
  resolveAiProvider,
  extractImageRefsFromHtml,
  extractMarkdownSignals,
  buildFallbackLayout,
  normalizeArticleLayout,
  normalizeLayoutGenerationMeta,
  buildLayoutResult,
  AiLayoutSchemaError,
  generateArticleLayout,
  renderArticleLayoutHtml,
  testAiProviderConnection,
};
