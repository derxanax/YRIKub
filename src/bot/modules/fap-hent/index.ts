import { BotModule } from "@/bot/types";
import { Telegraf, Markup } from "telegraf";
import axios from "axios";
import info from "./info.json";

interface ImageInfo {
  id: number;
  fileUrl: string;
  previewUrl: string;
}

interface ViewerSession {
  tag: string;
  images: ImageInfo[];
  currentIndex: number;
  chatId: number;
  messageId?: number;
}

const API_URL = "https://r34-sex.loca.lt/api/images";
const API_TOKEN = "fucl86me98and987cum2me";
const IMAGES_PER_FETCH = 20;

// Храним состояние включения модуля для каждого пользователя
const userEnabled: Map<number, boolean> = new Map();
// Активные сессии просмотра изображений
const sessions: Map<string, ViewerSession> = new Map();

function generateSessionId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
  );
}

async function fetchImages(
  tag: string,
  count: number = IMAGES_PER_FETCH,
  skip: number = 0
): Promise<ImageInfo[]> {
  const url = `${API_URL}?tag=${encodeURIComponent(tag)}&count=${count}&skip=${skip}`;
  const { data } = await axios.get(url, {
    headers: {
      "X-API-Token": API_TOKEN,
    },
  });
  return data;
}

function createKeyboard(sessionId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("⬅️", `fh:${sessionId}:prev`),
      Markup.button.callback("➡️", `fh:${sessionId}:next`),
    ],
    [Markup.button.callback("❌ Закрыть", `fh:${sessionId}:close`)],
  ]);
}

async function sendViewerMessage(
  ctx: any,
  sessionId: string,
  session: ViewerSession
) {
  const current = session.images[session.currentIndex];
  if (!current) return;

  const caption = `🍑 Тег: ${session.tag}\nКадр ${
    session.currentIndex + 1
  } / ${session.images.length} — наслаждайся 😏`;

  if (session.messageId) {
    try {
      await ctx.telegram.editMessageMedia(
        session.chatId,
        session.messageId,
        undefined,
        { type: "photo", media: current.fileUrl },
        { reply_markup: createKeyboard(sessionId).reply_markup }
      );
      await ctx.telegram.editMessageCaption(
        session.chatId,
        session.messageId,
        undefined,
        caption,
        { reply_markup: createKeyboard(sessionId).reply_markup }
      );
    } catch (err) {
      console.error("Не удалось обновить изображение:", err);
    }
  } else {
    const msg = await ctx.replyWithPhoto(current.fileUrl, {
      caption,
      reply_markup: createKeyboard(sessionId).reply_markup,
    });
    session.messageId = msg.message_id;
  }
}

function initFapHentModule(bot: Telegraf): void {
  // Основная команда управления
  bot.command("fap_hent", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const args = ctx.message.text.split(/\s+/).slice(1);
    const subCmd = args[0]?.toLowerCase();

    if (subCmd === "on") {
      userEnabled.set(userId, true);
      await ctx.reply(
        "😈 Порнорежим врублен! Шли тег — подгоню горячий контент для твоего фап-сеанса 🤤"
      );
      return;
    }

    if (subCmd === "off") {
      userEnabled.delete(userId);
      await ctx.reply("👍 Хватит дрочить, режим выключен. Отдохни, чемпион! 🍆💦");
      return;
    }

    await ctx.reply(
      "Использование: /fap_hent on | off\nПосле включения отправьте сообщение с нужным тегом для поиска."
    );
  });

  // Обработка текстовых сообщений как тегов, когда режим включён
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    if (!userEnabled.get(userId)) return; // режим не включён

    const tag = ctx.message.text.trim();
    if (!tag) return;

    await ctx.reply(`🔍 Достаю порево по тегу: "${tag}"… Подожди, ща будет жара 🔥`);

    try {
      const images = await fetchImages(tag);
      if (!images.length) {
        await ctx.reply(`🙁 Чёрт, по тегу "${tag}" ничего не нашёл. Воображение в помощь!`);
        return;
      }

      const sessionId = generateSessionId();
      const session: ViewerSession = {
        tag,
        images,
        currentIndex: 0,
        chatId: ctx.chat.id,
      };
      sessions.set(sessionId, session);
      await sendViewerMessage(ctx, sessionId, session);
    } catch (err) {
      console.error(err);
      await ctx.reply("❌ Ёпта, сервер капризничает. Попробуй позже.");
    }
  });

  // Обработка inline-кнопок навигации
  bot.action(/^fh:(.+):(prev|next|close)$/, async (ctx) => {
    const [, sessionId, action] = ctx.match as unknown as string[];
    const session = sessions.get(sessionId);
    if (!session) {
      await ctx.answerCbQuery("Сессия устарела.");
      return;
    }

    if (action === "close") {
      sessions.delete(sessionId);
      try {
        if (ctx.callbackQuery.message) {
          await ctx.deleteMessage();
        }
      } catch (e) {
        // Игнорируем, если сообщение уже удалено
      }
      await ctx.answerCbQuery();
      return;
    }

    if (action === "prev" && session.currentIndex > 0) {
      session.currentIndex -= 1;
    } else if (action === "next") {
      session.currentIndex += 1;

      // Каждые 10 просмотренных слайдов подгружаем ещё 20, пропуская уже выданные
      if (session.currentIndex % 10 === 0) {
        try {
          const more = await fetchImages(
            session.tag,
            IMAGES_PER_FETCH,
            session.images.length
          );
          session.images.push(...more);
        } catch (e) {
          console.error("Не удалось получить дополнительные изображения:", e);
        }
      }
    }

    await sendViewerMessage(ctx, sessionId, session);
    await ctx.answerCbQuery();
  });
}

export const fapHentModule: BotModule = {
  info,
  init: initFapHentModule,
}; 