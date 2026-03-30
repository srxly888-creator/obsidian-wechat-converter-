const {
  loadAiLayoutSkillRegistry,
  getAiLayoutSkillById,
  getAiLayoutSkillList,
  getAiLayoutSharedResources,
} = require('./ai-layout-runtime/registry');

const AI_LAYOUT_SELECTION_AUTO = 'auto';
const registry = loadAiLayoutSkillRegistry();
const shared = getAiLayoutSharedResources();

const AI_LAYOUT_SKILL_VERSION = shared.version || '2026.03.25-alpha.1';
const AI_LAYOUT_FAMILIES = getAiLayoutSkillList().map((skill) => skill.id);
const AI_LAYOUT_COLOR_PALETTES = (shared.colorPalettes?.colorPalettes || []).map((item) => item.id);
const AI_LAYOUT_ALLOWED_BLOCKS = (shared.blockCatalog?.blocks || []).map((block) => ({ ...block }));
const AI_LAYOUT_OUTPUT_FIELDS = Array.isArray(shared.blockCatalog?.outputFields)
  ? shared.blockCatalog.outputFields.slice()
  : [
    'articleType',
    'selection',
    'resolved',
    'recommendedLayoutFamily',
    'recommendedColorPalette',
    'title',
    'summary',
    'blocks',
  ];

