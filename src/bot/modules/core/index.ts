import { BotModule } from '@/bot/types';
import { Telegraf } from 'telegraf';
import info from './info.json';

function initCoreModule(bot: Telegraf): void {
  bot.start((ctx) => {
    ctx.reply('Бот запущен и готов к работе. Используйте /test для проверки инлайн-кнопок.');
  });

  bot.help((ctx) => {
    ctx.reply(
      'Доступные команды:\n' +
      '/start - Начало работы с ботом\n' +
      '/test - Проверка работы инлайн-кнопок\n' +
      '/help - Показать это сообщение'
    );
  });
}

export const coreModule: BotModule = {
  info,
  init: initCoreModule
}; 