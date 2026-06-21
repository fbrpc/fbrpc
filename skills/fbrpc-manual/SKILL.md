---
name: fbrpc-manual
description: fbrpc RPC 框架使用指南。新建/修改 API、编写协议、注册服务时使用。
version: 0.1.7.0
allowed-tools: Read, Write, Edit, Glob, Bash(git:*)
argument-hint: ""
---

# fbrpc — 框架参考

## 核心理念

协议驱动 — 定义一次 `ApiDef`，handler 和 client 全链路类型安全。AI 看两个文件就知道全部契约：**协议文件**（入参/出参）+ **api.ts**（实现）。无 router、无 context、无 adapter。

## 项目结构

三层：共享协议包 → 服务端 → 客户端。

```
packages/api-xxx/          # 协议层 — 零框架依赖
  src/protocols/auth.ts    # 每个模块一个文件
  src/index.ts             # re-export 全部 Protocol
apps/server-xxx/           # 服务端 — Fastify + createRouter
  src/services/auth/
    api.ts                 # 唯一公开入口
    _internal_index.ts     # re-export 内部函数
    _internal/             # 纯实现目录
      login.ts
      errors.ts
  src/server.ts
apps/client-xxx/           # 客户端 — Proxy 调用器
  src/client.ts
```

三条硬规则：
- `api.ts` 只 import `./_internal_index.js`——模块唯一入口
- `_internal/` 子文件之间走 `_internal_index.ts`——模块内自消费也面向契约
- 跨模块只 import `../<module>/_internal_index.js`——永不穿透到 `_internal/` 子文件

## 1. 协议定义

每个方法独立 Req/Res 接口，模块协议汇总为一个 type。建议用 `type`（interface 也兼容，无强制）。

```ts
// packages/api-xxx/src/protocols/auth.ts
import type { ApiDef } from "@fbrpc/fbrpc-core";

export interface LoginReq { username: string; password: string; }
export interface LoginRes { accessToken: string; refreshToken: string; }

export interface RegisterReq { username: string; password: string; email: string; }
export interface RegisterRes { userId: string; }

export type AuthProtocol = {
  login:    ApiDef<LoginReq, LoginRes>;
  register: ApiDef<RegisterReq, RegisterRes>;
  logout:   ApiDef<void, void>;
};
```

```ts
// packages/api-xxx/src/index.ts
export type { AuthProtocol } from "./protocols/auth.js";
export type { UsersProtocol } from "./protocols/users.js";
```

## 2. 服务实现

### api.ts — 模块入口

只做翻译：`call.req` → 委托 `_internal` → 结果转 `call.succ` / `call.error`。不放校验、不放业务逻辑。

```ts
import type { ApiCall, ServiceHandlers, ServiceStreamHandlers, StreamCall } from "@fbrpc/fbrpc-core";
import type { AuthProtocol } from "<共享包>";
import * as svc from "./_internal_index.js";

// handlers — Pick 选出普通 RPC 方法，satisfies 强制全覆盖
type ApiMethods = Pick<AuthProtocol, "login" | "register" | "logout">;

export const handlers = {
  async login(call: ApiCall<AuthProtocol["login"]>) {
    const r = await svc.login(call.req);
    if (r.err) return call.error(r.err.message, r.err.code);
    call.succ({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  },

  async deleteUser(call: ApiCall<AuthProtocol["deleteUser"]>) {
    if (call.meta.role !== "admin") return call.error("无权限", "FORBIDDEN");
    await svc.deleteUser(call.req.userId);
    call.succ(undefined);
  },
} satisfies ServiceHandlers<ApiMethods>;

// streams — 流式方法同模式
type StreamMethods = Pick<AuthProtocol, "chat">;

export const streams = {
  chat(call: StreamCall<AuthProtocol["chat"]>) {
    call.stream(async (send) => {
      for await (const chunk of svc.chat(call.req)) await send(chunk);
    });
  },
} satisfies ServiceStreamHandlers<StreamMethods>;
```

### _internal_index.ts

只放 re-export，零逻辑。

```ts
// services/auth/_internal_index.ts
export { login } from "./_internal/login.js";
export { register } from "./_internal/register.js";
export { validateToken } from "./_internal/token.js";
export { hashPassword, comparePasswords } from "./_internal/password.js";
// 不导出 getUserById——仅本模块内部共用
```

### _internal/ — 纯实现

纯业务函数，签名用 POJO。不 import core 类型、不调 `call.*`、不读 `call.meta`。需要 meta 值时由 api.ts 取出当参数传入。

**命名**：被一个 handler 独占 → 文件名 = 方法名（`login.ts`）；被多个 handler 共用 → 文件名 = 概念名（`token.ts`）。禁用 `impl.ts`、`utils.ts`。

