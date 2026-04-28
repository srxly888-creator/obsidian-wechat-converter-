/**
 * 🍎 Apple Style 多主题系统
 * 支持多种主题风格：简约、经典、水墨、极光等
 * 设计理念：克制、优雅、注重细节
 */

// Use assignment expression to avoid "Identifier has already been declared" errors if re-eval'd
window.AppleTheme = class AppleTheme {
  /**
   * 🎨 主题色板 - 8种预设颜色
   */
  static THEME_COLORS = {
    blue: '#0366d6',
    green: '#28a745',
    purple: '#6f42c1',
    orange: '#fd7e14',
    teal: '#20c997',
    rose: '#e83e8c',
    ruby: '#dc3545',
    slate: '#6c757d',
  };

  /**
   * 🎨 标题专用深色板 (Tone-on-Tone)
   * 相比主题色加深 15-20%，用于标题以增加视觉稳重感，避免与正文高亮色冲突
   */
  static THEME_COLORS_DEEP = {
    blue: '#004795',    // Deep Blue
    green: '#1e7e34',   // Deep Green
    purple: '#4a2b82',  // Deep Purple
    orange: '#c75e0b',  // Deep Orange
    teal: '#158765',    // Deep Teal
    rose: '#b81f66',    // Deep Rose
    ruby: '#a81825',    // Deep Ruby
    slate: '#495057',   // Deep Slate
  };

  /**
   * 📐 字体大小系统 - 5档
   */
  static FONT_SIZES = {
    1: { base: 14, h1: 26, h2: 20, h3: 16, h4: 14, h5: 14, h6: 14, code: 12, caption: 12 },
    2: { base: 15, h1: 28, h2: 21, h3: 17, h4: 15, h5: 15, h6: 15, code: 13, caption: 12 },
    3: { base: 16, h1: 30, h2: 22, h3: 18, h4: 16, h5: 16, h6: 16, code: 14, caption: 13 }, // 推荐
    4: { base: 17, h1: 32, h2: 24, h3: 19, h4: 17, h5: 17, h6: 17, code: 15, caption: 14 },
    5: { base: 18, h1: 34, h2: 26, h3: 20, h4: 18, h5: 18, h6: 18, code: 16, caption: 14 },
  };

  /**
   * 🔤 字体栈
   */
  static FONTS = {
    'sans-serif': `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif`,
    'serif': `'Times New Roman', Georgia, 'SimSun', serif`,
    'monospace': `'SF Mono', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
  };

  /**
   * 🎨 主题配置 - 每种主题的独特配色和规则
   */
  static THEME_CONFIGS = {

    github: {
      name: '简约',
      lineHeight: 1.82,
      paragraphGap: 18,
      h1Decoration: 'none',
      h2Decoration: 'none',
      h3Decoration: 'bottom-line-left',
      h4Decoration: 'none',
      headingWeight: 800,
      headingLetterSpacing: 0,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',

      linkDecoration: 'underline',
      blockquoteBorderWidth: 4,
      tableHeaderBg: '#f6f8fa',
      tableCellPadding: 10,
      figurePadding: 8,
      figureBorderColor: '#e8eaed',
      // Removed blockquoteBorderColor to allow theme color (was #d0d7de)
      // Removed blockquoteBg to allow theme color tint (was #ffffff)
    },
    wechat: {
      name: '经典',
      lineHeight: 1.8,
      paragraphGap: 24,
      h1Decoration: 'classic-title',
      h2Decoration: 'classic-title',
      h3Decoration: 'classic-subhead',
      h4Decoration: 'classic-minor',
      headingWeight: 700,
      headingLetterSpacing: 0,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'none',
      blockquoteBorderWidth: 4,
      blockquoteBg: '#f8fafc',
      blockquoteStyle: 'soft',
    },
    serif: {
      name: '优雅',
      lineHeight: 1.8,
      paragraphGap: 20,
      h1Decoration: 'editorial-h1',      // 杂志大标题 (金线)
      h2Decoration: 'editorial-h1',      // H2 此时也是金线 (Level 2 = Level 1)
      h3Decoration: 'editorial-h2',      // H3 使用原 H2 样式 (斜体，现在的 helper 已强制左对齐)
      h4Decoration: 'editorial-h3',      // H4 使用原 H3 (左对齐下划线)
      headingWeight: 700,
      headingLetterSpacing: 1,           // 优雅主题增加字间距
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      linkDecoration: 'none',
      blockquoteBorderWidth: 0,          // 居中样式不需要左边框
      blockquoteStyle: 'center',         // 新增：居中引用
    },
    paper: {
      name: '纸张长文',
      lineHeight: 1.9,
      paragraphGap: 22,
      h1Decoration: 'paper-title',
      h2Decoration: 'paper-chapter',
      h3Decoration: 'paper-section',
      h4Decoration: 'paper-kicker',
      h5Decoration: 'simple',
      h6Decoration: 'quiet',
      headingWeight: 700,
      headingLetterSpacing: 0,
      textColor: '#3f3a33',
      headingColor: '#3e3e3e',
      sectionBg: '#fffdf8',
      mutedTextColor: '#786f63',
      linkDecoration: 'none',
      blockquoteBorderWidth: 0,
      blockquoteBg: '#f7f1e7',
      blockquoteStyle: 'paper',
      tableHeaderBg: '#f7f1e7',
      tableBorderColor: '#e6dccd',
      figureBorderColor: '#eadfce',
    },
    grid: {
      name: '网格文档',
      lineHeight: 1.82,
      paragraphGap: 20,
      h1Decoration: 'grid-title',
      h2Decoration: 'grid-chapter',
      h3Decoration: 'grid-section',
      h4Decoration: 'grid-kicker',
      h5Decoration: 'light-bg',
      h6Decoration: 'quiet',
      headingWeight: 800,
      headingLetterSpacing: 0,
      textColor: '#344054',
      headingColor: '#263238',
      sectionBgStyle: 'grid',
      sectionBgSize: '18px 18px',
      mutedTextColor: '#667085',
      linkDecoration: 'none',
      blockquoteBorderWidth: 4,
      blockquoteBg: '#f6f9fc',
      blockquoteStyle: 'soft',
      tableHeaderBg: '#f3f7fb',
      tableBorderColor: '#dbe5ef',
    },
    typo: {
      name: 'Typo',
      lineHeight: 1.92,
      paragraphGap: 22,
      h1Decoration: 'typo-title',
      h2Decoration: 'typo-title',
      h3Decoration: 'typo-section',
      h4Decoration: 'typo-subhead',
      h5Decoration: 'dashed-bottom',
      h6Decoration: 'quiet',
      headingWeight: 700,
      headingLetterSpacing: 0,
      textColor: '#333333',
      headingColor: '#222222',
      mutedTextColor: '#6b6b6b',
      linkDecoration: 'underline',
      blockquoteBorderWidth: 2,
      blockquoteBg: '#fafafa',
      blockquoteStyle: 'soft',
      paragraphTextIndent: '2em',
      tableHeaderBg: '#f7f7f7',
      figureBorderColor: '#ededed',
    },
    media: {
      name: '清爽媒体',
      lineHeight: 1.86,
      paragraphGap: 18,
      h1Decoration: 'media-title',
      h2Decoration: 'media-chapter',
      h3Decoration: 'media-section',
      h4Decoration: 'left-border',
      h5Decoration: 'light-bg',
      h6Decoration: 'quiet',
      headingWeight: 700,
      headingLetterSpacing: 0,
      textColor: '#3b4648',
      headingColor: '#263238',
      mutedTextColor: '#667476',
      linkDecoration: 'none',
      blockquoteBorderWidth: 3,
      blockquoteBg: '#f3fbf8',
      blockquoteStyle: 'soft',
      paragraphTextIndent: '1em',
      tableHeaderBg: '#f3fbf8',
      tableBorderColor: '#dbeee8',
      figureBorderColor: '#dcefeb',
    },
    colorful: {
      name: '彩色强调',
      lineHeight: 1.82,
      paragraphGap: 20,
      h1Decoration: 'colorful-title',
      h2Decoration: 'colorful-chapter',
      h3Decoration: 'colorful-section',
      h4Decoration: 'colorful-kicker',
      h5Decoration: 'light-bg',
      h6Decoration: 'quiet',
      headingWeight: 800,
      headingLetterSpacing: 0,
      textColor: '#3e3e3e',
      headingColor: '#3e3e3e',
      mutedTextColor: '#6b7280',
      linkDecoration: 'none',
      blockquoteBorderWidth: 4,
      blockquoteBg: '#fffaf5',
      blockquoteStyle: 'soft',
      tableHeaderBg: '#fff8ed',
      figureBorderColor: '#f0e4d4',
      strongBg: true,
    },
  };

  /**
   * 📐 间距系统 - 8px 基准
   */
  static SPACING = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  };

  /**
   * 🎯 圆角系统
   */
  static RADIUS = {
    sm: 4,
    md: 8,
    lg: 12,
  };

  static QUOTE_CALLOUT_NEUTRAL_BG = '#f9f9f9';
  static QUOTE_NEUTRAL_BORDER = '#d9d9d9';

  /**
   * 当前配置
   */
  constructor(options = {}) {
    this.themeName = options.theme || 'github';
    this.themeColor = options.themeColor || 'blue';
    this.customColor = options.customColor || null;
    this.quoteCalloutStyleMode = options.quoteCalloutStyleMode || 'theme';
    this.fontFamily = options.fontFamily || 'sans-serif';
    this.fontSize = options.fontSize || 3;
    this.macCodeBlock = options.macCodeBlock !== false;
    this.codeLineNumber = options.codeLineNumber || false;
    // 侧边距设置 (默认 16px)
    this.sidePadding = options.sidePadding !== undefined ? options.sidePadding : 16;
    // 标题染色设置
    this.coloredHeader = options.coloredHeader || false;
  }

  /**
   * 获取当前主题色值
   */
  getThemeColorValue() {
    if (this.themeColor === 'custom' && this.customColor) {
      return this.customColor;
    }
    return AppleTheme.THEME_COLORS[this.themeColor] || AppleTheme.THEME_COLORS.blue;
  }

  /**
   * 获取标题专用深色值
   */
  getHeadingColorValue() {
    // 1. 如果未开启标题染色，返回默认深灰
    if (!this.coloredHeader) {
      return '#3e3e3e';
    }

    // 2. 自定义颜色：自动计算变深 20%
    if (this.themeColor === 'custom' && this.customColor) {
      return this.adjustColorBrightness(this.customColor, -20);
    }

    // 3. 预设颜色：返回深色板对应值
    return AppleTheme.THEME_COLORS_DEEP[this.themeColor] || AppleTheme.THEME_COLORS_DEEP.blue;
  }

  /**
   * 辅助：调整 Hex 颜色亮度
   * @param {string} hex - #RRGGBB
   * @param {number} percent - -100 to 100
   */
  adjustColorBrightness(hex, percent) {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    r = Math.round(r * (100 + percent) / 100);
    g = Math.round(g * (100 + percent) / 100);
    b = Math.round(b * (100 + percent) / 100);

    r = (r < 255) ? r : 255;
    g = (g < 255) ? g : 255;
    b = (b < 255) ? b : 255;

    // Pad with 0 if necessary
    const rr = ((r.toString(16).length === 1) ? '0' + r.toString(16) : r.toString(16));
    const gg = ((g.toString(16).length === 1) ? '0' + g.toString(16) : g.toString(16));
    const bb = ((b.toString(16).length === 1) ? '0' + b.toString(16) : b.toString(16));

    return `#${rr}${gg}${bb}`;
  }

  /**
   * 获取当前主题配置
   */
  getThemeConfig() {
    return AppleTheme.THEME_CONFIGS[this.themeName] || AppleTheme.THEME_CONFIGS.github;
  }

  /**
   * 获取字体尺寸配置
   */
  getSizes() {
    return AppleTheme.FONT_SIZES[this.fontSize] || AppleTheme.FONT_SIZES[3];
  }

  /**
   * 获取字体栈
   */
  getFontFamily() {
    return AppleTheme.FONTS[this.fontFamily] || AppleTheme.FONTS['sans-serif'];
  }

  getQuoteCalloutStyleMode() {
    return this.quoteCalloutStyleMode === 'neutral' ? 'neutral' : 'theme';
  }

  /**
   * 获取元素样式
   * @param {string} tagName - HTML 标签名
   * @returns {string} - CSS 样式字符串
   */
  getStyle(tagName) {
    const config = this.getThemeConfig();
    const sizes = this.getSizes();
    const font = this.getFontFamily();
    const color = this.getThemeColorValue();
    const quoteCalloutStyleMode = this.getQuoteCalloutStyleMode();
    const s = AppleTheme.SPACING;
    const r = AppleTheme.RADIUS;

    // 标题颜色逻辑：使用专门的深色系标题色
    // 注意：某些特殊主题装饰(h1Decoration)可能已经包含了颜色设置，这里主要针对文字本身
    const headingColor = this.getHeadingColorValue();

    switch (tagName) {
      case 'section':
        // 使用配置的 sidePadding
        const sectionBackground = config.sectionBgStyle === 'grid'
          ? `linear-gradient(${color}09 1px, transparent 1px), linear-gradient(90deg, ${color}09 1px, transparent 1px), #ffffff`
          : (config.sectionBg || '#ffffff');
        return this.joinStyleStrings(
          `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; padding: 20px ${this.sidePadding}px; background: ${sectionBackground}; max-width: 100%; word-wrap: break-word; text-align: justify`,
          config.sectionBgSize ? `background-size: ${config.sectionBgSize}` : ''
        );

      case 'h1': return this.getH1Style(config.h1Decoration, color, sizes.h1, font, headingColor, config);
      case 'h2': return this.getH2Style(config.h2Decoration, color, sizes.h2, font, headingColor, config);
      case 'h3': return this.getH3Style(config.h3Decoration, color, sizes.h3, font, headingColor, config);
      case 'h4': return this.getH4Style(config.h4Decoration, color, sizes.h4, font, headingColor);

      case 'h5':
        return this.getH5Style(config.h5Decoration, color, sizes.h5, font, headingColor);
      case 'h6':
        return this.getH6Style(config.h6Decoration, color, sizes.h6, font, headingColor, config.mutedTextColor);

      case 'p':
        return this.joinStyleStrings(
          `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; margin: 0 0 ${config.paragraphGap}px 0; text-align: justify; letter-spacing: 0`,
          config.paragraphTextIndent ? `text-indent: ${config.paragraphTextIndent}` : ''
        );





      case 'blockquote':
        if (config.blockquoteStyle === 'center') {
          const centeredBackground = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_CALLOUT_NEUTRAL_BG
            : (config.blockquoteBg || color + '1F');
          const centeredBorder = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_NEUTRAL_BORDER
            : `${color}99`;
          return `font-family: ${AppleTheme.FONTS.serif}; font-size: ${sizes.base}px; line-height: 1.8; color: #555; background: ${centeredBackground}; margin: 22px 0 22px 8px; padding: 16px 18px; text-align: justify; border-left: 3px solid ${centeredBorder}; border-radius: ${r.sm}px;`;
        }
        if (config.blockquoteStyle === 'paper') {
          const paperBg = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_CALLOUT_NEUTRAL_BG
            : (config.blockquoteBg || color + '1F');
          const paperBorder = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_NEUTRAL_BORDER
            : `${color}99`;
          return `font-family: ${AppleTheme.FONTS.serif}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: #5f574c; background: ${paperBg}; margin: 22px 0 22px 8px; padding: 16px 18px; border-left: 3px solid ${paperBorder}; border-radius: ${r.sm}px; text-align: justify;`;
        }
        if (config.blockquoteStyle === 'soft') {
          const softBg = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_CALLOUT_NEUTRAL_BG
            : (config.blockquoteBg || color + '14');
          const softBorderColor = quoteCalloutStyleMode === 'neutral'
            ? AppleTheme.QUOTE_NEUTRAL_BORDER
            : `${color}99`;
          const softBorderWidth = this.themeName === 'wechat'
            ? 3
            : (config.blockquoteBorderWidth || 4);
          return `font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: #595959; background: ${softBg}; margin: ${s.md}px 0 ${s.md}px 8px; padding: ${s.md}px; border-left: ${softBorderWidth}px solid ${softBorderColor}; border-radius: ${r.sm}px;`;
        }

        if (quoteCalloutStyleMode === 'neutral') {
          const neutralBorderWidth = this.themeName === 'wechat'
            ? 3
            : (config.blockquoteBorderWidth || 4);
          return `font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: #595959; background: ${AppleTheme.QUOTE_CALLOUT_NEUTRAL_BG}; margin: ${s.md}px 0 ${s.md}px 8px; padding: ${s.md}px; border-left: ${neutralBorderWidth}px solid ${AppleTheme.QUOTE_NEUTRAL_BORDER}; border-radius: ${r.sm}px;`;
        }

        // 经典主题（wechat）：使用更细的边框和更浅的颜色，与 H3 区分
        // H3: 4px 主题色 100% 左边框，顶格
        // 引用块: 3px 主题色 60% 左边框，缩进 4px
        if (this.themeName === 'wechat') {
          return `font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: #595959; background: ${config.blockquoteBg || color + '1F'}; margin: ${s.md}px 0 ${s.md}px 4px; padding: ${s.md}px; border-left: 3px solid ${color}99; border-radius: 3px;`;
        }

        // Standard Blockquote: Restoring Italic and adjusting padding/background to match the screenshot
        // Background: Light opacity of theme color (1F) for better visibility
        // Border: Solid theme color
        // Font: Normal (removed italic) for better legibility on mobile
        return `font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: #595959; background: ${config.blockquoteBg || color + '1F'}; margin: ${s.md}px 0; padding: ${s.md}px; border-left: ${config.blockquoteBorderWidth}px solid ${config.blockquoteBorderColor || color}; border-radius: 3px;`;

      case 'pre':
        return `background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: ${r.md}px; padding: ${s.md}px; margin: ${s.md}px 0; overflow-x: auto; font-family: ${AppleTheme.FONTS.monospace}; font-size: ${sizes.code}px; line-height: 1.6; color: #24292e;`;

      case 'code':
        return `background: ${color}1A; color: ${color}; padding: 2px 4px; border-radius: 3px; font-family: ${AppleTheme.FONTS.monospace}; font-size: ${sizes.code}px;`;

      case 'ul':
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; margin: 12px 0; padding-left: 20px; list-style-type: disc;`;
      case 'ol':
        return `font-family: ${font}; font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; margin: 12px 0; padding-left: 20px; list-style-type: decimal;`;
      case 'li':
        return `font-size: ${sizes.base}px; line-height: ${config.lineHeight}; color: ${config.textColor}; margin: 4px 0;`;
      case 'li p':
        return `margin: 0; padding: 0; line-height: ${config.lineHeight};`;




      case 'figure':
        // Fix: Restoring wireframe (border/padding) & balanced spacing (20px top/bottom)
        // No shadow for cleaner look
        return `display: block; margin: 20px 0; text-align: center; border: 1px solid ${config.figureBorderColor || '#e1e4e8'}; border-radius: ${r.md}px; padding: ${config.figurePadding || 10}px;`;

      case 'figcaption':
        return `font-size: ${sizes.caption}px; color: #999; text-align: center; margin-top: ${s.sm}px;`;

      case 'img':
        return `display: block; margin: 0 auto; max-width: 100%; border-radius: 4px;`;

      case 'a':
        return `color: ${color}; text-decoration: ${config.linkDecoration}; border-bottom: ${config.linkDecoration === 'none' ? `1px dashed ${color}` : 'none'};`;

      case 'table-wrapper':
        return `box-sizing: border-box; max-width: 100%; overflow-x: auto; margin: ${s.md}px 0; padding-bottom: 10px;`;
      case 'table':
        return `border-collapse: collapse; width: 100%; min-width: max-content; border: 1px solid ${config.tableBorderColor || '#e1e4e8'};`;
      case 'th':
        return `background: ${config.tableHeaderBg || color + '1F'}; font-weight: bold; color: ${config.textColor}; border: 1px solid ${config.tableBorderColor || '#e1e4e8'}; padding: ${config.tableCellPadding || 12}px; text-align: left;`;
      case 'td':
        return `border: 1px solid ${config.tableBorderColor || '#e1e4e8'}; padding: ${config.tableCellPadding || 12}px; text-align: left;`;
      case 'thead':
        return `background: #f6f8fa;`;

      case 'hr':
        return `border: 0; border-top: 1px solid rgba(0,0,0,0.08); margin: 40px 0;`;

      case 'strong':
        return config.strongBg
          ? `font-weight: bold; color: ${color}; background: ${color}18; padding: 0 3px; border-radius: 3px;`
          : `font-weight: bold; color: ${color};`;
      case 'em':
        return `font-style: italic;`;
      case 'del':
        return `text-decoration: line-through; color: #999;`;

      case 'avatar-header':
        return `margin: 0 0 ${s.sm}px 0 !important; display: flex !important; align-items: center !important; justify-content: flex-start !important; width: 100%; flex-direction: row !important; flex-wrap: nowrap !important; text-align: left !important;`;
      case 'avatar':
        return `display: inline-block !important; vertical-align: middle !important; margin: 0 !important; width: 32px !important; height: 32px !important; border-radius: 50%; object-fit: cover; border: 1px solid #e8e8ed; flex-shrink: 0;`;
      case 'avatar-caption':
        return `display: inline-block !important; vertical-align: middle !important; font-size: ${sizes.caption}px; color: #666; margin-left: 10px; line-height: 1.4; text-align: left !important;`;

      default:
        return '';
    }
  }

  // === Helper Methods ===

  getH1Style(type, color, fontSize, font, headingColor, config = {}) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 30px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.2;`;
    switch (type) {
      case 'editorial-h1': // Magazine Style: Forced Serif + Golden Line
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 30px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.2;
          background-image: linear-gradient(to right, transparent, ${color}, transparent);
          background-size: 100px 1px;
          background-repeat: no-repeat;
          background-position: bottom center;
          padding-bottom: 20px; letter-spacing: 1px;`;
      case 'bottom-line':
        // Pure CSS centered short line using linear-gradient (simulating image)
        return `${base}
          background-image: linear-gradient(to right, ${color}, ${color});
          background-size: 80px 3px;
          background-repeat: no-repeat;
          background-position: bottom center;
          padding-bottom: 15px;`;
      case 'border-box':
        return `${base} border: 1px solid ${color}; padding: 10px 20px; border-radius: 4px; display: inline-block; width: auto;`;
      case 'classic-title':
        return `${base} margin: 34px auto 22px; padding: 0; background-image: linear-gradient(to right, transparent, ${color}, transparent); background-size: 120px 2px; background-repeat: no-repeat; background-position: bottom center; padding-bottom: 14px;`;
      case 'paper-title':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 24px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1px; border-top: 2px solid ${color}; border-bottom: 1px solid ${color}66; padding: 16px 0 14px;`;
      case 'grid-title':
        return `${base} text-align: left; border: 1px solid ${color}55; border-radius: 4px; padding: 10px 12px; background: ${color}0F;`;
      case 'typo-title':
        return `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: 700; margin: 34px auto 22px; color: ${headingColor}; text-align: left; line-height: 1.28; border-bottom: 1px solid #d8d8d8; padding-bottom: 14px;`;
      case 'media-title':
        return `${base} text-align: left; color: ${headingColor}; background-image: linear-gradient(to right, ${color}, ${color}33); background-size: 100% 2px; background-repeat: no-repeat; background-position: bottom left; padding-bottom: 14px;`;
      case 'colorful-title':
        return `${base} color: #ffffff; background: ${color}; padding: 12px 18px; border-radius: 6px; box-shadow: 6px 6px 0 ${color}33;`;
      default: // none or unknown
        return this.joinStyleStrings(base, config.headingLetterSpacing ? `letter-spacing: ${config.headingLetterSpacing}px` : '');
    }
  }

  getH2Style(type, color, fontSize, font, headingColor, config = {}) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 32px auto 16px; text-align: center; color: ${headingColor}; line-height: 1.25;`;
    switch (type) {
      case 'editorial-h1': // Golden Line (Shifted from H1)
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 32px auto 16px; color: ${headingColor}; text-align: center; line-height: 1.2;
          background-image: linear-gradient(to right, transparent, ${color}, transparent);
          background-size: 100px 1px;
          background-repeat: no-repeat;
          background-position: bottom center;
          padding-bottom: 20px; letter-spacing: 1px;`;
      case 'editorial-h2': // Magazine Subtitle
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: normal; margin: 32px auto 16px; text-align: center; color: ${headingColor}; line-height: 1.4; font-style: italic; letter-spacing: 1px;`;
      case 'bottom-line':
        // Pure CSS centered short line (thinner/shorter for H2)
        return `${base}
           background-image: linear-gradient(to right, ${color}, ${color});
           background-size: 50px 2px;
           background-repeat: no-repeat;
           background-position: bottom center;
           padding-bottom: 12px;`;
      case 'filled-pill':
        return `${base} background-color: ${color}; color: #fff; padding: 5px 20px; border-radius: 20px; display: inline-block; width: auto;`;
      case 'bottom-line-center':
        return `${base} display: inline-block; border-bottom: 1px solid ${color}; padding-bottom: 5px; width: auto;`;
      case 'classic-title':
        return `${base} margin: 34px auto 20px; padding: 0; background-image: linear-gradient(to right, transparent, ${color}, transparent); background-size: 120px 2px; background-repeat: no-repeat; background-position: bottom center; padding-bottom: 14px;`;
      case 'paper-title':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1px; border-top: 2px solid ${color}; border-bottom: 1px solid ${color}66; padding: 14px 0 12px;`;
      case 'paper-chapter':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px auto 20px; color: ${headingColor}; text-align: center; line-height: 1.35; letter-spacing: 1.5px; border-bottom: 2px solid ${color}; padding-bottom: 12px;`;
      case 'grid-title':
        return `${base} text-align: left; border: 1px solid ${color}55; border-radius: 4px; padding: 10px 12px; background: ${color}0F;`;
      case 'grid-chapter':
        return `${base} text-align: left; border-left: 3px solid ${color}; border-radius: 0 4px 4px 0; padding: 8px 12px; background: ${color}08;`;
      case 'typo-title':
        return `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: 700; margin: 34px 0 18px; color: ${headingColor}; text-align: left; line-height: 1.3; background-image: linear-gradient(#d8d8d8, #d8d8d8); background-size: 40% 1px; background-repeat: no-repeat; background-position: bottom left; padding-bottom: 12px;`;
      case 'media-title':
        return `${base} text-align: left; color: ${headingColor}; background-image: linear-gradient(to right, ${color}, ${color}33); background-size: 100% 2px; background-repeat: no-repeat; background-position: bottom left; padding-bottom: 12px;`;
      case 'media-chapter':
        return `${base} text-align: left; color: ${headingColor}; background-image: linear-gradient(to right, ${color}, transparent); background-size: 60% 2px; background-repeat: no-repeat; background-position: bottom left; padding-bottom: 12px;`;
      case 'colorful-title':
        return `${base} color: #ffffff; background: ${color}; padding: 10px 16px; border-radius: 6px; box-shadow: 5px 5px 0 ${color}33;`;
      case 'colorful-chapter':
        return `${base} text-align: left; border-left: 4px solid ${color}; background: ${color}12; padding: 10px 14px; border-radius: 0 4px 4px 0;`;
      case 'paper-section':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 34px 0 16px; color: ${headingColor}; text-align: left; line-height: 1.35; border-bottom: 1px solid ${color}55; padding-bottom: 8px;`;
      case 'grid-section':
        return `${base} text-align: left; border-bottom: 1px solid ${color}66; padding: 4px 0 8px;`;
      case 'typo-section':
        return `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: 700; margin: 34px 0 16px; color: ${headingColor}; text-align: left; line-height: 1.35;`;
      case 'media-section':
        return `${base} display: inline-block; width: auto; text-align: left; background: ${color}14; border: 1px solid ${color}33; padding: 6px 12px; border-radius: 2px;`;
      case 'colorful-section':
        return `${base} display: inline-block; width: auto; text-align: left; background: ${color}18; border-bottom: 3px solid ${color}; padding: 6px 10px 5px; border-radius: 4px 4px 0 0;`;
      default:
        return this.joinStyleStrings(base, config.headingLetterSpacing ? `letter-spacing: ${config.headingLetterSpacing}px` : '');
    }
  }

  getH3Style(type, color, fontSize, font, headingColor, config = {}) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 20px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.3;`;
    switch (type) {
      case 'editorial-h2': // Italic Serif (Left Aligned for H3)
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: normal; margin: 24px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.4; font-style: italic; letter-spacing: 1px;`;
      case 'editorial-h3': // Magazine Section: Forced Serif + Left Underline
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 24px 0 12px; text-align: left; color: ${headingColor}; line-height: 1.3;
           border-bottom: 1px solid ${color}; padding-bottom: 4px; display: inline-block; width: auto; letter-spacing: 0.5px;`;
      case 'left-border':
        return `${base} border-left: 4px solid ${color}; padding-left: 10px;`;
      case 'bottom-line-left':
        return `${base} display: inline-block; border-bottom: 2px solid ${color}; padding-bottom: 2px; margin-right: auto;`;
      case 'classic-subhead':
        return `${base} border-left: 3px solid ${color}; background: ${color}0A; padding: 6px 10px; margin: 24px 0 12px;`;
      case 'paper-section':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 28px 0 14px; color: ${headingColor}; text-align: left; line-height: 1.35; border-top: 1px solid ${color}55; padding-top: 8px;`;
      case 'grid-section':
        return `${base} background-image: linear-gradient(${color}, ${color}); background-size: 3px 55%; background-position: left center; background-repeat: no-repeat; padding-left: 12px;`;
      case 'typo-section':
        return `${base} font-weight: 700; margin: 28px 0 14px; line-height: 1.35; border-left: 2px solid #d8d8d8; padding-left: 10px;`;
      case 'media-section':
        return `${base} display: inline-block; width: auto; background: ${color}14; border: 1px solid ${color}33; padding: 5px 10px; border-radius: 2px;`;
      case 'colorful-section':
        return `${base} display: inline-block; width: auto; background: ${color}18; border-bottom: 2px solid ${color}; padding: 5px 9px 4px; border-radius: 4px 4px 0 0;`;
      case 'paper-kicker':
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 24px 0 12px; color: ${headingColor}; text-align: left; line-height: 1.35; padding-left: 10px; border-left: 3px double ${color};`;
      case 'typo-subhead':
        return `${base} font-weight: 700; color: ${headingColor};`;
      default:
        return this.joinStyleStrings(base, config.headingLetterSpacing ? `letter-spacing: ${config.headingLetterSpacing}px` : '');
    }
  }

  getH4Style(type, color, fontSize, font, headingColor) {
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 15px 0 10px; text-align: left; color: ${headingColor}; line-height: 1.35;`;
    switch (type) {
      case 'editorial-h3': // Inherit H3 style for H4
        return `font-family: ${AppleTheme.FONTS.serif}; display: block; font-size: ${fontSize}px; font-weight: bold; margin: 15px 0 10px; text-align: left; color: ${headingColor}; line-height: 1.35;
           border-bottom: 1px solid ${color}; padding-bottom: 3px; display: inline-block; width: auto; letter-spacing: 0.5px;`;
      case 'simple': // Simple Bold (User Font)
        // Use headingColor (Deep) instead of color (Bright)
        return `${base}`;
      case 'light-bg':
        // Background uses bright color tint (low opacity), Text uses deep headingColor
        return `${base} background-color: ${color}15; padding: 4px 8px; border-radius: 4px; display: inline-block;`;
      case 'classic-minor':
        return `${base} border-left: 2px solid ${color}55; padding-left: 8px;`;
      case 'left-border':
        return `${base} border-left: 3px solid ${color}; padding-left: 9px;`;
      case 'bottom-line-left':
        return `${base} display: inline-block; border-bottom: 2px solid ${color}; padding-bottom: 2px; margin-right: auto;`;
      case 'paper-kicker':
        return `font-family: ${AppleTheme.FONTS.serif}; display: inline-block; font-size: ${fontSize}px; font-weight: bold; margin: 22px 0 10px; color: ${headingColor}; text-align: left; line-height: 1.35; border-bottom: 1px double ${color}99; padding-bottom: 2px;`;
      case 'grid-kicker':
        return `${base} display: inline-block; border-bottom: 1px dashed ${color}44; padding-bottom: 2px;`;
      case 'typo-subhead':
        return `${base} font-weight: 700; letter-spacing: 1.5px;`;
      case 'colorful-kicker':
        return `${base} color: ${color}; background: ${color}12; padding: 4px 8px; border-radius: 4px; display: inline-block;`;
      case 'italic-serif':
        return `${base} font-style: italic; font-family: serif; border-bottom: 1px dashed #ccc; display: inline-block; padding-bottom: 2px;`;
      default:
        return base;
    }
  }

  getH5Style(type, color, fontSize, font, headingColor) {
    if (!type) {
      return `font-family: ${font}; font-size: ${fontSize}px; font-weight: bold; color: ${headingColor}; margin: 10px 0; text-align: left; line-height: 1.4;`;
    }
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; color: ${headingColor}; margin: 12px 0 8px; text-align: left; line-height: 1.4;`;
    switch (type) {
      case 'light-bg':
        return `${base} background-color: ${color}12; padding: 3px 7px; border-radius: 4px; display: inline-block;`;
      case 'dashed-bottom':
        return `${base} font-weight: 600; border-bottom: 1px dashed ${color}33; display: inline-block; padding-bottom: 1px;`;
      case 'simple':
      default:
        return base;
    }
  }

  getH6Style(type, color, fontSize, font, headingColor, mutedColor = '#6b7280') {
    if (!type) {
      return `font-family: ${font}; font-size: ${fontSize}px; font-weight: bold; color: ${headingColor}; margin: 10px 0; text-align: left; line-height: 1.4;`;
    }
    const base = `font-family: ${font}; display: block; font-size: ${fontSize}px; font-weight: bold; color: ${headingColor}; margin: 10px 0 6px; text-align: left; line-height: 1.4;`;
    switch (type) {
      case 'quiet':
        return `${base} color: ${mutedColor}; font-weight: 600;`;
      default:
        return base;
    }
  }

  joinStyleStrings(...styles) {
    return styles
      .map((style) => (style || '').trim())
      .filter(Boolean)
      .map((style) => style.endsWith(';') ? style : `${style};`)
      .join(' ');
  }

  /**
   * 更新配置
   */
  update(options) {
    if (options.theme !== undefined) this.themeName = options.theme;
    if (options.themeColor !== undefined) this.themeColor = options.themeColor;
    if (options.customColor !== undefined) this.customColor = options.customColor;
    if (options.quoteCalloutStyleMode !== undefined) this.quoteCalloutStyleMode = options.quoteCalloutStyleMode;
    if (options.fontFamily !== undefined) this.fontFamily = options.fontFamily;
    if (options.fontSize !== undefined) this.fontSize = options.fontSize;
    if (options.macCodeBlock !== undefined) this.macCodeBlock = options.macCodeBlock;
    if (options.codeLineNumber !== undefined) this.codeLineNumber = options.codeLineNumber;
    if (options.sidePadding !== undefined) this.sidePadding = options.sidePadding;
    if (options.coloredHeader !== undefined) this.coloredHeader = options.coloredHeader;
  }

  /**
   * 获取主题列表
   */
  static getThemeList() {
    return Object.entries(AppleTheme.THEME_CONFIGS).map(([key, config]) => ({
      value: key,
      label: config.name,
    }));
  }

  /**
   * 获取主题色列表
   */
  static getColorList() {
    return Object.entries(AppleTheme.THEME_COLORS).map(([key, value]) => ({
      value: key,
      color: value,
    }));
  }
}

// 导出到全局作用域
window.AppleTheme = AppleTheme;
