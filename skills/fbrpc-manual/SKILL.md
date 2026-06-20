---
name: fbrpc-manual
description: fbrpc RPC 框架使用指南。新建/修改 API、编写协议、注册服务时使用。
version: 2.1.0
allowed-tools: Read, Write, Edit, Glob, Bash(git:*)
argument-hint: ""
---

# fbrpc — 自建 RPC 框架

## 设计目标

AI 维护时只读 2 个文件：**协议文件**（入参出参）+ **api.ts**（实现）。无 router、无 context、无 adapter。

## 包结构

```
@fbrpc/fbrpc-core     — ApiDef / ApiCall / StreamCall / RpcError / AnyApiHandler（零依赖）
@fbrpc/fbrpc-server   — createRouter() + scanModules()（Fastify 插件）
@fbrpc/fbrpc-client   — createClient<T>() Proxy 客户端 + streamRequest()
```

协议类型存放在 **共享包**（前后端共用），实现放在 server 的 `services/` 下。

## 三层约定

```
共享包/protocols/                   server/services/                   client/
  <module>.ts     ← 纯类型（ApiDef）   <module>/                         createClient<{
                                          api.ts       ← handlers 导出      <module>: <Protocol>
                                          _internal/   ← 业务逻辑          }>({...})
                                            impl.ts
                                            ...
                                    middleware/
                                      token.ts      ← HTTP 层工具
```

**规则：**
- 协议文件只放 TS 接口，零框架依赖（只 import `ApiDef`）
- `api.ts` 是模块唯一的公开实现入口
- `_internal/` 内任意拆分，外部绝不 import
- `middleware/` 放 HTTP 层横切工具（token 解析等）

## 协议文件写法

```ts
import type { ApiDef } from "@fbrpc/fbrpc-core";

// 命名：{Method}Req / {Method}Res
export interface LoginReq { username: string; password: string; }
export interface LoginRes { accessToken: string; refreshToken: string; }

// 模块协议映射——一个文件展示全部 API 入参出参
export interface AuthProtocol {
  login:    ApiDef<LoginReq, LoginRes>;
  register: ApiDef<RegisterReq, RegisterRes>;
  logout:   ApiDef<LogoutReq, void>;
}
```

在共享包的 `index.ts` 中导出：
```ts
export type { AuthProtocol } from "./protocols/auth.js";
```

## api.ts 写法

```ts
import type { AnyApiHandler, ApiCall } from "@fbrpc/fbrpc-core";
import type { AuthProtocol } from "<共享包>";
import * as svc from "./_internal/impl.js";

type C<K extends keyof AuthProtocol> = ApiCall<AuthProtocol[K]>;

export const handlers: Record<string, AnyApiHandler> = {
  async login(call: C<"login">) {
    const r = await svc.loginUser(call.req.username, call.req.password);
    if (r.invalid) return call.error("用户名或密码错误");
    call.succ({ accessToken: r.accessToken, refreshToken: r.refreshToken });
  },

  async logout(call: C<"logout">) {
    await svc.logoutUser(call.req.refreshToken);
    call.succ(undefined);
  },
};

// SSE 流式端点
export const streams: Record<string, AnyStreamHandler> = {
  async chat(call) {
    call.stream(async (send) => {
      for await (const chunk of someStream) send(chunk);
    });
  },
};
```

**类型要点：**
- 用 `Record<string, AnyApiHandler>` 收窄类型（不要用 `ApiHandler` 泛型）
- 每个 handler 的 call 参数显式标注 `C<"methodName">`
- 不用 `satisfies`——它不提供窄化类型

**call 对象规则：**
- handler 不 return 值，必须调 `call.succ()` 或 `call.error()`
- handler 不抛异常（抛了框架转为 `{ code: "INTERNAL" }`）
- `call.meta` 含鉴权数据（`{ userId }` 等）
- 流式用 `call.stream(fn)`，`send(chunk)` 自动转 SSE

## 服务端注册

```ts
import { createRouter } from "@fbrpc/fbrpc-server";

const rpc = await createRouter({
  apiDir: "./services",    // 扫描 services/*/api.ts
  auth: (req) => {         // 鉴权，返回注入 call.meta 的数据
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const decoded = decodeToken(token);
    return decoded ? { userId: decoded.userId } : null;  // null = 401
  },
});

app.register(rpc.register, { prefix: "/api" });
// POST /api/auth/login    → services/auth/api.ts → handlers.login
// POST /api/agent/chat    → services/agent/api.ts → streams.chat (SSE)
```

## 客户端调用

```ts
import { createClient } from "@fbrpc/fbrpc-client";
import type { AuthProtocol, UsersProtocol } from "<共享包>";

const api = createClient<{ auth: AuthProtocol; users: UsersProtocol }>({
  baseUrl: "<server>/api",
  getHeaders: () => ({ Authorization: `Bearer ${getToken()}` }),
});

const result = await api.auth.login({ username: "foo", password: "bar" });
//    ^? { ok: true; data: { accessToken, refreshToken } }
//       | { ok: false; error: { message: string, code: string } }

if (result.ok) console.log(result.data.accessToken);
else console.error(result.error.message);
```

## 响应格式

所有请求返回统一结构：
```ts
{ ok: true, data: <Res> } | { ok: false, error: { message: string, code: string } }
```

| 场景 | handler 做法 | 客户端收到 |
|------|-------------|-----------|
| 业务错误 | `call.error("用户名不存在")` | `code: "API_ERROR"` |
| 自定义错误码 | `call.error("积分不足", "POINTS")` | `code: "POINTS"` |
| 抛异常 | `throw new Error("DB挂了")` | `code: "INTERNAL"` |
| 忘调 succ/error | — | `code: "UNSETTLED"` |

## 新增模块步骤

1. 共享包 `protocols/<name>.ts` — Req/Res 接口 + Protocol 映射
2. 共享包 `index.ts` — `export type { XxxProtocol }`
3. server `services/<name>/_internal/` — 业务逻辑
4. server `services/<name>/api.ts` — `export const handlers: Record<string, AnyApiHandler>`
5. 服务端自动识别（`createRouter` 扫描约定），无需手动注册
6. 客户端 `createClient<T>()` 泛型加新模块类型
