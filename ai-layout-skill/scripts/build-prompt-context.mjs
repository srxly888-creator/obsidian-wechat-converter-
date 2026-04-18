import fs from 'node:fs';

const args = process.argv.slice(2);
const fileArgIndex = args.findIndex((arg) => arg === '--file');
const input = fileArgIndex !== -1 && args[fileArgIndex + 1]
  ? fs.readFileSync(args[fileArgIndex + 1], 'utf8')
  : fs.readFileSync(0, 'utf8');

const snapshot = String(input || '').trim();

if (!snapshot) {
  console.error('No snapshot content provided.');
  process.exit(1);
}

const output = [
  '# 公众号 AI 编排调试上下文',
  '',
  '请基于下面的调试快照，分析当前 Obsidian 微信公众号 AI 编排结果，并给出最值得优先修正的一处。',
  '',
  '## 调试快照',
  '```text',
  snapshot,
  '```',
].join('\n');

process.stdout.write(output);
