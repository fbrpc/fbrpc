/**
 * fbrpc 类型安全客户端 — Proxy 驱动。
 *
 * 用法:
 *   const api = createClient<{ echo: EchoProtocol }, { echo: readonly ["streamEcho"] }>({
 *     baseUrl: "http://localhost:3008/api",
 *   });
 *
 *   // 普通 RPC → Promise<ApiResponse>
 *   const result = await api.echo.echo({ message: "fbrpc works!" });
 *
 *   // 流式 SSE → AsyncGenerator
 *   for await (const chunk of api.echo.streamEcho({ count: 3 })) {}
 */
import type { ApiDef, Protocol, ReqOf, ResOf, ApiResponse } from "@fbrpc/fbrpc-core";
import { streamRequest } from "./stream.js";

// ── 类型魔法 ──

type RpcMethod<P, K extends keyof P & string> =
  P[K] extends ApiDef<infer Req, infer Res>
    ? (req: Req) => Promise<ApiResponse<Res>>
    : never;

type StreamMethod<P, K extends keyof P & string> =
  P[K] extends ApiDef<infer Req, any>
    ? (req: Req) => AsyncGenerator<unknown, void, undefined>
    : never;

type MethodsOf<P extends Protocol, S> = [S] extends [never]
  ? { [K in keyof P & string]: RpcMethod<P, K> }
  : S extends readonly (keyof P & string)[]
    ? { [K in keyof P & string]: K extends S[number] ? StreamMethod<P, K> : RpcMethod<P, K> }
    : { [K in keyof P & string]: RpcMethod<P, K> };

export type FbrpcClient<T extends Record<string, Protocol>, S extends Record<string, readonly string[]> = {}> = {
  [M in keyof T & string]: M extends keyof S
    ? MethodsOf<T[M], S[M]>
    : MethodsOf<T[M], never>;
};

// ── 工厂 ──

export interface ClientOptions {
  baseUrl: string;
  getHeaders?: () => Record<string, string>;
  /** 流式方法声明。key=模块名，value=方法名数组。运行时驱动 Proxy 行为。 */
  streams?: Record<string, readonly string[]>;
}

export function createClient<
  T extends Record<string, Protocol>,
  S extends Record<string, readonly string[]> = {},
>(
  opts: ClientOptions,
): FbrpcClient<T, S> {
  const { baseUrl, getHeaders, streams = {} } = opts;

  const isStream = (mod: string, method: string): boolean => {
    return (streams[mod] as readonly string[] | undefined)?.includes(method) ?? false;
  };

  return new Proxy({} as FbrpcClient<T, S>, {
    get(_target, moduleName: string) {
      return new Proxy({} as any, {
        get(_target2, methodName: string) {
          if (methodName === "then") return undefined;

          if (isStream(moduleName, methodName)) {
            return (req: unknown): AsyncGenerator<unknown, void, undefined> => {
              let headers: Record<string, string> = {};
              if (getHeaders) headers = getHeaders();
              return streamRequest(`${baseUrl}/${moduleName}/${methodName}`, req, { headers });
            };
          }

          return async (req: unknown): Promise<ApiResponse> => {
            const url = `${baseUrl}/${moduleName}/${methodName}`;

            let headers: Record<string, string> = { "Content-Type": "application/json" };
            if (getHeaders) headers = { ...headers, ...getHeaders() };

            try {
              const res = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(req ?? {}),
              });

              if (res.status === 401) {
                return { ok: false, error: { message: "Unauthorized", code: "UNAUTHORIZED" } };
              }

              return (await res.json()) as ApiResponse;
            } catch (err) {
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
