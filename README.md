# fbrpc

**定义一次协议，前后端全程类型安全。** 基于 Fastify 的轻量 RPC 框架——零模板代码，零手动注册。

```ts
// 协议只写一次
interface AuthProtocol {
  login: ApiDef<{ username: string; password: string }, { accessToken: string }>;
}

// 服务端：约定式目录，自动注册
export const handlers = {
  async login(call) { call.succ({ accessToken: "..." }); }
};

// 客户端：完整类型推断
const result = await api.auth.login({ username: "birder", password: "xxx" });
//    ^? { ok: true; data: { accessToken: string } } | { ok: false; error: { message, code } }
```

## 三个包

| 包 | 职责 | 依赖 |
|---|------|------|
| `@fbrpc/fbrpc-core` | 协议类型（`ApiDef` `ApiCall` `StreamCall` `RpcError`） | 零 |
| `@fbrpc/fbrpc-server` | 扫描 `services/*/api.ts`，注册 Fastify 路由 | core |
| `@fbrpc/fbrpc-client` | Proxy 客户端，`api.auth.login(req)` 类型直达 | core |

## 安装

```bash
pnpm add @fbrpc/fbrpc-core @fbrpc/fbrpc-server @fbrpc/fbrpc-client
```

## 用法

### 定义协议

```ts
import type { ApiDef } from "@fbrpc/fbrpc-core";

export interface AuthProtocol {
  login:    ApiDef<{ username: string; password: string }, { accessToken: string }>;
  register: ApiDef<{ username: string; password: string }, { userId: string }>;
}
```

### 服务端

```ts
// services/auth/api.ts
import type { ApiCall } from "@fbrpc/fbrpc-core";
import type { AuthProtocol } from "./protocols/auth.js";

export const handlers = {
  async login(call: ApiCall<AuthProtocol["login"]>) {
    const { username, password } = call.req;
    // ... 验证 ...
    call.succ({ accessToken: "jwt..." });  // call.error("密码错误") 表示失败
  },
};
```

```ts
// server.ts — 一行注册
import { createRouter } from "@fbrpc/fbrpc-server";

const rpc = await createRouter({
  apiDir: "./src/services",
  auth: (req) => token ? { userId: decode(token).uid } : null,
});

await app.register(rpc.register, { prefix: "/api" });
// → POST /api/auth/login → services/auth/api.ts → handlers.login
```

### 客户端

```ts
import { createClient } from "@fbrpc/fbrpc-client";
import type { AuthProtocol } from "./protocols/auth.js";

const api = createClient<{ auth: AuthProtocol }>({
  baseUrl: "http://localhost:3008/api",
  getHeaders: () => ({ Authorization: `Bearer ${getToken()}` }),
});

const result = await api.auth.login({ username: "birder", password: "xxx" });

if (result.ok) console.log(result.data.accessToken);  // 完整类型
else console.error(result.error.code, result.error.message);
```

### SSE 流式

```ts
// 服务端
export const streams = {
  async chat(call) {
    call.stream(async (send) => {
      for await (const chunk of llmStream) send(chunk);
    });
  },
};

// 客户端
import { streamRequest } from "@fbrpc/fbrpc-client";
for await (const chunk of streamRequest("http://localhost:3008/api/agent/chat", { prompt })) {
  console.log(chunk);
}
```

### 响应格式

所有请求统一返回 `{ ok: true, data } | { ok: false, error: { message, code } }`。

| handler 行为 | 客户端收到 |
|-------------|-----------|
| `call.succ(data)` | `{ ok: true, data }` |
| `call.error("原因")` | `{ ok: false, error: { code: "API_ERROR" } }` |
| `throw new Error(...)` | `{ ok: false, error: { code: "INTERNAL" } }` |

## Skills

Claude Code 框架使用指南，一行安装到项目：

```bash
mkdir -p .claude/skills/fbrpc-manual
curl -o .claude/skills/fbrpc-manual/SKILL.md \
  https://raw.githubusercontent.com/fbrpc/fbrpc/master/skills/fbrpc-manual/SKILL.md
```

## 许可

MIT
