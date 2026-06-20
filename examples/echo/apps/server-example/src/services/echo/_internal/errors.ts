export interface ServiceError { message: string; code: string; }

export const Err = {
  validation: (msg: string) => ({ message: msg, code: "VALIDATION" as const }),
};
