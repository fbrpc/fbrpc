import { createClient, streamRequest } from "@fbrpc/fbrpc-client";
import type { EchoProtocol } from "@fbrpc/api-example";

const BASE = "http://localhost:34088/api";

// ── 普通 RPC ──

const api = createClient<{ echo: EchoProtocol }>({ baseUrl: BASE });

const r = await api.echo.echo({ message: "fbrpc works!" });
if (r.ok) {
  console.log("✓ echo:", r.data.message, `(${new Date(r.data.timestamp).toISOString()})`);
} else {
  console.error("✗ echo:", r.error);
  process.exit(1);
}

// ── SSE 流式 ──

console.log("\n✓ streamEcho:");
for await (const chunk of streamRequest(`${BASE}/echo/streamEcho`, {
  count: 3,
  delay: 200,
})) {
  console.log("  ", chunk);
}

console.log("\n✓ all tests passed");