```ts
// services/auth/_internal/login.ts
import { comparePasswords, signTokens } from "../_internal_index.js";
import type { ServiceError } from "../_internal_index.js";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  err?: ServiceError;
}

export async function login(req: { username: string; password: string }): Promise<LoginResult> {
  if (!req.username) return { err: { message: "用户名不能为空", code: "VALIDATION" }, accessToken: "", refreshToken: "" };

  const user = await db.user.findUnique({ where: { username: req.username } });
  if (!user || !(await comparePasswords(req.password, user.passwordHash))) {
    return { err: { message: "用户名或密码错误", code: "AUTH_FAILED" }, accessToken: "", refreshToken: "" };
  }

  return signTokens(user.id);
}
```

```ts
// services/auth/_internal/errors.ts
export interface ServiceError { message: string; code: string; }

export const Err = {
  unauthorized: (msg = "未登录") => ({ message: msg, code: "UNAUTHORIZED" as const }),
  forbidden:    (msg = "无权限") => ({ message: msg, code: "FORBIDDEN" as const }),
  notFound:     (msg = "不存在") => ({ message: msg, code: "NOT_FOUND" as const }),
  validation:   (msg: string)    => ({ message: msg, code: "VALIDATION" as const }),
};
```

### ORM 类型适配

`call.succ()` 类型严格匹配协议的 Res。Prisma 返回的 `Date`、`Decimal` 等与 JSON 类型不兼容。**推荐在 `_internal` 中转换**，收敛在业务层：

```ts
// _internal 返回已转换的类型
export async function getUser(id: string): Promise<{ id: string; name: string; createdAt: string } | null> {
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return null;
  return { id: u.id, name: u.name, createdAt: u.createdAt.toISOString() };
}

// api.ts 直接透传，无需 as any
async getUser(call: ApiCall<UsersProtocol["getUser"]>) {
  const u = await svc.getUser(call.req.id);
  if (!u) return call.error("用户不存在", "NOT_FOUND");
  call.succ(u);
}
```

### call 对象速查

| 成员 | 说明 |
|------|------|
| `call.req` | 请求参数，类型来自协议 |
| `call.meta` | 鉴权注入的元数据（只读） |
| `call.succ(data)` | 成功响应；不 return |
| `call.error(msg, code?)` | 业务错误；默认 code=`"API_ERROR"` |
| `call.stream(fn)` | **[StreamCall]** 启动 SSE 流 |

硬规则：不 return 值（框架忽略）、不抛异常（转 `INTERNAL` 丢失语义）。流式 handler 必须调 `call.stream()` 或 `call.error()`。

## 3. 服务端

```ts
import Fastify from "fastify";
import { createRouter } from "@fbrpc/fbrpc-server";

const app = Fastify({ logger: true });

const rpc = await createRouter({
  apiDir: "./src/services",
  cors: true,                         // true→*; { origin:"https://..." }→指定来源
  timeout: 30_000,                    // 请求超时 ms，默认无限制
  auth: async (req) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return null;              // null → 401
    const payload = await verifyJwt(token);
    return { userId: payload.sub, role: payload.role };  // 注入 call.meta
  },
  publicRoutes: [
    "auth.login",      // 精确匹配 "模块.方法"
    "auth.register",
    "health.*",        // 模块级通配 "模块.*"
  ],
});

await app.register(rpc.register, { prefix: "/api" });
await app.listen({ port: 3008 });
```

`GET /api/health` 自动注册，返回 `{ ok: true, data: { status: "ok", modules: [...] } }`。

### middleware/

HTTP 横切工具（如 JWT 验证）放在 `middleware/` 目录，不放业务逻辑。

```ts
// server/middleware/token.ts
import jwt from "jsonwebtoken";

export function verifyJwt(token: string): { sub: string; role: string } | null {
  try { return jwt.verify(token, SECRET) as any; }
  catch { return null; }
}
```

## 4. 客户端

```ts
import { createClient } from "@fbrpc/fbrpc-client";
import { unwrap } from "@fbrpc/fbrpc-core";
import type { AuthProtocol, UsersProtocol } from "<共享包>";

const api = createClient<
  { auth: AuthProtocol; users: UsersProtocol },    // 所有模块
  { auth: readonly ["chat"] }                       // 流式方法声明
>({
  baseUrl: "http://localhost:3008/api",
  streams: { auth: ["chat"] },
  getHeaders: () => token ? { Authorization: `Bearer ${token}` } : {},
});

// 普通 RPC → Promise<ApiResponse>
const r = await api.auth.login({ username: "admin", password: "123456" });

// unwrap 解包 — 成功返回 data，失败自动 throw RpcError（适合"不成功不往下走"）
const user = unwrap(await api.auth.login(req));
console.log(user.accessToken);

// 手动判别 — 保留联合类型 narrow，适合按错误码分流
if (!r.ok) {
  if (r.error.code === "AUTH_FAILED") return console.log("密码错误");
  return console.error(r.error.message);
}
console.log(r.data.accessToken);  // TS 识别 r.data 非空

// SSE 流式 → AsyncGenerator
for await (const chunk of api.auth.chat({ messages: [...] })) {
  console.log(chunk);
}
```

