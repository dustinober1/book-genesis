declare module "@mariozechner/pi-ai" {
  export function StringEnum(values: readonly string[]): unknown;
}

declare module "@sinclair/typebox" {
  export const Type: {
    Object(schema: Record<string, unknown>): unknown;
    String(options?: Record<string, unknown>): unknown;
    Number(options?: Record<string, unknown>): unknown;
    Optional(schema: unknown): unknown;
    Array(schema: unknown): unknown;
    Boolean(options?: Record<string, unknown>): unknown;
  };
}

declare module "@mariozechner/pi-coding-agent" {
  export interface ExtensionAPI {
    on(eventName: string, handler: (event: any, ctx: any) => any): void;
    registerTool(definition: any): void;
    registerCommand(name: string, definition: any): void;
    sendUserMessage(message: string, options?: any): void;
    sendMessage(message: any, options?: any): void;
    setSessionName(name: string): void;
  }
}
