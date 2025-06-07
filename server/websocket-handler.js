const WebSocket = require("ws")
const { v4: uuidv4 } = require("uuid")

console.log("📦 Загрузка WebSocketHandler модуля...")

class WebSocketHandler {
  constructor(wss, database, gameEngine) {
    console.log("🔌 Создание WebSocketHandler...")

    this.wss = wss
    this.db = database
    this.gameEngine = gameEngine
    this.users = new Map() // ws -> user data
    this.rooms = new Map() // roomId -> room data
    this.usersByNickname = new Map() // nickname -> ws

    this.setupWebSocket()

    console.log("✅ WebSocketHandler создан")
  }

  setupWebSocket() {
    console.log("🔌 Настройка WebSocket сервера...")

    this.wss.on("connection", (ws, req) => {
      const clientIP = req.socket.remoteAddress || req.connection.remoteAddress
      const userAgent = req.headers["user-agent"]
      const origin = req.headers.origin

      console.log("🎉 НОВОЕ WEBSOCKET ПОДКЛЮЧЕНИЕ!")
      console.log("=" * 80)
      console.log(`🌐 IP: ${clientIP}`)
      console.log(`🔧 User-Agent: ${userAgent}`)
      console.log(`🏠 Origin: ${origin}`)
      console.log(`📊 Всего подключений: ${this.wss.clients.size}`)
      console.log(`🕐 Время: ${new Date().toISOString()}`)
      console.log("=" * 80)

      ws.on("message", async (message) => {
        try {
          console.log(`📨 RAW MESSAGE от ${clientIP}:`, message.toString())
          const data = JSON.parse(message)
          console.log(`📨 PARSED MESSAGE от ${clientIP}:`, JSON.stringify(data, null, 2))
          await this.handleMessage(ws, data)
        } catch (error) {
          console.error(`❌ Ошибка обработки сообщения от ${clientIP}:`, error)
          this.sendError(ws, "Неверный формат сообщения")
        }
      })

      ws.on("close", (code, reason) => {
        console.log(`🔌 WebSocket соединение закрыто от ${clientIP}`)
        console.log(`📊 Код: ${code}, Причина: ${reason}`)
        this.handleDisconnect(ws)
      })

      ws.on("error", (error) => {
        console.error(`❌ WebSocket ошибка от ${clientIP}:`, error)
      })

      // Отправляем приветствие
      const welcomeMessage = {
        type: "connected",
        message: "Добро пожаловать в Mafia Game!",
        serverTime: new Date().toISOString(),
      }

      this.send(ws, welcomeMessage)
      console.log(`✅ Приветствие отправлено клиенту ${clientIP}`)
    })

    console.log("✅ WebSocket сервер настроен")
  }

  async handleMessage(ws, data) {
    console.log(`📨 ОБРАБОТКА СООБЩЕНИЯ ${data.type}`)

    try {
      switch (data.type) {
        case "ping":
          console.log(`🏓 Ping получен`)
          this.send(ws, { type: "pong", timestamp: new Date().toISOString() })
          break

        default:
          console.log("❓ Неизвестный тип сообщения:", data.type)
          this.sendError(ws, `Неизвестный тип сообщения: ${data.type}`)
      }
    } catch (error) {
      console.error(`❌ ОШИБКА ОБРАБОТКИ ${data.type}:`, error)
      this.sendError(ws, "Ошибка обработки сообщения")
    }
  }

  handleDisconnect(ws) {
    console.log("👋 Пользователь отключился")
  }

  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify(data)
      console.log(`📤 Отправка ${data.type} клиенту`)
      ws.send(message)
    } else {
      console.log(`❌ Попытка отправки ${data.type} клиенту с закрытым соединением`)
    }
  }

  sendError(ws, message) {
    console.log(`❌ Отправка ошибки клиенту: ${message}`)
    this.send(ws, {
      type: "error",
      message: message,
    })
  }

  getStats() {
    return {
      connectedUsers: this.users.size,
      activeRooms: this.rooms.size,
    }
  }
}

console.log("✅ WebSocketHandler модуль загружен")
module.exports = WebSocketHandler
