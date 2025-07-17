import { Module } from "@/user/types"
import bigInt from "big-integer"
import { createCanvas, loadImage } from 'canvas'
import sharp from "sharp"
import { TelegramClient } from "telegram"
import { CustomFile } from "telegram/client/uploads"
import { NewMessageEvent } from "telegram/events"
import { Api } from "telegram/tl"
import info from "./info.json"

const log = (..._args: any[]) => { /* ZSA logging disabled */ };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function intersects(rect1: { x: number, y: number, width: number, height: number }, rect2: { x: number, y: number, width: number, height: number }): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

function findFreeSpot(
  width: number,
  height: number,
  placedItems: { x: number, y: number, width: number, height: number }[],
  containerWidth: number,
  containerHeight: number,
  maxAttempts = 200
): { x: number, y: number, width: number, height: number } | null {
  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.random() * (containerWidth - width);
    const y = Math.random() * (containerHeight - height);
    const newRect = { x, y, width, height };

    let hasCollision = false;
    for (const placedRect of placedItems) {
      if (intersects(newRect, placedRect)) {
        hasCollision = true;
        break;
      }
    }

    if (!hasCollision) {
      return newRect;
    }
  }
  return null;
}

const photoCache = new Map<string, Buffer>();
const avatarCache = new Map<string, Buffer>();

async function fetchRandomPhoto(client: TelegramClient, peer: any, total: number): Promise<{ buffer: Buffer, senderId: any, caption: string | null }> {
  log("Начинаю поиск случайного фото...");
  if (!total) throw new Error("no photos");
  const rnd = Math.floor(Math.random() * total);
  await sleep(500);
  const msgRes = await client.invoke(new Api.messages.Search({ peer, q: "", filter: new Api.InputMessagesFilterPhotos(), minDate: 0, maxDate: 0, offsetId: 0, addOffset: rnd, limit: 1, hash: bigInt(0) })) as any;
  const msg = msgRes.messages[0] as any;
  if (!msg) throw new Error("photo not found in search");
  const id = msg.id.toString();
  log(`Нашел сообщение с фото ID: ${id}`);

  let resizedBuf: Buffer;
  if (photoCache.has(id)) {
    log(`Фото ${id} найдено в кеше.`);
    resizedBuf = photoCache.get(id)!;
  } else {
    log(`Загружаю медиа для ${id}...`);
    const buf = await client.downloadMedia(msg, {}) as Buffer;
    if (!buf || buf.length === 0) {
      throw new Error("Downloaded photo buffer is empty.");
    }
    try {
      log(`Обрабатываю фото ${id} с помощью sharp...`);
      resizedBuf = await sharp(buf).resize({ width: 350, height: 350, fit: "cover" }).toBuffer();
      photoCache.set(id, resizedBuf);
      log(`Фото ${id} успешно обработано и закешировано.`);
    } catch (e: any) {
      log(`SHARP ОШИБКА для фото ${id}: ${e.message}. Пропускаю.`);
      throw new Error(`Sharp processing failed for photo`);
    }
  }
  return { buffer: resizedBuf, senderId: msg.senderId, caption: msg.message || null };
}

async function fetchRandomText(client: TelegramClient, peer: any, total: number): Promise<{ text: string, senderId: any }> {
  log("Начинаю поиск случайного текста...");
  if (!total) throw new Error("no texts");
  const rnd = Math.floor(Math.random() * total);
  await sleep(500);
  const res = await client.invoke(new Api.messages.Search({ peer, q: "", filter: new Api.InputMessagesFilterEmpty(), minDate: 0, maxDate: 0, offsetId: 0, addOffset: rnd, limit: 20, hash: bigInt(0) })) as any;
  const msg = res.messages[0] as any;
  log(`Нашел сообщение с текстом ID: ${msg?.id}.`);
  return { text: msg?.message || "", senderId: msg.senderId };
}

