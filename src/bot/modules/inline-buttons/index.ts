import { BotModule } from '@/bot/types';
import { Markup, Telegraf } from 'telegraf';
import info from './info.json';

const randomPhrases = [
  "женя хуесос",
  "женя пидоор "
]
const negativeResponses = [
  "Не трогай блять, не твоё! женя хуесос",
  "Куда лезешь, а? Иди нахуй! женя пижорас",
  "женя пидорас, руки убрал от кнопки, это не для тебя!"
];
const SPECIAL_USER_ID = 1256738876;
const IMAGE_URL = "https://cdn.rule34.gg/preview/53b5d77899fa7e6216b86000b4c23cf0.jpeg";

function getRandomPhrase(): string {
  const randomIndex = Math.floor(Math.random() * randomPhrases.length);
  return randomPhrases[randomIndex];
}

function getRandomNegativeResponse(): string {
  const randomIndex = Math.floor(Math.random() * negativeResponses.length);
  return negativeResponses[randomIndex];
}

function initInlineButtonsModule(bot: Telegraf): void {
  const OWNER_ID = parseInt((info as any)['id-admin'] || "0");

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
      const userId = ctx.from?.id;
      const isOwner = OWNER_ID !== 0 && userId === OWNER_ID;

      if (userId === SPECIAL_USER_ID) {
        await ctx.answerCbQuery('Лови картинку 😉');

        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
          try {
            await ctx.deleteMessage();
          } catch (error) {
            console.error('Не удалось удалить сообщение:', error);
          }

          await ctx.replyWithPhoto(IMAGE_URL);
        } else if (ctx.callbackQuery && 'inline_message_id' in ctx.callbackQuery) {
          await ctx.telegram.editMessageMedia(
            undefined,
            undefined,
            ctx.callbackQuery.inline_message_id,
            { type: 'photo', media: IMAGE_URL }
          );
        }

        return;
      }

      if (!isOwner) {
        await ctx.answerCbQuery(getRandomNegativeResponse(), { show_alert: true });

        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
          try {
            await ctx.deleteMessage();
          } catch (error) {
            console.error('Не удалось удалить сообщение:', error);
          }
        }
        return;
      }

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