# fbrpc

Fastify + TypeScript 类型安全的 RPC 框架。协议驱动——定义一次 API 契约，客户端到服务端全程类型安全。

## 包

| 包 | 说明 |
|---------|-------------|
| `@birderrr/fbrpc-core` | 核心类型——`ApiDef`、`ApiCall`、`StreamCall`、`ServiceHandlers`。零依赖。 |
| `@birderrr/fbrpc-server` | Fastify 路由——扫描 `services/*/api.ts`，自动注册 `POST /api/:module/:method`。 |
| `@birderrr/fbrpc-client` | Proxy 调用器——`api.auth.login(req)` 完整类型推断。 |

## 安装

```bash
pnpm add @birderrr/fbrpc-core @birderrr/fbrpc-server @birderrr/fbrpc-client
```

## 快速开始

### 1. 定义协议（`api-user/` 包）

```ts
import type { ApiDef } from "@birderrr/fbrpc-core";

export interface AuthProtocol {
  login: ApiDef<{ username: string; password: string }, { accessToken: string }>;
}
```

### 2. 服务端——处理函数

```ts
// services/auth/api.ts
import type { ApiCall, ServiceHandlers } from "@birderrr/fbrpc-core";
import type { AuthProtocol } from "@your/api-user";

export const handlers = {
  async login(call: ApiCall<AuthProtocol["login"]>) {
    const { username, password } = call.req;
    // ... 验证身份 ...
    call.succ({ accessToken: "jwt..." });
  },
} satisfies ServiceHandlers<AuthProtocol>;
```

### 3. 服务端——注册路由

```ts
import Fastify from "fastify";
import { createRouter } from "@birderrr/fbrpc-server";

const app = Fastify();
const rpc = await createRouter({
  apiDir: "./src/services",
  auth: (req) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    return token ? { userId: decodeToken(token).userId } : null;
  },
  publicRoutes: ["auth.login", "auth.register"],
});
await app.register(rpc.register, { prefix: "/api" });
```

### 4. 客户端

```ts
import { createClient } from "@birderrr/fbrpc-client";
import type { AuthProtocol } from "@your/api-user";

const api = createClient<{ auth: AuthProtocol }>({
  baseUrl: "http://localhost:40101/api",
  getHeaders: () => ({ Authorization: `Bearer ${token}` }),
});

const result = await api.auth.login({ username: "birder", password: "xxx" });
// result.ok === true  →  result.data.accessToken  （完整类型）
```

## 路由

```
POST /api/:module/:method

services/auth/api.ts  →  handlers.login  →  POST /api/auth/login
services/agent/api.ts →  streams.chat    →  POST /api/agent/chat (SSE)
```

## 许可

MIT
