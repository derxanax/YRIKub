import { Module } from "@/user/types";
import axios from "axios";
import { TelegramClient } from "telegram";
import { NewMessageEvent } from "telegram/events";
import info from "./info.json";

const API_URL = "https://r34-sex.loca.lt/api/images";
const API_TOKEN = "fucl86me98and987cum2me";

async function r34Handler(client: TelegramClient, event: NewMessageEvent, args: string[]): Promise<void> {
  const message = event.message;

  if (args.length === 0) {
    await message.edit({ text: "❌ Укажите тег для поиска." });
    return;
  }

  const tag = args.join(" ");
  const requestUrl = `${API_URL}?tag=${encodeURIComponent(tag)}&count=20&token=${API_TOKEN}`;

  await message.edit({ text: `🔎 Ищу по тегу: \`${tag}\`...` });

  try {
    const response = await axios.get(requestUrl);
    const images = response.data;

    if (!images || images.length === 0) {
      await message.edit({ text: `🙁 По тегу \`${tag}\` ничего не найдено.` });
      return;
    }

    const randomImage = images[Math.floor(Math.random() * images.length)];
    const imageUrl = randomImage.fileUrl;

    if (!imageUrl) {
      await message.edit({ text: "❌ Ошибка: не удалось получить URL изображения." });
      return;
    }

    // Удаляем сообщение с командой
    await client.deleteMessages(message.chatId!, [message.id], { revoke: true });

    // Отправляем найденное изображение
    await client.sendFile(message.chatId!, {
      file: imageUrl,
      caption: `**Тег:** \`${tag}\`\n**ID:** \`${randomImage.id}\``,
      parseMode: 'markdown'
    });

  } catch (error: any) {
    let errorMessage = "❌ Произошла неизвестная ошибка.";
    if (error.response) {
      if (error.response.status === 403) {
        errorMessage = "❌ Ошибка: неверный токен API.";
      } else if (error.response.status === 404) {
        errorMessage = `🙁 По тегу \`${tag}\` ничего не найдено.`;
      } else {
        errorMessage = `❌ Ошибка API: ${error.response.statusText} (${error.response.status})`;
      }
    } else if (error.request) {
      errorMessage = "❌ Ошибка: не удалось подключиться к API.";
    }

    await message.edit({ text: errorMessage });
  }
}

export const r34Module: Module = {
  info: info,
  handler: r34Handler,
  commands: ["r34"],
}; 