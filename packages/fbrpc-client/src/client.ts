/**
 * fbrpc 类型安全客户端 — Proxy 驱动。
 *
 * 用法:
 *   const api = createClient<{ auth: AuthProtocol }>("http://localhost:3008/api");
 *   const result = await api.auth.login({ username: "foo", password: "bar" });
 *   // result: { ok: true; data: { accessToken, refreshToken } }
 *   //       | { ok: false; error: { message, code } }
 */
import type { ApiDef, Protocol, ReqOf, ResOf, ApiResponse } from "fbrpc-core";

// ── 类型 ──

/** 将 Protocol 映射为可调用方法 */
type ProtocolClient<P extends Protocol> = {
  [K in keyof P & string]: P[K] extends ApiDef
    ? (req: ReqOf<P[K]>) => Promise<ApiResponse<ResOf<P[K]>>>
    : never;
};

/** 将模块映射表映射为嵌套客户端 */
export type FbrpcClient<T extends Record<string, Protocol>> = {
  [Module in keyof T & string]: ProtocolClient<T[Module]>;
};

// ── 配置 ──

export interface ClientOptions {
  /** 服务端 base URL */
  baseUrl: string;
  /**
   * 每次请求前调用，返回要附加的 HTTP headers。
   * 典型用法：返回 { Authorization: `Bearer ${getToken()}` }
   */
  getHeaders?: () => Record<string, string>;
}

// ── 工厂 ──

export function createClient<T extends Record<string, Protocol>>(
  opts: ClientOptions,
): FbrpcClient<T> {
  const { baseUrl, getHeaders } = opts;

  return new Proxy({} as FbrpcClient<T>, {
    get(_target, moduleName: string) {
      // 第二层 Proxy：拦截方法名
      return new Proxy({} as ProtocolClient<Protocol>, {
        get(_target2, methodName: string) {
          // 返回调用函数
          return async (req: unknown): Promise<ApiResponse> => {
            const url = `${baseUrl}/${moduleName}/${methodName}`;

            let headers: Record<string, string> = {
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