### unwrap vs 手动判别

| 方式 | 适用场景 |
|------|---------|
| `unwrap(r)` | 失败即抛，上层 try-catch 或直接让框架处理 |
| `if (!r.ok)` | 需要按错误码分流、或要忽略某个错误继续执行 |

## 5. SSE 流式

### 服务端

```ts
export const streams = {
  chat(call: StreamCall<AgentProtocol["chat"]>) {
    call.stream(async (send) => {
      const stream = openai.chat.completions.create({ stream: true, ...call.req });
      for await (const chunk of stream) {
        await send(chunk.choices[0]?.delta?.content ?? "");
      }
      // 函数 return → 框架自动发 "event: done"、end 连接
    });
  },
} satisfies ServiceStreamHandlers<Pick<AgentProtocol, "chat">>;
```

### 流式错误处理

```ts
// 启流前校验失败 → 直接 call.error，不启流
if (!call.req.fileId) return call.error("缺少 fileId", "VALIDATION");

// 流中途出错 → throw，框架发 "event: error" 后 end
call.stream(async (send) => {
  const file = await loadFile(call.req.fileId);
  if (!file) throw new RpcError("文件不存在", "NOT_FOUND");
  for (const chunk of file) await send(chunk);
});
```

### 客户端消费

```ts
// 普通迭代
for await (const chunk of api.agent.chat({ ... })) { ... }

// 带超时断开
const controller = new AbortController();
setTimeout(() => controller.abort(), 30_000);
```

## 6. 错误处理全景

```
call.error(msg)              → HTTP 200  { ok: false, error: { code: "API_ERROR", message: msg } }
call.error(msg, "POINTS")    → HTTP 200  { ok: false, error: { code: "POINTS",   message: msg } }
throw new Error(msg)         → HTTP 500  { ok: false, error: { code: "INTERNAL",  message: msg } }
throw new RpcError(msg, "X") → HTTP 500  { ok: false, error: { code: "X",        message: msg } }
handler 既不 succ 也不 error  → HTTP 500  { ok: false, error: { code: "UNSETTLED" } }
鉴权返回 null                 → HTTP 401  { ok: false, error: { code: "UNAUTHORIZED" } }
网络/连接错误(client)          →            { ok: false, error: { code: "NETWORK_ERROR" } }
流式: call.error(msg, code)   → SSE event:error 后 end
流式: throw                   → SSE event:error 后 end
流式: 函数正常 return          → SSE event:done  后 end
```

原则：可预期的用户错误用 `call.error`（200），系统级意外用 `throw RpcError`（500）。不要 `throw new Error`（丢失 code 变为 INTERNAL）。

## 7. 新增模块清单

1. `protocols/<name>.ts` — Req/Res 接口 + Protocol type
2. 共享包 `index.ts` — `export type { XxxProtocol }`
3. `services/<name>/_internal/<方法名>.ts` — 纯业务逻辑，文件名自解释
4. `services/<name>/_internal/errors.ts` — `ServiceError` + `Err` 工厂
5. `services/<name>/_internal_index.ts` — re-export 内部函数
6. `services/<name>/api.ts` — handlers + streams，`satisfies ServiceHandlers/ServiceStreamHandlers`
7. 客户端 — `createClient` 泛参加新模块类型 + 流式声明
8. 无需手动注册路由 — `createRouter` 自扫描

## 8. 反模式

| ❌ | ✅ |
|----|----|
| `return call.succ(data)` | `call.succ(data)` — 不 return |
| `throw new Error("用户不存在")` | `call.error("用户不存在")` — 可预期的用 call |
| 业务逻辑写在 api.ts | 委托 `_internal/<方法名>.ts` |
| 外部 import `_internal/` 子文件 | 只通过 `_internal_index.ts` |
| `Record<string, AnyApiHandler>` | `satisfies ServiceHandlers<Protocol>` |
| `call.meta.userId = x` | `call.meta` 只读 |
| 流式 handler 忘调 `call.stream()` / `call.error()` | 必须调其一 |
| `call.succ()` 传 ORM 原生类型 | `_internal` 层提前转换为 JSON 兼容类型 |
