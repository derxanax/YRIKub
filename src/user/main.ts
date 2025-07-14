import { Module, ModuleInfo } from "@/user/types";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { TelegramClient } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";

dotenv.config();

const apiId = parseInt(process.env.API_ID || "0");
const apiHash = process.env.API_HASH || "";
const session = new StringSession(process.env.SESSION_STRING || "");

if (!apiId || !apiHash) {
  throw new Error("API_ID and API_HASH must be configured in .env file");
}

const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
});

const commandPrefix = ".";
const loadedModules: Map<string, Module> = new Map();

export async function loadModules() {
  loadedModules.clear();
  const modulesPath = path.join(__dirname, 'modules');
  const moduleDirs = await fs.readdir(modulesPath, { withFileTypes: true });

  for (const dir of moduleDirs) {
    if (dir.isDirectory()) {
      const infoPath = path.join(modulesPath, dir.name, 'info.json');
      const moduleIndexPath = path.join(modulesPath, dir.name, 'index.js');

      try {
        const info: ModuleInfo = JSON.parse(await fs.readFile(infoPath, 'utf-8'));
        if (!info.enabled) {
          console.log(`[Module] Skipping disabled module: ${info.name}`);
          continue;
        }

        const moduleImport = require(path.resolve(moduleIndexPath.replace(/\.js$/, '')));
        const module: Module = Object.values(moduleImport)[0] as Module;

        if (module && module.commands) {
          for (const command of module.commands) {
            loadedModules.set(command.toLowerCase(), module);
          }
          console.log(`[Module] Loaded module '${module.info.name}' for commands: ${module.commands.join(', ')}`);
        }
      } catch (error) {
        console.error(`[Module] Failed to load module from ${dir.name}:`, error);
      }
    }
  }
}

async function handleNewMessage(event: NewMessageEvent) {
  const message = event.message;
  if (!message.out || !message.text || !message.text.startsWith(commandPrefix)) {
    return;
  }

  const [commandName, ...args] = message.text.slice(commandPrefix.length).split(/\s+/);
  const module = loadedModules.get(commandName.toLowerCase());

  if (module) {
    try {
      console.log(`[Command] Executing command '${commandName}' from module '${module.info.name}'`);
      await module.handler(client, event, args);
    } catch (error: any) {
      console.error(`[Command] Error executing command '${commandName}':`, error);
      try {
        await event.message.edit({
          text: `❌ Ошибка: ${error.message || String(error)}`
        });
      } catch (e) {
      }
    }
  }
}

export async function startUserBot() {
  console.log("[UserBot] Starting...");

  await client.connect();

  console.log("[UserBot] You should now be connected.");

  await loadModules();
  console.log(`[UserBot] ${loadedModules.size} commands loaded.`);

  client.addEventHandler(handleNewMessage, new NewMessage({ incoming: false }));
}
