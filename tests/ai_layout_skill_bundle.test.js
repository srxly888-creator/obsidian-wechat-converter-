import { describe, expect, it } from 'vitest';

const {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutBlockConstraintLines,
  getAiLayoutTemplate,
  validateAiLayoutPayload,
} = require('../services/ai-layout-skill-bundle');

describe('ai-layout skill bundle', () => {
  it('should expose the canonical allowed block list', () => {
    expect(AI_LAYOUT_SKILL_VERSION).toBeTruthy();
    expect(AI_LAYOUT_ALLOWED_BLOCKS.map((item) => item.type)).toEqual([
      'hero',
      'part-nav',
      'lead-quote',
      'case-block',
      'phone-frame',
      'cta-card',
    ]);
    expect(AI_LAYOUT_SKILL_SYSTEM_LINES.join('\n')).toContain('只允许使用这些 block type');
  });

  it('should expose output fields and block constraints for prompt building', () => {
    expect(AI_LAYOUT_OUTPUT_FIELDS).toEqual(['articleType', 'stylePack', 'title', 'summary', 'blocks']);
    expect(getAiLayoutBlockConstraintLines()).toContain('- hero: eyebrow, title, subtitle, coverImageId, variant');
    expect(getAiLayoutBlockConstraintLines()).toContain('- cta-card: title, body, buttonText, note');
  });

  it('should provide a reusable layout template', () => {
    const template = getAiLayoutTemplate();
    expect(template.articleType).toBe('tutorial');
    expect(template.stylePack).toBe('tech-green');
    expect(Array.isArray(template.blocks)).toBe(true);
    expect(template.blocks.some((block) => block.type === 'case-block')).toBe(true);
  });

  it('should validate layout payload schema issues', () => {
    const result = validateAiLayoutPayload({
      articleType: 'tutorial',
      stylePack: 'tech-green',
      title: '文章标题',
      summary: '一句摘要',
      blocks: [
        { type: 'hero', subtitle: '缺少 title' },
        { type: 'unknown-block' },
      ],
    });

    expect(result.isValid).toBe(false);
    expect(result.issueCount).toBeGreaterThan(0);
    expect(result.fatal).toBe(true);
    expect(result.issues.some((issue) => issue.path.includes('unknown-block') || issue.message.includes('不支持的 block type'))).toBe(true);
  });
});
