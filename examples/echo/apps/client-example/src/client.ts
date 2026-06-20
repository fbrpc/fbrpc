import { createClient } from "@fbrpc/fbrpc-client";
import { unwrap } from "@fbrpc/fbrpc-core";
import type { EchoProtocol } from "@fbrpc/api-example";

const api = createClient<{ echo: EchoProtocol }, { echo: readonly ["streamEcho"] }>({
  baseUrl: "http://localhost:34088/api",
  streams: { echo: ["streamEcho"] },
});

// ── 普通 RPC ──

const data = unwrap(await api.echo.echo({ message: "fbrpc works!" }));
console.log("✓ echo:", data.message, `(${new Date(data.timestamp).toISOString()})`);

// ── SSE 流式（通过 createClient，统一入口）──

console.log("\n✓ streamEcho:");
for await (const chunk of api.echo.streamEcho({ count: 3, delay: 200 })) {
  console.log("  ", chunk);
}

console.log("\n✓ all tests passed");
