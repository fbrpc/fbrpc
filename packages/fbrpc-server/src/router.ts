/**
 * Fastify 路由注册器 — 将扫描到的模块注册为 HTTP 端点。
 *
 * 路由规则:
 *   POST /prefix/module/method
 *     调用 services/module/api.ts 中的 handlers[methodName]
 *
 * 流式规则:
 *   POST /prefix/module/method
 *     调用 services/module/api.ts 中的 streams[methodName]
 *     响应: text/event-stream (SSE)
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { RpcError } from "@fbrpc/fbrpc-core";
import type { ApiCall, StreamCall } from "@fbrpc/fbrpc-core";
import { scanModules } from "./scanner.js";

// ── 公开类型 ──

export interface RouterOptions {
  /**
   * services 目录绝对路径。
   * 扫描 services 下各模块的 api.ts。
   */
  apiDir: string;
  /**
   * 鉴权函数。
   * 返回 null 则拒绝请求（401）。
   * 返回的对象注入 call.meta。
   */
  auth?: (req: FastifyRequest) => Record<string, unknown> | null;
  /**
   * 跳过鉴权的路由。支持 "模块.方法" 和 "模块.*" 通配。
   * 如 ["auth.login", "auth.register", "monitor.*"]
   */
  publicRoutes?: string[];
}

export interface FbrpcRouter {
  /** 注册到 Fastify */
  register: (app: FastifyInstance, opts?: { prefix?: string }) => Promise<void>;
}

// ── 工厂 ──

export async function createRouter(opts: RouterOptions): Promise<FbrpcRouter> {
  const modules = await scanModules(opts.apiDir);

  return {
    async register(app: FastifyInstance, registerOpts?: { prefix?: string }) {
      const _prefix = registerOpts?.prefix ?? "/api";

      for (const [moduleName, mod] of Object.entries(modules)) {

        // ── 普通 RPC ──
        for (const [methodName, handler] of Object.entries(mod.handlers)) {
          const path = `/${moduleName}/${methodName}`;

          app.post(path, async (request: FastifyRequest, reply: FastifyReply) => {
            // 鉴权（公开路由跳过）
            const routeKey = `${moduleName}.${methodName}`;
            const isPublic =
              opts.publicRoutes?.includes(routeKey) ||
              opts.publicRoutes?.includes(`${moduleName}.*`);
            const meta = isPublic ? {} : (opts.auth?.(request) ?? null);
            if (meta === null) {
              return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
            }

            // 构造 call
            let settled = false;
            const call: ApiCall = {
              req: (request.body ?? {}) as Record<string, unknown>,
              meta: meta ?? {},
              succ(data: unknown) {
                settled = true;
                return reply.send({ ok: true, data });
              },
              error(message: string, code?: string) {
                settled = true;
                return reply.send({ ok: false, error: { message, code: code ?? "API_ERROR" } });
              },
            };

            try {
              await handler(call);
            } catch (err) {
              if (!settled) {
                settled = true;
                const message = err instanceof Error ? err.message : "Internal Server Error";
                const code = err instanceof RpcError ? err.code : "INTERNAL";
                reply.status(500).send({ ok: false, error: { message, code } });
              }
            }

            if (!settled) {
              reply.status(500).send({ ok: false, error: { message: "Handler did not settle", code: "UNSETTLED" } });
            }
          });
        }

        // ── SSE 流式 ──
        for (const [methodName, handler] of Object.entries(mod.streams)) {
          const path = `/${moduleName}/${methodName}`;

          app.post(path, async (request: FastifyRequest, reply: FastifyReply) => {
            const meta = opts.auth?.(request);
            if (meta === null) {
              return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
            }

            reply.raw.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
            });

            let settled = false;

            const call: StreamCall = {
              req: (request.body ?? {}) as Record<string, unknown>,
              meta: meta ?? {},
              stream(fn: (send: (chunk: unknown) => void) => Promise<void>) {
                settled = true;
                fn((chunk: unknown) => {
                  reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
                })
                  .then(() => {
                    reply.raw.write("event: done\ndata: {}\n\n");
                    reply.raw.end();
                  })
                  .catch((err: unknown) => {
                    const message = err instanceof Error ? err.message : "Stream error";
                    reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
                    reply.raw.end();
                  });
              },
              error(message: string) {
                settled = true;
                reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
                reply.raw.end();
              },
            };

            handler(call);

            if (!settled) {
              reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: "Handler did not call stream() or error()" })}\n\n`);
              reply.raw.end();
            }
          });
        }
      }
    },
  };
}
