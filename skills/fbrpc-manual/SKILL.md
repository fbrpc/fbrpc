---
name: fbrpc-manual
description: fbrpc RPC 框架使用指南。新建/修改 API、编写协议、注册服务时使用。
version: 0.1.5.0
allowed-tools: Read, Write, Edit, Glob, Bash(git:*)
argument-hint: ""
---

# fbrpc — 框架参考

## 核心理念

AI 维护时只读 2 个文件：**协议文件**（入参出参）+ **api.ts**（实现）。无 router、无 context、无 adapter。

## 推荐技术栈

**服务端 Fastify + 前端 Vite。** fbrpc 以此为基准设计：
- server：`Fastify` + `createRouter()`，一行注册，零配置
- 共享包：纯 TS 类型，Vite 可直接 import，无需额外构建
- client：`createClient()` 跑在浏览器或 Node，Vite HMR 下实时联动

新建项目时直接沿用这个组合，不要引入 Express、Webpack 等替代品——它们绕开了框架约定。

## 三层架构

以一个用户系统为例，典型项目结构：

**packages/api-user** — 协议层，前后端共享

- `src/protocols/auth.ts` — 纯 TS 接口：LoginReq/LoginRes、AuthProtocol 映射
- `src/protocols/users.ts`
- `src/index.ts` — `export type { AuthProtocol, UsersProtocol }`

**apps/server-user** — 服务端

- `src/services/auth/api.ts` — HTTP 入口，只 import `./_internal_index.js`
- `src/services/auth/_internal_index.ts` — 内部 API 入口，re-export `_internal/` 的子文件
- `src/services/auth/_internal/login.ts` — 纯业务函数，不触碰 ApiCall
- `src/server.ts` — `createRouter({ apiDir, auth })` 一行注册
- `middleware/token.ts` — JWT 验证等 HTTP 横切工具

**apps/client-user** — 客户端

- `src/client.ts` — `createClient<{ auth, users }>({ baseUrl })`

规则：
- 协议层 **零框架依赖**，只 import `ApiDef`
- api.ts 是模块**唯一公开入口**，外部绝不 import `_internal/`
- `_internal/` 内任意拆分，函数签名用 POJO，不碰 `call.*`
- middleware 只放鉴权相关工具，不放业务逻辑

## 协议文件

```ts
import type { ApiDef } from "@fbrpc/fbrpc-core";

// 每个方法独立 Req/Res 接口
export interface LoginReq { username: string; password: string; }
export interface LoginRes { accessToken: string; refreshToken: string; }

export interface RegisterReq { username: string; password: string; email: string; }
export interface RegisterRes { userId: string; }

// 模块协议映射——用 type，不用 interface（interface 缺少索引签名，客户端泛型不兼容）
export type AuthProtocol = {
  login:    ApiDef<LoginReq, LoginRes>;
  register: ApiDef<RegisterReq, RegisterRes>;
  logout:   ApiDef<LogoutReq, void>;
};
```

共享包 `index.ts` 集中导出：
```ts
export type { AuthProtocol } from "./protocols/auth.js";
export type { UsersProtocol } from "./protocols/users.js";
```

## api.ts

api.ts 只做**翻译**：call.req 传入 → 委托 _internal → 把结果转成 call.succ / call.error。不放校验、不放业务逻辑。

### 基本结构

```ts
import type { ApiCall, ServiceHandlers, ServiceStreamHandlers, StreamCall } from "@fbrpc/fbrpc-core";
import type { AuthProtocol } from "<共享包>";
import * as svc from "./_internal_index.js";

type ApiMethods = Pick<AuthProtocol, "login" | "register" | "logout">;

export const handlers = {
  async login(call: ApiCall<AuthProtocol["login"]>) {
    const r = await svc.login(call.req);
    if (r.err) return call.error(r.err.message, r.err.code);
    call.succ({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  },
} satisfies ServiceHandlers<ApiMethods>;

type StreamMethods = Pick<AuthProtocol, "chatStream">;

export const streams = {
  chatStream(call: StreamCall<AuthProtocol["chatStream"]>) {
    call.stream(async (send) => {
      // ...
    });
  },
} satisfies ServiceStreamHandlers<StreamMethods>;
```

### _internal_index.ts + _internal/ — 模块内部结构

`api.ts` 和 `_internal_index.ts` 并列，`_internal/` 下沉为纯实现目录：

```
services/auth/
  api.ts                   ← HTTP 入口，只 import ./_internal_index.js
  _internal_index.ts       ← 内部 API 入口，re-export _internal/ 子文件
  _internal/               ← 纯实现，外部永远不碰
    login.ts               ← 登录流程
    register.ts            ← 注册流程
    password.ts            ← bcrypt 哈希/验证
    token.ts               ← JWT 签发/解码
    errors.ts              ← ServiceError 类型
```

