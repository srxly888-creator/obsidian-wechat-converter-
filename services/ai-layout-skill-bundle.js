const AI_LAYOUT_SKILL_VERSION = '2026.03.24-alpha.1';

const AI_LAYOUT_ALLOWED_BLOCKS = [
  {
    type: 'hero',
    fields: ['eyebrow', 'title', 'subtitle', 'coverImageId', 'variant'],
    description: '文章封面卡，适合标题、导语和封面图。',
  },
  {
    type: 'part-nav',
    fields: ['items[{label,text}]'],
    description: '章节导航卡，适合目录或分段导读。',
  },
  {
    type: 'lead-quote',
    fields: ['text', 'note'],
    description: '导语摘要卡，适合金句、总结或开场重点。',
  },
  {
    type: 'case-block',
    fields: ['caseLabel', 'title', 'summary', 'bullets', 'imageIds', 'highlight'],
    description: '案例/教程主体区块，适合分章节承载正文。',
  },
  {
    type: 'phone-frame',
    fields: ['imageId', 'caption'],
    description: '手机截图展示块，适合 App 界面或聊天截图。',
  },
  {
    type: 'cta-card',
    fields: ['title', 'body', 'buttonText', 'note'],
    description: '收尾 CTA 区块，适合总结、引导或后续动作。',
  },
];

const AI_LAYOUT_SKILL_SYSTEM_LINES = [
  '你是微信公众号排版助手。',
  '你的职责是把文章内容映射为结构化的排版 JSON。',
  '不要输出 Markdown，不要输出 HTML，不要解释，只输出一个 JSON 对象。',
  `只允许使用这些 block type: ${AI_LAYOUT_ALLOWED_BLOCKS.map((block) => block.type).join(', ')}。`,
  'block 内不要杜撰图片 URL，只能使用提供的 image id。',
  '尽量保留原文信息，不要改写作者观点，不要编造数据。',
  '优先做教程/案例型公众号编排：封面概览 -> 导语摘要 -> 分章节 case -> 截图 -> 收尾 CTA。',
  '如果原文存在明显章节标题，优先将其转成 part-nav 和 case-block。',
  '如果有图片，优先挑 1 到 2 张最像封面/截图的图进入 hero 或 phone-frame。',
];

const AI_LAYOUT_OUTPUT_FIELDS = ['articleType', 'stylePack', 'title', 'summary', 'blocks'];

function getAiLayoutBlockConstraintLines() {
  return AI_LAYOUT_ALLOWED_BLOCKS.map((block) => `- ${block.type}: ${block.fields.join(', ')}`);
}

function createSchemaIssue(path, message, fatal = false) {
  return {
    path,
    message,
    fatal: fatal === true,
  };
}

