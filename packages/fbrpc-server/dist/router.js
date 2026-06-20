import { RpcError } from "fbrpc-core";
import { scanModules } from "./scanner.js";
// ── 工厂 ──
export async function createRouter(opts) {
    const modules = await scanModules(opts.apiDir);
    return {
        async register(app, registerOpts) {
            const _prefix = registerOpts?.prefix ?? "/api";
            for (const [moduleName, mod] of Object.entries(modules)) {
                // ── 普通 RPC ──
                for (const [methodName, handler] of Object.entries(mod.handlers)) {
                    const path = `/${moduleName}/${methodName}`;
                    app.post(path, async (request, reply) => {
                        // 鉴权（公开路由跳过）
                        const routeKey = `${moduleName}.${methodName}`;
                        const isPublic = opts.publicRoutes?.includes(routeKey) ||
                            opts.publicRoutes?.includes(`${moduleName}.*`);
                        const meta = isPublic ? {} : (opts.auth?.(request) ?? null);
                        if (meta === null) {
                            return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
                        }
                        // 构造 call
                        let settled = false;
                        const call = {
                            req: (request.body ?? {}),
                            meta: meta ?? {},
                            succ(data) {
                                settled = true;
                                return reply.send({ ok: true, data });
                            },
                            error(message, code) {
                                settled = true;
                                return reply.send({ ok: false, error: { message, code: code ?? "API_ERROR" } });
                            },
                        };
                        try {
                            await handler(call);
                        }
                        catch (err) {
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
                    app.post(path, async (request, reply) => {
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
                        const call = {
                            req: (request.body ?? {}),
                            meta: meta ?? {},
                            stream(fn) {
                                settled = true;
                                fn((chunk) => {
                                    reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
                                })
                                    .then(() => {
                                    reply.raw.write("event: done\ndata: {}\n\n");
                                    reply.raw.end();
                                })
                                    .catch((err) => {
                                    const message = err instanceof Error ? err.message : "Stream error";
                                    reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
                                    reply.raw.end();
                                });
                            },
                            error(message) {
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
//# sourceMappingURL=router.js.map