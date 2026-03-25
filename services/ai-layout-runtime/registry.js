const fs = require('fs');
const path = require('path');

let cachedRegistry = null;

function resolveSkillsRoot() {
  const candidates = [
    path.join(__dirname, '..', '..', 'ai-layout-skills'),
    path.join(__dirname, '..', 'ai-layout-skills'),
    path.join(__dirname, 'ai-layout-skills'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, '_shared'))) {
      return candidate;
    }
  }
  throw new Error('无法定位 ai-layout-skills 目录');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function loadSkill(skillRoot) {
  const manifest = readJson(path.join(skillRoot, 'manifest.json'));
  const prompt = readText(path.join(skillRoot, 'prompt.md')).trim();
  const blocks = readJson(path.join(skillRoot, 'blocks.json'));
  const fallback = readJson(path.join(skillRoot, 'fallback.json'));
  const skillDoc = readText(path.join(skillRoot, 'SKILL.md')).trim();
  const examplesDir = path.join(skillRoot, 'examples');
  const examples = fs.existsSync(examplesDir)
    ? fs.readdirSync(examplesDir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => ({
        name: file,
        value: readJson(path.join(examplesDir, file)),
      }))
    : [];

  return {
    id: manifest.id,
    manifest,
    prompt,
    blocks,
    fallback,
    skillDoc,
    examples,
  };
}

function loadAiLayoutSkillRegistry() {
  if (cachedRegistry) return cachedRegistry;
  const root = resolveSkillsRoot();
  const sharedRoot = path.join(root, '_shared');
  const colorPaletteData = readJson(path.join(sharedRoot, 'assets', 'color-palettes.json'));
  const blockCatalogData = readJson(path.join(sharedRoot, 'assets', 'block-catalog.json'));
  const wechatSafeStylePrimitives = readJson(path.join(sharedRoot, 'assets', 'wechat-safe-style-primitives.json'));
  const schema = readJson(path.join(sharedRoot, 'schema', 'article-layout.schema.json'));
  const template = readJson(path.join(sharedRoot, 'templates', 'article-layout.template.json'));

  const skills = fs.readdirSync(root)
    .filter((name) => !name.startsWith('_'))
    .map((name) => loadSkill(path.join(root, name)))
    .sort((left, right) => {
      const leftOrder = Number(left?.manifest?.order || 999);
      const rightOrder = Number(right?.manifest?.order || 999);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left?.manifest?.label || left?.id).localeCompare(String(right?.manifest?.label || right?.id), 'zh-Hans-CN');
    });

  cachedRegistry = {
    root,
    shared: {
      version: wechatSafeStylePrimitives.version || colorPaletteData.version || '2026.03.25-alpha.1',
      schema,
      template,
      blockCatalog: blockCatalogData,
      colorPalettes: colorPaletteData,
      wechatSafeStylePrimitives,
    },
    skills,
  };
  return cachedRegistry;
}

function getAiLayoutSkillById(id) {
  const registry = loadAiLayoutSkillRegistry();
  return registry.skills.find((skill) => skill.id === id) || null;
}

function getAiLayoutSkillList() {
  return loadAiLayoutSkillRegistry().skills.slice();
}

function getAiLayoutSharedResources() {
  return loadAiLayoutSkillRegistry().shared;
}

module.exports = {
  loadAiLayoutSkillRegistry,
  getAiLayoutSkillById,
  getAiLayoutSkillList,
  getAiLayoutSharedResources,
};
