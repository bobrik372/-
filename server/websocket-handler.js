const WebSocket = require("ws")
const { v4: uuidv4 } = require("uuid")
const crypto = require("crypto")

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
    this.deviceSessions = new Map() // deviceId -> { nickname, sessionId }

    // Связываем GameEngine с комнатами и базой данных
    if (this.gameEngine) {
      this.gameEngine.setRooms(this.rooms)
      this.gameEngine.setDatabase(this.db)
    }

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
        deviceId: null,
        sessionId: null,
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

    // Запускаем периодическое обновление игр
    this.startGameUpdateLoop()
  }

  startGameUpdateLoop() {
    setInterval(() => {
      for (const [roomId, room] of this.rooms.entries()) {
        if (room.game && room.status === "playing") {
          // Отправляем обновления игры всем игрокам в комнате
          this.broadcastToRoom(roomId, {
            type: "gameUpdate",
            game: {
              phase: room.game.phase,
              day: room.game.day,
              timeLeft: room.game.timeLeft,
              lastAction: room.game.lastAction,
              votingResults: room.game.votingResults,
            },
          })
        }
      }
    }, 1000) // Обновляем каждую секунду
  }

  generateDeviceId(userAgent, ip) {
    return crypto
      .createHash("sha256")
      .update(userAgent + ip)
      .digest("hex")
      .substring(0, 16)
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
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
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
        case "startGame":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.startGame(ws)
          break
        case "addBot":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.addBot(ws, data)
          break
        case "removeBot":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.removeBot(ws, data)
          break
        case "forceEndGame":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.forceEndGame(ws, data)
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
        case "getUserProfile":
          if (!user || !user.isAuthenticated) {
            return this.sendError(ws, "Вы не авторизованы")
          }
          await this.getUserProfile(ws, data.nickname)
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
      const { nickname, password, deviceId } = data

      if (!nickname || !password) {
        return this.sendError(ws, "Никнейм и пароль обязательны")
      }

      const user = await this.db.loginUser(nickname, password)

      if (!user) {
        return this.sendError(ws, "Неверный никнейм или пароль")
      }

      // Генерируем или используем deviceId
      const finalDeviceId = deviceId || this.generateDeviceId(data.userAgent || "unknown", data.ip || "unknown")

      // Проверяем существующие сессии
      const existingSession = this.deviceSessions.get(finalDeviceId)
      if (existingSession && existingSession.nickname === nickname) {
        console.log(`🔄 Восстановление сессии для ${nickname} с устройства ${finalDeviceId}`)
      }

      // Отключаем предыдущие соединения этого пользователя
      const existingWs = this.usersByNickname.get(nickname)
      if (existingWs && existingWs !== ws) {
        console.log(`🔄 Отключение предыдущего соединения для ${nickname}`)

        // Удаляем игрока из комнаты если он там был
        const existingUser = this.users.get(existingWs)
        if (existingUser && existingUser.currentRoom) {
          await this.removePlayerFromRoom(existingUser.currentRoom, nickname)
        }

        this.users.delete(existingWs)
        this.usersByNickname.delete(nickname)

        try {
          existingWs.close()
        } catch (e) {
          console.log("Старое соединение уже закрыто")
        }
      }

      // Создаём новую сессию
      const sessionId = uuidv4()
      this.deviceSessions.set(finalDeviceId, { nickname, sessionId })

      // Сохраняем пользователя
      const userData = {
        ...user,
        currentRoom: null,
        isAuthenticated: true,
        deviceId: finalDeviceId,
        sessionId: sessionId,
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
        deviceId: finalDeviceId,
        sessionId: sessionId,
      }

      this.send(ws, loginResponse)
      console.log(`✅ Пользователь авторизован: ${nickname}`)
    } catch (error) {
      console.error("❌ Ошибка входа:", error)
      this.sendError(ws, "Ошибка входа в систему")
    }
  }

  async removePlayerFromRoom(roomId, nickname) {
    const room = this.rooms.get(roomId)
    if (!room) return

    const playerIndex = room.players.findIndex((p) => p.nickname === nickname)
    if (playerIndex !== -1) {
      room.players.splice(playerIndex, 1)
      console.log(`🗑️ Игрок ${nickname} удалён из комнаты ${room.name}`)

      // Отменяем автостарт если условия больше не выполняются
      this.cancelAutoStart(room)

      // Если комната пуста, удаляем её
      if (room.players.length === 0) {
        this.rooms.delete(roomId)
        await this.db.deleteRoom(roomId)
        console.log(`🗑️ Комната ${room.name} удалена (пустая)`)
      } else {
        // Если создатель ушёл, назначаем нового
        if (room.creator === nickname && room.players.length > 0) {
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
          message: `${nickname} покинул комнату`,
          timestamp: new Date().toISOString(),
        })
      }

      await this.broadcastRoomsList()
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

      // Проверяем, не находится ли игрок уже в этой комнате
      if (room.players.find((p) => p.nickname === user.nickname)) {
        return this.sendError(ws, "Вы уже находитесь в этой комнате")
      }

      // Добавляем игрока
      room.players.push({
        nickname: user.nickname,
        avatar: user.avatar,
        isCreator: false,
        role: null,
        isAlive: true,
      })

      user.currentRoom = roomId

      // Проверяем автостарт
      this.checkAutoStart(room)

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
    await this.removePlayerFromRoom(roomId, user.nickname)
    user.currentRoom = null

    // Очищаем чат при выходе из комнаты
    this.send(ws, {
      type: "clearChat",
    })

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
      fire: 75,
      ice: 70,
      electric: 80,
      matrix: 65,
      neon: 85,
      gold: 100,
      shadow: 45,
      wave: 40,
      flip: 55,
      zoom: 35,
      bg_stars: 120,
      bg_gradient: 100,
      bg_pulse: 90,
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
      if (user.nickname_effects && user.nickname_effects.includes(effect)) {
        return this.sendError(ws, "У вас уже есть этот эффект")
      }

      // Покупаем эффект
      await this.db.updateUserCoins(user.nickname, -price)
      if (!user.nickname_effects) user.nickname_effects = []
      user.nickname_effects.push(effect)
      await this.db.updateUserNicknameEffects(user.nickname, user.nickname_effects)
      user.coins -= price

      // Отправляем обновленные данные пользователя
      this.send(ws, {
        type: "userUpdated",
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
      })

      this.send(ws, {
        type: "effectBought",
        effect: effect,
        coins: user.coins,
        nickname_effects: user.nickname_effects,
        message: `Эффект "${effect}" успешно куплен!`,
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
          const targetUser = await this.db.getUser(data.target)
          if (!targetUser) {
            return this.sendError(ws, "Пользователь не найден")
          }

          await this.db.adminUpdateUserCoins(user.nickname, data.target, data.amount)

          // Обновляем данные пользователя если он онлайн
          const targetWs = this.usersByNickname.get(data.target)
          if (targetWs) {
            const targetUserData = this.users.get(targetWs)
            if (targetUserData) {
              targetUserData.coins += data.amount
              this.send(targetWs, {
                type: "userUpdated",
                user: {
                  nickname: targetUserData.nickname,
                  avatar: targetUserData.avatar,
                  coins: targetUserData.coins,
                  nickname_effects: targetUserData.nickname_effects,
                  games_played: targetUserData.games_played,
                  games_won: targetUserData.games_won,
                  games_survived: targetUserData.games_survived,
                  is_admin: targetUserData.is_admin,
                },
              })
            }
          }

          this.send(ws, {
            type: "adminActionSuccess",
            message: `Выдано ${data.amount} монет пользователю ${data.target}`,
          })
          break

        case "giveEffect":
          const targetUser2 = await this.db.getUser(data.target)
          if (!targetUser2) {
            return this.sendError(ws, "Пользователь не найден")
          }

          const effects = targetUser2.nickname_effects || []
          if (!effects.includes(data.effect)) {
            effects.push(data.effect)
            await this.db.adminUpdateUserEffects(user.nickname, data.target, effects)

            // Обновляем данные пользователя если он онлайн
            const targetWs2 = this.usersByNickname.get(data.target)
            if (targetWs2) {
              const targetUserData2 = this.users.get(targetWs2)
              if (targetUserData2) {
                targetUserData2.nickname_effects = effects
                this.send(targetWs2, {
                  type: "userUpdated",
                  user: {
                    nickname: targetUserData2.nickname,
                    avatar: targetUserData2.avatar,
                    coins: targetUserData2.coins,
                    nickname_effects: targetUserData2.nickname_effects,
                    games_played: targetUserData2.games_played,
                    games_won: targetUserData2.games_won,
                    games_survived: targetUserData2.games_survived,
                    is_admin: targetUserData2.is_admin,
                  },
                })
              }
            }
          }

          this.send(ws, {
            type: "adminActionSuccess",
            message: `Выдан эффект ${data.effect} пользователю ${data.target}`,
          })
          break

        case "removeEffect":
          const targetUser3 = await this.db.getUser(data.target)
          if (targetUser3) {
            const effects3 = targetUser3.nickname_effects || []
            const newEffects = effects3.filter((e) => e !== data.effect)
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

  async startGame(ws) {
    const user = this.users.get(ws)
    if (!user || !user.currentRoom) {
      return this.sendError(ws, "Вы не находитесь в комнате")
    }

    const room = this.rooms.get(user.currentRoom)
    if (!room) {
      return this.sendError(ws, "Комната не найдена")
    }

    // Проверяем права создателя
    if (room.creator !== user.nickname) {
      return this.sendError(ws, "Только создатель может начать игру")
    }

    // Проверяем количество игроков
    if (room.players.length < room.minPlayers) {
      return this.sendError(ws, `Недостаточно игроков. Минимум: ${room.minPlayers}`)
    }

    try {
      console.log(`🎮 Запуск игры в комнате ${room.name}`)

      // Отменяем автостарт если он был
      this.cancelAutoStart(room)

      // Запускаем игру через игровой движок
      if (this.gameEngine) {
        console.log(`🎮 Используем GameEngine для запуска игры`)
        const game = await this.gameEngine.startGame(room, this.db)
        console.log(`🎮 Игра создана:`, game)
      } else {
        console.log(`🎮 GameEngine не найден, используем простую заглушку`)
        // Простая заглушка для запуска игры
        room.status = "playing"
        room.game = {
          phase: "night",
          day: 1,
          timeLeft: 60, // 60 секунд на ночь
          votingResults: null,
          lastAction: "Игра началась! Наступила ночь...",
        }

        // Раздаём роли
        this.assignRoles(room)
        await this.db.updateRoomStatus(room.id, "playing")
      }

      // Отправляем каждому игроку его роль
      for (const player of room.players) {
        const playerWs = this.usersByNickname.get(player.nickname)
        if (playerWs) {
          this.send(playerWs, {
            type: "roleAssigned",
            role: player.role,
            mafiaMembers:
              player.role === "mafia" || player.role === "don"
                ? room.players.filter((p) => p.role === "mafia" || p.role === "don").map((p) => p.nickname)
                : null,
          })
        }
      }

      this.broadcastToRoom(user.currentRoom, {
        type: "gameStarted",
        room: this.sanitizeRoomForClient(room),
      })

      this.broadcastToRoom(user.currentRoom, {
        type: "chatMessage",
        sender: "Система",
        message: "🎮 Игра началась! Роли розданы. Удачи!",
        timestamp: new Date().toISOString(),
      })

      await this.broadcastRoomsList()

      console.log(`🎮 Игра успешно началась в комнате ${room.name}`)
    } catch (error) {
      console.error("❌ Ошибка запуска игры:", error)
      this.sendError(ws, "Ошибка запуска игры: " + error.message)
    }
  }

  assignRoles(room) {
    const players = [...room.players]
    const roles = []
    const playerCount = players.length

    console.log(`🎭 Раздача ролей для ${playerCount} игроков`)

    // Обязательные роли
    roles.push("don") // Дон мафии

    // Добавляем мафию (1/3 от общего количества игроков, минимум 1)
    const mafiaCount = Math.max(1, Math.floor(playerCount / 3))
    for (let i = 1; i < mafiaCount; i++) {
      roles.push("mafia")
    }

    // Добавляем доктора если включён и достаточно игроков
    if (room.roles.doctor && playerCount >= 5) {
      roles.push("doctor")
    }

    // Добавляем влюблённых если включены и достаточно игроков
    if (room.roles.lovers && playerCount >= 6) {
      roles.push("lover1", "lover2")
    }

    // Заполняем остальных мирными жителями
    while (roles.length < playerCount) {
      roles.push("citizen")
    }

    // Перемешиваем роли
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[roles[i], roles[j]] = [roles[j], roles[i]]
    }

    // Назначаем роли игрокам
    players.forEach((player, index) => {
      player.role = roles[index]
      player.isAlive = true
    })

    console.log(
      `🎭 Роли назначены:`,
      players.map((p) => `${p.nickname}: ${p.role}`),
    )
  }

  checkAutoStart(room) {
    if (room.status !== "waiting" || room.autoStartTimer) {
      return // Игра уже идёт или таймер уже запущен
    }

    const playerCount = room.players.length
    let autoStartDelay = null

    // Если набрано максимум игроков - 3 секунды
    if (playerCount >= room.maxPlayers) {
      autoStartDelay = 3
    }
    // Если набрано минимум игроков - 16 секунд
    else if (playerCount >= room.minPlayers) {
      autoStartDelay = 16
    }

    if (autoStartDelay) {
      console.log(`⏰ Запуск автостарта для комнаты ${room.name} через ${autoStartDelay} секунд`)

      room.autoStartTimer = autoStartDelay
      room.autoStartInterval = setInterval(() => {
        room.autoStartTimer--

        // Отправляем обновление таймера всем в комнате
        this.broadcastToRoom(room.id, {
          type: "autoStartTimer",
          timeLeft: room.autoStartTimer,
          reason: playerCount >= room.maxPlayers ? "Комната заполнена" : "Минимум игроков набран",
        })

        if (room.autoStartTimer <= 0) {
          this.executeAutoStart(room)
        }
      }, 1000)

      // Уведомляем о начале автостарта
      this.broadcastToRoom(room.id, {
        type: "autoStartTimer",
        timeLeft: room.autoStartTimer,
        reason: playerCount >= room.maxPlayers ? "Комната заполнена" : "Минимум игроков набран",
      })

      this.broadcastToRoom(room.id, {
        type: "chatMessage",
        sender: "Система",
        message: `⏰ Автостарт через ${autoStartDelay} секунд! ${playerCount >= room.maxPlayers ? "Комната заполнена" : "Минимум игроков набран"}`,
        timestamp: new Date().toISOString(),
      })
    }
  }

  cancelAutoStart(room) {
    if (room.autoStartTimer && room.autoStartInterval) {
      console.log(`❌ Отмена автостарта для комнаты ${room.name}`)

      clearInterval(room.autoStartInterval)
      room.autoStartTimer = null
      room.autoStartInterval = null

      this.broadcastToRoom(room.id, {
        type: "autoStartCancelled",
      })

      this.broadcastToRoom(room.id, {
        type: "chatMessage",
        sender: "Система",
        message: "❌ Автостарт отменён",
        timestamp: new Date().toISOString(),
      })
    }
  }

  async executeAutoStart(room) {
    console.log(`🚀 Выполнение автостарта для комнаты ${room.name}`)

    // Очищаем таймер
    clearInterval(room.autoStartInterval)
    room.autoStartTimer = null
    room.autoStartInterval = null

    try {
      // Запускаем игру
      if (this.gameEngine) {
        console.log(`🎮 Автостарт: используем GameEngine`)
        const game = await this.gameEngine.startGame(room, this.db)
        console.log(`🎮 Автостарт: игра создана`)
      } else {
        console.log(`🎮 Автостарт: используем простую заглушку`)
        room.status = "playing"
        room.game = {
          phase: "night",
          day: 1,
          timeLeft: 60,
          votingResults: null,
          lastAction: "Игра началась автоматически! Наступила ночь...",
        }

        this.assignRoles(room)
        await this.db.updateRoomStatus(room.id, "playing")
      }

      // Отправляем каждому игроку его роль
      for (const player of room.players) {
        const playerWs = this.usersByNickname.get(player.nickname)
        if (playerWs) {
          this.send(playerWs, {
            type: "roleAssigned",
            role: player.role,
            mafiaMembers:
              player.role === "mafia" || player.role === "don"
                ? room.players.filter((p) => p.role === "mafia" || p.role === "don").map((p) => p.nickname)
                : null,
          })
        }
      }

      this.broadcastToRoom(room.id, {
        type: "gameStarted",
        room: this.sanitizeRoomForClient(room),
      })

      this.broadcastToRoom(room.id, {
        type: "chatMessage",
        sender: "Система",
        message: "🚀 Игра запущена автоматически! Роли розданы. Удачи!",
        timestamp: new Date().toISOString(),
      })

      await this.broadcastRoomsList()

      console.log(`🎮 Автостарт: игра успешно началась в комнате ${room.name}`)
    } catch (error) {
      console.error("❌ Ошибка автостарта:", error)

      this.broadcastToRoom(room.id, {
        type: "chatMessage",
        sender: "Система",
        message: "❌ Ошибка автостарта игры",
        timestamp: new Date().toISOString(),
      })
    }
  }

  async handleGameAction(ws, data) {
    const user = this.users.get(ws)
    if (!user || !user.currentRoom) {
      return this.sendError(ws, "Вы не находитесь в комнате")
    }

    const room = this.rooms.get(user.currentRoom)
    if (!room || !room.game) {
      return this.sendError(ws, "Игра не найдена")
    }

    console.log(`🎮 Игровое действие от ${user.nickname}:`, data.action)

    try {
      // Передаём действие в игровой движок
      if (this.gameEngine) {
        await this.gameEngine.handleAction(room, user.nickname, data.action.action, data.action.target)
      } else {
        // Простая обработка действий без движка
        this.send(ws, {
          type: "actionReceived",
          message: `Действие "${data.action.action}" принято`,
        })
      }

      // Обновляем состояние игры для всех
      this.broadcastToRoom(user.currentRoom, {
        type: "gameUpdate",
        game: {
          phase: room.game.phase,
          day: room.game.day,
          timeLeft: room.game.timeLeft,
          lastAction: room.game.lastAction,
          votingResults: room.game.votingResults,
        },
      })
    } catch (error) {
      console.error("❌ Ошибка обработки игрового действия:", error)
      this.sendError(ws, "Ошибка обработки действия")
    }
  }

  async addBot(ws, data) {
    const user = this.users.get(ws)
    if (!user || !user.is_admin) {
      return this.sendError(ws, "У вас нет прав администратора")
    }

    if (!user.currentRoom) {
      return this.sendError(ws, "Вы не находитесь в комнате")
    }

    const room = this.rooms.get(user.currentRoom)
    if (!room) {
      return this.sendError(ws, "Комната не найдена")
    }

    if (room.players.length >= room.maxPlayers) {
      return this.sendError(ws, "Комната заполнена")
    }

    const botName = data.botName || `Бот${Date.now()}`
    const botAvatar = data.botAvatar || "🤖"

    // Проверяем уникальность имени
    if (room.players.find((p) => p.nickname === botName)) {
      return this.sendError(ws, "Игрок с таким именем уже существует")
    }

    // Добавляем бота
    room.players.push({
      nickname: botName,
      avatar: botAvatar,
      isCreator: false,
      role: null,
      isAlive: true,
      isBot: true,
    })

    // Проверяем автостарт
    this.checkAutoStart(room)

    this.broadcastToRoom(user.currentRoom, {
      type: "roomUpdated",
      room: this.sanitizeRoomForClient(room),
    })

    this.broadcastToRoom(user.currentRoom, {
      type: "chatMessage",
      sender: "Система",
      message: `🤖 Бот ${botName} добавлен в комнату`,
      timestamp: new Date().toISOString(),
    })

    this.send(ws, {
      type: "botAdded",
      botName: botName,
    })

    console.log(`🤖 Админ ${user.nickname} добавил бота ${botName}`)
  }

  async removeBot(ws, data) {
    const user = this.users.get(ws)
    if (!user || !user.is_admin) {
      return this.sendError(ws, "У вас нет прав администратора")
    }

    if (!user.currentRoom) {
      return this.sendError(ws, "Вы не находитесь в комнате")
    }

    const room = this.rooms.get(user.currentRoom)
    if (!room) {
      return this.sendError(ws, "Комната не найдена")
    }

    const botIndex = room.players.findIndex((p) => p.nickname === data.botName && p.isBot)
    if (botIndex === -1) {
      return this.sendError(ws, "Бот не найден")
    }

    room.players.splice(botIndex, 1)

    // Отменяем автостарт если условия больше не выполняются
    this.cancelAutoStart(room)

    this.broadcastToRoom(user.currentRoom, {
      type: "roomUpdated",
      room: this.sanitizeRoomForClient(room),
    })

    this.broadcastToRoom(user.currentRoom, {
      type: "chatMessage",
      sender: "Система",
      message: `🤖 Бот ${data.botName} удалён из комнаты`,
      timestamp: new Date().toISOString(),
    })

    this.send(ws, {
      type: "adminActionSuccess",
      message: `Бот ${data.botName} удалён`,
    })

    console.log(`🗑️ Админ ${user.nickname} удалил бота ${data.botName}`)
  }

  async forceEndGame(ws, data) {
    const user = this.users.get(ws)
    if (!user || !user.is_admin) {
      return this.sendError(ws, "У вас нет прав администратора")
    }

    const room = this.rooms.get(data.roomId || user.currentRoom)
    if (!room) {
      return this.sendError(ws, "Комната не найдена")
    }

    if (room.game) {
      room.status = "waiting"
      room.game = null

      // Сбрасываем роли
      room.players.forEach((player) => {
        player.role = null
        player.isAlive = true
      })

      await this.db.updateRoomStatus(room.id, "waiting")

      this.broadcastToRoom(room.id, {
        type: "gameEnded",
        room: this.sanitizeRoomForClient(room),
      })

      this.broadcastToRoom(room.id, {
        type: "chatMessage",
        sender: "Система",
        message: `👑 Игра принудительно завершена администратором`,
        timestamp: new Date().toISOString(),
      })
    }

    this.send(ws, {
      type: "adminActionSuccess",
      message: `Игра в комнате завершена`,
    })

    console.log(`👑 Админ ${user.nickname} завершил игру в комнате ${room.id}`)
  }

  async getUserProfile(ws, nickname) {
    try {
      const user = await this.db.getUser(nickname)
      if (!user) {
        return this.sendError(ws, "Пользователь не найден")
      }

      this.send(ws, {
        type: "userProfile",
        profile: {
          nickname: user.nickname,
          avatar: user.avatar,
          coins: user.coins,
          nickname_effects: user.nickname_effects,
          games_played: user.games_played,
          games_won: user.games_won,
          games_survived: user.games_survived,
          is_admin: user.is_admin,
          created_at: user.created_at,
          last_login: user.last_login,
        },
      })
    } catch (error) {
      console.error("❌ Ошибка получения профиля:", error)
      this.sendError(ws, "Ошибка получения профиля пользователя")
    }
  }

  handleDisconnect(ws) {
    const user = this.users.get(ws)
    if (!user) {
      return
    }

    // НЕ покидаем комнату при отключении - пользователь может переподключиться
    // if (user.currentRoom) {
    //   this.leaveRoom(ws)
    // }

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
      const gameStats = this.gameEngine ? this.gameEngine.getGameStats() : { activeGames: 0 }

      this.send(ws, {
        type: "stats",
        stats: {
          onlineUsers: wsStats.connectedUsers,
          activeRooms: wsStats.activeRooms,
          activeGames: gameStats.activeGames,
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
  async rejoinRoom(ws, roomId) {
    this.sendError(ws, "Переподключение к комнатам временно недоступно")
  }
}

console.log("✅ WebSocketHandler модуль загружен")
module.exports = WebSocketHandler
