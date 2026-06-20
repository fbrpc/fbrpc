// ── 工厂 ──
export function createClient(opts) {
    const { baseUrl, getHeaders } = opts;
    return new Proxy({}, {
        get(_target, moduleName) {
            // 第二层 Proxy：拦截方法名
            return new Proxy({}, {
                get(_target2, methodName) {
                    // 返回调用函数
                    return async (req) => {
                        const url = `${baseUrl}/${moduleName}/${methodName}`;
                        let headers = {
                            "Content-Type": "application/json",
                        };
                        if (getHeaders) {
                            headers = { ...headers, ...getHeaders() };
                        }
                        try {
                            const res = await fetch(url, {
                                method: "POST",
                                headers,
                                body: JSON.stringify(req ?? {}),
                            });
                            if (res.status === 401) {
                                return { ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } };
                            }
                            return (await res.json());
                        }
                        catch (err) {
                            return {
                                ok: false,
                                error: {
                                    message: err instanceof Error ? err.message : "Network error",
                                    code: "NETWORK_ERROR",
                                },
                            };
                        }
                    };
                },
            });
        },
    });
}
//# sourceMappingURL=client.js.map