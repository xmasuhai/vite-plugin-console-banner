# 发布 npm 包提示词（vite-plugin-console-banner）

请协助完成当前项目 `vite-plugin-console-banner` 的 npm 包发布流程。默认自动升级**补丁版本（`patch`）**；若我额外指定了 `minor`、`major` 或具体版本号，则按指定方式升级。

执行过程中请严格遵循以下流程与安全规范：

---

## 一、优先推荐方式（调用项目内置发布脚本）

- 项目已在 `scripts/publish.mjs`（以及 `package.json` 的 `release` / `release:dry` 命令）中封装了完整的自动化发布逻辑（包含前置校验、临时切换 npm 官方源、自动升级补丁版本、发布及自动恢复原镜像源）：

1. **发布前演练预检（Dry Run）**

```bash
pnpm run release:dry
```

- 确认工作区状态、构建产物、单元测试、登录状态及待打包文件清单均无异常。

2. **执行正式发布（默认自动升级 `patch` 补丁版本）**

```bash
# 默认升级补丁版本（patch，如 0.1.4 -> 0.1.5）并发布
pnpm run release

# 如需升级次版本或主版本：
# node scripts/publish.mjs minor
# node scripts/publish.mjs major

# 如账号启用了 npm 2FA 双因素验证码：
# node scripts/publish.mjs patch --otp=<6位验证码>

# 如需发布完成后自动推送 Git 提交和版本 Tag：
# node scripts/publish.mjs patch --push
```

---

## 二、标准分步执行流程（逐步核验或手动执行时遵循）

若需逐步执行或排查异常，请严格按以下顺序操作，**切勿颠倒顺序**：

### 1. 前置检查（Git 状态 + 构建 + 测试）
- 执行 `git status` 检查工作区，**确保所有代码变更均已提交，工作区完全干净**（存在未提交变更会导致 `npm version` 失败）。
- 执行构建与测试，确保在修改版本号之前产物和用例 100% 正常：

```bash
pnpm run build
pnpm run test
```

### 2. 查看并临时切换 npm 镜像源（关键步骤）
- 查看并记录当前 npm 镜像源地址，以便发布结束后恢复：

```bash
npm config get registry
```

-（若本地使用 `nrm`，也可通过 `nrm ls` 查看当前激活的源，例如 `taobao` 对应 `https://registry.npmmirror.com/` 。）
- 若当前源不是 npm 官方默认源 `https://registry.npmjs.org/` ，请**临时切换为 npm 官方源**：

```bash
# 方式一：使用 npm config 直接设置
npm config set registry https://registry.npmjs.org/

# 方式二：若使用 nrm 管理镜像源
nrm use npm
```

- 切换后再次执行 `npm config get registry`，确认已生效为 `https://registry.npmjs.org/`。

### 3. 验证 npm 登录状态
- 检查当前是否已在 npm 官方源登录：

```bash
npm whoami --registry https://registry.npmjs.org/
```

- **异常处理**：若提示未登录（`ENEEDAUTH`）或登录态失效，请停止自动流程并提示我在交互式终端手动执行 `npm login` 完成认证后再继续；切勿在非交互终端中盲目等待输入。

### 4. 自动升级版本号（默认补丁版本 `patch`）
- 根据发布类型更新 `package.json` 版本号并自动生成 Git commit 与版本 tag：

```bash
# 默认：补丁版本（修复 bug 或小改动，如 v0.1.4 -> v0.1.5）
npm version patch

# 可选：次版本号（新增向后兼容功能，如 v0.1.4 -> v0.2.0）
# npm version minor

# 可选：主版本号（不兼容的重大变更，如 v0.1.4 -> v1.0.0）
# npm version major
```

### 5. 执行发布
- 可先通过 `npm pack --dry-run`（未升级版本号前）或升级版本号后通过 `npm publish --dry-run --registry https://registry.npmjs.org/` 核验打包文件列表（确认仅包含 `dist/`、`package.json`、`README.md`、`LICENSE`）。
- 正式发布到 npm 官方仓库（会自动触发 `prepublishOnly` 钩子再次验证构建和测试）：

```bash
npm publish --registry https://registry.npmjs.org/
```

-（若触发 2FA 校验，请提示我提供验证码并附带 `--otp=<code>` 重新执行 `node scripts/publish.mjs --no-version --otp=<code>` 或 `npm publish --otp=<code>`。）

### 6. 恢复原始 npm 镜像源与同步远端（必须执行）
- **无论发布成功还是中途失败**，都必须将 npm 镜像源恢复为步骤 2 记录的原始源（或切回日常使用的国内镜像源）：

```bash
# 恢复为发布前记录的原镜像源地址
npm config set registry <发布前记录的registry地址>

# 或使用 nrm 切回淘宝镜像源
nrm use taobao

# 校验镜像源是否已恢复
npm config get registry
```

- 发布成功后，按需将版本提交与标签推送至远端仓库：

```bash
git push
git push --tags
```

---

## 三、输出总结要求

流程执行完毕后，请向我汇报以下摘要信息：
1. **包名与版本变更**：如 `vite-plugin-console-banner`: `0.1.4` -> `0.1.5`
2. **构建与测试结果**：构建产物及单元测试是否全部通过
3. **npm 发布状态**：是否成功发布至 `https://registry.npmjs.org/`
4. **镜像源恢复确认**：发布前的源、发布时使用的源、当前最终已恢复的 `npm config get registry` 结果
5. **Git 同步状态**：本地生成的版本 commit / tag 名称，以及是否已推送到远端仓库

---
---
