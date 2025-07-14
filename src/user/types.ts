import { TelegramClient } from "telegram";
import { type NewMessageEvent } from "telegram/events";

export interface ModuleInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
}

export interface Module {
  info: ModuleInfo;
  handler: (client: TelegramClient, event: NewMessageEvent, args: string[]) => Promise<void>;
  commands: string[];
} 