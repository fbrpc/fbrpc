import type { ApiDef } from "@fbrpc/fbrpc-core";

export interface EchoReq {
  message: string;
}

export interface EchoRes {
  message: string;
  timestamp: number;
}

export interface StreamEchoReq {
  count: number;
  delay?: number;
}

export type EchoProtocol = {
  echo:       ApiDef<EchoReq, EchoRes>;
  streamEcho: ApiDef<StreamEchoReq, void>;
};
