import { Module } from "@/user/types";
import { TelegramClient } from "telegram";
import { NewMessageEvent } from "telegram/events";
import { generateRandomBigInt } from "telegram/Helpers";
import { Api } from "telegram/tl";
import info from "./info.json";

async function tsiHandler(client: TelegramClient, event: NewMessageEvent, args: string[]): Promise<void> {
  const message = event.message;

  try {
    const botUsername = process.env.BOT_USERNAME;

    if (!botUsername) {
      await message.edit({ text: "❌ Ошибка: BOT_USERNAME не указан в .env файле" });
      return;
    }

    if (!message.chatId) {
      await message.edit({ text: "❌ Ошибка: Не удалось определить ID чата" });
      return;
    }

    let bot;
    try {
      bot = await client.getInputEntity(botUsername);
    } catch (error) {
      await message.edit({ text: `❌ Ошибка: Не удалось найти бота "${botUsername}"` });
      return;
    }

    const peer = await client.getInputEntity(message.chatId);

    const results = await client.invoke(
      new Api.messages.GetInlineBotResults({
        bot: bot,
        peer: peer,
        query: "test",
        offset: "",
      })
    );

    if (!results.results || results.results.length === 0) {
      await message.edit({ text: "❌ Бот не вернул результатов" });
      return;
    }

    const resultId = results.results[0].id;
    const randomId = generateRandomBigInt();

    await client.invoke(
      new Api.messages.SendInlineBotResult({
        peer: peer,
        queryId: results.queryId,
        id: resultId,
        randomId: randomId,
        hideVia: true
      })
    );

    await client.deleteMessages(message.chatId, [message.id], { revoke: true });

  } catch (error: any) {
    console.error("TSI error:", error.message || String(error));
    try {
      let errorMessage = "❌ Ошибка";

      if (error.message) {
        errorMessage = `❌ Ошибка: ${error.message}`;
      } else if (error.errorMessage) {
        errorMessage = `❌ Ошибка API: ${error.errorMessage}`;
      }

      await message.edit({ text: errorMessage });
    } catch (editError) {
      console.error("Failed to edit message with error");
    }
  }
}

export const tsiModule: Module = {
  info: info,
  handler: tsiHandler,
  commands: ["tsi"],
}; 