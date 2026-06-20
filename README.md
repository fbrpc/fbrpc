# fbrpc

Type-safe RPC framework for Fastify + TypeScript. Protocol-driven — define your API contract once, get end-to-end type safety from client to server.

## Packages

| Package | Description |
|---------|-------------|
| `@birderr/fbrpc-core` | Core types — `ApiDef`, `ApiCall`, `StreamCall`, `ServiceHandlers`. Zero dependencies. |
| `@birderr/fbrpc-server` | Fastify router — scans `services/*/api.ts`, auto-registers `POST /api/:module/:method`. |
| `@birderr/fbrpc-client` | Proxy-based caller — `api.auth.login(req)` with full type inference. |

## Install

**Step 1** — Create `.npmrc` in your project root:

```
@birderr:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

**Step 2** — Set `NPM_TOKEN` env var with a GitHub [personal access token](https://github.com/settings/tokens) that has `read:packages` scope, then:

```bash
npm install @birderr/fbrpc-core @birderr/fbrpc-server @birderr/fbrpc-client
```

Or with pnpm:

```bash
pnpm add @birderr/fbrpc-core @birderr/fbrpc-server @birderr/fbrpc-client
```

## Quick Start

### 1. Define a protocol (`api-user/` package)

```ts
import type { ApiDef } from "@birderr/fbrpc-core";

export interface AuthProtocol {
  login: ApiDef<{ username: string; password: string }, { accessToken: string }>;
}
```

### 2. Server — handler

```ts
// services/auth/api.ts
import type { ApiCall, ServiceHandlers } from "@birderr/fbrpc-core";
import type { AuthProtocol } from "@your/api-user";

export const handlers = {
  async login(call: ApiCall<AuthProtocol["login"]>) {
    const { username, password } = call.req;
    // ... authenticate ...
    call.succ({ accessToken: "jwt..." });
  },
} satisfies ServiceHandlers<AuthProtocol>;
```

### 3. Server — register routes

```ts
import Fastify from "fastify";
import { createRouter } from "@birderr/fbrpc-server";

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

### 4. Client

```ts
import { createClient } from "@birderr/fbrpc-client";
import type { AuthProtocol } from "@your/api-user";

const api = createClient<{ auth: AuthProtocol }>({
  baseUrl: "http://localhost:40101/api",
  getHeaders: () => ({ Authorization: `Bearer ${token}` }),
});

const result = await api.auth.login({ username: "birder", password: "xxx" });
// result.ok === true  →  result.data.accessToken  (fully typed)
```

## Routing

```
POST /api/:module/:method

services/auth/api.ts  →  handlers.login  →  POST /api/auth/login
services/agent/api.ts →  streams.chat    →  POST /api/agent/chat (SSE)
```

## License

MIT
