import { Module } from "@/user/types"
import bigInt from "big-integer"
import { createCanvas, loadImage } from 'canvas'
import sharp from "sharp"
import { TelegramClient } from "telegram"
import { CustomFile } from "telegram/client/uploads"
import { NewMessageEvent } from "telegram/events"
import { Api } from "telegram/tl"
import * as fs from 'fs'
import * as path from 'path'
import info from "./info.json"

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Кеш для фотографий
const photoCache = new Map<string, Buffer>();

// Функция для получения случайного фото из чата
async function fetchRandomPhoto(client: TelegramClient, peer: any, total: number): Promise<Buffer> {
  if (!total) throw new Error("no photos");
  const rnd = Math.floor(Math.random() * total);
  await sleep(500);
  
  const msgRes = await client.invoke(new Api.messages.Search({ 
    peer, 
    q: "", 
    filter: new Api.InputMessagesFilterPhotos(), 
    minDate: 0, 
    maxDate: 0, 
    offsetId: 0, 
    addOffset: rnd, 
    limit: 1, 
    hash: bigInt(0) 
  })) as any;
  
  const msg = msgRes.messages[0] as any;
  if (!msg) throw new Error("photo not found in search");
  
  const id = msg.id.toString();
  
  // Проверяем кеш
  if (photoCache.has(id)) {
    return photoCache.get(id)!;
  }
  
  // Загружаем и обрабатываем фото
  const buf = await client.downloadMedia(msg, {}) as Buffer;
  if (!buf || buf.length === 0) {
    throw new Error("Downloaded photo buffer is empty.");
  }
  
  // Изменяем размер до квадрата 300x300 для мема
  const resizedBuf = await sharp(buf)
    .resize({ width: 300, height: 300, fit: "cover" })
    .toBuffer();
  
  photoCache.set(id, resizedBuf);
  return resizedBuf;
}

// Функция для получения случайного текста из чата
async function fetchRandomText(client: TelegramClient, peer: any, total: number): Promise<string> {
  if (!total) throw new Error("no texts");
  const rnd = Math.floor(Math.random() * total);
  await sleep(500);
  
  const msgRes = await client.invoke(new Api.messages.Search({ 
    peer, 
    q: "", 
    filter: new Api.InputMessagesFilterEmpty(), 
    minDate: 0, 
    maxDate: 0, 
    offsetId: 0, 
    addOffset: rnd, 
    limit: 1, 
    hash: bigInt(0) 
  })) as any;
  
  const msg = msgRes.messages[0] as any;
  if (!msg || !msg.message) throw new Error("text not found in search");
  
  return msg.message;
}

