# 添加 `enable` 开启开关选项与自定义展示时机修改说明

本文档记录了为 `vite-plugin-console-banner` 插件添加 `enable` 配置项的完整修改步骤、设计考量以及测试验证情况。

---

## 1. 背景与目标

在实际项目中，开发者通常希望根据环境或自定义逻辑决定是否在控制台打印横幅（例如仅在生产环境或特定调试模式下开启）。
为了提供灵活的展示时机控制，需在插件配置项中增加 `enable` 开关，满足以下需求：
1. **支持布尔值**：直接通过 `true` / `false` 开启或禁用。
2. **支持同步/异步函数**：通过 `() => boolean | Promise<boolean>` 动态获取开启状态（支持异步判断逻辑）。
3. **安全跳过处理**：当处于禁用状态时，不触发 ASCII Art 字体加载与解析（避免因字体配置错误等引发不必要的构建报错），且不注入 `<script>` 到 HTML 中。
4. **测试与文档覆盖**：补充对应的单元与集成测试，并更新 `README.md` 说明文档。

---

## 2. 修改步骤

### 2.1 扩展 TypeScript 类型定义 (`src/index.ts`)

在 `ConsoleBannerOptions` 接口中新增 `enable` 属性定义：

```typescript
export interface ConsoleBannerOptions {
  /**
   * 是否开启横幅打印，默认 true。
   * 支持传入布尔值或返回布尔值的函数（支持异步函数），用于自定义展示信息的时机（例如仅在生产环境开启）。
   */
  enable?: boolean | (() => boolean | Promise<boolean>);
  // ... 其他已有字段
}
```

### 2.2 核心生命周期与逻辑改造 (`src/index.ts`)

1. **默认值解构**：在 `consoleBanner` 入口处为 `enable` 设置默认值 `true`。
2. **状态解析辅助函数**：引入 `isEnabled` 统一处理布尔值与同步/异步函数：
   ```typescript
   const isEnabled = async (): Promise<boolean> => {
     if (typeof enable === "function") {
       return await enable();
     }
     return enable;
   };
   ```
3. **`buildStart` 钩子异步化与跳过**：
   - 改造为 `async buildStart()`。
   - 在执行前先判断 `await isEnabled()`，若为 `false` 则提前返回，不执行 `renderAsciiArt(text, font)`。
4. **`transformIndexHtml` 钩子跳过与惰性回退**：
   - 改造为 `async transformIndexHtml()`。
   - 先检查 `await isEnabled()`，若为 `false` 则不注入任何脚本（返回 `undefined`）。
   - 保留未预解析时的惰性 `renderAsciiArt` 补全逻辑。

---

### 2.3 完善自动化测试用例 (`src/index.test.ts`)

1. **测试辅助函数调整**：
   - 将 `render` 辅助函数的返回类型调整为 `Promise<string | undefined>`，以便断言未注入脚本的情况。
2. **新增测试用例**：
   - **布尔值开关测试**：验证 `enable: true` 时成功注入脚本，`enable: false` 时返回 `undefined`。
   - **同步/异步函数测试**：验证 `() => true`、`() => false`、`async () => true` 及 `async () => false` 的正确响应。
   - **禁用时的容错测试**：验证 `enable: false` 时传入未知字体不会抛出字体解析异常。
   - **生产打包集成测试**：通过 Vite `build()` 验证在完整构建流程下 `enable: false` 时输出的 `dist/index.html` 不含横幅与 `console.log`。

---

### 2.4 更新使用说明文档 (`README.md`)

1. **更新配置示例**：在快速上手示例代码中演示 `enable: process.env.NODE_ENV === "production"` 的推荐用法。
2. **更新选项表格**：在选项表格首行添加 `enable` 的类型（`boolean | (() => boolean | Promise<boolean>)`）、默认值（`true`）及说明。

---

## 3. 验证情况

| 验证项 | 执行命令 | 验证结果 |
| :--- | :--- | :--- |
| **单元与集成测试** | `pnpm test` (`vitest run`) | 9 个测试用例全部通过（包含字体解析、标签转义、XSS 防护、开关控制与 Vite 生产构建测试） |
| **构建与类型检查** | `pnpm build` (`tsup && tsc`) | 成功输出 CJS、ESM 以及类型声明文件 (`dist/index.d.ts`)，无类型报错 |

---

## 4. 涉及文件清单

- `src/index.ts`：核心逻辑及类型定义变更。
- `src/index.test.ts`：单元测试与构建测试补充。
- `README.md`：文档与选项说明更新。
- `doc/log/add-enable-option.md`：本次修改步骤总结文档（本文档）。
