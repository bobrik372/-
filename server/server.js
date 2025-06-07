const express = require("express")
const http = require("http")
const WebSocket = require("ws")
const cors = require("cors")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

// МАКСИМАЛЬНОЕ ЛОГИРОВАНИЕ С САМОГО НАЧАЛА
console.log("🚀 СТАРТ ПРИЛОЖЕНИЯ - НАЧАЛО ЗАГРУЗКИ МОДУЛЕЙ")
console.log(`📅 Время: ${new Date().toISOString()}`)
console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV}`)
console.log(`🔌 PORT: ${process.env.PORT}`)
console.log(`📁 __dirname: ${__dirname}`)
console.log(`📁 process.cwd(): ${process.cwd()}`)

let Database, WebSocketHandler, GameEngine

try {
  console.log("📦 Загрузка Database...")
  Database = require("./database")
  console.log("✅ Database загружен")
} catch (error) {
  console.error("❌ ОШИБКА загрузки Database:", error)
  process.exit(1)
}

try {
  console.log("📦 Загрузка WebSocketHandler...")
  WebSocketHandler = require("./websocket-handler")
  console.log("✅ WebSocketHandler загружен")
} catch (error) {
  console.error("❌ ОШИБКА загрузки WebSocketHandler:", error)
  process.exit(1)
}

try {
  console.log("📦 Загрузка GameEngine...")
  GameEngine = require("./game-engine")
  console.log("✅ GameEngine загружен")
} catch (error) {
  console.error("❌ ОШИБКА загрузки GameEngine:", error)
  process.exit(1)
}

console.log("✅ ВСЕ МОДУЛИ ЗАГРУЖЕНЫ")

class MafiaGameServer {
  constructor() {
    console.log("🏗️ СОЗДАНИЕ ЭКЗЕМПЛЯРА MafiaGameServer...")

    this.port = process.env.PORT || 3000
    console.log(`🔌 Порт установлен: ${this.port}`)

    try {
      console.log("🌐 Создание Express приложения...")
      this.app = express()
      console.log("✅ Express создан")

      console.log("🌐 Создание HTTP сервера...")
      this.server = http.createServer(this.app)
      console.log("✅ HTTP сервер создан")

      console.log("🔌 Создание WebSocket сервера...")
      this.wss = new WebSocket.Server({
        server: this.server,
        verifyClient: (info) => {
          console.log(`🔍 WebSocket verifyClient - Origin: ${info.origin}, IP: ${info.req.socket.remoteAddress}`)
          return true
        },
      })
      console.log("✅ WebSocket сервер создан")

      console.log("💾 Создание Database...")
      this.db = new Database()
      console.log("✅ Database создан")

      console.log("🎮 Создание GameEngine...")
      this.gameEngine = new GameEngine()
      console.log("✅ GameEngine создан")

      console.log("🔌 Создание WebSocketHandler...")
      this.wsHandler = new WebSocketHandler(this.wss, this.db, this.gameEngine)
      console.log("✅ WebSocketHandler создан")

      // Устанавливаем связи
      this.gameEngine.setRooms(this.wsHandler.rooms)
      this.gameEngine.setDatabase(this.db)

      this.setupMiddleware()
      this.setupRoutes()
      this.setupErrorHandling()

      console.log("✅ MafiaGameServer создан успешно")
    } catch (error) {
      console.error("❌ КРИТИЧЕСКАЯ ОШИБКА создания MafiaGameServer:", error)
      console.error("Stack trace:", error.stack)
      process.exit(1)
    }
  }

  setupMiddleware() {
    console.log("🔧 Настройка middleware...")

    try {
      // CORS
      console.log("🌐 Настройка CORS...")
      this.app.use(
        cors({
          origin: "*",
          methods: ["GET", "POST", "PUT", "DELETE"],
          allowedHeaders: ["Content-Type", "Authorization"],
        }),
      )
      console.log("✅ CORS настроен")

      // JSON парсер
      console.log("📦 Настройка JSON парсера...")
      this.app.use(express.json({ limit: "10mb" }))
      this.app.use(express.urlencoded({ extended: true }))
      console.log("✅ JSON парсер настроен")

      // Создаём папку для загрузок если её нет
      const uploadsDir = path.join(__dirname, "uploads")
      if (!fs.existsSync(uploadsDir)) {
        console.log("📁 Создание папки uploads...")
        fs.mkdirSync(uploadsDir, { recursive: true })
        console.log("✅ Папка uploads создана")
      }

      // Статические файлы
      console.log("📁 Настройка статических файлов...")
      this.app.use("/uploads", express.static(uploadsDir))
      console.log("✅ Статические файлы настроены")

      // МАКСИМАЛЬНОЕ логирование всех запросов
      this.app.use((req, res, next) => {
        const startTime = Date.now()
        const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress

        console.log("🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥")
        console.log(`📥 ВХОДЯЩИЙ HTTP ЗАПРОС`)
        console.log(`📅 Время: ${new Date().toISOString()}`)
        console.log(`🌐 Метод: ${req.method}`)
        console.log(`🔗 URL: ${req.url}`)
        console.log(`📍 Path: ${req.path}`)
        console.log(`🏠 IP: ${clientIP}`)
        console.log(`🔧 User-Agent: ${req.get("User-Agent")}`)
        console.log(`🔑 Headers:`, JSON.stringify(req.headers, null, 2))

        if (req.body && Object.keys(req.body).length > 0) {
          console.log(`📦 Body:`, JSON.stringify(req.body, null, 2))
        }

        console.log("🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥")

        res.on("finish", () => {
          const duration = Date.now() - startTime
          console.log(`📤 ОТВЕТ: ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`)
        })

        next()
      })

      console.log("✅ Middleware настроен")
    } catch (error) {
      console.error("❌ ОШИБКА настройки middleware:", error)
      throw error
    }
  }

  setupRoutes() {
    console.log("🛣️ Настройка маршрутов...")

    try {
      // Главная страница - ПРОСТЕЙШИЙ ТЕСТ
      this.app.get("/", (req, res) => {
        console.log("🏠 ЗАПРОС ГЛАВНОЙ СТРАНИЦЫ!")
        const response = {
          message: "🎭 Mafia Game Server работает!",
          version: "2.0.0",
          status: "running",
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          port: this.port,
          env: process.env.NODE_ENV,
        }
        console.log("📤 Отправка ответа:", response)
        res.json(response)
      })

      // Health check для Render
      this.app.get("/health", (req, res) => {
        console.log("🏥 HEALTH CHECK ЗАПРОС!")
        const response = {
          status: "healthy",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        }
        console.log("📤 Health check ответ:", response)
        res.json(response)
      })

      // Тестовый маршрут
      this.app.get("/test", (req, res) => {
        console.log("🧪 ТЕСТОВЫЙ ЗАПРОС!")
        res.json({
          test: "OK",
          message: "Сервер работает нормально!",
          timestamp: new Date().toISOString(),
        })
      })

      // API маршруты
      this.app.use("/api", this.createApiRoutes())

      console.log("✅ Маршруты настроены")
    } catch (error) {
      console.error("❌ ОШИБКА настройки маршрутов:", error)
      throw error
    }
  }

  createApiRoutes() {
    console.log("🔧 Создание API маршрутов...")
    const router = express.Router()

    // Простой тест API
    router.get("/test", (req, res) => {
      console.log("🧪 API TEST запрос!")
      res.json({
        api: "working",
        timestamp: new Date().toISOString(),
      })
    })

    console.log("✅ API маршруты созданы")
    return router
  }

  setupErrorHandling() {
    console.log("🚨 Настройка обработки ошибок...")

    // 404 обработчик
    this.app.use((req, res) => {
      console.log(`❌ 404 - Маршрут не найден: ${req.method} ${req.path}`)
      res.status(404).json({
        error: "Маршрут не найден",
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
      })
    })

    // Глобальный обработчик ошибок
    this.app.use((error, req, res, next) => {
      console.error("❌ ГЛОБАЛЬНАЯ ОШИБКА:", error)
      console.error("Stack trace:", error.stack)
      res.status(500).json({
        error: "Внутренняя ошибка сервера",
        message: error.message,
        timestamp: new Date().toISOString(),
      })
    })

    console.log("✅ Обработка ошибок настроена")
  }

  async start() {
    try {
      console.log("🚀🚀🚀 ЗАПУСК MAFIA GAME SERVER 🚀🚀🚀")
      console.log("=" * 100)
      console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV}`)
      console.log(`🔌 PORT: ${this.port}`)
      console.log(`🕐 Время запуска: ${new Date().toISOString()}`)
      console.log("=" * 100)

      // Инициализируем базу данных
      console.log("💾 Инициализация базы данных...")
      await this.db.init()
      console.log("✅ База данных инициализирована")

      // Настраиваем обработчики событий сервера
      this.server.on("listening", () => {
        console.log("🎉🎉🎉 HTTP СЕРВЕР ЗАПУЩЕН! 🎉🎉🎉")
        console.log("=" * 100)
        console.log(`🚀 Mafia Game Server работает на порту ${this.port}`)
        console.log(`🌐 HTTP: http://localhost:${this.port}`)
        console.log(`🏥 Health: http://localhost:${this.port}/health`)
        console.log(`🧪 Test: http://localhost:${this.port}/test`)
        console.log(`🔌 WebSocket: ws://localhost:${this.port}`)
        console.log("=" * 100)
      })

      this.server.on("error", (error) => {
        console.error("❌❌❌ ОШИБКА HTTP СЕРВЕРА ❌❌❌")
        console.error("Ошибка:", error)
        console.error("Stack:", error.stack)
        if (error.code === "EADDRINUSE") {
          console.error(`❌ Порт ${this.port} уже используется!`)
          console.error("Попробуйте другой порт или убейте процесс на этом порту")
        }
        process.exit(1)
      })

      this.server.on("connection", (socket) => {
        console.log(`🔌 Новое TCP соединение от ${socket.remoteAddress}:${socket.remotePort}`)
      })

      // Запускаем сервер
      console.log(`🚀 Запуск HTTP сервера на порту ${this.port}...`)
      console.log(`🎯 Слушаем на 0.0.0.0:${this.port}`)

      this.server.listen(this.port, "0.0.0.0", () => {
        console.log(`✅ Сервер успешно запущен и слушает на 0.0.0.0:${this.port}`)
      })

      // Обработка сигналов завершения
      process.on("SIGTERM", () => {
        console.log("🛑 Получен сигнал SIGTERM")
        this.shutdown()
      })
      process.on("SIGINT", () => {
        console.log("🛑 Получен сигнал SIGINT (Ctrl+C)")
        this.shutdown()
      })

      // Логируем статистику каждые 30 секунд
      setInterval(() => {
        console.log(
          `📊 СТАТИСТИКА: Время работы: ${Math.floor(process.uptime())}с, Память: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        )
      }, 30000)

      // Тестовый запрос к самому себе через 5 секунд
      setTimeout(() => {
        console.log("🧪 Выполняем тестовый запрос к самому себе...")
        fetch(`http://localhost:${this.port}/health`)
          .then((response) => response.json())
          .then((data) => {
            console.log("✅ Тестовый запрос успешен:", data)
          })
          .catch((error) => {
            console.error("❌ Тестовый запрос failed:", error)
          })
      }, 5000)
    } catch (error) {
      console.error("❌❌❌ КРИТИЧЕСКАЯ ОШИБКА запуска сервера ❌❌❌")
      console.error("Ошибка:", error)
      console.error("Stack trace:", error.stack)
      process.exit(1)
    }
  }

  async shutdown() {
    console.log("🛑 Завершение работы сервера...")

    try {
      // Закрываем WebSocket соединения
      console.log("🔌 Закрытие WebSocket соединений...")
      this.wss.clients.forEach((client) => {
        client.close()
      })

      // Закрываем HTTP сервер
      console.log("🌐 Закрытие HTTP сервера...")
      this.server.close()

      // Закрываем базу данных
      console.log("💾 Закрытие базы данных...")
      await this.db.close()

      console.log("✅ Сервер успешно завершил работу")
      process.exit(0)
    } catch (error) {
      console.error("❌ Ошибка при завершении работы:", error)
      process.exit(1)
    }
  }
}

// ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ОШИБОК
process.on("uncaughtException", (error) => {
  console.error("❌❌❌ UNCAUGHT EXCEPTION ❌❌❌")
  console.error("Ошибка:", error)
  console.error("Stack:", error.stack)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌❌❌ UNHANDLED REJECTION ❌❌❌")
  console.error("Reason:", reason)
  console.error("Promise:", promise)
  process.exit(1)
})

// Запуск сервера
if (require.main === module) {
  console.log("🎬🎬🎬 СТАРТ ПРИЛОЖЕНИЯ 🎬🎬🎬")
  const server = new MafiaGameServer()
  server.start()
}

module.exports = MafiaGameServer
