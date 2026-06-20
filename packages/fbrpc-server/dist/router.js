import { RpcError } from "@fbrpc/fbrpc-core";
import { scanModules } from "./scanner.js";
// ── 工厂 ──
export async function createRouter(opts) {
    const modules = await scanModules(opts.apiDir);
    // CORS 头
    const corsOrigin = !opts.cors ? null
        : opts.cors === true ? "*"
            : (opts.cors.origin ?? "*");
    const sseHeaders = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    };
    if (corsOrigin)
        sseHeaders["Access-Control-Allow-Origin"] = corsOrigin;
    const isPublicRoute = (moduleName, methodName) => opts.publicRoutes?.includes(`${moduleName}.${methodName}`) ||
        opts.publicRoutes?.includes(`${moduleName}.*`);
    const authenticate = async (request, moduleName, methodName) => {
        if (isPublicRoute(moduleName, methodName))
            return {};
        return opts.auth ? await opts.auth(request) : null;
    };
    return {
        async register(app, _registerOpts) {
            for (const [moduleName, mod] of Object.entries(modules)) {
                // ── 普通 RPC ──
                for (const [methodName, handler] of Object.entries(mod.handlers)) {
                    app.post(`/${moduleName}/${methodName}`, async (request, reply) => {
                        if (corsOrigin)
                            reply.header("Access-Control-Allow-Origin", corsOrigin);
                        if (opts.timeout)
                            request.raw.setTimeout(opts.timeout);
                        const meta = await authenticate(request, moduleName, methodName);
                        if (meta === null) {
                            return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
                        }
                        meta.requestId = crypto.randomUUID();
                        // call.req 来自 request.body——HTTP 边界的必然类型转换
                        let settled = false;
                        const call = {
                            req: (request.body ?? {}),
                            meta,
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
                    app.post(`/${moduleName}/${methodName}`, async (request, reply) => {
                        if (opts.timeout)
                            request.raw.setTimeout(opts.timeout);
                        const meta = await authenticate(request, moduleName, methodName);
                        if (meta === null) {
                            return reply.status(401).send({ ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
                        }
                        meta.requestId = crypto.randomUUID();
                        reply.raw.writeHead(200, sseHeaders);
                        let settled = false;
                        const call = {
                            req: (request.body ?? {}),
                            meta,
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
                                    reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: message, code: "INTERNAL" })}\n\n`);
                                    reply.raw.end();
                                });
                            },
                            error(message, code) {
                                settled = true;
                                reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: message, code: code ?? "API_ERROR" })}\n\n`);
                                reply.raw.end();
                            },
                        };
                        try {
                            handler(call);
                        }
                        catch (err) {
                            if (!settled) {
                                settled = true;
                                const message = err instanceof Error ? err.message : "Stream error";
                                const code = err instanceof RpcError ? err.code : "INTERNAL";
                                reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: message, code })}\n\n`);
                                reply.raw.end();
                            }
                        }
                        if (!settled) {
                            reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: "Handler did not call stream() or error()" })}\n\n`);
                            reply.raw.end();
                        }
                    });
                }
            }
            // ── 健康检查 ──
            app.get("/health", async (_request, reply) => {
                const moduleList = Object.keys(modules).map((name) => ({
                    module: name,
                    handlers: Object.keys(modules[name].handlers),
                    streams: Object.keys(modules[name].streams),
                }));
                return reply.send({ ok: true, data: { status: "ok", modules: moduleList } });
            });
        },
    };
}
//# sourceMappingURL=router.js.map