两条硬规则：
- `api.ts` 只 import `./_internal_index.js`——没有别的 import
- 跨模块只 import `../<module>/_internal_index.js`——永不穿透到 `_internal/` 子文件

命名原则：**AI 看文件名就知道里面有什么，不用打开**。禁用 `impl.ts`、`utils.ts` 等万能名字。

### _internal_index.ts

只放 re-export，零逻辑。每个方法所属的内文件一行。

```ts
// services/auth/_internal_index.ts
export { login } from "./_internal/login.js";
export { register } from "./_internal/register.js";
export { validateToken } from "./_internal/token.js";
// getUserById 不导出 — 只给本模块 login.ts 用
```

### _internal/ 子文件

纯业务函数，不接触 ApiCall。按方法分还是按概念分，看复用度：

- 只被一个 handler 用的 → 文件名 = 方法名（`login.ts`）
- 被多个 handler 或中间件共用的 → 文件名 = 概念名（`password.ts`、`token.ts`）

`login.ts` 示例：

```ts
// services/auth/_internal/login.ts
import { comparePasswords } from "./password.js";
import { signTokens } from "./token.js";
import type { ServiceError } from "./errors.js";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  err?: ServiceError;
}

export async function login(req: { username: string; password: string }): Promise<LoginResult> {
  if (!req.username) return { err: { message: "用户名不能为空", code: "VALIDATION" }, accessToken: "", refreshToken: "" };
  if (!req.password || req.password.length < 6) return { err: { message: "密码至少6位", code: "VALIDATION" }, accessToken: "", refreshToken: "" };

  const user = await db.user.findUnique({ where: { username: req.username } });
  if (!user || !(await comparePasswords(req.password, user.passwordHash))) {
    return { err: { message: "用户名或密码错误", code: "AUTH_FAILED" }, accessToken: "", refreshToken: "" };
  }

  return signTokens(user.id);
}
```

`errors.ts` 示例：

```ts
// services/auth/_internal/errors.ts
export interface ServiceError { message: string; code: string; }

export const Err = {
  unauthorized: (msg = "未登录") => ({ message: msg, code: "UNAUTHORIZED" as const }),
  forbidden:    (msg = "无权限") => ({ message: msg, code: "FORBIDDEN" as const }),
  notFound:     (msg = "不存在") => ({ message: msg, code: "NOT_FOUND" as const }),
  validation:   (msg: string)    => ({ message: msg, code: "VALIDATION" as const }),
};

api.ts 调用：

```ts
import type { ApiCall, ServiceHandlers } from "@fbrpc/fbrpc-core";
import type { AuthProtocol } from "<共享包>";
import * as svc from "./_internal_index.js";
import { Err } from "./_internal/errors.js";

