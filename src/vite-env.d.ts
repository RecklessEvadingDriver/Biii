/// <reference types="vite/client" />

type PlayerjsApiValue = string | number | boolean | null | undefined;

declare class Playerjs {
  constructor(options: { id: string; file: string; poster?: string; title?: string; autoplay?: number; start?: number; ready?: string; vars?: Record<string, string> });
  api(command: string, param?: string | number): PlayerjsApiValue;
  destroy(): void;
}

declare function PlayerjsEvents(event: string, id: string, data: unknown): void;

interface Window {
  Playerjs?: typeof Playerjs;
  PlayerjsEvents?: typeof PlayerjsEvents;
}
