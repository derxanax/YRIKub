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
    console.log(chalk.red("Could not load ASCII logo."));
  }

  console.log(chalk.blue("Starting services..."));

  await Promise.all([
    startUserBot(),
    startBotPlaceholder()
  ]).catch(error => {
    console.error(chalk.red("An error occurred during startup:"), error);
    process.exit(1);
  });

  console.log(chalk.green("All services are running."));
}

main();
