import { loadModules } from "@/user/main";
import { Module, ModuleInfo } from "@/user/types";
import fs from "fs/promises";
import path from "path";
import { TelegramClient } from "telegram";
import { NewMessageEvent } from "telegram/events";
import info from "./info.json";

async function moduleHandler(client: TelegramClient, event: NewMessageEvent, args: string[]): Promise<void> {
  const [action, moduleName] = args;

  const modulesPath = path.join(__dirname, '..');

  if (!action) {
    const moduleDirs = await fs.readdir(modulesPath, { withFileTypes: true });
    let responseText = `╭───﹝ Модули YRIKub ﹞───\n│\n`;
    for (const dir of moduleDirs) {
      if (dir.isDirectory()) {
        const infoPath = path.join(modulesPath, dir.name, 'info.json');
        try {
          const moduleInfo: ModuleInfo = JSON.parse(await fs.readFile(infoPath, 'utf-8'));
          responseText += `├─ ${moduleInfo.name} ${moduleInfo.enabled ? '🟢' : '🔴'} - ${moduleInfo.description}\n`;
        } catch {
        }
      }
    }
    responseText += `│\n╰───﹝ v1.0.0 ﹞───`;

    await event.message.edit({
      text: responseText
    });
    return;
  }

  if (!moduleName) {
    await event.message.edit({
      text: "Укажите имя модуля."
    });
    return;
  }

  const targetModulePath = path.join(modulesPath, moduleName, 'info.json');

  try {
    const moduleInfo: ModuleInfo = JSON.parse(await fs.readFile(targetModulePath, 'utf-8'));

    switch (action.toLowerCase()) {
      case 'on':
      case 'enable':
        moduleInfo.enabled = true;
        break;
      case 'off':
      case 'disable':
        moduleInfo.enabled = false;
        break;
      default:
        await event.message.edit({
          text: "Неизвестное действие. Используйте on или off."
        });
        return;
    }

    await fs.writeFile(targetModulePath, JSON.stringify(moduleInfo, null, 4));
    await loadModules();

    const statusText = `Модуль ${moduleName} был ${moduleInfo.enabled ? 'включен' : 'выключен'}. ✅`;
    await event.message.edit({
      text: statusText
    });

  } catch (e) {
    const errorText = `Не удалось найти или обработать модуль ${moduleName}. ❌`;
    await event.message.edit({
      text: errorText
    });
  }
}

export const coreCommandsModule: Module = {
  info: info,
  handler: moduleHandler,
  commands: ["module"],
}; 