// Функция для создания мема
// Поддерживает три шаблона: meme1.jpeg, meme2.jpeg и meme3.jpg
async function generateMeme(photo1: Buffer, photo2: Buffer, templatePath: string, text1?: string, text2?: string, texts?: string[], mode?: string, allPhotos?: Buffer[]): Promise<Buffer> {
  // Загружаем шаблон мема
  const templateBuffer = fs.readFileSync(templatePath);
  const template = await loadImage(templateBuffer);
  
  // Создаем canvas размером с шаблон
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext('2d');
  
  // Рисуем шаблон как фон
  ctx.drawImage(template, 0, 0);
  
  // Загружаем фотографии
  const img1 = await loadImage(photo1);
  const img2 = await loadImage(photo2);
  
  // Определяем, какой шаблон используется
  const templateName = path.basename(templatePath);
  
  if (templateName === 'meme1.jpeg') {
    // Координаты для шаблона meme1.jpeg (960x960)
    // Верхняя часть (счастливое лицо)
    const topPhotoX = 500;
    const topPhotoY = 50;
    const topPhotoWidth = 400;
    const topPhotoHeight = 350;
    
    // Нижняя часть (череп)
    const bottomPhotoX = 500;
    const bottomPhotoY = 500;
    const bottomPhotoWidth = 400;
    const bottomPhotoHeight = 350;
    
    // Рисуем фотографии
    ctx.drawImage(img1, topPhotoX, topPhotoY, topPhotoWidth, topPhotoHeight);
    ctx.drawImage(img2, bottomPhotoX, bottomPhotoY, bottomPhotoWidth, bottomPhotoHeight);
  } 
  else if (templateName === 'meme2.jpeg') {
    // Координаты для шаблона meme2.jpeg
    // Согласно точным координатам из image-map
    
    // Первая фотография (левая кнопка) - coords="215,159,45,45"
    const photo1X = 45;
    const photo1Y = 45;
    const photo1Width = 170; // 215 - 45
    const photo1Height = 114; // 159 - 45
    
    // Вторая фотография (правая кнопка) - coords="266,39,409,120"
    const photo2X = 266;
    const photo2Y = 39;
    const photo2Width = 143; // 409 - 266
    const photo2Height = 81; // 120 - 39
    
    // Рисуем фотографии, растягивая их точно по размерам областей
    ctx.drawImage(img1, photo1X, photo1Y, photo1Width, photo1Height);
    ctx.drawImage(img2, photo2X, photo2Y, photo2Width, photo2Height);
    
    // Добавляем текст, если он предоставлен
    if (text1) {
      // Текст для первой кнопки - coords="112,248,293,283"
      ctx.font = '16px Arial';
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';
      const text1X = 112 + (293 - 112) / 2; // центр области текста
      const text1Y = 248 + 20; // немного ниже верхней границы
      wrapText(ctx, text1, text1X, text1Y, 293 - 112, 20);
    }
    
    if (text2) {
      // Текст для второй кнопки - coords="314,186,495,221"
      ctx.font = '16px Arial';
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';
      const text2X = 314 + (495 - 314) / 2; // центр области текста
      const text2Y = 186 + 20; // немного ниже верхней границы
      wrapText(ctx, text2, text2X, text2Y, 495 - 314, 20);
    }
  }
  else if (templateName === 'meme3.jpg') {
    // Координаты для шаблона meme3.jpg (расширяющийся мозг)
    // Согласно координатам из image-map
    
    // Определяем координаты для 6 уровней
    const levels = [
      { x: 13, y: 11, width: 100, height: 40 },    // Уровень 1 - coords="13,11,113,51"
      { x: 12, y: 74, width: 100, height: 45 },    // Уровень 2 - coords="12,74,112,119"
      { x: 11, y: 142, width: 102, height: 46 },   // Уровень 3 - coords="11,142,113,188"
      { x: 13, y: 211, width: 106, height: 42 },   // Уровень 4 - coords="13,211,119,253"
      { x: 15, y: 269, width: 102, height: 45 },   // Уровень 5 - coords="15,269,117,314"
      { x: 21, y: 339, width: 88, height: 53 }     // Уровень 6 - coords="21,339,109,392"
    ];
    
    // Используем переданный режим или по умолчанию "photo"
    const modeToUse = mode || "photo";
    
    if (modeToUse === "photo") {
      // Режим фото: размещаем фото на всех 6 уровнях
      // Используем все 6 загруженных фотографий
      
      // Размещаем фото на всех уровнях
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        
        // Если есть массив всех фото и в нем достаточно элементов, используем их
        if (allPhotos && allPhotos.length > i) {
          // Загружаем фото из массива
          const photoImg = await loadImage(allPhotos[i]);
          ctx.drawImage(photoImg, level.x, level.y, level.width, level.height);
        } else {
          // Запасной вариант: чередуем фото1 и фото2
          const photoToUse = i % 2 === 0 ? img1 : img2;
          ctx.drawImage(photoToUse, level.x, level.y, level.width, level.height);
        }
      }
    } 
    else {
      // Режим текст: размещаем тексты на всех уровнях
      // Если предоставлены тексты, используем их, иначе используем text1 и text2
      const textsToUse = texts || [];
      
      // Настраиваем стиль текста
      ctx.font = '12px Arial';
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';
      
      // Размещаем тексты на уровнях
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const textToUse = textsToUse[i] || (i === 0 ? text1 : i === 1 ? text2 : `Уровень ${i + 1}`);
        
        if (textToUse) {
          const textX = level.x + level.width / 2;
          const textY = level.y + level.height / 2;
          wrapText(ctx, textToUse, textX, textY, level.width - 10, 14);
        }
      }
    }
  }
  
  return canvas.toBuffer("image/jpeg");
}

