import { describe, it, expect } from 'vitest';
const { cleanHtmlForDraft } = require('../services/wechat-html-cleaner');

describe('Wechat HTML Cleaner Service', () => {
  it('should keep list label and body on one line in a simple case', () => {
    const input = '<ol><li><strong>清理时机</strong>：<br>正文</li></ol>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('清理时机');
    expect(output).toContain('正文');
    expect(output).not.toContain('<br>');
  });

  it('should unwrap fragment-only links such as rendered Obsidian tags', () => {
    const input = '<p><a href="#执业医师">#执业医师</a> <a href="#方剂学">#方剂学</a></p>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('#执业医师 #方剂学');
    expect(output).not.toContain('href="#执业医师"');
    expect(output).not.toContain('href="#方剂学"');
  });

  it('should preserve ordinary in-document anchors', () => {
    const input = '<p><a href="#toc-1">目录跳转</a> <a href="#fnref-1">↩ 返回</a></p>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('href="#toc-1"');
    expect(output).toContain('href="#fnref-1"');
    expect(output).toContain('目录跳转');
    expect(output).toContain('↩ 返回');
  });

  it('should unwrap encoded fragment links when they render as Obsidian tags', () => {
    const input = '<p><a href="#%E6%89%A7%E4%B8%9A%E5%8C%BB%E5%B8%88">#执业医师</a></p>';
    const output = cleanHtmlForDraft(input);

    expect(output).toContain('#执业医师');
    expect(output).not.toContain('href="#%E6%89%A7%E4%B8%9A%E5%8C%BB%E5%B8%88"');
  });
});
