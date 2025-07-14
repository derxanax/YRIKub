import { Module } from "@/user/types";
import fs from "fs";
import path from "path";
import ping from "ping";
import si from "systeminformation";
import { TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { NewMessageEvent } from "telegram/events";
import info from "./info.json";

async function menuHandler(client: TelegramClient, event: NewMessageEvent): Promise<void> {
  const message = event.message;

  try {
    const cpu = await si.cpu();
    const mem = await si.mem();
    const gfx = await si.graphics();
    const os = await si.osInfo();

    const tgPingRes = await ping.promise.probe('149.154.167.91', { timeout: 2 });
    const googlePingRes = await ping.promise.probe('8.8.8.8', { timeout: 2 });
    const tgPing = tgPingRes.alive ? `${Math.round(parseFloat(tgPingRes.avg))}ms` : 'недоступен';
    const googlePing = googlePingRes.alive ? `${Math.round(parseFloat(googlePingRes.avg))}ms` : 'недоступен';

    const me = (await client.getMe()) as any;
    const myFirstName = me.firstName || "Не указано";

    const logoPath = path.join(process.cwd(), 'assets', 'img', 'logo.png');

    const responseText = [
      `╭───﹝ YRIKub ﹞───`,
      `│`,
      `├─﹝ Пользователь ﹞`,
      `│  👤 Имя: ${myFirstName}`,
      `│`,
      `├─﹝ 🛰️ Пинг ﹞`,
      `│  ✈️ Telegram: ${tgPing}`,
      `│  🌍 Google: ${googlePing}`,
      `│`,
      `├─﹝ 💻 Система ﹞`,
      `│  🖥️ ОС: ${os.distro} (${os.release})`,
      `│  ⚙️ CPU: ${cpu.manufacturer} ${cpu.brand} @ ${cpu.speed}GHz`,
      `│  💾 RAM: Использовано ${(mem.used / 1024 / 1024 / 1024).toFixed(2)}GB из ${(mem.total / 1024 / 1024 / 1024).toFixed(2)}GB`,
      `│  🎨 GPU: ${gfx.controllers.map(c => `${c.vendor} ${c.model}`).join('\n') || "Не найдено"}`,
      `│`,
      `╰───﹝ @derxanax ﹞───`
    ].join('\n');

    // Создаем CustomFile из файла на диске
    const fileBuffer = fs.readFileSync(logoPath);
    const customFile = new CustomFile("logo.png", fileBuffer.length, "", fileBuffer);

    // Загружаем файл для отправки
    const inputFile = await client.uploadFile({
      file: customFile,
      workers: 1
    });

    // Используем sendMessage с файлом вместо editMessage
    await client.sendMessage(message.chatId!, {
      file: inputFile,
      message: responseText,
      replyTo: message.id
    });

    // Удаляем исходное сообщение после отправки нового
    await client.deleteMessages(message.chatId!, [message.id], { revoke: true });

  } catch (e: any) {
    try {
      await message.edit({ text: `❌ Ошибка: ${e.message || String(e)}` });
    } catch { }
  }
}

export const menuModule: Module = {
  info: info,
  handler: menuHandler,
  commands: ["menu"],
}; 