# fbrpc

Type-safe RPC monorepo，组织名 `@birderrr`，3 个包：`fbrpc-core`、`fbrpc-server`、`fbrpc-client`。

## 构建

```bash
pnpm build          # tsc 编译所有包（顺序：core → server → client）
```

输出：每个包下的 `dist/`（`.js` + `.d.ts` + `.d.ts.map` + `.js.map`）。

## 发布

同时发布到 **npmjs.org**（公开）和 **GitHub Packages**（`@birderrr` scope）。

### 前置条件

- npmjs.org：需要 Granular Access Token（`npm_` 开头），权限 Read and write + **Bypass 2FA**。在 https://www.npmjs.com/settings/birderr/tokens 生成。
- GitHub Packages：需要 `gh` CLI 已登录，token 含 `write:packages` scope。

### 发布命令（按顺序执行）

```bash
# 0. 确保依赖正确
pnpm install && pnpm build

# 1. 替换 workspace: 协议为实际版本（发布前必须）
cd packages/fbrpc-server && sed -i 's/"@birderrr\/fbrpc-core": "workspace:\*"/"@birderrr\/fbrpc-core": "^0.1.0"/' package.json
cd packages/fbrpc-client && sed -i 's/"@birderrr\/fbrpc-core": "workspace:\*"/"@birderrr\/fbrpc-core": "^0.1.0"/' package.json

# 2. 获取 tokens
export NPM_TOKEN=$(<用户提供的 npm token>)
export GH_TOKEN=$(gh auth token)

# 3. 发布到 npmjs
cd packages/fbrpc-core   && npm publish --access public --//registry.npmjs.org/:_authToken=$NPM_TOKEN
cd packages/fbrpc-server && npm publish --access public --//registry.npmjs.org/:_authToken=$NPM_TOKEN
cd packages/fbrpc-client && npm publish --access public --//registry.npmjs.org/:_authToken=$NPM_TOKEN

# 4. 发布到 GitHub Packages
cd packages/fbrpc-core   && npm publish --registry=https://npm.pkg.github.com --//npm.pkg.github.com/:_authToken=$GH_TOKEN
cd packages/fbrpc-server && npm publish --registry=https://npm.pkg.github.com --//npm.pkg.github.com/:_authToken=$GH_TOKEN
cd packages/fbrpc-client && npm publish --registry=https://npm.pkg.github.com --//npm.pkg.github.com/:_authToken=$GH_TOKEN

# 5. 恢复 workspace 协议
cd packages/fbrpc-server && sed -i 's/"@birderrr\/fbrpc-core": "\^0\.1\.0"/"@birderrr\/fbrpc-core": "workspace:*"/' package.json
cd packages/fbrpc-client && sed -i 's/"@birderrr\/fbrpc-core": "\^0\.1\.0"/"@birderrr\/fbrpc-core": "workspace:*"/' package.json

# 6. 提交并推送
git add -A && git commit -m "release: v0.1.x" && git tag v0.1.x
git push origin master --tags
```

### 发布顺序

`fbrpc-core`（无依赖）→ `fbrpc-server`（依赖 core）→ `fbrpc-client`（依赖 core）。

### 版本号

```bash
cd packages/fbrpc-core   && npm version patch --no-git-tag-version
cd packages/fbrpc-server && npm version patch --no-git-tag-version
cd packages/fbrpc-client && npm version patch --no-git-tag-version
```

## Remote

| 名称 | URL | 用途 |
|------|-----|------|
| `origin` | `git@github.com:birderrr/fbrpc.git` | 主仓库 |

## 备注

- `dist/` 已提交到 git，别人可以直接从 git 安装。
- 项目是 `"type": "module"`，输出全部 ESM。
- Fastify 是 `fbrpc-server` 的 **peer** 依赖，不打进包里。
- pnpm 的 `workspace:*` 协议在 `pnpm publish` 时**不会**自动替换版本号，需手动改。
