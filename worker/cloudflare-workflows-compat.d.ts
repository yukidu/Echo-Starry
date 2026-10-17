declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

declare module 'cloudflare:workers' {
  export type WorkflowEvent<T = unknown> = {
    payload: T;
    schedule?: { cron: string; scheduledTime: number };
    instanceId?: string;
    timestamp?: Date;
  };

  export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
    do<T>(name: string, config: unknown, callback: () => Promise<T> | T): Promise<T>;
    sleep?(name: string, duration: string | number): Promise<void>;
  }

  export class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected env: Env;
    constructor(ctx: unknown, env: Env);
    run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }

  export class DurableObject<Env = unknown> {
    protected env: Env;
    protected ctx: {
      container?: any;
      storage?: any;
      waitUntil?(promise: Promise<unknown>): void;
      blockConcurrencyWhile?<T>(callback: () => Promise<T>): Promise<T>;
    };
    constructor(ctx: unknown, env: Env);
  }
}
