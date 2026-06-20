# fbrpc

**定义一次协议，前后端全程类型安全。** 基于 Fastify 的 RPC 框架——零模板代码，约定式路由。

```ts
const result = await api.auth.login({ username: "birder", password: "xxx" });
//    ^? { ok: true; data: { accessToken: string } } | { ok: false; error: { message, code } }
```

## 包

| 包 | 职责 |
|---|------|
| `@fbrpc/fbrpc-core` | 协议类型（`ApiDef` `ApiCall` `StreamCall`）——零依赖 |
| `@fbrpc/fbrpc-server` | 扫描 `services/*/api.ts`，一行注册 Fastify 路由 |
| `@fbrpc/fbrpc-client` | Proxy 调用器，类型直达每个参数和返回值 |

## 安装

```bash
pnpm add @fbrpc/fbrpc-core @fbrpc/fbrpc-server @fbrpc/fbrpc-client
```

## 文档

完整使用指南通过 Claude Code skill 分发：

```bash
mkdir -p .claude/skills/fbrpc-manual
curl -o .claude/skills/fbrpc-manual/SKILL.md \
  https://raw.githubusercontent.com/fbrpc/fbrpc/master/skills/fbrpc-manual/SKILL.md
```

Claude Code 中自动触发，覆盖协议编写、api.ts 实现、鉴权、SSE 流式、校验、错误处理。

## 许可

MIT
