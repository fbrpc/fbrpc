import { createClient } from "@fbrpc/fbrpc-client";
import type { EchoProtocol } from "@fbrpc/api-example";

const api = createClient<{ echo: EchoProtocol }, { echo: readonly ["streamEcho"] }>({
  baseUrl: "http://localhost:34088/api",
  streams: { echo: ["streamEcho"] },
});

// ── 普通 RPC ──

const r = await api.echo.echo({ message: "fbrpc works!" });
if (r.ok) {
  console.log("✓ echo:", r.data.message, `(${new Date(r.data.timestamp).toISOString()})`);
} else {
  console.error("✗ echo:", r.error);
  process.exit(1);
}

// ── SSE 流式（通过 createClient，统一入口）──

console.log("\n✓ streamEcho:");
for await (const chunk of api.echo.streamEcho({ count: 3, delay: 200 })) {
  console.log("  ", chunk);
}

console.log("\n✓ all tests passed");