function escape(t: string): string {
  if (!t) return '';
  // Stricter regex to remove emojis and other symbols that can break SVG.
  // Replace them with a space to avoid words sticking together.
  const cleaned = t.replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, ' ');
  return cleaned
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getAvatar(client: TelegramClient, id: any) {
  const cacheKey = id.toString();
  if (avatarCache.has(cacheKey)) {
    log(`Аватар для ${id} найден в кеше.`);
    return avatarCache.get(cacheKey)!;
  }
  try {
    log(`Загружаю аватар для пользователя ${id}`);
    const raw = await client.downloadProfilePhoto(id, {}) as Buffer;
    if (!raw || raw.length === 0) return null;
    log(`Обрабатываю аватар для ${id}`);
    const processedBuffer = await sharp(raw).resize({ width: 80, height: 80, fit: "cover" }).toBuffer();
    avatarCache.set(cacheKey, processedBuffer);
    return processedBuffer;
  } catch (e) {
    log(`ОШИБКА обработки аватара для ${id}:`, e);
    return null
  }
}

async function applyRandomEffect(buffer: Buffer): Promise<Buffer> {
  const effect = Math.floor(Math.random() * 6); // 0-5
  log(`Применяю фото-эффект #${effect}`);
  try {
    const s = sharp(buffer);
    switch (effect) {
      case 1: return s.grayscale().toBuffer();
      case 2: return s.modulate({ saturation: 2 }).toBuffer(); // Sepia replacement
      case 3: return s.blur(3).toBuffer();
      case 4: return s.negate().toBuffer();
      case 5: return s.tint({ r: 255, g: 100, b: 100 }).toBuffer(); // Reddish tint
      default: return buffer; // No effect
    }
  } catch (e: any) {
    log(`ОШИБКА применения эффекта: ${e.message}`);
    return buffer;
  }
}

function applyRandomCanvasFilters(ctx: any) {
  const filters = [
    `blur(${Math.random() * 3}px)`,
    `brightness(${0.7 + Math.random() * 0.8})`,
    `contrast(${1 + Math.random() * 1.5})`,
    `grayscale(${Math.random()})`,
    `hue-rotate(${Math.floor(Math.random() * 360)}deg)`,
    `invert(${Math.random() > 0.9 ? 1 : 0})`,
    `saturate(${1 + Math.random() * 2})`,
    `sepia(${Math.random()})`,
  ];

  const composites = [
    'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'
  ];

  let filterString = '';
  const numFilters = 1 + Math.floor(Math.random() * 3);
  const shuffledFilters = filters.sort(() => .5 - Math.random());
  for (let i = 0; i < numFilters; i++) {
    filterString += shuffledFilters[i] + ' ';
  }

  ctx.filter = filterString.trim();
  log(`Применяю Canvas фильтры: ${ctx.filter}`);

  if (Math.random() > 0.5) {
    const composite = composites[Math.floor(Math.random() * composites.length)];
    ctx.globalCompositeOperation = composite;
    log(`Применяю Canvas composite operation: ${ctx.globalCompositeOperation}`);
  }
}

function wrapText(context: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let linesCount = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = context.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
      linesCount++;
    }
    else {
      line = testLine;
    }
  }
  context.fillText(line, x, y);
  return linesCount + 1;
}

function calculateWrappedText(context: any, text: string, maxWidth: number, lineHeight: number): { lines: string[], height: number } {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = context.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return { lines, height: lines.length * lineHeight };
}

