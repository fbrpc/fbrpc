---
name: fbrpc-manual
description: fbrpc RPC 框架使用指南。新建/修改 API、编写协议、注册服务时使用。
version: 3.0.0
allowed-tools: Read, Write, Edit, Glob, Bash(git:*)
argument-hint: ""
---

# fbrpc — 框架参考

## 核心理念

AI 维护时只读 2 个文件：**协议文件**（入参出参）+ **api.ts**（实现）。无 router、无 context、无 adapter。

## 三层架构

以一个用户系统为例，典型项目结构：

**packages/api-user** — 协议层，前后端共享

- `src/protocols/auth.ts` — 纯 TS 接口：LoginReq/LoginRes、AuthProtocol 映射
- `src/protocols/users.ts`
- `src/index.ts` — `export type { AuthProtocol, UsersProtocol }`

**apps/server-user** — 服务端

- `src/services/auth/api.ts` — handlers 唯一入口，委托 `_internal/`
- `src/services/auth/_internal/impl.ts` — 纯业务逻辑，不触碰 ApiCall
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

// 模块协议映射——一个文件展示全部 API
export interface AuthProtocol {
  login:    ApiDef<LoginReq, LoginRes>;
  register: ApiDef<RegisterReq, RegisterRes>;
  logout:   ApiDef<LogoutReq, void>;
}
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
import type { AnyApiHandler, AnyStreamHandler, ApiCall } from "@fbrpc/fbrpc-core";
import type { AuthProtocol } from "<共享包>";
import * as svc from "./_internal/impl.js";

// 类型缩写——免去每次写 ApiCall<AuthProtocol["login"]>
type C<K extends keyof AuthProtocol> = ApiCall<AuthProtocol[K]>;

export const handlers: Record<string, AnyApiHandler> = {
  async login(call: C<"login">) {
    const r = await svc.loginUser(call.req);
    if (r.err) return call.error(r.err.message, r.err.code);
    call.succ({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  },
};

export const streams: Record<string, AnyStreamHandler> = {
  // SSE 示例见下文
};
```

### _internal/impl.ts — 校验 + 业务在一起

```ts
// services/auth/_internal/impl.ts
// 纯业务函数，不接触 ApiCall。校验也在这里——它是业务规则的一部分。

export interface ServiceError { message: string; code: string; }

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  err?: ServiceError;
}

export async function loginUser(req: { username: string; password: string }): Promise<LoginResult> {
  // 校验
  if (!req.username) return { err: { message: "用户名不能为空", code: "VALIDATION" }, accessToken: "", refreshToken: "" };
  if (!req.password) return { err: { message: "密码不能为空", code: "VALIDATION" }, accessToken: "", refreshToken: "" };
  if (req.password.length < 6) return { err: { message: "密码至少6位", code: "VALIDATION" }, accessToken: "", refreshToken: "" };

  // 业务
  const user = await db.user.findUnique({ where: { username: req.username } });
  if (!user || !(await bcrypt.compare(req.password, user.passwordHash))) {
    return { err: { message: "用户名或密码错误", code: "AUTH_FAILED" }, accessToken: "", refreshToken: "" };
  }

  return {
    accessToken: signJwt({ userId: user.id }),
    refreshToken: generateRefreshToken(user.id),
  };
}
```

**原则：** `_internal/` 函数不 import core 类型、不调 `call.*`、不读 `call.meta`。需要 meta 时（如当前 userId），由 api.ts 从 `call.meta` 取出当参数传入。

### 复杂校验拆独立文件

校验逻辑较多时可单独拆：

```ts
// _internal/validate.ts
export interface FieldError { field: string; message: string; }

export function validateLogin(req: LoginReq): FieldError[] {
  const errors: FieldError[] = [];
  if (!req.username) errors.push({ field: "username", message: "用户名不能为空" });
  if (!req.password) errors.push({ field: "password", message: "密码不能为空" });
  if (req.password && req.password.length < 6) errors.push({ field: "password", message: "密码至少6位" });
  return errors;
}
```

api.ts 中调用：
```ts
async login(call: C<"login">) {
  const errors = validateLogin(call.req);
  if (errors.length) return call.error(errors[0].message, "VALIDATION");
  const r = await svc.loginUser(call.req);
  // ...
}
```

### 类型要点

- 用 `Record<string, AnyApiHandler>` 声明 handlers 类型（不用 `ApiHandler` 泛型 —— 它推断不出 key 约束）
- 每个 handler 的 call 参数显式标注 `C<"methodName">`，获取该方法的 req/res 类型
- **不用 `satisfies`** —— 它不窄化 call.req 的类型，和 `Record<string, AnyApiHandler>` 冲突

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
export const streams: Record<string, AnyStreamHandler> = {
  async chat(call) {
    call.stream(async (send) => {
      // send(chunk) → 自动转为 SSE data 帧
      const llm = openai.chat.completions.create({ stream: true, ... });
      for await (const chunk of llm) {
        send(chunk.choices[0]?.delta?.content ?? "");
      }
      // stream 结束时框架自动发送 done 事件
    });
  },
};
```

### 客户端

```ts
import { streamRequest } from "@fbrpc/fbrpc-client";

for await (const chunk of streamRequest("/api/agent/chat", {
  messages: [{ role: "user", content: "你好" }],
})) {
  process.stdout.write(chunk as string);
}
```

### SSE 错误处理

```ts
export const streams: Record<string, AnyStreamHandler> = {
  async process(call) {
    // 参数校验失败——直接 err 不启流
    if (!call.req.fileId) return call.error("缺少 fileId");

    call.stream(async (send) => {
      // 流中途出错——throw，框架发 error 事件后 end
      const file = await loadFile(call.req.fileId);
      if (!file) throw new Error("文件不存在");
      // ...
    });
  },
};
```

## 鉴权与中间件

### 服务端配置

```ts
const rpc = await createRouter({
  apiDir: "./src/services",
  auth: (req) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return null;                           // null → 401
    const payload = verifyJwt(token);
    return { userId: payload.sub, role: payload.role }; // 注入 call.meta
  },
  publicRoutes: [
    "auth.login",     // 精确匹配
    "auth.register",
    "health.*",       // health 模块全部公开
  ],
});
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
| 把业务逻辑写在 api.ts 里 | 委托到 `_internal/impl.ts` |
| 从外部 import `_internal/` | 只通过 api.ts 调用 |
| 用 `satisfies ServiceHandlers<P>` | 用 `Record<string, AnyApiHandler>` + `C<K>` |
| `call.meta.userId = x` | `call.meta` 只读 |
| 流式 handler 忘记调 `call.stream()` 或 `call.error()` | 必须调其一 |

## 新增模块清单

1. `protocols/<name>.ts` — Req/Res 接口 + Protocol 映射
2. 共享包 `index.ts` — `export type { XxxProtocol }`
3. `services/<name>/_internal/impl.ts` — 纯业务逻辑
4. `services/<name>/api.ts` — handlers 导出（`Record<string, AnyApiHandler>`）
5. 无需手动注册路由 — `createRouter` 自扫描
6. 客户端 `createClient<T>()` 泛型里加新模块类型

## 响应格式

```
{ ok: true, data: <Res> } | { ok: false, error: { message: string, code: string } }
```

客户端统一通过 `result.ok` 判别，无需 try-catch。
