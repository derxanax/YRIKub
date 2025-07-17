import fs from "fs/promises";
import path from "path";
import readline from "readline";
import { TelegramClient } from "telegram";

export async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function updateEnvSessionString(newSession: string): Promise<void> {
  const envPath = path.join(process.cwd(), ".env");
  let content = "";
  try {
    content = await fs.readFile(envPath, "utf-8");
  } catch {
    // файл отсутствует — создадим новый
  }

  const lines = content.split(/\r?\n/);
  const sessionIdx = lines.findIndex((l) => l.startsWith("SESSION_STRING="));
  if (sessionIdx !== -1) {
    lines[sessionIdx] = `SESSION_STRING=${newSession}`;
  } else {
    lines.push(`SESSION_STRING=${newSession}`);
  }

  await fs.writeFile(envPath, lines.join("\n"));
  // Session saved (log suppressed)
}

export async function interactiveLogin(client: TelegramClient): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const phoneNumber = await prompt("Введите номер телефона (+7XXXXXXXXXX): ");
      await client.start({
        phoneNumber: async () => phoneNumber,
        phoneCode: async () => {
          return await prompt("Введите код из Telegram: ");
        },
        password: async () => {
          const pwd = await prompt("Введите пароль 2FA (если не установлен, оставьте пустым): ");
          return pwd;
        },
        onError: (err) => console.error("Ошибка авторизации:", err),
      });
      return; // успех
    } catch (err) {
      console.error(`Не удалось авторизоваться (попытка ${attempt}/3):`, err);
      if (attempt === 3) throw err;
    }
  }
} 