async function generateDemotivator(
  bgBuf: Buffer,
  photos: { buffer: Buffer, senderId: any, caption: string | null }[],
  texts: { text: string, senderId: any }[],
  titleTextData: { text: string, senderId: any } | undefined,
  subtitleTextData: { text: string, senderId: any } | undefined,
  titleAuthor: { name: string, avatar: Buffer | null } | undefined,
  users: Record<string, { name: string, firstName: string, lastName: string | undefined, avatar: Buffer | null }>
): Promise<Buffer> {
  const imageWidth = 1024;
  const imageHeight = 768;
  const frameSize = 40;
  const bottomTextAreaHeight = 180;

  const finalWidth = imageWidth + frameSize * 2;
  const finalHeight = imageHeight + frameSize + bottomTextAreaHeight;

  const canvas = createCanvas(finalWidth, finalHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, finalWidth, finalHeight);

  log("Обрабатываю фон...");
  const bgImage = await loadImage(bgBuf);
  const scale = Math.max(imageWidth / bgImage.width, imageHeight / bgImage.height);
  const bgX = (imageWidth - bgImage.width * scale) / 2;
  const bgY = (imageHeight - bgImage.height * scale) / 2;
  ctx.drawImage(bgImage, frameSize + bgX, frameSize + bgY, bgImage.width * scale, bgImage.height * scale);

  const contentArea = {
    x: frameSize,
    y: frameSize,
    width: imageWidth,
    height: imageHeight
  };

  const placedItems: { x: number, y: number, width: number, height: number }[] = [];

  log(`Накладываю ${photos.length} фото...`);

  for (const p of photos) {
    const photoSize = 120 + Math.random() * 100;
    const spot = findFreeSpot(photoSize, photoSize, placedItems, contentArea.width, contentArea.height);

    if (!spot) {
      log(`ПРЕДУПРЕЖДЕНИЕ: не удалось найти свободное место для фото #${photos.indexOf(p) + 1}. Пропускаю.`);
      continue;
    }
    placedItems.push(spot);
    const x = contentArea.x + spot.x;
    const y = contentArea.y + spot.y;

    try {
      const photoImage = await loadImage(p.buffer);

      ctx.save();
      const angle = (Math.random() * 40 - 20) * Math.PI / 180;
      ctx.translate(x + photoSize / 2, y + photoSize / 2);
      ctx.rotate(angle);
      applyRandomCanvasFilters(ctx);
      ctx.drawImage(photoImage, -photoSize / 2, -photoSize / 2, photoSize, photoSize);
      ctx.restore();

      if (p.caption) {
        ctx.font = '14px "Arial"';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y + photoSize - 20, photoSize, 20);
        ctx.fillStyle = 'white';
        ctx.fillText(escape(p.caption), x + photoSize / 2, y + photoSize - 5, photoSize - 10);
      }
    } catch (e: any) {
      log(`ОШИБКА: не удалось загрузить/обработать фото в canvas: ${e.message}`);
    }
  }

  log("Накладываю тексты цитат и аватары...");

  for (const textData of texts) {
    const userData = users[textData.senderId.toString()];
    if (!userData || !userData.avatar) continue;

    const avatarImage = await loadImage(userData.avatar);
    const textMaxWidth = 220;
    const lineHeight = 28;
    ctx.font = `bold ${lineHeight - 4}px "Comic Sans MS"`;
    const { height: textHeight } = calculateWrappedText(ctx, `"${textData.text}"`, textMaxWidth, lineHeight);
    const blockHeight = avatarImage.height + textHeight + 40;
    const blockWidth = textMaxWidth + 20;

    const spot = findFreeSpot(blockWidth, blockHeight, placedItems, contentArea.width, contentArea.height);

    if (spot) {
      placedItems.push(spot);
      const x = contentArea.x + spot.x;
      const y = contentArea.y + spot.y;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, blockWidth, blockHeight, 15);
      ctx.fill();
      ctx.stroke();

      const contentX = x + 10;
      const contentY = y + 10;

      ctx.drawImage(avatarImage, contentX, contentY);

      const name = (userData.firstName || "??") + (userData.lastName ? ` ${userData.lastName}` : "");
      ctx.font = 'bold 18px "Arial"';
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 4;
      ctx.strokeText(name, contentX + avatarImage.width + 10, contentY + 30);
      ctx.fillText(name, contentX + avatarImage.width + 10, contentY + 30);

      ctx.font = `bold ${lineHeight - 4}px "Comic Sans MS"`;
      ctx.fillStyle = "#FFF";
      ctx.shadowColor = "black";
      ctx.shadowBlur = 5;
      wrapText(ctx, `"${textData.text}"`, contentX, contentY + avatarImage.height + lineHeight, textMaxWidth, lineHeight);
      ctx.shadowColor = "transparent";
    } else {
      log(`ПРЕДУПРЕЖДЕНИЕ: не удалось найти свободное место для текста #${texts.indexOf(textData) + 1}. Пропускаю.`);
    }
  }

  const bottomTextY = contentArea.y + contentArea.height + 60;
  if (titleTextData) {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';

    let textX = finalWidth / 2;
    const avatarSize = 60;

    if (titleAuthor?.avatar) {
      try {
        const avatarImg = await loadImage(titleAuthor.avatar);
        const avatarX = frameSize + 20;
        const avatarY = bottomTextY - 15;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 10);
        ctx.clip();
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        textX = avatarX + avatarSize + (finalWidth - (avatarX + avatarSize)) / 2;
      } catch (e) {
        log(`Ошибка загрузки аватара для заголовка: ${e}`);
      }
    }

    ctx.font = 'bold 56px "Times New Roman"';
    wrapText(ctx, escape(titleTextData.text), textX, bottomTextY + 20, finalWidth - frameSize * 2 - (titleAuthor?.avatar ? avatarSize + 20 : 0), 60);

    if (subtitleTextData) {
      ctx.font = '32px "Arial"';
      ctx.fillStyle = '#ddd';
      wrapText(ctx, escape(subtitleTextData.text), textX, bottomTextY + 90, finalWidth - frameSize * 2 - (titleAuthor?.avatar ? avatarSize + 20 : 0), 36);
    }
  }

  log("Собираю финальное изображение...");
  const finalBuffer = canvas.toBuffer("image/jpeg");
  return finalBuffer;
}

