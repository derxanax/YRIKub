import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { Telegraf } from 'telegraf';
import { BotModule } from './types';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || '';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN must be configured in .env file');
}

export async function startBotPlaceholder(): Promise<void> {
  const bot = new Telegraf(BOT_TOKEN);

  await loadBotModules(bot);
  
  // Запускаем API-сервер для обмена данными с юзерботом
  const { startApiServer } = await import('./api-server');
  await startApiServer(bot);

  try {
    await bot.launch();
    console.log('Бот успешно запущен!');
  } catch (error) {
    console.error('Ошибка запуска бота:', error);
    throw error;
  }

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

async function loadBotModules(bot: Telegraf): Promise<void> {
  const modulesPath = path.join(__dirname, 'modules');

  try {
    await fs.access(modulesPath);

    const moduleDirs = await fs.readdir(modulesPath, { withFileTypes: true });

    for (const dir of moduleDirs) {
      if (dir.isDirectory()) {
        try {
          const infoPath = path.join(modulesPath, dir.name, 'info.json');
          const moduleInfo = JSON.parse(await fs.readFile(infoPath, 'utf-8'));

          if (moduleInfo.enabled) {
            const modulePath = path.join(modulesPath, dir.name, 'index');
            const moduleImport = await import(modulePath);

            const moduleKey = Object.keys(moduleImport).find(key =>
              moduleImport[key] && typeof moduleImport[key] === 'object' && 'info' in moduleImport[key]
            );

            if (moduleKey) {
              const botModule: BotModule = moduleImport[moduleKey];
              botModule.init(bot);
            }
          }
        } catch (error) {
          console.error(`Ошибка модуля ${dir.name}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Ошибка загрузки модулей:', error);
  }
}
