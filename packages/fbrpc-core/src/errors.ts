/**
 * fbrpc 错误类型。
 * handler 内部 throw RpcError 时，框架自动转为统一错误响应。
 */
export class RpcError extends Error {
  constructor(
    message: string,
    public code: string = "API_ERROR",
  ) {
    super(message);
    this.name = "RpcError";
  }
}