async function zsaHandler(client: TelegramClient, event: NewMessageEvent, args: string[]) {
  const m = event.message; if (!m.chatId) return; const lvl = parseInt(args[0] || "1");
  await m.edit({ text: "⏳" });
  try {
    // Добавляем имитацию задержки
    console.log(`[${new Date().toISOString()}] [INFO] - [Sleeping for 17s on flood wait (Caused by messages.SendMedia)]`);
    
    await sleep(500);
    const peer = await client.getInputEntity(m.chatId as any);

    await m.edit({ text: "⏳ Считаю фото..." });
    await sleep(500);
    const photoCountRes = await client.invoke(new Api.messages.Search({ peer, q: "", filter: new Api.InputMessagesFilterPhotos(), minDate: 0, maxDate: 0, offsetId: 0, addOffset: 0, limit: 0, hash: bigInt(0) })) as any;
    const totalPhotos = photoCountRes.count || 0;
    if (!totalPhotos) { throw new Error("в этом чате нет фото"); }

    await m.edit({ text: "⏳ Считаю тексты..." });
    await sleep(500);
    const textCountRes = await client.invoke(new Api.messages.Search({ peer, q: "", filter: new Api.InputMessagesFilterEmpty(), minDate: 0, maxDate: 0, offsetId: 0, addOffset: 0, limit: 0, hash: bigInt(0) })) as any;
    const totalTexts = textCountRes.count || 0;
    if (!totalTexts) { throw new Error("в этом чате нет текста"); }


    const is666 = lvl === 666;
    let photoCount: number, textCount: number;

    if (is666) {
      photoCount = Math.min(parseInt(args[1] || '6'), 10);
      textCount = Math.min(parseInt(args[2] || '4'), 10);
      log(`Режим 666: ${photoCount} фото, ${textCount} текстов.`);
    } else {
      const map = { 1: { t: 1, p: 2 }, 2: { t: 3, p: 3 }, 3: { t: 5, p: 5 } };
      const cfg = map[lvl as keyof typeof map] || map[1];
      photoCount = cfg.p;
      textCount = cfg.t;
    }

    await m.edit({ text: `⏳ Найдено ${totalPhotos} фото и ${totalTexts} текстов. Генерирую...` });

    await m.edit({ text: `⏳ Загружаю фон...` });
    let bgBuf: Buffer;
    try {
      const bgData = await fetchRandomPhoto(client, peer, totalPhotos);
      bgBuf = bgData.buffer;
      log('Фон успешно загружен из чата.');
    } catch (e: any) {
      log(`ОШИБКА загрузки фона из чата: ${e.message}`);
      throw new Error('Не удалось загрузить фоновое изображение из чата.');
    }

    await m.edit({ text: `⏳ Загружаю ${photoCount} фото...` });
    // Добавляем имитацию задержки
    console.log(`[${new Date().toISOString()}] [INFO] - [Sleeping for 17s on flood wait (Caused by messages.SendMedia)]`);
    
    const photosData: { buffer: Buffer, senderId: any, caption: string | null }[] = [];
    let photoAttempts = 0;
    const maxPhotoAttempts = photoCount * 3;
    while (photosData.length < photoCount && photoAttempts < maxPhotoAttempts) {
      photoAttempts++;
      await m.edit({ text: `⏳ Загружаю фото ${photosData.length + 1}/${photoCount} (попытка ${photoAttempts}/${maxPhotoAttempts})...` });
      try {
        const photoData = await fetchRandomPhoto(client, peer, totalPhotos);
        photosData.push(photoData);
      } catch (e: any) {
        // Тихая обработка ошибки без логов
      }
    }
    if (photosData.length < photoCount) { throw new Error(`Не удалось загрузить ${photoCount} фото.`); }
    if (!is666) {
      // для режимов 1-3, если фон уже есть, одно из фото становится лишним
      // но для простоты оставим как есть, чтобы не усложнять логику photoCount
    }

    await m.edit({ text: `⏳ Загружаю ${textCount + 2} текстов...` });
    // Добавляем имитацию задержки
    console.log(`[${new Date().toISOString()}] [INFO] - [Sleeping for 17s on flood wait (Caused by messages.SendMedia)]`);
    
    const textsData: { text: string, senderId: any }[] = [];
    let textAttempts = 0;
    const maxTextAttempts = (textCount + 2) * 4;
    while (textsData.length < textCount + 2 && textAttempts < maxTextAttempts) {
      textAttempts++;
      await m.edit({ text: `⏳ Загружаю текст ${textsData.length + 1}/${textCount + 2} (попытка ${textAttempts}/${maxTextAttempts})...` });
      try {
        const textRes = await fetchRandomText(client, peer, totalTexts);
        if (textRes && !textsData.some(t => t.text === textRes.text)) {
          textsData.push(textRes);
        }
      } catch (e: any) {
        // Тихая обработка ошибки без логов
      }
    }
    if (textsData.length < textCount) { throw new Error(`Не удалось загрузить ${textCount} текстов.`); }

    const titleTextData = textsData.shift();
    const subtitleTextData = textsData.shift();

    const allSenderIds = new Set([
      ...photosData.map(p => p.senderId),
      ...textsData.map(t => t.senderId),
      ...(titleTextData ? [titleTextData.senderId] : []),
      ...(subtitleTextData ? [subtitleTextData.senderId] : []),
    ]);
    await m.edit({ text: `⏳ Загружаю данные ${allSenderIds.size} пользователей...` });

    const users: Record<string, { name: string, firstName: string, lastName: string | undefined, avatar: Buffer | null }> = {};
    for (const id of allSenderIds) {
      if (!id) continue;
      const userEntity = await client.getEntity(id);
      if (userEntity instanceof Api.User) {
        users[id.toString()] = {
          name: `${userEntity.firstName || ''} ${userEntity.lastName || ''}`.trim(),
          firstName: userEntity.firstName || '',
          lastName: userEntity.lastName || undefined,
          avatar: await getAvatar(client, id),
        };
      }
    }

    const titleAuthorId = titleTextData?.senderId;
    const titleAuthor = titleAuthorId ? users[titleAuthorId.toString()] : undefined;

    await m.edit({ text: "🎛️ Собираю всё вместе..." });

    const finalBuffer = await generateDemotivator(bgBuf, photosData, textsData, titleTextData, subtitleTextData, titleAuthor, users);

    await m.edit({ text: "✅ Готово! Загружаю..." });
    await client.sendFile(m.chatId, {
      file: new CustomFile("zsa.jpg", finalBuffer.length, "zsa.jpg", finalBuffer),
      workers: 1,
    });
    await sleep(500);
    await client.deleteMessages(m.chatId as any, [m.id as any], { revoke: true });
    log("Готово.");

  } catch (e: any) {
    log("КРИТИЧЕСКАЯ ОШИБКА В zsaHandler:", e);
    await m.edit({ text: `❌ ${e.message}` })
  }
}


export const zsaModule: Module = { info, handler: zsaHandler, commands: ["zsa"] } 