export const handlers = {
  async login(call: ApiCall<AuthProtocol["login"]>) {
    const r = await svc.login(call.req);
    if (r.err) return call.error(r.err.message, r.err.code);
    call.succ({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  },

  async deleteUser(call: ApiCall<AuthProtocol["deleteUser"]>) {
    if (call.meta.role !== "admin") return call.error(Err.forbidden().message, Err.forbidden().code);
    // ...
  },
} satisfies ServiceHandlers<AuthProtocol>;
```

**原则：** `_internal/` 函数不 import core 类型、不调 `call.*`、不读 `call.meta`。需要 meta 时由 api.ts 取出当参数传入。

### 类型要点

- handlers 用 **`satisfies ServiceHandlers<Pick<Protocol, ...>>`**；streams 用 **`satisfies ServiceStreamHandlers<Pick<Protocol, ...>>`**
- 协议用 **`type` 不要 `interface`**——interface 缺少索引签名，客户端泛型不兼容
- 每个 handler 的 call 标注 `ApiCall<Protocol["method"]>` — `satisfies` 自动窄化
- 不用 `Record<string, AnyApiHandler>` / `Record<string, AnyStreamHandler>` — 丢了 key 约束

### call 对象规则

| 规则 | 原因 |
|------|------|
| 不 return 值 | 框架忽略 return，必须调 `call.succ()` / `call.error()` |
| 不抛异常 | 抛了转 `{ code: "INTERNAL" }`，丢失业务语义 |
| 用 `call.error(msg, code)` | 业务错误用自定义 code（如 `"POINTS_INSUFFICIENT"`） |
| `call.meta` 只读 | 由鉴权函数注入，handler 不应修改 |

## SSE 流式

### 服务端

```ts
import type { ServiceStreamHandlers, StreamCall } from "@fbrpc/fbrpc-core";

type StreamMethods = Pick<AgentProtocol, "chat">;

export const streams = {
  chat(call: StreamCall<AgentProtocol["chat"]>) {
    call.stream(async (send) => {
      // send(chunk) → 自动转为 SSE data 帧
      const llm = openai.chat.completions.create({ stream: true, ... });
      for await (const chunk of llm) {
        send(chunk.choices[0]?.delta?.content ?? "");
      }
      // stream 结束时框架自动发送 done 事件
    });
  },
} satisfies ServiceStreamHandlers<StreamMethods>;
```

### 客户端

```ts
import { createClient } from "@fbrpc/fbrpc-client";
import { unwrap } from "@fbrpc/fbrpc-core";
import type { EchoProtocol } from "<共享包>";

const api = createClient<
  { echo: EchoProtocol },
  { echo: readonly ["streamEcho"] }
>({
  baseUrl: "http://localhost:3008/api",
  streams: { echo: ["streamEcho"] },
});

// 普通调用 — unwrap() 失败自动 throw
const data = unwrap(await api.echo.echo({ message: "hi" }));
console.log(data);

// 流式调用
for await (const chunk of api.echo.streamEcho({ count: 3 })) {
  console.log(chunk);
}
```

### SSE 错误处理

```ts
// 参数校验失败——直接 call.error 不启流
if (!call.req.fileId) return call.error("缺少 fileId");

// 流中途出错——throw，框架发 error 事件后 end
call.stream(async (send) => {
  const file = await loadFile(call.req.fileId);
  if (!file) throw new Error("文件不存在");
});
```

## 鉴权与中间件

### 服务端配置

```ts
const rpc = await createRouter({
  apiDir: "./src/services",
  cors: true,                  // 或 { origin: "https://example.com" }
  timeout: 30_000,             // 请求超时（毫秒）
  auth: async (req) => {                            // 支持 async（查库、调 auth 服务）
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return null;                           // null → 401
    const payload = await verifyJwtAsync(token);
    return { userId: payload.sub, role: payload.role }; // 注入 call.meta
  },
  publicRoutes: [
    "auth.login",     // 精确匹配
    "auth.register",
    "health.*",       // health 模块全部公开
  ],
});
// 自动注册 GET /health → { modules: [{ module, handlers, streams }] }
```

### handler 中使用 meta

```ts
async deleteUser(call: C<"deleteUser">) {
  const { userId, role } = call.meta;  // 鉴权注入
  if (role !== "admin") return call.error("无权限", "FORBIDDEN");

  await svc.deleteUser(call.req.targetUserId);
  call.succ(undefined);
}
```

### middleware/ 示例

```ts
// server/middleware/token.ts
import jwt from "jsonwebtoken";

export function verifyJwt(token: string): { sub: string; role: string } | null {
  try { return jwt.verify(token, SECRET) as any; }
  catch { return null; }
}
```

## 错误处理

```
call.error(msg)              → { ok: false, error: { code: "API_ERROR", message: msg } }
call.error(msg, "POINTS")    → { ok: false, error: { code: "POINTS", message: msg } }
throw new Error(msg)         → { ok: false, error: { code: "INTERNAL", message: msg } }
throw new RpcError(msg, "X") → { ok: false, error: { code: "X", message: msg } }
handler 什么都不调          → { ok: false, error: { code: "UNSETTLED" } }
```

**原则：** 可预期的用户错误用 `call.error`，系统级意外用 `throw RpcError`。不要 `throw new Error`（会被吞掉业务语义）。

## 反模式

| ❌ | ✅ |
|----|----|
| `return call.succ(data)` | `call.succ(data)` — 不 return |
| `throw new Error("用户不存在")` | `call.error("用户不存在")` — 可预期的给 call |
| 把业务逻辑写在 api.ts 里 | 委托到 `_internal/<方法名>.ts` |
| 从外部 import `_internal/` | 只通过 api.ts 调用 |
| 用 `Record<string, AnyApiHandler>` | 用 `satisfies ServiceHandlers<Protocol>` — 编译期全覆盖检查 |
| `call.meta.userId = x` | `call.meta` 只读 |
| 流式 handler 忘记调 `call.stream()` 或 `call.error()` | 必须调其一 |

## 新增模块清单

1. `protocols/<name>.ts` — Req/Res 接口 + Protocol 映射
2. 共享包 `index.ts` — `export type { XxxProtocol }`
3. `services/<name>/_internal/<方法名>.ts` — 纯业务逻辑，文件名自解释
4. `services/<name>/_internal_index.ts` — re-export 内部函数（给 api.ts 和跨模块）
5. `services/<name>/api.ts` — `export const handlers = { ... } satisfies ServiceHandlers<Protocol>`
6. 无需手动注册路由 — `createRouter` 自扫描
7. 客户端 `createClient<T, S>()` — 加模块类型 + 流式方法声明

## 响应格式

```
{ ok: true, data: <Res> } | { ok: false, error: { message: string, code: string } }
```

客户端统一通过 `result.ok` 判别，无需 try-catch。
