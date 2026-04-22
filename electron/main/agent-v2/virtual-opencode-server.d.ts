// Type shim for the virtual:opencode-server module resolved by electron-vite
// to thirdparty/opencode/packages/opencode/dist/node/node.js.

declare module "virtual:opencode-server" {
  export namespace Log {
    function init(opts: {
      level?: "DEBUG" | "INFO" | "WARN" | "ERROR";
    }): Promise<void>;
  }

  export namespace Server {
    type Listener = {
      hostname: string;
      port: number;
      url: URL;
      stop(close?: boolean): Promise<void> | void;
    };
    function listen(opts: {
      port: number;
      hostname: string;
      mdns?: boolean;
      mdnsDomain?: string;
      cors?: string[];
    }): Promise<Listener>;
  }

  export const Config: unknown;
  export const Database: unknown;
  export const JsonMigration: unknown;
  export function bootstrap(...args: unknown[]): unknown;
}
