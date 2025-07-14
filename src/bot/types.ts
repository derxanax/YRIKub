import { Telegraf } from 'telegraf';

export interface ModuleInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
}

export interface BotModule {
  info: ModuleInfo;
  init: (bot: Telegraf) => void;
} 