const AI_LAYOUT_SKILL_SYSTEM_LINES = [
  '你是微信公众号排版助手。',
  '你的职责是把文章内容映射为结构化的排版 JSON。',
  '不要输出 Markdown，不要输出 HTML，不要解释，只输出一个 JSON 对象。',
  `只允许使用这些 block type: ${AI_LAYOUT_ALLOWED_BLOCKS.map((block) => block.type).join(', ')}。`,
  `layoutFamily 只允许使用这些值: ${AI_LAYOUT_FAMILIES.join(', ')}。`,
  `colorPalette 只允许使用这些值: ${AI_LAYOUT_COLOR_PALETTES.join(', ')}。`,
  'block 内不要杜撰图片 URL，只能使用提供的 image id。',
  '尽量保留原文信息，不要改写作者观点，不要编造数据。',
  '优先覆盖全文主要章节，保真优先于花哨编排。',
  'selection 表示用户当前选择；resolved 表示本次最终采用的布局和颜色。',
  '如果 selection 为 auto，请根据内容推荐 recommendedLayoutFamily 和 recommendedColorPalette，并写入 resolved。',
  '如果 selection 已指定具体布局或颜色，resolved 必须尊重该选择。',
  'AI 编排最终会被渲染为微信安全 HTML，不能依赖额外 style 标签或 class 选择器。',
];

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
  const allowedLayoutFamilies = new Set(AI_LAYOUT_FAMILIES);
  const allowedColorPalettes = new Set(AI_LAYOUT_COLOR_PALETTES);
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

  const requiredTopLevelFields = ['articleType', 'selection', 'resolved', 'title', 'summary', 'blocks'];
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
    if ((field === 'selection' || field === 'resolved') && (typeof rawLayout[field] !== 'object' || !rawLayout[field] || Array.isArray(rawLayout[field]))) {
      issues.push(createSchemaIssue(`$.${field}`, `${field} 必须是对象。`, true));
      return;
    }
    if (field !== 'selection' && field !== 'resolved' && typeof rawLayout[field] !== 'string') {
      issues.push(createSchemaIssue(`$.${field}`, `${field} 必须是字符串。`, false));
    }
  });

  if (rawLayout.selection && typeof rawLayout.selection === 'object' && !Array.isArray(rawLayout.selection)) {
    const selectionLayoutFamily = String(rawLayout.selection.layoutFamily || '').trim();
    const selectionColorPalette = String(rawLayout.selection.colorPalette || '').trim();
    if (!selectionLayoutFamily || (selectionLayoutFamily !== AI_LAYOUT_SELECTION_AUTO && !allowedLayoutFamilies.has(selectionLayoutFamily))) {
      issues.push(createSchemaIssue('$.selection.layoutFamily', 'selection.layoutFamily 必须是 auto 或合法的 layoutFamily。', true));
    }
    if (!selectionColorPalette || (selectionColorPalette !== AI_LAYOUT_SELECTION_AUTO && !allowedColorPalettes.has(selectionColorPalette))) {
      issues.push(createSchemaIssue('$.selection.colorPalette', 'selection.colorPalette 必须是 auto 或合法的 colorPalette。', true));
    }
  }

  if (rawLayout.resolved && typeof rawLayout.resolved === 'object' && !Array.isArray(rawLayout.resolved)) {
    const resolvedLayoutFamily = String(rawLayout.resolved.layoutFamily || '').trim();
    const resolvedColorPalette = String(rawLayout.resolved.colorPalette || '').trim();
    if (!allowedLayoutFamilies.has(resolvedLayoutFamily)) {
      issues.push(createSchemaIssue('$.resolved.layoutFamily', 'resolved.layoutFamily 必须是合法的 layoutFamily。', true));
    }
    if (!allowedColorPalettes.has(resolvedColorPalette)) {
      issues.push(createSchemaIssue('$.resolved.colorPalette', 'resolved.colorPalette 必须是合法的 colorPalette。', true));
    }
  }

  if ('recommendedLayoutFamily' in rawLayout) {
    const recommendedLayoutFamily = String(rawLayout.recommendedLayoutFamily || '').trim();
    if (recommendedLayoutFamily && !allowedLayoutFamilies.has(recommendedLayoutFamily)) {
      issues.push(createSchemaIssue('$.recommendedLayoutFamily', 'recommendedLayoutFamily 必须是合法的 layoutFamily。', false));
    }
  }

  if ('recommendedColorPalette' in rawLayout) {
    const recommendedColorPalette = String(rawLayout.recommendedColorPalette || '').trim();
    if (recommendedColorPalette && !allowedColorPalettes.has(recommendedColorPalette)) {
      issues.push(createSchemaIssue('$.recommendedColorPalette', 'recommendedColorPalette 必须是合法的 colorPalette。', false));
    }
  }

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
    if (block.type === 'section-block') {
      const isNumber = Number.isInteger(block.sectionIndex) && block.sectionIndex >= 0;
      const isNumericString = typeof block.sectionIndex === 'string' && /^\d+$/.test(block.sectionIndex.trim());
      if (!isNumber && !isNumericString) {
        issues.push(createSchemaIssue(`${path}.sectionIndex`, 'section-block.sectionIndex 必须是非负整数。', true));
      }
      if ('sectionLabel' in block && typeof block.sectionLabel !== 'string') {
        issues.push(createSchemaIssue(`${path}.sectionLabel`, 'section-block.sectionLabel 必须是字符串。', false));
      }
      if ('headingLevel' in block && (!Number.isInteger(block.headingLevel) || block.headingLevel < 2 || block.headingLevel > 6)) {
        issues.push(createSchemaIssue(`${path}.headingLevel`, 'section-block.headingLevel 必须是 2 到 6 之间的整数。', false));
      }
      if ('title' in block && typeof block.title !== 'string') {
        issues.push(createSchemaIssue(`${path}.title`, 'section-block.title 必须是字符串。', false));
      }
      if ('paragraphs' in block && !Array.isArray(block.paragraphs)) {
        issues.push(createSchemaIssue(`${path}.paragraphs`, 'section-block.paragraphs 必须是数组。', false));
      }
      if ('bulletGroups' in block) {
        if (!Array.isArray(block.bulletGroups)) {
          issues.push(createSchemaIssue(`${path}.bulletGroups`, 'section-block.bulletGroups 必须是数组。', false));
        } else {
          block.bulletGroups.forEach((group, groupIndex) => {
            if (!Array.isArray(group) || group.some((item) => typeof item !== 'string')) {
              issues.push(createSchemaIssue(`${path}.bulletGroups[${groupIndex}]`, 'section-block.bulletGroups 中的每组必须是字符串数组。', false));
            }
          });
        }
      }
      if ('subsections' in block) {
        if (!Array.isArray(block.subsections)) {
          issues.push(createSchemaIssue(`${path}.subsections`, 'section-block.subsections 必须是数组。', false));
        } else {
          block.subsections.forEach((subsection, subsectionIndex) => {
            if (!subsection || typeof subsection !== 'object' || Array.isArray(subsection)) {
              issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}]`, 'subsection 必须是对象。', false));
              return;
            }
            if (typeof subsection.title !== 'string') {
              issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].title`, 'subsection.title 必须是字符串。', false));
            }
            if ('level' in subsection && (!Number.isInteger(subsection.level) || subsection.level < 3 || subsection.level > 6)) {
              issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].level`, 'subsection.level 必须是 3 到 6 之间的整数。', false));
            }
            if ('paragraphs' in subsection && !Array.isArray(subsection.paragraphs)) {
              issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].paragraphs`, 'subsection.paragraphs 必须是数组。', false));
            }
            if ('bulletGroups' in subsection) {
              if (!Array.isArray(subsection.bulletGroups)) {
                issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].bulletGroups`, 'subsection.bulletGroups 必须是数组。', false));
              } else {
                subsection.bulletGroups.forEach((group, groupIndex) => {
                  if (!Array.isArray(group) || group.some((item) => typeof item !== 'string')) {
                    issues.push(createSchemaIssue(`${path}.subsections[${subsectionIndex}].bulletGroups[${groupIndex}]`, 'subsection.bulletGroups 中的每组必须是字符串数组。', false));
                  }
                });
              }
            }
          });
        }
      }
      if ('imageIds' in block && !Array.isArray(block.imageIds)) {
        issues.push(createSchemaIssue(`${path}.imageIds`, 'section-block.imageIds 必须是数组。', false));
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
  return JSON.parse(JSON.stringify(shared.template));
}

module.exports = {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_SELECTION_AUTO,
  AI_LAYOUT_FAMILIES,
  AI_LAYOUT_COLOR_PALETTES,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutBlockConstraintLines,
  getAiLayoutTemplate,
  validateAiLayoutPayload,
  getAiLayoutSkillRegistry: loadAiLayoutSkillRegistry,
  getAiLayoutSkillById,
  getAiLayoutSkillList,
  getAiLayoutSharedResources,
};
