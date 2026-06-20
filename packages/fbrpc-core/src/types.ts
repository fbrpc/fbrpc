/**
 * fbrpc-core — 核心类型定义，零依赖。
 *
 * 设计目标：AI 打开一个文件就能理解全部 API 契约。
 * 协议层只用纯 TS 接口，不引入任何框架类型。
 */

// ── API 定义 ──

/** 单个 API 的请求/响应类型对 */
export interface ApiDef<Req = unknown, Res = unknown> {
  req: Req;
  res: Res;
}

/** 协议映射：{ 方法名: ApiDef } */
export type Protocol = Record<string, ApiDef>;

// ── call 对象 ──

/**
 * 普通 RPC 调用的 call 对象。
 * handler 通过 call.succ() / call.error() 回传结果，
 * 不抛异常、不 return 值。
 */
export interface ApiCall<D extends ApiDef = ApiDef> {
  /** 请求参数（协议定义的 req 类型） */
  req: D["req"];
  /**
   * 元数据——由服务器鉴权函数注入。
   * 通常包含 userId、sessionId 等横切信息。
   */
  meta: Record<string, unknown>;
  /** 成功响应 */
  succ(data: D["res"]): void;
  /** 业务错误 */
  error(message: string, code?: string): void;
}

/**
 * SSE 流式调用的 call 对象。
 * handler 调用 call.stream(fn)，框架负责把 yield 转成 SSE 事件。
 */
export interface StreamCall<D extends ApiDef<unknown, void> = ApiDef<unknown, void>> {
  req: D["req"];
  meta: Record<string, unknown>;
  /**
   * 启动流式输出。
   * fn 接收 send 函数，每次 send(chunk) 输出一个 SSE 事件。
   */
  stream(fn: (send: (chunk: unknown) => void) => Promise<void>): void;
  /** 流式错误 */
  error(message: string, code?: string): void;
}

// ── 处理器 ──

/** 任意 ApiCall 的 handler 类型，用于 ApiModule 和扫描器 */
export type AnyApiHandler = (call: ApiCall<any>) => Promise<void>;
/** 任意 StreamCall 的 handler 类型 */
export type AnyStreamHandler = (call: StreamCall<any>) => void;

/**
 * 从 Protocol 推导类型安全的 handler 映射。
 *
 * 用于 services 目录下各 api.ts 的 handlers 导出——
 * `satisfies ServiceHandlers<Protocol>` 确保：
 * 1. 所有协议方法都被实现（无遗漏）
 * 2. key 精确对齐（无多余）
 * 3. 每个 handler 的 call 参数自动推导 req/res 类型
 *
 * 配合 call 参数的类型注解（如 `ApiCall<Protocol["method"]>`），
 * 达成全链路编译期类型安全。
 */
export type ServiceHandlers<P> = {
  [K in keyof P & string]: P[K] extends ApiDef<infer Req, infer Res>
    ? (call: ApiCall<ApiDef<Req, Res>>) => Promise<void>
    : never
};

/**
 * 从 Protocol 推导类型安全的 SSE 流式 handler 映射。
 *
 * 与 ServiceHandlers 对称——但 handler 返回 void（同步），
 * StreamCall.res 固定为 void（流式不返回）。
 *
 * 配合 satisfies ServiceStreamHandlers<Pick<Protocol, "streamMethod">>，
 * key 名精确、req 类型对齐。需要编译期检查的流式方法用 Pick 选出。
 */
export type ServiceStreamHandlers<P> = {
  [K in keyof P & string]: P[K] extends ApiDef<infer Req, any>
    ? (call: StreamCall<ApiDef<Req, void>>) => void
    : never;
};

// ── 模块描述 ──

/**
 * 一个服务模块的导出。
 * services/<name>/api.ts 必须导出这个形状。
 */
export interface ApiModule {
  /** 普通 RPC 处理器。key = 方法名。 */
  handlers: Record<string, AnyApiHandler>;
  /** SSE 流式处理器。key = 方法名。 */
  streams: Record<string, AnyStreamHandler>;
}

// ── 响应格式 ──

/** 统一成功响应 */
export interface SuccResponse<T = unknown> {
  ok: true;
  data: T;
}

/** 统一错误响应 */
export interface ErrResponse {
  ok: false;
  error: {
    message: string;
    code: string;
  };
}

/** 统一响应 */
export type ApiResponse<T = unknown> = SuccResponse<T> | ErrResponse;
