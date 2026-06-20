import { streamRequest } from "./stream.js";
export function createClient(opts) {
    const { baseUrl, getHeaders, streams = {} } = opts;
    const isStream = (mod, method) => {
        return streams[mod]?.includes(method) ?? false;
    };
    return new Proxy({}, {
        get(_target, moduleName) {
            return new Proxy({}, {
                get(_target2, methodName) {
                    if (methodName === "then")
                        return undefined;
                    if (isStream(moduleName, methodName)) {
                        return (req) => {
                            let headers = {};
                            if (getHeaders)
                                headers = getHeaders();
                            return streamRequest(`${baseUrl}/${moduleName}/${methodName}`, req, { headers });
                        };
                    }
                    return async (req) => {
                        const url = `${baseUrl}/${moduleName}/${methodName}`;
                        let headers = { "Content-Type": "application/json" };
                        if (getHeaders)
                            headers = { ...headers, ...getHeaders() };
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