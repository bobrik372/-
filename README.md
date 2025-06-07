# 🎭 Mafia Game Server

Многопользовательская игра "Мафия" с WebSocket сервером.

## 🚀 Деплой на Render

### Настройки для Render:

- **Build Command**: `cd server && npm install`
- **Start Command**: `cd server && npm start`
- **Root Directory**: оставить пустым
- **Environment**: Node.js
- **Node Version**: 18.x или выше

### Переменные окружения:

- `NODE_ENV=production`
- `PORT` - автоматически устанавливается Render

## 📁 Структура проекта

\`\`\`
/
├── server/           # Node.js сервер
│   ├── server.js     # Главный файл сервера
│   ├── package.json  # Зависимости сервера
│   └── ...
├── app/             # Android приложение
└── src/             # React компоненты
\`\`\`

## 🔧 Локальная разработка

\`\`\`bash
# Установка зависимостей сервера
cd server
npm install

# Запуск сервера
npm start

# Разработка с автоперезагрузкой
npm run dev
\`\`\`

## 🌐 API Endpoints

- `GET /` - Информация о сервере
- `GET /health` - Health check
- `GET /test` - Тестовый endpoint
- `WS /` - WebSocket соединение

## 👑 Админ

- Никнейм: `Anubis`
- Пароль: `anubis_god_password`
