# README.md

## 在项目控制台输出banner

## npm 发布

- 需要临时设置为npm默认源

```bash
// 查看npm镜像源地址
npm config get registry
// 切换npm镜像源 设置npm默认源
npm config set registry https://registry.npmjs.org/
```

## 登录

```bash
npm login
```

## 运行发布命令

```bash
npm publish
```

## 更新 npm 包版本，并重新发布

```bash
# 自动更改版本号并且commit
# npm version xxx

# 控制台会返回下一个小版本号 如v1.0.1
npm version patch

# 重新发布
npm publish
```

### npm 版本号

```bash
# patch：补丁号，修复bug，小变动，如 v1.0.0->v1.0.1
npm version patch

# minor：次版本号，增加新功能，如 v1.0.0->v1.1.0
npm version minor

# major：主版本号，不兼容的修改，如 v1.0.0->v2.0.0
npm version major
```

---

---
---
