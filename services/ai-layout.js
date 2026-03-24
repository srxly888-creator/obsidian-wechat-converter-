const {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutBlockConstraintLines,
  validateAiLayoutPayload,
} = require('./ai-layout-skill-bundle');

const AI_LAYOUT_SCHEMA_VERSION = 1;

const AI_PROVIDER_KINDS = {
  OPENAI_COMPATIBLE: 'openai-compatible',
};

const MAX_LAYOUT_BLOCKS = 24;

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
  'ocean-blue': {
    id: 'ocean-blue',
    label: '深海蓝',
    description: '更冷静的科技信息风格，适合教程、知识卡片和产品更新。',
    tokens: {
      accent: '#2c6bed',
      accentDeep: '#1f4fb2',
      accentSoft: '#edf4ff',
      text: '#223047',
      muted: '#5e718f',
      border: '#d8e2f2',
      surface: '#ffffff',
      surfaceSoft: '#f6f9fd',
      quoteBg: '#f2f6fc',
    },
  },
  'sunset-amber': {
    id: 'sunset-amber',
    label: '暖砂金',
    description: '更偏内容杂志感的暖色风格，适合观点、清单和经验分享。',
    tokens: {
      accent: '#d8892b',
      accentDeep: '#a66218',
      accentSoft: '#fff5e8',
      text: '#3a2b1f',
      muted: '#7b6756',
      border: '#eadfce',
      surface: '#fffdf9',
      surfaceSoft: '#faf6f0',
      quoteBg: '#f8f2ea',
    },
  },
  'graphite-rose': {
    id: 'graphite-rose',
    label: '石墨玫瑰',
    description: '偏编辑感的灰粉中性色，适合案例拆解和品牌内容。',
    tokens: {
      accent: '#cc5f82',
      accentDeep: '#9f4764',
      accentSoft: '#fff0f5',
      text: '#2e2c33',
      muted: '#6f6874',
      border: '#e7dce3',
      surface: '#fffefe',
      surfaceSoft: '#faf7f9',
      quoteBg: '#f8f2f5',
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

class AiLayoutTimeoutError extends Error {
  constructor(timeoutMs) {
    const seconds = Math.max(1, Math.round(Number(timeoutMs || 0) / 1000));
    super(`AI 请求超时（${seconds}s）`);
    this.name = 'AiLayoutTimeoutError';
    this.code = 'ai-layout-timeout';
    this.timeoutMs = Number(timeoutMs || 0);
  }
}

function normalizeArticleLayoutState(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const layoutJson = raw.layoutJson && typeof raw.layoutJson === 'object' ? raw.layoutJson : null;
  if (!layoutJson) return null;
  const dismissedBlockKeys = Array.isArray(raw.dismissedBlockKeys)
    ? raw.dismissedBlockKeys.map((item) => coerceString(item)).filter(Boolean).slice(0, 128)
    : [];
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
    dismissedBlockKeys,
    generationMeta: normalizeLayoutGenerationMeta(raw.generationMeta, layoutJson),
    layoutJson,
  };
}

function normalizeArticleLayoutCacheEntry(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const legacyState = normalizeArticleLayoutState(raw);
  if (legacyState) {
    const stylePack = legacyState.stylePack || 'tech-green';
    return {
      lastStylePack: stylePack,
      stylePackStates: {
        [stylePack]: legacyState,
      },
    };
  }

  const stylePackStates = {};
  if (raw.stylePackStates && typeof raw.stylePackStates === 'object') {
    for (const [stylePackId, value] of Object.entries(raw.stylePackStates)) {
      const normalizedState = normalizeArticleLayoutState(value);
      if (!normalizedState) continue;
      const effectiveStylePack = normalizedState.stylePack || stylePackId || 'tech-green';
      stylePackStates[effectiveStylePack] = {
        ...normalizedState,
        stylePack: effectiveStylePack,
      };
    }
  }

  const stylePackIds = Object.keys(stylePackStates);
  if (!stylePackIds.length) return null;
  const lastStylePack = coerceString(raw.lastStylePack);
  return {
    lastStylePack: stylePackStates[lastStylePack] ? lastStylePack : stylePackIds[0],
    stylePackStates,
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
      const normalized = normalizeArticleLayoutCacheEntry(value);
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

function inferBlockType(rawBlock = {}) {
  if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) return '';
  const explicitType = coerceString(
    rawBlock.type
    || rawBlock.blockType
    || rawBlock.block_type
    || rawBlock.kind
    || rawBlock.component
  );
  const allowedTypes = new Set(AI_LAYOUT_ALLOWED_BLOCKS.map((item) => item.type));
  if (allowedTypes.has(explicitType)) return explicitType;

  if ('sectionIndex' in rawBlock || 'paragraphs' in rawBlock || 'bulletGroups' in rawBlock) return 'section-block';
  if (Array.isArray(rawBlock.items)) return 'part-nav';
  if (typeof rawBlock.imageId === 'string') return 'phone-frame';
  if ('coverImageId' in rawBlock || 'eyebrow' in rawBlock || 'subtitle' in rawBlock || explicitType === 'cover') return 'hero';
  if ('buttonText' in rawBlock || 'body' in rawBlock) return 'cta-card';
  if ('text' in rawBlock || 'quote' in rawBlock) return 'lead-quote';
  if ('summary' in rawBlock || 'caseLabel' in rawBlock || 'bullets' in rawBlock || 'highlight' in rawBlock || 'imageIds' in rawBlock) return 'case-block';
  if (typeof rawBlock.title === 'string') return 'section-block';
  return '';
}

function repairRawLayoutPayload(rawLayout = {}) {
  if (!rawLayout || typeof rawLayout !== 'object' || Array.isArray(rawLayout)) return rawLayout;
  if (!Array.isArray(rawLayout.blocks)) return rawLayout;
  return {
    ...rawLayout,
    blocks: rawLayout.blocks.map((block) => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
      const inferredType = inferBlockType(block);
      if (!inferredType) return block;
      const repaired = {
        ...block,
        type: inferredType,
      };
      delete repaired.blockType;
      delete repaired.block_type;
      delete repaired.kind;
      delete repaired.component;
      return repaired;
    }),
  };
}

function coerceString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeTitleKey(value) {
  return coerceString(value).toLowerCase().replace(/\s+/g, '');
}

function toSectionIndex(value, fallback = -1) {
  if (Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = parseInt(value.trim(), 10);
    return parsed >= 0 ? parsed : fallback;
  }
  return fallback;
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

function buildSectionBlockFromSource(section, {
  imageIds = [],
  fallbackIndex = 0,
} = {}) {
  if (!section || typeof section !== 'object') return null;
  const title = coerceString(section.title || section.heading || '');
  const paragraphs = Array.isArray(section.paragraphs)
    ? section.paragraphs.map((item) => coerceString(item)).filter(Boolean)
    : [];
  const bulletGroups = Array.isArray(section.bulletGroups)
    ? section.bulletGroups
      .map((group) => Array.isArray(group) ? group.map((item) => coerceString(item)).filter(Boolean).slice(0, 10) : [])
      .filter((group) => group.length)
    : [];
  const normalizedImageIds = Array.isArray(imageIds)
    ? imageIds.map((item) => coerceString(item)).filter(Boolean).slice(0, 3)
    : [];
  if (!title && !paragraphs.length && !bulletGroups.length) return null;
  return {
    type: 'section-block',
    sectionIndex: toSectionIndex(section.index, fallbackIndex),
    sectionLabel: (section.level || 2) >= 3 ? `SUB ${String(fallbackIndex + 1).padStart(2, '0')}` : `PART ${String(fallbackIndex + 1).padStart(2, '0')}`,
    headingLevel: Number.isInteger(section.level) ? section.level : 2,
    title,
    paragraphs,
    bulletGroups,
    imageIds: normalizedImageIds,
  };
}

function findSourceSectionByTitle(sourceSections = [], title = '') {
  const expectedKey = normalizeTitleKey(title);
  if (!expectedKey) return null;
  return sourceSections.find((section) => normalizeTitleKey(section?.title) === expectedKey) || null;
}

function normalizeLayoutBlock(block, imageIds, sourceSections, index) {
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
    const matchedSection = findSourceSectionByTitle(sourceSections, title);
    if (matchedSection) {
      return buildSectionBlockFromSource(matchedSection, {
        imageIds: toImageIdArray(block.imageIds, imageIds, 3),
        fallbackIndex: toSectionIndex(matchedSection.index, index),
      });
    }
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

  if (type === 'section-block') {
    const sectionIndex = toSectionIndex(block.sectionIndex, -1);
    const sourceSection = sectionIndex >= 0 ? sourceSections.find((item) => toSectionIndex(item?.index, -1) === sectionIndex) : null;
    if (!sourceSection) return null;
    return buildSectionBlockFromSource(sourceSection, {
      imageIds: toImageIdArray(block.imageIds, imageIds, 3),
      fallbackIndex: sectionIndex,
    });
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

function looksLikeScreenshotRef(image = {}) {
  const signature = [
    image.id,
    image.alt,
    image.caption,
    image.src,
  ].map((item) => coerceString(item).toLowerCase()).join(' ');
  if (!signature) return false;
  return /(截图|界面|对话|聊天|微信|面板|后台|screenshot|screen|cleanshot|dialog|chat|ui)/i.test(signature);
}

function stripFrontmatterBlock(markdown = '') {
  const content = String(markdown || '').replace(/^\uFEFF/, '');
  if (!content.startsWith('---')) return content;
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return match ? content.slice(match[0].length) : content;
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

function extractMarkdownSections(markdown = '') {
  const lines = stripFrontmatterBlock(markdown).split(/\r?\n/);
  const sections = [];
  const introParagraphs = [];
  const introBulletGroups = [];
  let currentSection = null;
  let currentParagraph = [];
  let currentBullets = [];

  const pushParagraphToTarget = () => {
    const text = stripMarkdown(currentParagraph.join(' ').trim());
    if (text) {
      if (currentSection) {
        currentSection.paragraphs.push(text);
      } else {
        introParagraphs.push(text);
      }
    }
    currentParagraph = [];
  };

  const pushBulletsToTarget = () => {
    if (currentBullets.length) {
      if (currentSection) {
        currentSection.bulletGroups.push(currentBullets);
      } else {
        introBulletGroups.push(currentBullets);
      }
    }
    currentBullets = [];
  };

  const finalizeSection = () => {
    if (currentSection && (currentSection.title || currentSection.paragraphs.length || currentSection.bulletGroups.length)) {
      currentSection.index = sections.length;
      sections.push(currentSection);
    }
    currentSection = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      pushParagraphToTarget();
      pushBulletsToTarget();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      pushParagraphToTarget();
      pushBulletsToTarget();
      finalizeSection();
      currentSection = {
        index: sections.length,
        level: headingMatch[1].length,
        title: stripMarkdown(headingMatch[2]),
        paragraphs: [],
        bulletGroups: [],
      };
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch) {
      pushParagraphToTarget();
      currentBullets.push(stripMarkdown(bulletMatch[1]));
      continue;
    }

    currentParagraph.push(line);
  }

  pushParagraphToTarget();
  pushBulletsToTarget();
  finalizeSection();

  if (!sections.length && (introParagraphs.length || introBulletGroups.length)) {
    sections.push({
      index: 0,
      level: 2,
      title: '核心内容',
      paragraphs: introParagraphs.slice(),
      bulletGroups: introBulletGroups.slice(),
    });
  }

  return {
    introParagraphs,
    introBulletGroups,
    sections,
  };
}

function extractMarkdownSignals(markdown = '') {
  const structure = extractMarkdownSections(markdown);
  const headings = structure.sections.map((section) => ({
    level: section.level || 2,
    text: coerceString(section.title),
  })).filter((section) => section.text);
  const bulletGroups = [
    ...structure.introBulletGroups,
    ...structure.sections.flatMap((section) => section.bulletGroups || []),
  ];
  const paragraphs = [
    ...structure.introParagraphs,
    ...structure.sections.flatMap((section) => section.paragraphs || []),
  ];
  const leadParagraphs = paragraphs.slice(0, 3);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const sectionTitles = headings.filter((item) => item.level <= 3).map((item) => item.text).slice(0, 12);
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
  const sourceSections = Array.isArray(context.sourceSections) ? context.sourceSections : extractMarkdownSections(context.markdown || '').sections;
  const firstImageId = imageRefs[0]?.id || '';
  const leadText = summarizeText(signals.leadParagraphs[0] || signals.paragraphs[0] || '');
  const leadNote = summarizeText(signals.leadParagraphs[1] || '');
  const partItems = signals.sectionTitles.slice(0, 5).map((text, index) => ({
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

  sourceSections.forEach((section, index) => {
    const block = buildSectionBlockFromSource(section, {
      imageIds: index === 0 && firstImageId ? [firstImageId] : [],
      fallbackIndex: index,
    });
    if (block) bodyBlocks.push(block);
  });

  const screenshotImage = imageRefs.find((image, index) => index > 0 && looksLikeScreenshotRef(image)) || null;
  if (screenshotImage?.id) {
    bodyBlocks.push({
      type: 'phone-frame',
      imageId: screenshotImage.id,
      caption: screenshotImage.caption || screenshotImage.alt || '示意截图',
    });
  }

  return {
    version: AI_LAYOUT_SCHEMA_VERSION,
    articleType: signals.sectionTitles.length >= 2 ? 'tutorial' : 'article',
    stylePack,
    title,
    summary: summarizeText(leadText || signals.lastParagraph || title, 90),
    blocks: [...headBlocks, ...bodyBlocks].filter(Boolean).slice(0, MAX_LAYOUT_BLOCKS),
  };
}

function mergeBlocksWithFallback(aiBlocks = [], fallbackBlocks = []) {
  return mergeBlocksWithFallbackDetailed(aiBlocks, fallbackBlocks).map((entry) => entry.block);
}

function mergeBlocksWithFallbackDetailed(aiBlocks = [], fallbackBlocks = []) {
  const introOrder = ['hero', 'part-nav', 'lead-quote'];
  const introAiByType = new Map();
  const introFallbackByType = new Map();
  const fallbackSectionsByIndex = new Map();
  const deferredAi = [];
  const deferredFallback = [];
  const seenKeys = new Set();
  const merged = [];

  const addBlock = (block, source) => {
    if (!block || !block.type) return;
    const dedupeKey = getLayoutBlockKey(block);
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);
    merged.push({ block, source });
  };

  const fallbackSectionIndices = [];
  fallbackBlocks.forEach((block) => {
    if (!block || !block.type) return;
    if (introOrder.includes(block.type)) {
      if (!introFallbackByType.has(block.type)) {
        introFallbackByType.set(block.type, block);
      }
      return;
    }
    if (block.type === 'section-block' && Number.isInteger(block.sectionIndex) && block.sectionIndex >= 0) {
      if (!fallbackSectionsByIndex.has(block.sectionIndex)) {
        fallbackSectionsByIndex.set(block.sectionIndex, block);
        fallbackSectionIndices.push(block.sectionIndex);
      }
      return;
    }
    deferredFallback.push({ block, source: 'fallback' });
  });

  aiBlocks.forEach((block) => {
    if (!block || !block.type) return;
    if (introOrder.includes(block.type)) {
      if (!introAiByType.has(block.type)) {
        introAiByType.set(block.type, block);
      }
      return;
    }
    deferredAi.push({ block, source: 'ai' });
  });

  introOrder.forEach((type) => {
    const aiBlock = introAiByType.get(type);
    const fallbackBlock = introFallbackByType.get(type);
    if (aiBlock) {
      addBlock(aiBlock, 'ai');
    } else if (fallbackBlock) {
      addBlock(fallbackBlock, 'fallback');
    }
  });

  const sortedFallbackIndices = Array.from(new Set(fallbackSectionIndices)).sort((a, b) => a - b);
  let fallbackPointer = 0;
  const flushFallbackSectionsBefore = (targetIndex) => {
    while (fallbackPointer < sortedFallbackIndices.length && sortedFallbackIndices[fallbackPointer] < targetIndex) {
      const sectionIndex = sortedFallbackIndices[fallbackPointer];
      addBlock(fallbackSectionsByIndex.get(sectionIndex), 'fallback');
      fallbackPointer += 1;
    }
  };
  const consumeFallbackSection = (sectionIndex) => {
    while (fallbackPointer < sortedFallbackIndices.length && sortedFallbackIndices[fallbackPointer] <= sectionIndex) {
      fallbackPointer += 1;
    }
  };

  deferredAi.forEach((entry) => {
    const block = entry.block;
    if (block?.type === 'section-block' && Number.isInteger(block.sectionIndex) && block.sectionIndex >= 0) {
      flushFallbackSectionsBefore(block.sectionIndex);
      addBlock(block, 'ai');
      consumeFallbackSection(block.sectionIndex);
      return;
    }
    if (block?.type === 'hero' || block?.type === 'part-nav' || block?.type === 'lead-quote') {
      return;
    }
    deferredFallback.push(entry);
  });

  flushFallbackSectionsBefore(Number.POSITIVE_INFINITY);
  deferredFallback.forEach((entry) => addBlock(entry.block, entry.source));

  return merged.slice(0, MAX_LAYOUT_BLOCKS);
}

function normalizeArticleLayout(rawLayout = {}, context = {}) {
  const imageIds = new Set((context.imageRefs || []).map((image) => image.id));
  const requestedStylePack = coerceString(context.stylePack || rawLayout.stylePack || 'tech-green');
  const sourceSections = Array.isArray(context.sourceSections) ? context.sourceSections : extractMarkdownSections(context.markdown || '').sections;
  const normalizedAiBlocks = Array.isArray(rawLayout.blocks)
    ? rawLayout.blocks
      .map((block, index) => normalizeLayoutBlock(block, imageIds, sourceSections, index))
      .filter(Boolean)
    : [];
  const fallbackLayout = buildFallbackLayout({
    title: rawLayout.title || context.title,
    markdown: context.markdown,
    stylePack: requestedStylePack,
    imageRefs: context.imageRefs,
    sourceSections,
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
  const requestedStylePack = coerceString(context.stylePack || rawLayout.stylePack || 'tech-green');
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
  const sourceSections = Array.isArray(context.sourceSections) ? context.sourceSections : extractMarkdownSections(context.markdown || '').sections;
  const normalizedAiBlocks = Array.isArray(rawLayout.blocks)
    ? rawLayout.blocks
      .map((block, index) => normalizeLayoutBlock(block, imageIds, sourceSections, index))
      .filter(Boolean)
    : [];
  const fallbackLayout = buildFallbackLayout({
    title: rawLayout.title || context.title,
    markdown: context.markdown,
    stylePack: requestedStylePack,
    imageRefs: context.imageRefs,
    sourceSections,
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
  const sectionSummary = signals.sectionTitles.length
    ? signals.sectionTitles.map((item, index) => `- ${index}: ${item}`).join('\n')
    : '- 无明显章节结构';
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
        '可用正文 section：',
        sectionSummary,
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
        '正文主体请优先使用 section-block，并通过 sectionIndex 引用原文章节。',
        'sectionIndex 从 0 开始，对应上面“可用正文 section”的编号。',
        '优先覆盖全文主要章节，不要只处理前半篇，也不要遗漏后半部分内容。',
        '如果章节较多，允许生成更多 block 来覆盖全文；保真优先于花哨编排。',
        'CTA 和 phone-frame 都是可选块，不要默认强加。',
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
    return repairRawLayoutPayload(JSON.parse(jsonPayload));
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new AiLayoutTimeoutError(timeoutMs);
    }
    throw error;
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
  const sourceSections = extractMarkdownSections(markdown).sections;

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
    sourceSections,
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
  const bodyFontSize = 16;
  const bodyLineHeight = 1.8;
  const bodyParagraphGap = 20;
  const wrapperStyle = [
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
    `color:${tokens.text}`,
    `font-size:${bodyFontSize}px`,
    `line-height:${bodyLineHeight}`,
    'letter-spacing:0',
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
        ${block.summary ? `<p style="margin:0 0 ${bodyParagraphGap}px;color:${tokens.muted};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${escapeHtml(block.summary)}</p>` : ''}
        ${block.highlight ? `<div style="margin-top:12px;padding:10px 12px;border-left:4px solid ${tokens.accent};background:${tokens.accentSoft};border-radius:10px;color:${tokens.accentDeep};font-weight:600;font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${escapeHtml(block.highlight)}</div>` : ''}
        ${bulletsHtml}
        ${imagesHtml}
      </section>`;
    }

    if (block.type === 'section-block') {
      const sectionDisplayIndex = Number.isInteger(block.sectionIndex) && block.sectionIndex >= 0
        ? block.sectionIndex + 1
        : index + 1;
      const headingLevel = Number.isInteger(block.headingLevel) ? block.headingLevel : 2;
      const titleFontSize = headingLevel >= 3 ? 18 : 22;
      const titleMarginBottom = headingLevel >= 3 ? 10 : 12;
      const titleColor = headingLevel >= 3 ? tokens.accentDeep : tokens.text;
      const paragraphsHtml = Array.isArray(block.paragraphs)
        ? block.paragraphs.map((paragraph) => `<p style="margin:0 0 ${bodyParagraphGap}px;color:${tokens.text};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${escapeHtml(paragraph)}</p>`).join('')
        : '';
      const bulletGroupsHtml = Array.isArray(block.bulletGroups)
        ? block.bulletGroups.map((group) => {
          if (!Array.isArray(group) || !group.length) return '';
          return `<ul style="margin:12px 0 ${bodyParagraphGap}px 20px;padding:0;color:${tokens.text};font-size:${bodyFontSize}px;line-height:${bodyLineHeight};letter-spacing:0;">${group.map((bullet) => `<li style="margin:4px 0;">${escapeHtml(bullet)}</li>`).join('')}</ul>`;
        }).join('')
        : '';
      const imagesHtml = Array.isArray(block.imageIds)
        ? block.imageIds.map((imageId) => `<div style="margin-top:14px;">${renderImage(imageId)}</div>`).join('')
        : '';
      return `<section style="margin:26px 0;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="font-size:28px;font-weight:800;color:${tokens.accent};line-height:1;">${String(sectionDisplayIndex).padStart(2, '0')}</div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:${tokens.muted};text-transform:uppercase;">${escapeHtml(block.sectionLabel || `SECTION ${String(sectionDisplayIndex).padStart(2, '0')}`)}</div>
        </div>
        ${block.title ? `<h2 style="margin:0 0 ${titleMarginBottom}px;font-size:${titleFontSize}px;line-height:1.4;color:${titleColor};">${escapeHtml(block.title)}</h2>` : ''}
        ${paragraphsHtml}
        ${bulletGroupsHtml}
        ${imagesHtml}
      </section>`;
    }

    if (block.type === 'phone-frame') {
      return `<section style="margin:24px auto;max-width:380px;padding:14px;border:1px solid ${tokens.border};border-radius:42px;background:linear-gradient(180deg, ${tokens.surfaceSoft} 0%, ${tokens.surface} 100%);box-shadow:0 20px 40px -28px rgba(36,50,61,0.18);">
        <div style="width:42%;height:18px;margin:0 auto 14px;border-radius:999px;background:${tokens.border};"></div>
        <div style="background:${tokens.surface};border:1px solid ${tokens.border};border-radius:28px;padding:10px;overflow:hidden;">
          ${renderImage(block.imageId, 'border-radius:22px;')}
        </div>
        ${block.caption ? `<div style="margin-top:10px;font-size:12px;text-align:center;color:${tokens.muted};">${escapeHtml(block.caption)}</div>` : ''}
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
  normalizeArticleLayoutCacheEntry,
  normalizeSchemaValidation,
  getStylePackList,
  getStylePackById,
  listEnabledAiProviders,
  resolveAiProvider,
  extractImageRefsFromHtml,
  extractMarkdownSections,
  extractMarkdownSignals,
  buildFallbackLayout,
  normalizeArticleLayout,
  normalizeLayoutGenerationMeta,
  buildLayoutResult,
  AiLayoutSchemaError,
  AiLayoutTimeoutError,
  generateArticleLayout,
  renderArticleLayoutHtml,
  testAiProviderConnection,
};
