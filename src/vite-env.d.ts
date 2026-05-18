/// <reference types="vite/client" />

declare class Playerjs {
  constructor(options: { id: string; file: string; poster?: string; title?: string; autoplay?: number; start?: number; ready?: string; vars?: Record<string, string> });
  api(command: string, param?: string | number): any;
  destroy(): void;
}

declare function PlayerjsEvents(event: string, id: string, data: any): void;
