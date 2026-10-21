import type { FontName } from "figlet";
import type { Plugin } from "vite";
import figlet from "figlet";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function getFigletFontsDir(): string {
  // figlet 的 exports 没有导出 package.json。figlet/node 指向 dist，字体在其上一级 fonts。
  return join(dirname(require.resolve("figlet/node")), "../fonts");
}

function unknownFontError(font: string): Error {
  return new Error(
    `[vite-plugin-console-banner] 未知的 figlet 字体 "${font}"。` +
      `请使用 figlet 内置字体名，例如 "ANSI Shadow" 或 "Big"。`,
  );
}

/** 将配置的字体名解析为 figlet 内置字体的规范名称，大小写不敏感。 */
function resolveFigletFont(font: string): FontName {
  const fontFile = `${font}.flf`;
  const files = readdirSync(getFigletFontsDir());
  if (files.includes(fontFile)) {
    return font as FontName;
  }

  const matched = files.filter((file) => file.toLowerCase() === fontFile.toLowerCase());
  if (matched.length === 1) {
    return matched[0]!.slice(0, -".flf".length) as FontName;
  }

  throw unknownFontError(font);
}

function renderAsciiArt(text: string, font: string): string {
  const resolvedFont = resolveFigletFont(font);
  const fontData = readFileSync(join(getFigletFontsDir(), `${resolvedFont}.flf`), "utf8");
  figlet.parseFont(resolvedFont, fontData);
  const art = figlet.textSync(text, { font: resolvedFont });
  if (!art) {
    throw new Error(
      `[vite-plugin-console-banner] 无法使用字体 "${resolvedFont}" 生成 ASCII art。`,
    );
  }
  return art;
}

/** 嵌入单引号 JS 字符串，并避免用户内容提前结束 HTML script 标签。 */
function escapeForSingleQuotedJs(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("<", "\\u003c");
}

export interface ConsoleBannerBadge {
  label: string;
  url: string;
  /** 标签背景色，默认 '#42b883' */
  labelBg?: string;
  /** URL 背景色，默认 '#35495e' */
  urlBg?: string;
}

export interface ConsoleBannerOptions {
  /** ASCII Art 显示的文本，默认 'Hello' */
  text?: string;
  /**
   * figlet 内置字体名称，大小写不敏感，默认 'ANSI Shadow'。
   * 运行时按 fonts/*.flf 文件名匹配；未知字体在构建时报错，不会回退。
   */
  font?: FontName | (string & {});
  /** ASCII Art 文字颜色（CSS color），默认 '#476EE3' */
  color?: string;
  /** 额外的控制台标签行。label 中的 ${year} 会替换为构建时的年份。 */
  badges?: ConsoleBannerBadge[];
}

/**
 * Vite 插件：在浏览器控制台打印 ASCII Art 横幅。
 *
 * 字体只在构建阶段读取。生成的文本被注入 HTML，浏览器不依赖 figlet。
 *
 * @example
 * ```ts
 * consoleBanner({
 *   text: "xmasuhai.xyz",
 *   font: "big",
 *   badges: [
 *     { label: "徐帅的博客", url: "https://xmasuhai.xyz" },
 *     { label: "徐帅${year}简历", url: "https://xmasuhai.xyz/my-latest-resume/" },
 *   ],
 * })
 * ```
 */
export function consoleBanner(options: ConsoleBannerOptions = {}): Plugin {
  const { text = "Hello", font = "ANSI Shadow", color = "#476EE3", badges = [] } = options;

  let asciiArt = "";

  return {
    name: "vite-plugin-console-banner",
    enforce: "post",
    buildStart() {
      asciiArt = renderAsciiArt(text, font);
    },
    transformIndexHtml() {
      const currentYear = new Date().getFullYear();
      const badgeStatements = badges
        .map((badge) => {
          const labelBg = escapeForSingleQuotedJs(badge.labelBg || "#42b883");
          const urlBg = escapeForSingleQuotedJs(badge.urlBg || "#35495e");
          const label = escapeForSingleQuotedJs(
            badge.label.replaceAll("${year}", String(currentYear)),
          );
          const url = escapeForSingleQuotedJs(badge.url);

          return `
          console.log(
            '%c ${label} %c ${url} ',
            'background: ${labelBg}; color: #fff; padding: 4px 8px; border-radius: 4px 0 0 4px; font-size: 14px;',
            'background: ${urlBg}; color: #fff; padding: 4px 8px; border-radius: 0 4px 4px 0; font-size: 14px;'
          );`;
        })
        .join("\n");

      const script = `
        ;(function() {
          console.log(
            '%c${escapeForSingleQuotedJs(asciiArt)}',
            'color: ${escapeForSingleQuotedJs(color)}; font-size: 12px;'
          );
          ${badgeStatements}
        })();`;

      return [
        {
          tag: "script",
          children: script,
          injectTo: "body",
        },
      ];
    },
  };
}

export default consoleBanner;
