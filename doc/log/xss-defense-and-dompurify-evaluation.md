# XSS 防护现状与 DOMPurify 引入可行性评估报告

本文档记录了对 `vite-plugin-console-banner` 插件当前 XSS 防护机制的分析评估，以及引入 `DOMPurify` 等三方净化库的技术可行性、成本效益（ROI）与替代加固方案分析。

---

## 1. 插件当前的 XSS 防护现状

插件目前已在构建注入阶段设计并实现了针对脚本注入与标签闭合逃逸的基础防御。

在 `src/index.ts` 中，通过 `escapeForSingleQuotedJs` 函数对动态内容（ASCII Art 文本、颜色值、徽章标签与链接）进行了字符转义：

```typescript
function escapeForSingleQuotedJs(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("<", "\\u003c");
}
```

并在 `src/index.test.ts` 中配备了防御断言用例（例如拦截 `</script><script>alert(1)` 攻击载荷）：

1. **防止 HTML 标签闭合逃逸**：将 `<` 转换为 `\u003c`，防止恶意输入构造 `</script>` 提前闭合 Vite 注入到 HTML 的内联 `<script>` 标签。
2. **防止 JavaScript 语法逃逸**：对单引号 `'` 和反斜杠 `\\` 进行转义，防止恶意内容闭合当前 JS 字符串字面量并注入可执行语句。

---

## 2. DOMPurify 引入评估（结论：不适用且不推荐）

**核心结论**：引入 `DOMPurify` 存在严重的上下文错位与极高的引入成本，无法带来有效安全收益，**不建议引入**。

### 2.1 防护上下文错位（HTML 解析器 vs JS 字符串逃逸）
* **定位不同**：`DOMPurify` 的核心设计目标是清洗不可信的 **HTML / SVG 标记代码**（主要防御基于 `innerHTML` 等 DOM 渲染引发的 XSS，清理 `<script>`、`onerror=` 属性、`javascript:` 伪协议等）。
* **场景不符**：本插件并非将内容作为 HTML 片段插入 DOM 树，而是将字符串作为参数内联至 JavaScript 的 `console.log(...)` 语句中。当前面临的核心威胁是 **Inline Script 字符串注入 / 语法逃逸**。
* **副作用**：若将包含特殊 ASCII Art 符号或 JavaScript 代码片段的字符串传递给 HTML 净化器，不仅无法转义 JS 单双引号及控制字符，反而可能将 ASCII Art 中的特殊符号误当做不合规标记进行破坏性清洗。

### 2.2 运行环境与性能开销（Node.js 构建阶段无原生 DOM）
* 本插件为 **Vite 构建时插件**，代码在 Node.js 环境下执行。
* `DOMPurify` 深度依赖浏览器原生的 `window.document` 与 DOM 解析能力。若在 Node.js 构建期运行，必须额外引入 `jsdom` 等重量级虚拟 DOM 运行时。这会显著增加依赖体积、拖慢构建性能，且带来不必要的维护复杂度。

### 2.3 浏览器控制台原生安全边界
* 浏览器控制台 API `console.log('%c text', 'style')` 将格式化参数视为**纯文本**与 **CSS 样式声明**，控制台引擎本身不会将输出文本作为 HTML 标签进行二次解析与执行。

---

## 3. 高效且低成本的安全加固方案

从工程效率与可靠性角度出发，建议采用以下原生、轻量且具备高防护效能的方案：

### 3.1 采用 `JSON.stringify` 结合 `<` 转义（推荐，零外部依赖）
手动列举字符替换容易遗漏特定的 Unicode 行/段分隔符（如 `\u2028`、`\u2029`，在部分 JS 引擎中可能导致字符串换行破坏语法）。使用原生 `JSON.stringify` 配合 `<` 转义可实现完备的字符串字面量安全注入：

```typescript
function escapeForInlinedScript(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
```

在生成内联脚本时，直接作为合法的 JS 字符串字面量嵌入：

```typescript
const script = `
  ;(function() {
    console.log(
      '%c' + ${escapeForInlinedScript(asciiArt)},
      'color: ' + ${escapeForInlinedScript(color)} + '; font-size: 12px;'
    );
  })();`;
```

### 3.2 引入轻量级序列化库 `serialize-javascript`
若需要更标准化的脚本安全序列化，可选用专门处理 HTML 嵌入场景的轻量工业级库：
```bash
pnpm add serialize-javascript
pnpm add -D @types/serialize-javascript
```
该库专为向 HTML `<script>` 注入 JS 数据设计，原生处理了 `</script>` 逃逸及所有特殊 Unicode 字符，体积小且运行开销极低。

### 3.3 CSS 样式属性合法性约束
对 `color`、`labelBg`、`urlBg` 等样式字段，可通过正则表达式约束为合法的 CSS 颜色值（例如十六进制颜色 `#RGB` / `#RRGGBB`、`rgb()`、`hsl()` 或标准颜色关键字），避免异常样式规则影响控制台正常输出。

---

## 4. 总结与建议行动项

| 方案 | 防护有效性 | 性能与依赖成本 | 综合推荐度 |
| :--- | :--- | :--- | :--- |
| **引入 DOMPurify** | 无效（上下文错位） | 极高（需额外引入 `jsdom`） | ❌ 不推荐 |
| **保持现有手动转义** | 良好（覆盖核心逃逸场景） | 零成本 | ⚠️ 可维持当前状态 |
| **升级为 `JSON.stringify` + `<` 转义** | 完备（覆盖 Unicode 换行与全字符集） | 零成本（Node 原生能力） | ✅ 推荐（高性价比） |
| **引入 `serialize-javascript`** | 完备（行业标准序列化） | 极低（轻量工具库） | 💡 可选（复杂数据注入时推荐） |
