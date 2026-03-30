import { describe, expect, it } from 'vitest';

const {
  AI_LAYOUT_SKILL_VERSION,
  AI_LAYOUT_ALLOWED_BLOCKS,
  AI_LAYOUT_SKILL_SYSTEM_LINES,
  AI_LAYOUT_OUTPUT_FIELDS,
  getAiLayoutSkillList,
  getAiLayoutSkillById,
  getAiLayoutSharedResources,
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
      'section-block',
      'phone-frame',
      'cta-card',
    ]);
    expect(AI_LAYOUT_SKILL_SYSTEM_LINES.join('\n')).toContain('只允许使用这些 block type');
    expect(AI_LAYOUT_SKILL_SYSTEM_LINES.join('\n')).toContain('保真优先');
  });

  it('should expose output fields and block constraints for prompt building', () => {
    expect(AI_LAYOUT_OUTPUT_FIELDS).toEqual([
      'articleType',
      'selection',
      'resolved',
      'recommendedLayoutFamily',
      'recommendedColorPalette',
      'title',
      'summary',
      'blocks',
    ]);
    expect(getAiLayoutBlockConstraintLines()).toContain('- hero: eyebrow, title, subtitle, coverImageId, variant');
    expect(getAiLayoutBlockConstraintLines()).toContain('- section-block: sectionIndex, sectionLabel, headingLevel, title, paragraphs, bulletGroups, subsections, imageIds');
    expect(getAiLayoutBlockConstraintLines()).toContain('- cta-card: title, body, buttonText, note');
  });

  it('should load skills and shared resources from the skill registry', () => {
    const skills = getAiLayoutSkillList();
    const sourceFirst = getAiLayoutSkillById('source-first');
    const shared = getAiLayoutSharedResources();

    expect(skills.map((item) => item.id)).toEqual([
      'source-first',
      'tutorial-cards',
      'editorial-lite',
    ]);
    expect(sourceFirst?.manifest?.providerStrategy).toBe('prefer-ai-fallback-local');
    expect(sourceFirst?.prompt).toContain('原文增强型');
    expect(shared.wechatSafeStylePrimitives?.profiles?.['tutorial-cards']).toBeTruthy();
    expect(shared.colorPalettes?.colorPalettes?.length).toBe(4);
  });

  it('should provide a reusable layout template', () => {
    const template = getAiLayoutTemplate();
    expect(template.articleType).toBe('tutorial');
    expect(template.selection).toEqual({
      layoutFamily: 'auto',
      colorPalette: 'auto',
    });
    expect(template.resolved).toEqual({
      layoutFamily: 'tutorial-cards',
      colorPalette: 'tech-green',
    });
    expect(template.recommendedLayoutFamily).toBe('tutorial-cards');
    expect(template.recommendedColorPalette).toBe('tech-green');
    expect(Array.isArray(template.blocks)).toBe(true);
    expect(template.blocks.some((block) => block.type === 'section-block')).toBe(true);
    expect(template.blocks.some((block) => block.type === 'cta-card')).toBe(false);
  });

  it('should validate layout payload schema issues', () => {
    const result = validateAiLayoutPayload({
      articleType: 'tutorial',
      selection: {
        layoutFamily: 'auto',
        colorPalette: 'auto',
      },
      resolved: {
        layoutFamily: 'tutorial-cards',
        colorPalette: 'tech-green',
      },
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
