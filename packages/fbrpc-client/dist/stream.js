/**
 * SSE 流式请求，返回 async iterable。
 */
export async function* streamRequest(url, req, opts) {
    const headers = {
        "Content-Type": "application/json",
        ...opts?.headers,
    };
    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(req),
    });
    if (!res.ok || !res.body) {
        throw new Error(`Stream request failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            // 按 SSE 帧分割
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            let eventType = "";
            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    eventType = line.slice(7);
                }
                else if (line.startsWith("data: ")) {
                    const json = line.slice(6);
                    if (eventType === "error") {
                        const parsed = JSON.parse(json);
                        throw new Error(`${parsed.code ?? "API_ERROR"}: ${parsed.error}`);
                    }
                    if (eventType === "done")
                        return;
                    // 普通数据帧
                    eventType = "";
                    try {
                        yield JSON.parse(json);
                    }
                    catch {
                        yield json;
                    }
                }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
}
//# sourceMappingURL=stream.js.map