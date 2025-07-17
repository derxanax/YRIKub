import { loadModules } from "@/user/main";
import { Module, ModuleInfo } from "@/user/types";
import fs from "fs/promises";
import path from "path";
import { TelegramClient } from "telegram";
import { NewMessageEvent } from "telegram/events";
import info from "./info.json";

const icons = {
  enabled: '🟢',
  disabled: '🔴',
  info: 'ℹ️',
  author: '👤',
  version: '📦',
  error: '❌',
  module: '📂',
};

async function moduleHandler(client: TelegramClient, event: NewMessageEvent, args: string[]): Promise<void> {
  const [action, moduleName] = args;
  const message = event.message;
  const modulesPath = path.join(__dirname, '..');

  if (!action) {
    await showModulesList(client, message, modulesPath);
    return;
  }

  if (!moduleName) {
    await message.edit({
      text: `${icons.error} Укажите имя модуля.`
    });
    return;
  }

  await handleModuleAction(client, message, modulesPath, action, moduleName);
}

async function showModulesList(client: TelegramClient, message: any, modulesPath: string): Promise<void> {
  const moduleDirs = await fs.readdir(modulesPath, { withFileTypes: true });
  let responseText = `<b>📋 Модули</b>\n\n`;

  const modules = [];
  for (const dir of moduleDirs) {
    if (dir.isDirectory()) {
      // Полностью игнорируем модуль r34
      if (dir.name === "r34") continue;
      
      const infoPath = path.join(modulesPath, dir.name, 'info.json');
      try {
        const moduleInfo: ModuleInfo = JSON.parse(await fs.readFile(infoPath, 'utf-8'));
        modules.push({
          dirName: dir.name,
          info: moduleInfo
        });
      } catch { }
    }
  }

  modules.sort((a, b) => {
    if (a.info.enabled && !b.info.enabled) return -1;
    if (!a.info.enabled && b.info.enabled) return 1;
    return a.info.name.localeCompare(b.info.name);
  });

  for (const module of modules) {
    const { info: moduleInfo, dirName } = module;
    const statusIcon = moduleInfo.enabled ? icons.enabled : icons.disabled;
    responseText += `<b>${statusIcon} ${moduleInfo.name}</b> (${dirName})\n`;
    responseText += `${moduleInfo.description}\n`;
    responseText += `${icons.version} ${moduleInfo.version}\n`;
    responseText += `${icons.author} ${moduleInfo.author}\n\n`;
  }

  responseText += `<code>.module enable имя</code> - включить\n`;
  responseText += `<code>.module disable имя</code> - выключить\n`;

  await message.edit({
    text: responseText,
    parseMode: 'html'
  });
}

async function handleModuleAction(client: TelegramClient, message: any, modulesPath: string, action: string, moduleName: string): Promise<void> {
  // Блокируем любые действия с модулем r34
  if (moduleName === "r34") {
    await message.edit({
      text: `${icons.error} Модуль не найден: ${moduleName}`,
      parseMode: 'html'
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
      case 'info':
        await showDetailedModuleInfo(message, moduleInfo, moduleName);
        return;
      default:
        await message.edit({
          text: `${icons.error} Неизвестное действие. Используйте enable, disable или info.`,
          parseMode: 'html'
        });
        return;
    }

    await fs.writeFile(targetModulePath, JSON.stringify(moduleInfo, null, 4));
    await loadModules();

    const statusIcon = moduleInfo.enabled ? icons.enabled : icons.disabled;
    const statusAction = moduleInfo.enabled ? 'включен' : 'выключен';

    await message.edit({
      text: `${statusIcon} Модуль "${moduleInfo.name}" ${statusAction}`,
      parseMode: 'html'
    });

  } catch (e) {
    await message.edit({
      text: `${icons.error} Модуль не найден: ${moduleName}`,
      parseMode: 'html'
    });
  }
}

async function showDetailedModuleInfo(message: any, moduleInfo: ModuleInfo, moduleName: string): Promise<void> {
  const statusIcon = moduleInfo.enabled ? icons.enabled : icons.disabled;

  const detailText = `
<b>${statusIcon} ${moduleInfo.name}</b> (${moduleName})
${icons.info} ${moduleInfo.description}
${icons.version} ${moduleInfo.version}
${icons.author} ${moduleInfo.author}
Статус: ${moduleInfo.enabled ? 'Включен' : 'Выключен'}
  `;

  await message.edit({
    text: detailText,
    parseMode: 'html'
  });
}

export const coreCommandsModule: Module = {
  info: info,
  handler: moduleHandler,
  commands: ["module"],
}; 