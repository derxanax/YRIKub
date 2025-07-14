import { startBotPlaceholder } from "@/bot/main";
import { startUserBot } from "@/user/main";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";

async function main() {
  try {
    const logoPath = path.join(process.cwd(), 'assets', 'txt', 'logo-sex.ascii');
    const logo = await fs.readFile(logoPath, 'utf-8');
    console.log(chalk.magentaBright(logo));
  } catch (error) {
  }

  try {
    // Запускаем боты последовательно, а не параллельно
    await startUserBot();
    await startBotPlaceholder();
  } catch (error) {
    console.error(chalk.red("Ошибка запуска:"), error);
    process.exit(1);
  }
}

main();
