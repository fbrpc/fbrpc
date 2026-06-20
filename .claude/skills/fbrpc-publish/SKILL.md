---
name: fbrpc-publish
description: 发布 fbrpc 三个包到 npmjs.org 和 GitHub Packages。自动处理 workspace 替换、构建、发布、恢复、提交。
version: 1.0.0
allowed-tools: Read, Write, Edit, Glob, Bash(git:*, gh:*, npm:*, pnpm:*, sed:*)
argument-hint: "[patch|minor|major]"
---

# fbrpc-publish

同时发布 `@birderrr/fbrpc-{core,server,client}` 到 **npmjs.org**（公开）和 **GitHub Packages**。

## 使用方式

```
/fbrpc-publish          # 不升版本号
/fbrpc-publish patch    # 升 patch 版本后发布
```

## 执行步骤

### 1. 获取 npm token

询问用户提供 npm Granular Access Token（`npm_` 开头）。该 token 需具备：
- Read and write 权限
- Bypass two-factor authentication (2FA)

### 2. 提升版本号（如果用户指定了 patch/minor/major）

```bash
cd packages/fbrpc-core   && npm version <bump> --no-git-tag-version
cd packages/fbrpc-server && npm version <bump> --no-git-tag-version
cd packages/fbrpc-client && npm version <bump> --no-git-tag-version
```

### 3. 构建

```bash
pnpm install && pnpm build
```

### 4. 替换 workspace 协议为实际版本

```bash
cd packages/fbrpc-server && sed -i 's/"@birderrr\/fbrpc-core": "workspace:\*"/"@birderrr\/fbrpc-core": "^<version>"/' package.json
cd packages/fbrpc-client && sed -i 's/"@birderrr\/fbrpc-core": "workspace:\*"/"@birderrr\/fbrpc-core": "^<version>"/' package.json
```

`<version>` 从 `packages/fbrpc-core/package.json` 读取。

### 5. 发布到 npmjs.org

```bash
export NPM_TOKEN=<用户提供的 token>
cd packages/fbrpc-core   && npm publish --access public --//registry.npmjs.org/:_authToken=$NPM_TOKEN
cd packages/fbrpc-server && npm publish --access public --//registry.npmjs.org/:_authToken=$NPM_TOKEN
cd packages/fbrpc-client && npm publish --access public --//registry.npmjs.org/:_authToken=$NPM_TOKEN
```

### 6. 发布到 GitHub Packages

```bash
export GH_TOKEN=$(gh auth token)
cd packages/fbrpc-core   && npm publish --registry=https://npm.pkg.github.com --//npm.pkg.github.com/:_authToken=$GH_TOKEN
cd packages/fbrpc-server && npm publish --registry=https://npm.pkg.github.com --//npm.pkg.github.com/:_authToken=$GH_TOKEN
cd packages/fbrpc-client && npm publish --registry=https://npm.pkg.github.com --//npm.pkg.github.com/:_authToken=$GH_TOKEN
```

如果 GitHub Packages 发布失败（如 token 权限不足），单独指出哪个包失败即可，npmjs 的发布不撤销。

### 7. 恢复 workspace 协议

```bash
cd packages/fbrpc-server && sed -i 's/"@birderrr\/fbrpc-core": "\^<version>"/"@birderrr\/fbrpc-core": "workspace:*"/' package.json
cd packages/fbrpc-client && sed -i 's/"@birderrr\/fbrpc-core": "\^<version>"/"@birderrr\/fbrpc-core": "workspace:*"/' package.json
```

### 8. 提交并推送

```bash
git add -A
git commit -m "release: v<version>"
git tag v<version>
git push origin master --tags
git push github-pkg master --tags
```

### 9. 输出汇总

以表格形式列出所有包在两个 registry 的发布状态。

## 注意事项

- 发布顺序不能乱：core → server + client
- 如果 npmjs 某个包发布失败，后续包不继续发
- GitHub Packages 失败不阻塞 npmjs 发布
- `pnpm publish` 不会自动转换 `workspace:*`，必须手动替换
- 发布完成后提醒用户删除 npm token（安全建议）
