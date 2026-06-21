import type { ApiCall, ServiceHandlers, ServiceStreamHandlers, StreamCall } from "@fbrpc/fbrpc-core";
import type { EchoProtocol } from "@fbrpc/api-example";
import * as echoSvc from "./_internal_index.js";

// ── handlers ──

type ApiMethods = Pick<EchoProtocol, "echo">;

export const handlers = {
  async echo(call: ApiCall<EchoProtocol["echo"]>) {
    const r = echoSvc.handleEcho(call.req);
    if (r.err) return call.error(r.err.message, r.err.code);
    call.succ({ message: r.message, timestamp: r.timestamp });
  },
} satisfies ServiceHandlers<ApiMethods>;

// ── streams ──

type StreamMethods = Pick<EchoProtocol, "streamEcho">;

export const streams = {
  streamEcho(call: StreamCall<EchoProtocol["streamEcho"]>) {
    call.stream(async (send) => {
      for await (const chunk of echoSvc.handleStreamEcho(call.req)) {
        await send(chunk);
      }
    });
  },
} satisfies ServiceStreamHandlers<StreamMethods>;
