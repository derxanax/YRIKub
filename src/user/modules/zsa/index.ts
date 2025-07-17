import { Module } from "@/user/types"
import bigInt from "big-integer"
import { createCanvas, loadImage } from 'canvas'
import sharp from "sharp"
import { TelegramClient } from "telegram"
import { CustomFile } from "telegram/client/uploads"
import { NewMessageEvent } from "telegram/events"
import { Api } from "telegram/tl"
import info from "./info.json"

// Полностью отключаем логирование
const log = (..._args: any[]) => { /* ZSA logging disabled */ };

// Глобальная переменная для отслеживания, был ли уже выведен лог о задержке
let floodWaitLogShown = false;

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
  // Создаем классический демотиватор с черной рамкой и текстом внизу
  const imageWidth = 800;
  const imageHeight = 600;
  const borderSize = 3;  // Тонкая белая рамка
  const frameSize = 50;  // Черная рамка вокруг изображения
  const bottomTextAreaHeight = 200;  // Увеличиваем область для текста

  const finalWidth = imageWidth + frameSize * 2;
  const finalHeight = imageHeight + frameSize + bottomTextAreaHeight;

  const canvas = createCanvas(finalWidth, finalHeight);
  const ctx = canvas.getContext('2d');

  // Черный фон для всего демотиватора
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, finalWidth, finalHeight);

  // Белая рамка вокруг основного изображения
  ctx.strokeStyle = 'white';
  ctx.lineWidth = borderSize;
  ctx.strokeRect(
    frameSize - borderSize/2, 
    frameSize - borderSize/2, 
    imageWidth + borderSize, 
    imageHeight + borderSize
  );

  // Загружаем и размещаем основное изображение по центру
  const mainImage = await loadImage(bgBuf);
  const scale = Math.min(imageWidth / mainImage.width, imageHeight / mainImage.height);
  const scaledWidth = mainImage.width * scale;
  const scaledHeight = mainImage.height * scale;
  const imgX = frameSize + (imageWidth - scaledWidth) / 2;
  const imgY = frameSize + (imageHeight - scaledHeight) / 2;
  
  // Рисуем основное изображение
  // Просто рисуем изображение без эффектов, так как CSS-фильтры не поддерживаются в типах TS
  ctx.drawImage(mainImage, imgX, imgY, scaledWidth, scaledHeight);

  // Добавляем случайные фотографии пользователей поверх основного изображения
  if (photos.length > 0) {
    const maxPhotosToShow = Math.min(photos.length, 3);
    const placedPhotos: { x: number, y: number, width: number, height: number }[] = [];
    
    for (let i = 0; i < maxPhotosToShow; i++) {
      const photo = photos[i];
      try {
        const photoImage = await loadImage(photo.buffer);
        
        // Размещаем фото в случайном месте на основном изображении, избегая наложений
        const photoSize = 120;
        
        // Используем функцию findFreeSpot для поиска места без пересечений
        const spot = findFreeSpot(photoSize, photoSize, placedPhotos, imageWidth - photoSize, imageHeight - photoSize);
        
        if (!spot) {
          // Если не удалось найти свободное место, пропускаем это фото
          continue;
        }
        
        // Добавляем фото в список размещенных
        placedPhotos.push(spot);
        
        const photoX = frameSize + spot.x;
        const photoY = frameSize + spot.y;
        
        // Добавляем рамку для фото
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(photoX, photoY, photoSize, photoSize);
        
        // Рисуем фото с эффектом
        ctx.save();
        const angle = (Math.random() * 40 - 20) * Math.PI / 180;
        ctx.translate(photoX + photoSize/2, photoY + photoSize/2);
        ctx.rotate(angle);
        
        // Просто рисуем фото без эффектов, так как CSS-фильтры не поддерживаются в типах TS
        ctx.drawImage(photoImage, -photoSize/2, -photoSize/2, photoSize, photoSize);
        ctx.restore();
      } catch (e) {
        // Тихая обработка ошибки
      }
    }
  }

  // Добавляем аватарки пользователей слева от основного изображения
  // Создаем вертикальную колонку с аватарками пользователей слева
  const avatarSize = 80;
  const avatarMargin = 10;
  let avatarColumnX = 10; // Отступ от левого края
  let avatarColumnY = frameSize + 20; // Начинаем с верхней части изображения
  
  // Собираем всех уникальных пользователей из текстов и фото
  const uniqueUserIds = new Set<string>();
  texts.forEach(t => {
    if (t.senderId) uniqueUserIds.add(t.senderId.toString());
  });
  photos.forEach(p => {
    if (p.senderId) uniqueUserIds.add(p.senderId.toString());
  });
  
  // Отображаем аватарки пользователей слева
  for (const userId of uniqueUserIds) {
    const userData = users[userId];
    if (userData && userData.avatar) {
      try {
        const avatarImage = await loadImage(userData.avatar);
        
        // Рисуем аватарку
        ctx.drawImage(avatarImage, avatarColumnX, avatarColumnY, avatarSize, avatarSize);
        
        // Добавляем белую рамку вокруг аватарки
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(avatarColumnX, avatarColumnY, avatarSize, avatarSize);
        
        // Имя пользователя под аватаркой
        const name = (userData.firstName || "??") + (userData.lastName ? ` ${userData.lastName}` : "");
        ctx.font = 'bold 12px "Arial"';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(name.substring(0, 10) + (name.length > 10 ? "..." : ""), 
                    avatarColumnX + avatarSize/2, 
                    avatarColumnY + avatarSize + 15);
        
        // Увеличиваем Y для следующей аватарки
        avatarColumnY += avatarSize + 30;
        
        // Если достигли нижней части изображения, переходим к следующему столбцу
        if (avatarColumnY > frameSize + imageHeight - avatarSize) {
          avatarColumnY = frameSize + 20;
          avatarColumnX += avatarSize + avatarMargin;
        }
      } catch (e) {
        // Тихая обработка ошибки
      }
    }
  }
  
  // Добавляем цитаты пользователей с аватарками внизу изображения
  if (texts.length > 0) {
    const maxTextsToShow = Math.min(texts.length, 2);
    const quoteBoxHeight = 80;
    const quoteBoxWidth = imageWidth - 40;
    
    for (let i = 0; i < maxTextsToShow; i++) {
      const textData = texts[i];
      const userData = users[textData.senderId.toString()];
      
      if (userData && userData.avatar) {
        try {
          const avatarImage = await loadImage(userData.avatar);
          const quoteAvatarSize = 60;
          const quoteBoxX = frameSize + 20;
          const quoteBoxY = frameSize + imageHeight - (quoteBoxHeight * (i + 1)) - 20;
          
          // Рисуем фон для цитаты
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(quoteBoxX, quoteBoxY, quoteBoxWidth, quoteBoxHeight);
          
          // Рисуем аватарку
          ctx.drawImage(avatarImage, quoteBoxX + 10, quoteBoxY + 10, quoteAvatarSize, quoteAvatarSize);
          
          // Имя пользователя
          const name = (userData.firstName || "??") + (userData.lastName ? ` ${userData.lastName}` : "");
          ctx.font = 'bold 16px "Arial"';
          ctx.fillStyle = 'white';
          ctx.textAlign = 'left';
          ctx.fillText(name, quoteBoxX + quoteAvatarSize + 20, quoteBoxY + 25);
          
          // Текст цитаты
          ctx.font = '14px "Arial"';
          ctx.fillStyle = '#cccccc';
          wrapText(ctx, `"${escape(textData.text)}"`, quoteBoxX + quoteAvatarSize + 20, quoteBoxY + 45, quoteBoxWidth - quoteAvatarSize - 30, 18);
        } catch (e) {
          // Тихая обработка ошибки
        }
      }
    }
  }

  // Добавляем текст в стиле классического демотиватора
  const bottomTextY = frameSize + imageHeight + 40;
  
  if (titleTextData) {
    // Основной текст (большой)
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px "Times New Roman"';
    wrapText(ctx, escape(titleTextData.text), finalWidth / 2, bottomTextY, finalWidth - 100, 60);

    // Добавляем аватарку автора основной цитаты
    if (titleAuthor?.avatar) {
      try {
        const avatarImg = await loadImage(titleAuthor.avatar);
        const avatarSize = 60;
        const avatarX = frameSize + 20;
        const avatarY = bottomTextY - 15;
        
        // Рисуем аватарку
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
        
        // Добавляем имя автора
        if (titleAuthor.name) {
          ctx.font = 'italic 16px "Times New Roman"';
          ctx.fillStyle = '#999999';
          ctx.textAlign = 'left';
          ctx.fillText(`— ${titleAuthor.name}`, avatarX + avatarSize + 10, avatarY + avatarSize/2);
        }
      } catch (e) {
        // Тихая обработка ошибки
      }
    }

    // Подзаголовок (мелкий текст)
    if (subtitleTextData) {
      const subtitleY = bottomTextY + 80;
      ctx.font = '28px "Times New Roman"';
      ctx.fillStyle = '#cccccc';
      ctx.textAlign = 'center';
      wrapText(ctx, escape(subtitleTextData.text), finalWidth / 2, subtitleY, finalWidth - 120, 36);
      
      // Добавляем аватарку автора подзаголовка
      const subtitleAuthorId = subtitleTextData.senderId.toString();
      const subtitleAuthor = users[subtitleAuthorId];
      
      if (subtitleAuthor?.avatar) {
        try {
          const subtitleAvatarImg = await loadImage(subtitleAuthor.avatar);
          const subtitleAvatarSize = 40; // Меньше, чем для основного автора
          const subtitleAvatarX = finalWidth - frameSize - 20 - subtitleAvatarSize;
          const subtitleAvatarY = subtitleY - 10;
          
          // Рисуем аватарку
          ctx.drawImage(subtitleAvatarImg, subtitleAvatarX, subtitleAvatarY, subtitleAvatarSize, subtitleAvatarSize);
          
          // Добавляем имя автора
          const subtitleAuthorName = (subtitleAuthor.firstName || "") + (subtitleAuthor.lastName ? ` ${subtitleAuthor.lastName}` : "");
          if (subtitleAuthorName) {
            ctx.font = 'italic 14px "Times New Roman"';
            ctx.fillStyle = '#777777';
            ctx.textAlign = 'right';
            ctx.fillText(`— ${subtitleAuthorName}`, subtitleAvatarX - 5, subtitleAvatarY + subtitleAvatarSize/2);
          }
        } catch (e) {
          // Тихая обработка ошибки
        }
      }
    }
  }

  // Добавляем случайную "водяную метку" из сообщений чата
  if (texts.length > 0) {
    // Берем случайное сообщение из чата для водяной метки
    const randomTextIndex = Math.floor(Math.random() * texts.length);
    const randomText = texts[randomTextIndex].text;
    
    // Берем короткую часть сообщения (до 20 символов)
    const shortText = randomText.length > 20 
      ? randomText.substring(0, 20) + "..." 
      : randomText;
    
    ctx.font = 'italic 14px "Arial"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.textAlign = 'right';
    ctx.fillText(shortText, finalWidth - frameSize - 10, frameSize + 20);
  }

  // Возвращаем финальное изображение
  return canvas.toBuffer("image/jpeg");
}

async function zsaHandler(client: TelegramClient, event: NewMessageEvent, args: string[]) {
  const m = event.message; if (!m.chatId) return; const lvl = parseInt(args[0] || "1");
  await m.edit({ text: "⏳" });
  try {
    // Добавляем только один лог с ошибкой в начале
    if (!floodWaitLogShown) {
      console.log(`❌ Ошибка: 500: INTERDC_2_CALL_ERROR (caused by messages.EditMessage)`);
      floodWaitLogShown = true;
    }
    
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
      console.log(`Режим 666: ${photoCount} фото, ${textCount} текстов.`);
    } else {
      // Четко определяем уровни и их параметры
      const map: Record<number, { t: number, p: number }> = { 
        1: { t: 1, p: 2 }, 
        2: { t: 3, p: 3 }, 
        3: { t: 5, p: 5 } 
      };
      
      // Проверяем, существует ли указанный уровень
      const cfg = map[lvl] || map[1];
      photoCount = cfg.p;
      textCount = cfg.t;
      console.log(`Режим ${lvl}: ${photoCount} фото, ${textCount} текстов.`);
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