import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';

// Создаем Express-приложение
const app = express();

// Middleware для парсинга JSON
app.use(bodyParser.json());

// Порт для API-сервера
const PORT = process.env.API_PORT || 3000;

// Функция для запуска API-сервера
export async function startApiServer(bot: any) {
  // Эндпоинт для обновления статуса мема
  app.post('/meme-status', (req: any, res: any) => {
    const { sessionId, status, photoUrl } = req.body;
    
    if (!sessionId || !status) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    console.log(`Получено обновление статуса мема: sessionId=${sessionId}, status=${status}`);
    
    // Вызываем функцию обновления статуса в боте
    if (global.updateMemeStatus) {
      global.updateMemeStatus(sessionId, status, photoUrl);
    }
    
    res.json({ success: true });
  });
  
  // Запускаем сервер
  app.listen(PORT, () => {
    console.log(`API-сервер запущен на порту ${PORT}`);
  });
}

// Экспортируем типы для TypeScript
declare global {
  var updateMemeStatus: (sessionId: string, status: string, photoUrl?: string) => Promise<void>;
}