function validateAiLayoutPayload(rawLayout) {
  const issues = [];
  const allowedBlockTypes = new Set(AI_LAYOUT_ALLOWED_BLOCKS.map((block) => block.type));
  const fieldMap = new Map(AI_LAYOUT_ALLOWED_BLOCKS.map((block) => [block.type, new Set(['type', ...block.fields.flatMap((field) => {
    if (field === 'items[{label,text}]') return ['items'];
    return [field];
  })])]));

  if (!rawLayout || typeof rawLayout !== 'object' || Array.isArray(rawLayout)) {
    issues.push(createSchemaIssue('$', '顶层必须是一个 JSON 对象。', true));
    return {
      isValid: false,
      fatal: true,
      issueCount: issues.length,
      issues,
    };
  }

  const requiredTopLevelFields = ['articleType', 'stylePack', 'title', 'summary', 'blocks'];
  requiredTopLevelFields.forEach((field) => {
    if (!(field in rawLayout)) {
      issues.push(createSchemaIssue(`$.${field}`, `缺少顶层字段 ${field}。`, field === 'blocks'));
      return;
    }
    if (field === 'blocks') {
      if (!Array.isArray(rawLayout.blocks)) {
        issues.push(createSchemaIssue('$.blocks', 'blocks 必须是数组。', true));
      }
      return;
    }
    if (typeof rawLayout[field] !== 'string') {
      issues.push(createSchemaIssue(`$.${field}`, `${field} 必须是字符串。`, false));
    }
  });

  if (!Array.isArray(rawLayout.blocks)) {
    return {
      isValid: issues.length === 0,
      fatal: issues.some((issue) => issue.fatal),
      issueCount: issues.length,
      issues,
    };
  }

  rawLayout.blocks.forEach((block, index) => {
    const path = `$.blocks[${index}]`;
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      issues.push(createSchemaIssue(path, 'block 必须是对象。', true));
      return;
    }
    if (typeof block.type !== 'string' || !block.type.trim()) {
      issues.push(createSchemaIssue(`${path}.type`, 'block 缺少合法的 type。', true));
      return;
    }
    if (!allowedBlockTypes.has(block.type)) {
      issues.push(createSchemaIssue(`${path}.type`, `不支持的 block type: ${block.type}。`, true));
      return;
    }

    const allowedFields = fieldMap.get(block.type) || new Set(['type']);
    Object.keys(block).forEach((key) => {
      if (!allowedFields.has(key)) {
        issues.push(createSchemaIssue(`${path}.${key}`, `${block.type} 不支持字段 ${key}。`, false));
      }
    });

    if (block.type === 'hero' && typeof block.title !== 'string') {
      issues.push(createSchemaIssue(`${path}.title`, 'hero.title 必须是字符串。', false));
    }
    if (block.type === 'part-nav') {
      if (!Array.isArray(block.items)) {
        issues.push(createSchemaIssue(`${path}.items`, 'part-nav.items 必须是数组。', true));
      } else {
        block.items.forEach((item, itemIndex) => {
          if (!item || typeof item !== 'object') {
            issues.push(createSchemaIssue(`${path}.items[${itemIndex}]`, 'part-nav item 必须是对象。', false));
            return;
          }
          if (typeof item.label !== 'string' || typeof item.text !== 'string') {
            issues.push(createSchemaIssue(`${path}.items[${itemIndex}]`, 'part-nav item 需要 label 和 text 字符串。', false));
          }
        });
      }
    }
    if (block.type === 'lead-quote' && typeof block.text !== 'string') {
      issues.push(createSchemaIssue(`${path}.text`, 'lead-quote.text 必须是字符串。', false));
    }
    if (block.type === 'case-block') {
      if ('bullets' in block && !Array.isArray(block.bullets)) {
        issues.push(createSchemaIssue(`${path}.bullets`, 'case-block.bullets 必须是数组。', false));
      }
      if ('imageIds' in block && !Array.isArray(block.imageIds)) {
        issues.push(createSchemaIssue(`${path}.imageIds`, 'case-block.imageIds 必须是数组。', false));
      }
    }
    if (block.type === 'phone-frame' && typeof block.imageId !== 'string') {
      issues.push(createSchemaIssue(`${path}.imageId`, 'phone-frame.imageId 必须是字符串。', true));
    }
  });

  const fatal = issues.some((issue) => issue.fatal);
  return {
    isValid: issues.length === 0,
    fatal,
    issueCount: issues.length,
    issues,
  };
}

function getAiLayoutTemplate() {
  return {
    articleType: 'tutorial',
    stylePack: 'tech-green',
    title: '文章标题',
    summary: '一句摘要',
    blocks: [
      {
        type: 'hero',
        eyebrow: 'AI Layout Draft',
        title: '文章标题',
        subtitle: '封面导语',
        coverImageId: 'image-1',
        variant: 'cover-right',
      },
      {
        type: 'lead-quote',
        text: '一段适合做导语的重点摘要。',
        note: '补充说明或上下文。',
      },
      {
        type: 'case-block',
        caseLabel: 'CASE 01',
        title: '第一部分',
        summary: '这一节的核心内容。',
        bullets: ['要点一', '要点二'],
        imageIds: ['image-1'],
        highlight: '本节最值得高亮的一句话。',
      },
      {
        type: 'cta-card',
        title: '继续阅读',
        body: '收尾总结或 CTA。',
        buttonText: '整理后发布',
        note: '本版式为 AI 辅助生成。',
      },
    ],
  };
}

module.exports = {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutBlockConstraintLines,
  getAiLayoutTemplate,
  validateAiLayoutPayload,
};
