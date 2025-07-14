import { BotModule } from '@/bot/types';
import { Markup, Telegraf } from 'telegraf';
import info from './info.json';

// случайные фразы для редактирования сообщения
const randomPhrases = [
  "Жизнь — это то, что с тобой происходит, пока ты строишь планы",
  "Если проблема решаема, не стоит о ней беспокоиться. Если нерешаема, беспокойство не поможет",
  "Лучше быть первым в деревне, чем последним в городе",
  "Никогда не ошибается тот, кто ничего не делает",
  "Волка ноги кормят, а лису - хвост",
  "Лучше один раз увидеть, чем сто раз услышать",
  "Семь раз отмерь, один раз отрежь",
  "На ошибках учатся, на чужих - подсматривают",
  "Не имей сто рублей, а имей сто друзей",
  "Делу время, потехе час"
];

// получение случайной фразы
function getRandomPhrase(): string {
  const randomIndex = Math.floor(Math.random() * randomPhrases.length);
  return randomPhrases[randomIndex];
}

function initInlineButtonsModule(bot: Telegraf): void {
  bot.command('test', (ctx) => {
    ctx.reply('Нажмите на кнопку для теста', Markup.inlineKeyboard([
      Markup.button.callback('Изменить сообщение', 'edit_action')
    ]));
  });

  bot.on('inline_query', async (ctx) => {
    try {
      const query = ctx.inlineQuery.query;

      if (query.includes('test') || query === '') {
        await ctx.answerInlineQuery([
          {
            type: 'article',
            id: 'test-button',
            title: 'Изменить сообщение',
            description: 'Нажмите, чтобы изменить текст сообщения на случайную фразу',
            input_message_content: {
              message_text: 'Нажмите на кнопку, чтобы увидеть случайную мудрость'
            },
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Изменить текст', callback_data: 'edit_action' }]
              ]
            }
          }
        ], {
          cache_time: 1
        });
      }
    } catch (error) {
      console.error('Ошибка inline запроса:', error);
    }
  });

  bot.action('edit_action', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const randomPhrase = getRandomPhrase();

      if (ctx.callbackQuery && 'inline_message_id' in ctx.callbackQuery) {
        const inlineMessageId = ctx.callbackQuery.inline_message_id;

        await ctx.telegram.editMessageText(
          undefined,
          undefined,
          inlineMessageId,
          `✨ Мудрость дня: ${randomPhrase}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Еще мудрость', callback_data: 'edit_action' }]
              ]
            }
          }
        );
      }
      else if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.editMessageText(`✨ Мудрость дня: ${randomPhrase}`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Еще мудрость', callback_data: 'edit_action' }]
            ]
          }
        });
      } else {
        await ctx.answerCbQuery('Ошибка: не удалось найти сообщение');
      }
    } catch (error) {
      console.error('Ошибка edit_action:', error);
      try {
        await ctx.answerCbQuery('Не удалось изменить сообщение');
      } catch { }
    }
  });
}

export const inlineButtonsModule: BotModule = {
  info,
  init: initInlineButtonsModule
}; 