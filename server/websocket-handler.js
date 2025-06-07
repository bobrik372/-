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

      // Инициализируем пользователя как неавторизованного
      this.users.set(ws, {
        isAuthenticated: false,
        nickname: null,
        currentRoom: null,
      })

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
    const userInfo = user && user.isAuthenticated ? `${user.nickname} (auth)` : "unknown"

    console.log(`📨 ОБРАБОТКА СООБЩЕНИЯ ${data.type} от ${userInfo}`)

    try {
      switch (data.type) {
        case "register":
          await this.handleRegister(ws, data)
          break
        case "login":
          await this.handleLogin(ws, data)
          break
        case "getRooms":
          await this.sendRoomsList(ws)
          break
        case "createRoom":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.createRoom(ws, data.room)
          break
        case "joinRoom":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.joinRoom(ws, data.roomId, data.password)
          break
        case "leaveRoom":
          await this.leaveRoom(ws)
          break
        case "chatMessage":
          await this.handleChatMessage(ws, data)
          break
        case "gameAction":
          await this.handleGameAction(ws, data)
          break
        case "updateAvatar":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.updateAvatar(ws, data.avatar)
          break
        case "buyEffect":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.buyEffect(ws, data.effect)
          break
        case "adminAction":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.handleAdminAction(ws, data)
          break
        case "ping":
          this.send(ws, { type: "pong", timestamp: new Date().toISOString() })
          break
        case "getStats":
          await this.sendLobbyStats(ws)
          break
        case "rejoinRoom":
          await this.rejoinRoom(ws, data.roomId)
          break
        default:
          this.sendError(ws, `Неизвестный тип сообщения: ${data.type}`)
      }
    } catch (error) {
      console.error(`❌ ОШИБКА ОБРАБОТКИ ${data.type} от ${userInfo}:`, error)
      this.sendError(ws, "Ошибка обработки сообщения: " + error.message)
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
      console.error("❌ Ошибка регистрации:", error)
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
      const userData = {
        ...user,
        currentRoom: null,
        isAuthenticated: true,
      }

      this.users.set(ws, userData)
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
    } catch (error) {
      console.error("❌ Ошибка входа:", error)
      this.sendError(ws, "Ошибка входа в систему")
    }
  }

  async createRoom(ws, roomData) {
    const user = this.users.get(ws)

    if (user.currentRoom) {
      return this.sendError(ws, "Вы уже находитесь в комнате")
    }

    try {
      const roomId = uuidv4()
      const room = {
        id: roomId,
        name: roomData.name,
        status: "waiting",
        minPlayers: roomData.minPlayers || 4,
        maxPlayers: roomData.maxPlayers || 10,
        creator: user.nickname,
        password: roomData.password || null,
        players: [
          {
            nickname: user.nickname,
            avatar: user.avatar,
            isCreator: true,
            isReady: false,
            role: null,
            isAlive: true,
          },
        ],
        roles: roomData.roles || { doctor: true, don: true, lovers: false },
        messages: [],
        game: null,
        createdAt: new Date().toISOString(),
      }

      // Сохраняем в память и БД
      this.rooms.set(roomId, room)
      await this.db.createRoom({
        id: roomId,
        name: roomData.name,
        creator: user,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
        roles: room.roles,
        password: roomData.password,
      })

      user.currentRoom = roomId

      this.send(ws, {
        type: "roomJoined",
        room: this.sanitizeRoomForClient(room, user.nickname),
      })

      await this.broadcastRoomsList()

      console.log(`🏠 Комната создана: ${roomData.name} (${roomId}) пользователем ${user.nickname}`)
    } catch (error) {
      console.error("❌ Ошибка создания комнаты:", error)
      this.sendError(ws, "Ошибка создания комнаты")
    }
  }

  async joinRoom(ws, roomId, password = null) {
    const user = this.users.get(ws)

    if (user.currentRoom) {
      return this.sendError(ws, "Вы уже находитесь в комнате")
    }

    try {
      const room = this.rooms.get(roomId)
      if (!room) {
        return this.sendError(ws, "Комната не найдена")
      }

      // Проверяем пароль
      if (room.password && room.password !== password) {
        return this.sendError(ws, "Неверный пароль")
      }

      if (room.players.length >= room.maxPlayers) {
        return this.sendError(ws, "Комната заполнена")
      }

      if (room.status !== "waiting") {
        return this.sendError(ws, "Игра уже началась")
      }

      // Добавляем игрока
      room.players.push({
        nickname: user.nickname,
        avatar: user.avatar,
        isCreator: false,
        isReady: false,
        role: null,
        isAlive: true,
      })

      user.currentRoom = roomId

      // Отправляем данные комнаты новому игроку
      this.send(ws, {
        type: "roomJoined",
        room: this.sanitizeRoomForClient(room, user.nickname),
      })

      // Уведомляем всех в комнате
      this.broadcastToRoom(roomId, {
        type: "roomUpdated",
        room: this.sanitizeRoomForClient(room),
      })

      this.broadcastToRoom(roomId, {
        type: "chatMessage",
        sender: "Система",
        message: `${user.nickname} присоединился к комнате`,
        timestamp: new Date().toISOString(),
      })

      await this.broadcastRoomsList()

      console.log(`👤 ${user.nickname} присоединился к комнате ${room.name}`)
    } catch (error) {
      console.error("❌ Ошибка присоединения к комнате:", error)
      this.sendError(ws, "Ошибка присоединения к комнате")
    }
  }

  async leaveRoom(ws) {
    const user = this.users.get(ws)
    if (!user || !user.currentRoom) {
      return
    }

    const roomId = user.currentRoom
    const room = this.rooms.get(roomId)
    if (!room) {
      return
    }

    // Удаляем игрока
    const playerIndex = room.players.findIndex((p) => p.nickname === user.nickname)
    if (playerIndex !== -1) {
      room.players.splice(playerIndex, 1)
    }

    user.currentRoom = null

    // Если комната пуста, удаляем её
    if (room.players.length === 0) {
      this.rooms.delete(roomId)
      await this.db.deleteRoom(roomId)
      console.log(`🗑️ Комната ${room.name} удалена (пустая)`)
    } else {
      // Если создатель ушёл, назначаем нового
      if (room.creator === user.nickname && room.players.length > 0) {
        room.creator = room.players[0].nickname
        room.players[0].isCreator = true
        console.log(`👑 Новый создатель комнаты: ${room.creator}`)
      }

      this.broadcastToRoom(roomId, {
        type: "roomUpdated",
        room: this.sanitizeRoomForClient(room),
      })

      this.broadcastToRoom(roomId, {
        type: "chatMessage",
        sender: "Система",
        message: `${user.nickname} покинул комнату`,
        timestamp: new Date().toISOString(),
      })
    }

    await this.broadcastRoomsList()
    console.log(`👤 ${user.nickname} покинул комнату`)
  }

  async handleChatMessage(ws, data) {
    const user = this.users.get(ws)
    if (!user || !user.currentRoom) {
      return this.sendError(ws, "Вы не находитесь в комнате")
    }

    const room = this.rooms.get(user.currentRoom)
    if (!room) {
      return this.sendError(ws, "Комната не найдена")
    }

    const message = {
      sender: user.nickname,
      message: data.message,
      timestamp: new Date().toISOString(),
    }

    room.messages.push(message)

    // Сохраняем в БД
    await this.db.saveMessage({
      roomId: user.currentRoom,
      sender: user.nickname,
      message: data.message,
      timestamp: message.timestamp,
    })

    this.broadcastToRoom(user.currentRoom, {
      type: "chatMessage",
      ...message,
    })

    console.log(`💬 Сообщение в комнате ${room.name}: ${user.nickname}: ${data.message}`)
  }

  async updateAvatar(ws, avatar) {
    const user = this.users.get(ws)

    try {
      await this.db.updateUserAvatar(user.nickname, avatar)
      user.avatar = avatar

      // Обновляем аватар в комнате если пользователь в ней
      if (user.currentRoom) {
        const room = this.rooms.get(user.currentRoom)
        if (room) {
          const player = room.players.find((p) => p.nickname === user.nickname)
          if (player) {
            player.avatar = avatar
            this.broadcastToRoom(user.currentRoom, {
              type: "roomUpdated",
              room: this.sanitizeRoomForClient(room),
            })
          }
        }
      }

      this.send(ws, {
        type: "avatarUpdated",
        avatar: avatar,
      })
    } catch (error) {
      console.error("❌ Ошибка обновления аватара:", error)
      this.sendError(ws, "Ошибка обновления аватара")
    }
  }

  async buyEffect(ws, effect) {
    const user = this.users.get(ws)

    const effectPrices = {
      rainbow: 50,
      glow: 30,
      shake: 25,
      bounce: 20,
      fade: 15,
    }

    const price = effectPrices[effect]
    if (!price) {
      return this.sendError(ws, "Неизвестный эффект")
    }

    if (user.coins < price) {
      return this.sendError(ws, "Недостаточно монет")
    }

    try {
      // Проверяем, есть ли уже этот эффект
      if (user.nickname_effects.includes(effect)) {
        return this.sendError(ws, "У вас уже есть этот эффект")
      }

      // Покупаем эффект
      await this.db.updateUserCoins(user.nickname, -price)
      user.nickname_effects.push(effect)
      await this.db.updateUserNicknameEffects(user.nickname, user.nickname_effects)
      user.coins -= price

      this.send(ws, {
        type: "effectBought",
        effect: effect,
        coins: user.coins,
        nickname_effects: user.nickname_effects,
      })
    } catch (error) {
      console.error("❌ Ошибка покупки эффекта:", error)
      this.sendError(ws, "Ошибка покупки эффекта")
    }
  }

  async handleAdminAction(ws, data) {
    const user = this.users.get(ws)
    if (!user || !user.is_admin) {
      return this.sendError(ws, "У вас нет прав администратора")
    }

    try {
      switch (data.action) {
        case "giveCoins":
          await this.db.adminUpdateUserCoins(user.nickname, data.target, data.amount)
          this.send(ws, {
            type: "adminActionSuccess",
            message: `Выдано ${data.amount} монет пользователю ${data.target}`,
          })
          break

        case "giveEffect":
          const targetUser = await this.db.getUser(data.target)
          if (targetUser) {
            const effects = targetUser.nickname_effects || []
            if (!effects.includes(data.effect)) {
              effects.push(data.effect)
              await this.db.adminUpdateUserEffects(user.nickname, data.target, effects)
            }
          }
          this.send(ws, {
            type: "adminActionSuccess",
            message: `Выдан эффект ${data.effect} пользователю ${data.target}`,
          })
          break

        case "removeEffect":
          const targetUser2 = await this.db.getUser(data.target)
          if (targetUser2) {
            const effects = targetUser2.nickname_effects || []
            const newEffects = effects.filter((e) => e !== data.effect)
            await this.db.adminUpdateUserEffects(user.nickname, data.target, newEffects)
          }
          this.send(ws, {
            type: "adminActionSuccess",
            message: `Удалён эффект ${data.effect} у пользователя ${data.target}`,
          })
          break

        default:
          this.sendError(ws, "Неизвестное админское действие")
      }
    } catch (error) {
      console.error("❌ Ошибка админского действия:", error)
      this.sendError(ws, "Ошибка выполнения админского действия")
    }
  }

  handleDisconnect(ws) {
    const user = this.users.get(ws)
    if (!user) {
      return
    }

    // Покидаем комнату если были в ней
    if (user.currentRoom) {
      this.leaveRoom(ws)
    }

    // Удаляем из списков
    this.users.delete(ws)
    if (user.nickname) {
      this.usersByNickname.delete(user.nickname)
    }

    console.log(`👋 Пользователь отключился: ${user.nickname || "Неизвестный"}`)
  }

  // Вспомогательные методы
  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify(data)
      ws.send(message)
    }
  }

  sendError(ws, message) {
    this.send(ws, {
      type: "error",
      message: message,
    })
  }

  broadcastToRoom(roomId, message) {
    const room = this.rooms.get(roomId)
    if (!room) return

    for (const [ws, user] of this.users.entries()) {
      if (user.currentRoom === roomId) {
        this.send(ws, message)
      }
    }
  }

  async broadcastRoomsList() {
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

    for (const [ws, user] of this.users.entries()) {
      if (user.isAuthenticated && !user.currentRoom) {
        this.send(ws, {
          type: "rooms",
          rooms: roomsList,
        })
      }
    }
  }

  sanitizeRoomForClient(room, userNickname = null) {
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      players: room.players.map((p) => ({
        nickname: p.nickname,
        avatar: p.avatar,
        isCreator: p.isCreator,
        isReady: p.isReady,
        isAlive: p.isAlive,
        isBot: p.isBot || false,
        role: p.nickname === userNickname || room.status === "finished" ? p.role : null,
      })),
      maxPlayers: room.maxPlayers,
      creator: room.creator,
      roles: room.roles,
      messages: room.messages.slice(-50),
      game: room.game
        ? {
            phase: room.game.phase,
            day: room.game.day,
            timeLeft: room.game.timeLeft,
            votingResults: room.game.votingResults,
            lastAction: room.game.lastAction,
          }
        : null,
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
      console.error("❌ Ошибка получения комнат:", error)
      this.sendError(ws, "Ошибка получения списка комнат")
    }
  }

  async sendLobbyStats(ws) {
    try {
      const dbStats = await this.db.getStats()
      const wsStats = this.getStats()

      this.send(ws, {
        type: "stats",
        stats: {
          onlineUsers: wsStats.connectedUsers,
          activeRooms: wsStats.activeRooms,
          activeGames: 0,
          uptime: process.uptime(),
        },
      })
    } catch (error) {
      console.error("❌ Ошибка отправки статистики:", error)
      this.sendError(ws, "Ошибка получения статистики")
    }
  }

  getStats() {
    return {
      connectedUsers: this.users.size,
      activeRooms: this.rooms.size,
      authenticatedUsers: Array.from(this.users.values()).filter((u) => u.isAuthenticated).length,
    }
  }

  // Заглушки для остальных методов
  async handleGameAction(ws, data) {
    this.sendError(ws, "Игровые действия временно недоступны")
  }

  async rejoinRoom(ws, roomId) {
    this.sendError(ws, "Переподключение к комнатам временно недоступно")
  }
}

console.log("✅ WebSocketHandler модуль загружен")
module.exports = WebSocketHandler
