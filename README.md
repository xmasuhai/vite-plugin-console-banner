# vite-plugin-console-banner

在浏览器控制台打印 figlet ASCII Art 横幅和链接标签的 Vite 插件。

字体在构建阶段按配置动态加载，生成的文本被注入 `index.html`。浏览器不依赖 figlet，也不会打包 `.flf` 字体文件。开发和生产构建都会注入。

## 安装

```bash
pnpm add -D vite-plugin-console-banner
```

`vite` 和 `figlet` 是 peer dependency。`figlet` 也是本包的依赖，字体文件会随安装提供，一般不需要再单独安装。

## 使用

```ts
import { defineConfig } from "vite";
import { consoleBanner } from "vite-plugin-console-banner";

export default defineConfig({
  plugins: [
    consoleBanner({
      text: "xmasuhai.xyz",
      font: "big", // 大小写不敏感，也可用 "Big"、"ANSI Shadow"
      color: "#476EE3",
      badges: [
        { label: "徐帅的博客", url: "https://xmasuhai.xyz" },
        { label: "徐帅${year}简历", url: "https://xmasuhai.xyz/my-latest-resume/" },
      ],
    }),
  ],
});
```

## 选项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `text` | `string` | `"Hello"` | ASCII Art 文本 |
| `font` | `string` | `"ANSI Shadow"` | figlet 内置字体名，大小写不敏感 |
| `color` | `string` | `"#476EE3"` | ASCII Art 的 CSS 颜色 |
| `badges` | `Badge[]` | `[]` | 横幅下方的控制台标签 |
| `badges[].label` | `string` | - | 标签文字，`${year}` 会替换为构建时的年份 |
| `badges[].url` | `string` | - | 标签链接 |
| `badges[].labelBg` | `string` | `"#42b883"` | 标签背景色 |
| `badges[].urlBg` | `string` | `"#35495e"` | 链接背景色 |

字体名对应 figlet 包内 `fonts/*.flf` 的文件名（去掉扩展名）。未知字体会在构建期抛出错误，不会静默回退到默认字体。

## 许可

[MIT](./LICENSE)
