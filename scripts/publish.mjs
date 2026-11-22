#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OFFICIAL_REGISTRY = "https://registry.npmjs.org/";
const REGISTRY_ALIASES = {
  npm: "https://registry.npmjs.org/",
  taobao: "https://registry.npmmirror.com/",
  npmmirror: "https://registry.npmmirror.com/",
  tencent: "https://mirrors.tencent.com/npm/",
  yarn: "https://registry.yarnpkg.com/",
};

const VALID_BUMP_TYPES = new Set([
  "patch",
  "minor",
  "major",
  "prepatch",
  "preminor",
  "premajor",
  "prerelease",
]);
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SAFE_TOKEN_REGEX = /^[0-9A-Za-z._-]+$/;

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const packageJsonPath = resolve(rootDir, "package.json");

function logInfo(message) {
  console.log(`\x1b[36m[publish]\x1b[0m ${message}`);
}

function logSuccess(message) {
  console.log(`\x1b[32m[publish]\x1b[0m ${message}`);
}

function logWarn(message) {
  console.warn(`\x1b[33m[publish]\x1b[0m ${message}`);
}

function logError(message) {
  console.error(`\x1b[31m[publish]\x1b[0m ${message}`);
}

function printHelp() {
  console.log(`
用法:
  node scripts/publish.mjs [patch|minor|major|<version>] [options]

说明:
  自动化发布 npm 包脚本：默认自动升级补丁版本（patch），自动临时切换 npm 官方源，
  执行构建与测试校验后发布，并在结束或异常退出时自动恢复原始 npm 镜像源。

版本参数（可选，默认: patch）:
  patch                     升级补丁版本，如 0.1.4 -> 0.1.5（默认）
  minor                     升级次版本号，如 0.1.4 -> 0.2.0
  major                     升级主版本号，如 0.1.4 -> 1.0.0
  <x.y.z>                   指定具体语义化版本号

选项:
  -d, --dry-run             演练模式：校验环境、构建、测试与打包清单，不修改版本号，不实际发布
  --no-version              跳过版本号升级（适用于已手动升级版本后重试发布）
  --push                    发布成功后自动执行 git push 与 git push --tags
  --otp=<code>              传入 npm 双因素认证（2FA）一次性验证码
  --tag=<dist-tag>          指定发布的 dist-tag（例如 latest、beta、next）
  --restore-registry=<src>  结束后强制恢复到的镜像源 URL 或别名（如 taobao、npm；默认自动恢复为运行前的源）
  --allow-dirty             允许在 Git 工作区存在未提交变更时继续（仅配合 --dry-run 或 --no-version 有效）
  -h, --help                显示帮助信息

示例:
  node scripts/publish.mjs
  node scripts/publish.mjs --dry-run
  node scripts/publish.mjs minor --push
  node scripts/publish.mjs patch --otp=123456
  node scripts/publish.mjs --no-version --restore-registry=taobao
`);
}

function parseCliArgs(argv) {
  const options = {
    releaseType: "patch",
    skipVersion: false,
    dryRun: false,
    pushGit: false,
    allowDirty: false,
    otp: "",
    distTag: "",
    restoreRegistry: "",
    help: false,
  };

  let hasPositionalReleaseType = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "-d" || arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-version" || arg === "--skip-version") {
      options.skipVersion = true;
      continue;
    }
    if (arg === "--push") {
      options.pushGit = true;
      continue;
    }
    if (arg === "--allow-dirty") {
      options.allowDirty = true;
      continue;
    }
    if (arg === "--otp") {
      options.otp = argv[++i] ?? "";
      if (!options.otp) {
        throw new Error("参数 --otp 缺少验证码值。");
      }
      continue;
    }
    if (arg.startsWith("--otp=")) {
      options.otp = arg.slice("--otp=".length);
      if (!options.otp) {
        throw new Error("参数 --otp 缺少验证码值。");
      }
      continue;
    }
    if (arg === "--tag") {
      options.distTag = argv[++i] ?? "";
      if (!options.distTag) {
        throw new Error("参数 --tag 缺少标签值。");
      }
      continue;
    }
    if (arg.startsWith("--tag=")) {
      options.distTag = arg.slice("--tag=".length);
      if (!options.distTag) {
        throw new Error("参数 --tag 缺少标签值。");
      }
      continue;
    }
    if (arg === "--restore-registry") {
      options.restoreRegistry = argv[++i] ?? "";
      if (!options.restoreRegistry) {
        throw new Error("参数 --restore-registry 缺少镜像源地址或别名。");
      }
      continue;
    }
    if (arg.startsWith("--restore-registry=")) {
      options.restoreRegistry = arg.slice("--restore-registry=".length);
      if (!options.restoreRegistry) {
        throw new Error("参数 --restore-registry 缺少镜像源地址或别名。");
      }
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`未知选项: ${arg}。请使用 --help 查看支持的选项。`);
    }

    if (hasPositionalReleaseType) {
      throw new Error(`多余的位置参数: ${arg}。`);
    }
    options.releaseType = arg;
    hasPositionalReleaseType = true;
  }

  if (
    !options.skipVersion &&
    !VALID_BUMP_TYPES.has(options.releaseType) &&
    !SEMVER_REGEX.test(options.releaseType)
  ) {
    throw new Error(
      `无效的版本升级类型 "${options.releaseType}"。支持 patch、minor、major 或合法语义化版本号（如 0.1.5）。`,
    );
  }

  if (options.otp && !SAFE_TOKEN_REGEX.test(options.otp)) {
    throw new Error(`非法的 --otp 参数值: "${options.otp}"。`);
  }

  if (options.distTag && !SAFE_TOKEN_REGEX.test(options.distTag)) {
    throw new Error(`非法的 --tag 参数值: "${options.distTag}"。`);
  }

  return options;
}

function normalizeRegistryUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }
  return `${trimmed.replace(/\/+$/, "").toLowerCase()}/`;
}

function resolveRegistryInput(input) {
  const trimmed = input.trim();
  const aliasTarget = REGISTRY_ALIASES[trimmed.toLowerCase()];
  if (aliasTarget) {
    return aliasTarget;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `无效的镜像源地址 "${trimmed}"。请传入完整 http(s) URL 或别名（${Object.keys(REGISTRY_ALIASES).join(", ")}）。`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`不支持的镜像源协议 "${parsed.protocol}"，仅支持 http 或 https。`);
  }

  return parsed.href;
}

function runCapture(command) {
  return execSync(command, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runInherit(command) {
  execSync(command, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

function readPackageInfo() {
  const raw = readFileSync(packageJsonPath, "utf8");
  return JSON.parse(raw);
}

function previewNextVersion(currentVersion, releaseType) {
  if (SEMVER_REGEX.test(releaseType)) {
    return releaseType;
  }

  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(currentVersion);
  if (!match) {
    return `<${releaseType}>`;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  switch (releaseType) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
    case "prepatch":
      return `${major}.${minor}.${patch + 1}-0`;
    case "preminor":
      return `${major}.${minor + 1}.0-0`;
    case "premajor":
      return `${major + 1}.0.0-0`;
    default:
      return `${currentVersion} (${releaseType})`;
  }
}

function getCurrentRegistry() {
  return runCapture("npm config get registry");
}

function setNpmRegistry(registryUrl) {
  runInherit(`npm config set registry "${registryUrl}"`);
}

function ensureCleanGitWorkingTree(options) {
  const status = runCapture("git status --porcelain");
  if (!status) {
    logInfo("Git 工作区干净。");
    return;
  }

  if (options.dryRun || options.allowDirty) {
    logWarn("检测到未提交的 Git 变更（当前模式允许继续）：");
    console.warn(status);
    return;
  }

  throw new Error(
    `Git 工作区存在未提交的变更，无法升级版本并发布。请先 git commit 或 stash 后重试：\n${status}`,
  );
}

function verifyNpmAuth(options) {
  try {
    const username = runCapture(`npm whoami --registry "${OFFICIAL_REGISTRY}"`);
    logInfo(`已验证 npm 官方源登录账号: ${username}`);
    return username;
  } catch {
    if (options.dryRun) {
      logWarn(
        "当前未登录 npm 官方源（dry-run 演练模式将继续执行构建、测试与打包预检；正式发布前请先执行 npm login）。",
      );
      return "";
    }

    if (process.stdin.isTTY && process.stdout.isTTY) {
      logWarn("检测到尚未登录 npm 官方源，正在启动交互式 npm login ...");
      runInherit(`npm login --registry "${OFFICIAL_REGISTRY}"`);
      const username = runCapture(`npm whoami --registry "${OFFICIAL_REGISTRY}"`);
      logInfo(`登录成功，当前 npm 账号: ${username}`);
      return username;
    }

    throw new Error(
      `当前未登录 npm 官方源（${OFFICIAL_REGISTRY}）。请先在终端切换官方源并执行 "npm login" 完成认证后再运行发布脚本。`,
    );
  }
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const initialPkg = readPackageInfo();
  const pkgName = initialPkg.name;
  const oldVersion = initialPkg.version;

  logInfo(`准备发布包: ${pkgName}（当前版本: v${oldVersion}）`);
  if (options.dryRun) {
    logWarn("当前运行在 --dry-run 演练模式，不会修改版本号，也不会实际发布到 npm。");
  }

  ensureCleanGitWorkingTree(options);

  const originalRegistry = getCurrentRegistry();
  const targetRestoreRegistry = options.restoreRegistry
    ? resolveRegistryInput(options.restoreRegistry)
    : originalRegistry;

  logInfo(`当前 npm 镜像源: ${originalRegistry}`);

  let registrySwitched = false;
  let registryRestored = false;

  const restoreRegistryIfNeeded = () => {
    if (registryRestored) {
      return;
    }
    registryRestored = true;

    const current = getCurrentRegistry();
    if (
      targetRestoreRegistry &&
      normalizeRegistryUrl(current) !== normalizeRegistryUrl(targetRestoreRegistry)
    ) {
      logInfo(`正在恢复 npm 镜像源为: ${targetRestoreRegistry}`);
      try {
        setNpmRegistry(targetRestoreRegistry);
        const verified = getCurrentRegistry();
        logInfo(`已恢复 npm 镜像源（当前源: ${verified}）`);
      } catch (restoreError) {
        logError(
          `自动恢复 npm 镜像源失败，请手动执行: npm config set registry "${targetRestoreRegistry}"`,
        );
        console.error(restoreError);
      }
    } else if (registrySwitched) {
      logInfo(`npm 镜像源已处于目标状态: ${current}`);
    }
  };

  const handleSignal = (signal) => {
    logWarn(`收到中断信号 ${signal}，正在清理并恢复 npm 镜像源...`);
    restoreRegistryIfNeeded();
    process.exit(130);
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  let versionBumped = false;
  let targetVersion = oldVersion;

  try {
    if (normalizeRegistryUrl(originalRegistry) !== normalizeRegistryUrl(OFFICIAL_REGISTRY)) {
      logInfo(`临时切换 npm 镜像源至官方源: ${OFFICIAL_REGISTRY}`);
      setNpmRegistry(OFFICIAL_REGISTRY);
      registrySwitched = true;
      logInfo(`切换后 npm 镜像源: ${getCurrentRegistry()}`);
    } else {
      logInfo(`当前已是 npm 官方源（${OFFICIAL_REGISTRY}），无需切换。`);
    }

    verifyNpmAuth(options);

    logInfo("正在执行发布前构建与单元测试校验...");
    runInherit("pnpm run build");
    runInherit("pnpm run test");

    if (options.skipVersion) {
      logInfo(`已指定 --no-version，保持当前版本号 v${oldVersion}。`);
    } else if (options.dryRun) {
      targetVersion = previewNextVersion(oldVersion, options.releaseType);
      logInfo(`[dry-run] 预计升级版本号: v${oldVersion} -> v${targetVersion} (${options.releaseType})`);
    } else {
      logInfo(`正在升级版本号（${options.releaseType}）...`);
      runInherit(`npm version "${options.releaseType}"`);
      targetVersion = readPackageInfo().version;
      versionBumped = true;
      logSuccess(`版本号已更新: v${oldVersion} -> v${targetVersion}`);
    }

    if (options.dryRun) {
      logInfo("[dry-run] 正在通过 npm pack --dry-run 校验待发布文件清单...");
      runInherit("npm pack --dry-run");
      logSuccess(
        `[dry-run] 演练完成！若正式执行，${pkgName} 将从 v${oldVersion} 升级至 v${targetVersion} 并发布到 ${OFFICIAL_REGISTRY}`,
      );
    } else {
      const publishArgs = [`--registry "${OFFICIAL_REGISTRY}"`];
      if (options.distTag) {
        publishArgs.push(`--tag "${options.distTag}"`);
      }
      if (options.otp) {
        publishArgs.push(`--otp "${options.otp}"`);
      }

      const publishCommand = `npm publish ${publishArgs.join(" ")}`;
      logInfo(`正在执行发布命令: ${publishCommand}`);
      runInherit(publishCommand);

      logSuccess(`🎉 成功发布 ${pkgName}@${targetVersion} 到 ${OFFICIAL_REGISTRY}`);

      if (options.pushGit) {
        logInfo("正在推送 Git 提交与版本标签到远端仓库...");
        runInherit("git push");
        runInherit("git push --tags");
        logSuccess("Git 提交与标签推送完成。");
      } else if (versionBumped) {
        logInfo("提示：可执行 `git push && git push --tags` 将新版本提交与标签推送到远端仓库。");
      }
    }
  } catch (error) {
    if (versionBumped) {
      logWarn(
        `注意：本地版本号已升级至 v${targetVersion}，但后续步骤未完成。修复问题后可执行 \`node scripts/publish.mjs --no-version\` 重试发布，或执行 \`git tag -d v${targetVersion} && git reset --hard HEAD~1\` 回退版本提交。`,
      );
    }
    throw error;
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    restoreRegistryIfNeeded();
  }
}

try {
  main();
} catch (error) {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
