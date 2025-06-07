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
    const user = this.users.get(ws)
    const userInfo = user ? `${user.nickname} (${user.isAuthenticated ? "auth" : "unauth"})` : "unknown"

    console.log(`📨 ОБРАБОТКА СООБЩЕНИЯ ${data.type} от ${userInfo}`)
    console.log(`📦 Данные:`, JSON.stringify(data, null, 2))

    try {
      switch (data.type) {
        case "register":
          console.log(`👤 Попытка регистрации: ${data.nickname}`)
          await this.handleRegister(ws, data)
          break
        case "login":
          console.log(`🔐 Попытка входа: ${data.nickname}`)
          await this.handleLogin(ws, data)
          break
        case "getRooms":
          console.log(`🏠 Запрос списка комнат от ${userInfo}`)
          await this.sendRoomsList(ws)
          break
        case "createRoom":
          console.log(`🏗️ Создание комнаты от ${userInfo}`)
          await this.createRoom(ws, data.room)
          break
        case "joinRoom":
          console.log(`🚪 Присоединение к комнате ${data.roomId} от ${userInfo}`)
          await this.joinRoom(ws, data.roomId, data.password)
          break
        case "leaveRoom":
          console.log(`🚪 Выход из комнаты от ${userInfo}`)
          await this.leaveRoom(ws)
          break
        case "chatMessage":
          console.log(`💬 Сообщение в чат от ${userInfo}: ${data.message}`)
          await this.handleChatMessage(ws, data)
          break
        case "gameAction":
          console.log(`🎮 Игровое действие от ${userInfo}`)
          await this.handleGameAction(ws, data)
          break
        case "updateAvatar":
          console.log(`🎭 Обновление аватара от ${userInfo}`)
          await this.updateAvatar(ws, data.avatar)
          break
        case "buyEffect":
          console.log(`💰 Покупка эффекта ${data.effect} от ${userInfo}`)
          await this.buyEffect(ws, data.effect)
          break
        case "adminAction":
          console.log(`👑 Админское действие от ${userInfo}`)
          await this.handleAdminAction(ws, data)
          break
        case "ping":
          console.log(`🏓 Ping от ${userInfo}`)
          this.send(ws, { type: "pong", timestamp: new Date().toISOString() })
          break
        case "getStats":
          console.log(`📊 Запрос статистики от ${userInfo}`)
          await this.sendLobbyStats(ws)
          break
        case "rejoinRoom":
          console.log(`🔄 Переподключение к комнате ${data.roomId} от ${userInfo}`)
          await this.rejoinRoom(ws, data.roomId)
          break
        default:
          console.log("❌ НЕИЗВЕСТНЫЙ ТИП СООБЩЕНИЯ:", data.type)
          console.log("Данные:", JSON.stringify(data, null, 2))
          this.sendError(ws, `Неизвестный тип сообщения: ${data.type}`)
      }
    } catch (error) {
      console.error(`❌ ОШИБКА ОБРАБОТКИ ${data.type} от ${userInfo}:`, error)
      console.error("Stack trace:", error.stack)
      this.sendError(ws, "Ошибка обработки сообщения: " + error.message)
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

  async handleRegister(ws, data) {
    try {
      const { nickname, password, avatar } = data

      if (!nickname || !password) {
        return this.sendError(ws, "Никнейм и пароль обязательны")
      }

      if (nickname.length < 3 || nickname.length > 20) {
        return this.sendError(ws, "Никнейм должен быть от 3 до 20 символов")
      }

      if (password.length < 4) {
        return this.sendError(ws, "Пароль должен быть минимум 4 символа")
      }

      const user = await this.db.createUser({ nickname, password, avatar })

      this.send(ws, {
        type: "registerSuccess",
        message: "Регистрация успешна! Теперь войдите в систему.",
      })

      console.log(`✅ Пользователь ${nickname} успешно зарегистрирован`)
    } catch (error) {
      console.error("Ошибка регистрации:", error)
      this.sendError(ws, error.message)
    }
  }

  async handleLogin(ws, data) {
    try {
      const { nickname, password } = data

      if (!nickname || !password) {
        return this.sendError(ws, "Никнейм и пароль обязательны")
      }

      const user = await this.db.loginUser(nickname, password)

      if (!user) {
        return this.sendError(ws, "Неверный никнейм или пароль")
      }

      // Отключаем предыдущее соединение если есть
      const existingWs = this.usersByNickname.get(nickname)
      if (existingWs && existingWs !== ws) {
        console.log(`🔄 Отключение предыдущего соединения для ${nickname}`)
        this.send(existingWs, {
          type: "kicked",
          reason: "Вход с другого устройства",
        })
        existingWs.close()
      }

      // Сохраняем пользователя
      this.users.set(ws, {
        ...user,
        currentRoom: null,
        isAuthenticated: true,
      })
      this.usersByNickname.set(nickname, ws)

      const loginResponse = {
        type: "loginSuccess",
        user: {
          nickname: user.nickname,
          avatar: user.avatar,
          coins: user.coins,
          nickname_effects: user.nickname_effects,
          games_played: user.games_played,
          games_won: user.games_won,
          games_survived: user.games_survived,
          is_admin: user.is_admin,
        },
      }

      this.send(ws, loginResponse)

      console.log(`✅ Пользователь авторизован: ${nickname}`)
      console.log(`📊 Всего авторизованных: ${Array.from(this.users.values()).filter((u) => u.isAuthenticated).length}`)
    } catch (error) {
      console.error("Ошибка входа:", error)
      this.sendError(ws, "Ошибка входа в систему")
    }
  }

  async sendRoomsList(ws) {
    try {
      const rooms = await this.db.getRooms()
      const roomsList = []

      for (const room of rooms) {
        const roomData = this.rooms.get(room.id)
        roomsList.push({
          id: room.id,
          name: room.name,
          status: room.status,
          players: roomData ? roomData.players.length : 0,
          maxPlayers: room.max_players,
          creator: room.creator_nickname,
          hasPassword: room.hasPassword,
          createdAt: room.created_at,
        })
      }

      this.send(ws, {
        type: "rooms",
        rooms: roomsList,
      })

      console.log(`📋 Отправлен список комнат: ${roomsList.length} комнат`)
    } catch (error) {
      console.error("Ошибка получения комнат:", error)
      this.sendError(ws, "Ошибка получения списка комнат")
    }
  }

  // Добавь остальные методы как заглушки пока:
  async createRoom(ws, roomData) {
    this.sendError(ws, "Создание комнат временно недоступно")
  }

  async joinRoom(ws, roomId, password) {
    this.sendError(ws, "Присоединение к комнатам временно недоступно")
  }

  async leaveRoom(ws) {
    this.sendError(ws, "Выход из комнат временно недоступен")
  }

  async handleChatMessage(ws, data) {
    this.sendError(ws, "Чат временно недоступен")
  }

  async handleGameAction(ws, data) {
    this.sendError(ws, "Игровые действия временно недоступны")
  }

  async updateAvatar(ws, avatar) {
    this.sendError(ws, "Обновление аватара временно недоступно")
  }

  async buyEffect(ws, effect) {
    this.sendError(ws, "Покупка эффектов временно недоступна")
  }

  async handleAdminAction(ws, data) {
    this.sendError(ws, "Админские действия временно недоступны")
  }

  async sendLobbyStats(ws) {
    this.send(ws, {
      type: "stats",
      stats: {
        onlineUsers: this.users.size,
        activeRooms: this.rooms.size,
        activeGames: 0,
        uptime: process.uptime(),
      },
    })
  }

  async rejoinRoom(ws, roomId) {
    this.sendError(ws, "Переподключение к комнатам временно недоступно")
  }
}

console.log("✅ WebSocketHandler модуль загружен")
module.exports = WebSocketHandler