// Функция для переноса текста
function wrapText(context: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = context.measureText(testLine);
    const testWidth = metrics.width;
    
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  
  context.fillText(line, x, y);
}

// Основной обработчик команды .meme
async function memeHandler(client: TelegramClient, event: NewMessageEvent, args: string[]) {
  const m = event.message;
  if (!m.chatId) return;
  
  await m.edit({ text: "⏳ Создаю мем..." });
  
  try {
    await sleep(500);
    const peer = await client.getInputEntity(m.chatId as any);
    
    // Определяем, какой шаблон использовать
    // По умолчанию meme1.jpeg, если указан аргумент "2", то meme2.jpeg, если "3", то meme3.jpg
    let templatePath: string;
    let templateMode: string | undefined;
    let templateNumber: string;
    
    if (args[0] === "3" || args[0] === "4") {
      // Для третьего и четвертого шаблона используем .jpg расширение (оба используют meme3.jpg)
      templateNumber = "3"; // Оба используют один и тот же шаблон
      templatePath = path.join(process.cwd(), 'assets', 'img', 'futage', 'meme3.jpg');
      
      // Определяем режим: 
      // - Для ".meme 3" по умолчанию режим "photo", если указан "text", то "text"
      // - Для ".meme 4" всегда режим "text"
      templateMode = args[0] === "4" ? "text" : (args[1] === "text" ? "text" : "photo");
    } else {
      // Для первого и второго шаблонов используем .jpeg расширение
      templateNumber = args[0] === "2" ? "2" : "1";
      templatePath = path.join(process.cwd(), 'assets', 'img', 'futage', `meme${templateNumber}.jpeg`);
    }
    
    // Проверяем существование шаблона
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Шаблон мема meme${templateNumber}${templateNumber === "3" ? ".jpg" : ".jpeg"} не найден`);
    }
    
    // Считаем количество фото в чате
    await m.edit({ text: "⏳ Считаю фото в чате..." });
    const photoCountRes = await client.invoke(new Api.messages.Search({ 
      peer, 
      q: "", 
      filter: new Api.InputMessagesFilterPhotos(), 
      minDate: 0, 
      maxDate: 0, 
      offsetId: 0, 
      addOffset: 0, 
      limit: 0, 
      hash: bigInt(0) 
    })) as any;
    
    const totalPhotos = photoCountRes.count || 0;
    if (totalPhotos < 2) {
      throw new Error("В чате должно быть минимум 2 фото для создания мема");
    }
    
    await m.edit({ text: `⏳ Найдено ${totalPhotos} фото. Загружаю 2 случайных...` });
    
    // Определяем, сколько фотографий нужно загрузить
    // Для meme3.jpg в режиме text (templateMode === "text") фотографии не нужны
    const photosToLoad = templateNumber === "3" && templateMode !== "text" ? 6 : 2;
    
    // Загружаем нужное количество разных случайных фото
    const photos: Buffer[] = [];
    
    // Загружаем фотографии только если они нужны
    // Для meme3.jpg в режиме text (templateMode === "text") фотографии не нужны
    if (!(templateNumber === "3" && templateMode === "text")) {
      for (let i = 0; i < photosToLoad; i++) {
        await m.edit({ text: `⏳ Загружаю фото ${i + 1}/${photosToLoad}...` });
        
        let newPhoto: Buffer;
        let attempts = 0;
        const maxAttempts = 5;
        
        do {
          newPhoto = await fetchRandomPhoto(client, peer, totalPhotos);
          attempts++;
          
          // Проверяем, что фото отличается от уже загруженных
          const isDuplicate = photos.some(existingPhoto => 
            Buffer.compare(existingPhoto, newPhoto) === 0
          );
          
          if (!isDuplicate || attempts >= maxAttempts) {
            break;
          }
        } while (attempts < maxAttempts);
        
        photos.push(newPhoto);
      }
    } else {
      // В режиме text для meme3.jpg нам все равно нужны хотя бы 2 фото для совместимости с функцией generateMeme
      // Но мы можем загрузить их без сообщений пользователю
      photos.push(await fetchRandomPhoto(client, peer, totalPhotos));
      photos.push(await fetchRandomPhoto(client, peer, totalPhotos));
    }
    
    // Для обратной совместимости с остальным кодом
    const photo1 = photos[0];
    const photo2 = photos[1];
    
    // Для шаблонов meme2.jpeg и meme3.jpg (в режиме text) нужны тексты
    let text1: string | undefined;
    let text2: string | undefined;
    let texts: string[] | undefined;
    
    // Считаем количество текстовых сообщений в чате
    await m.edit({ text: "⏳ Считаю текстовые сообщения в чате..." });
    const textCountRes = await client.invoke(new Api.messages.Search({ 
      peer, 
      q: "", 
      filter: new Api.InputMessagesFilterEmpty(), 
      minDate: 0, 
      maxDate: 0, 
      offsetId: 0, 
      addOffset: 0, 
      limit: 0, 
      hash: bigInt(0) 
    })) as any;
    
    const totalTexts = textCountRes.count || 0;
    
    if (totalTexts > 0) {
      if (templateNumber === "2") {
        await m.edit({ text: `⏳ Найдено ${totalTexts} текстовых сообщений. Загружаю 2 случайных текста...` });
        
        // Загружаем 2 случайных текста для шаблона meme2.jpeg
        text1 = await fetchRandomText(client, peer, totalTexts);
        text2 = await fetchRandomText(client, peer, totalTexts);
        
        // Обрезаем тексты, чтобы они не были слишком длинными
        text1 = text1.length > 50 ? text1.substring(0, 50) + "..." : text1;
        text2 = text2.length > 50 ? text2.substring(0, 50) + "..." : text2;
      } 
      else if (templateNumber === "3" && templateMode === "text") {
        await m.edit({ text: `⏳ Найдено ${totalTexts} текстовых сообщений. Загружаю 6 случайных текстов...` });
        
        // Загружаем 6 случайных текстов для шаблона meme3.jpg в режиме text
        texts = [];
        for (let i = 0; i < 6; i++) {
          await m.edit({ text: `⏳ Загружаю текст ${i + 1}/6...` });
          const randomText = await fetchRandomText(client, peer, totalTexts);
          // Обрезаем текст, чтобы он не был слишком длинным
          texts.push(randomText.length > 30 ? randomText.substring(0, 30) + "..." : randomText);
        }
      }
    }
    
    await m.edit({ text: "⏳ Создаю мем из фотографий..." });
    
    // Генерируем мем
    const memeBuffer = await generateMeme(photo1, photo2, templatePath, text1, text2, texts, templateMode, photos);
    
    await m.edit({ text: "✅ Мем готов! Отправляю..." });
    
    // Отправляем мем
    await client.sendFile(m.chatId, {
      file: new CustomFile("meme.jpg", memeBuffer.length, "meme.jpg", memeBuffer),
      workers: 1,
    });
    
    // Удаляем служебное сообщение
    await sleep(500);
    await client.deleteMessages(m.chatId as any, [m.id as any], { revoke: true });
    
  } catch (e: any) {
    console.error("Ошибка в memeHandler:", e);
    await m.edit({ text: `❌ ${e.message}` });
  }
}

export const memeModule: Module = { 
  info, 
  handler: memeHandler, 
  commands: ["meme"] 
}