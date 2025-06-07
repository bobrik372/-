console.log("📦 Загрузка GameEngine модуля...")

class GameEngine {
  constructor() {
    console.log("🎮 Создание GameEngine...")
    this.games = new Map() // roomId -> game state
    console.log("✅ GameEngine создан")
  }

  async startGame(room, database) {
    const players = [...room.players]
    const gameId = await database.startGame(room.id, {
      players: players.map((p) => p.nickname),
      roles: room.roles,
    })

    // Распределяем роли
    const roles = this.distributeRoles(players, room.roles)

    // Обновляем игроков с ролями
    players.forEach((player, index) => {
      player.role = roles[index]
      player.isAlive = true
    })

    const game = {
      id: gameId,
      roomId: room.id,
      players: players,
      phase: "night",
      day: 1,
      timeLeft: 60, // 60 секунд на ночь
      actions: new Map(), // nickname -> action
      votingResults: {},
      lastAction: null,
      mafiaMembers: players.filter((p) => p.role === "mafia" || p.role === "don").map((p) => p.nickname),
      gameLog: [],
    }

    room.game = game
    room.status = "playing"
    this.games.set(room.id, game)

    // Запускаем таймер фазы
    this.startPhaseTimer(room.id)

    return game
  }

  distributeRoles(players, roleSettings) {
    const roles = []
    const playerCount = players.length

    // Обязательные роли
    roles.push("don") // Дон мафии

    // Добавляем мафию (1/3 от общего количества игроков)
    const mafiaCount = Math.floor(playerCount / 3)
    for (let i = 1; i < mafiaCount; i++) {
      roles.push("mafia")
    }

    // Добавляем доктора если включён
    if (roleSettings.doctor && playerCount >= 5) {
      roles.push("doctor")
    }

    // Добавляем влюблённых если включены
    if (roleSettings.lovers && playerCount >= 6) {
      roles.push("lover1", "lover2")
    }

    // Остальные - мирные жители
    while (roles.length < playerCount) {
      roles.push("citizen")
    }

    // Перемешиваем роли
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[roles[i], roles[j]] = [roles[j], roles[i]]
    }

    return roles
  }

  async handleAction(room, playerNickname, action, target = null) {
    const game = room.game
    if (!game) return

    const player = game.players.find((p) => p.nickname === playerNickname)
    if (!player || !player.isAlive) return

    // Сохраняем действие
    game.actions.set(playerNickname, { action, target, timestamp: Date.now() })

    // Логируем действие
    game.gameLog.push({
      phase: game.phase,
      day: game.day,
      player: playerNickname,
      action: action,
      target: target,
      timestamp: new Date().toISOString(),
    })

    // Проверяем, все ли сделали ход
    await this.checkPhaseCompletion(room.id)
  }

  async checkPhaseCompletion(roomId) {
    const room = this.rooms?.get(roomId)
    if (!room || !room.game) return

    const game = room.game
    const alivePlayers = game.players.filter((p) => p.isAlive)

    if (game.phase === "night") {
      // Проверяем, все ли мафиози сделали ход
      const aliveMafia = alivePlayers.filter((p) => p.role === "mafia" || p.role === "don")
      const mafiaActions = aliveMafia.filter((p) => game.actions.has(p.nickname))

      if (mafiaActions.length === aliveMafia.length) {
        await this.processNightActions(roomId)
      }
    } else if (game.phase === "day") {
      // Проверяем голосование
      const votes = Array.from(game.actions.values()).filter((a) => a.action === "vote")
      if (votes.length === alivePlayers.length) {
        await this.processDayVoting(roomId)
      }
    }
  }

  async processNightActions(roomId) {
    const room = this.rooms?.get(roomId)
    if (!room || !room.game) return

    const game = room.game
    const actions = Array.from(game.actions.entries())

    // Обрабатываем действия мафии
    const mafiaKills = actions.filter(
      ([player, action]) =>
        action.action === "kill" &&
        (game.players.find((p) => p.nickname === player)?.role === "mafia" ||
          game.players.find((p) => p.nickname === player)?.role === "don"),
    )

    // Обрабатываем лечение доктора
    const doctorHeals = actions.filter(
      ([player, action]) =>
        action.action === "heal" && game.players.find((p) => p.nickname === player)?.role === "doctor",
    )

    let killedPlayer = null
    if (mafiaKills.length > 0) {
      // Берём первое убийство (или можно сделать голосование мафии)
      const targetNickname = mafiaKills[0][1].target
      const isHealed = doctorHeals.some(([_, action]) => action.target === targetNickname)

      if (!isHealed) {
        killedPlayer = game.players.find((p) => p.nickname === targetNickname)
        if (killedPlayer) {
          killedPlayer.isAlive = false
        }
      }
    }

    // Переходим к дню
    game.phase = "day"
    game.timeLeft = 120 // 2 минуты на обсуждение
    game.actions.clear()

    // Уведомляем о результатах ночи
    game.lastAction = killedPlayer ? `${killedPlayer.nickname} был убит ночью` : "Ночь прошла спокойно"

    // Проверяем условия победы
    await this.checkWinConditions(roomId)

    // Запускаем таймер дня
    this.startPhaseTimer(roomId)
  }

  async processDayVoting(roomId) {
    const room = this.rooms?.get(roomId)
    if (!room || !room.game) return

    const game = room.game
    const votes = {}

    // Подсчитываем голоса
    for (const [voter, action] of game.actions.entries()) {
      if (action.action === "vote" && action.target) {
        votes[action.target] = (votes[action.target] || 0) + 1
      }
    }

    // Находим игрока с наибольшим количеством голосов
    let maxVotes = 0
    let votedOut = null

    for (const [target, voteCount] of Object.entries(votes)) {
      if (voteCount > maxVotes) {
        maxVotes = voteCount
        votedOut = target
      }
    }

    // Исключаем игрока
    if (votedOut && maxVotes > 0) {
      const player = game.players.find((p) => p.nickname === votedOut)
      if (player) {
        player.isAlive = false
        game.lastAction = `${votedOut} был исключён голосованием`
      }
    } else {
      game.lastAction = "Никто не был исключён"
    }

    game.votingResults = votes

    // Проверяем условия победы
    const gameEnded = await this.checkWinConditions(roomId)

    if (!gameEnded) {
      // Переходим к ночи
      game.phase = "night"
      game.day++
      game.timeLeft = 60
      game.actions.clear()

      this.startPhaseTimer(roomId)
    }
  }

  async checkWinConditions(roomId) {
    const room = this.rooms?.get(roomId)
    if (!room || !room.game) return false

    const game = room.game
    const alivePlayers = game.players.filter((p) => p.isAlive)
    const aliveMafia = alivePlayers.filter((p) => p.role === "mafia" || p.role === "don")
    const aliveCitizens = alivePlayers.filter((p) => p.role === "citizen" || p.role === "doctor")

    let winner = null

    if (aliveMafia.length === 0) {
      winner = "citizens"
    } else if (aliveMafia.length >= aliveCitizens.length) {
      winner = "mafia"
    }

    if (winner) {
      await this.endGame(roomId, winner)
      return true
    }

    return false
  }

  async endGame(roomId, winner) {
    const room = this.rooms?.get(roomId)
    if (!room || !room.game) return

    const game = room.game

    // Обновляем статистику и выдаём монеты
    for (const player of game.players) {
      const won =
        (winner === "citizens" && ["citizen", "doctor"].includes(player.role)) ||
        (winner === "mafia" && ["mafia", "don"].includes(player.role))

      const survived = player.isAlive

      // Система монеток
      let coinReward = 0
      if (won && survived) {
        coinReward = 7 // Победа + выживание
      } else if (won) {
        coinReward = 3 // Только победа
      } else {
        coinReward = -5 // Поражение
      }

      // Обновляем в базе данных
      if (this.database) {
        await this.database.updateUserStats(player.nickname, won, survived)
        await this.database.updateUserCoins(player.nickname, coinReward)
      }
    }

    // Завершаем игру
    room.status = "waiting"
    room.game = null

    if (this.database) {
      await this.database.endGame(game.id, winner, game.gameLog)
    }

    this.games.delete(roomId)

    // Уведомляем игроков
    game.lastAction = `Игра окончена! Победили: ${winner === "citizens" ? "Мирные жители" : "Мафия"}`
  }

  startPhaseTimer(roomId) {
    const room = this.rooms?.get(roomId)
    if (!room || !room.game) return

    const game = room.game

    const timer = setInterval(() => {
      game.timeLeft--

      if (game.timeLeft <= 0) {
        clearInterval(timer)

        if (game.phase === "night") {
          this.processNightActions(roomId)
        } else if (game.phase === "day") {
          this.processDayVoting(roomId)
        }
      }
    }, 1000)

    game.timer = timer
  }

  // Устанавливаем ссылку на комнаты и базу данных
  setRooms(rooms) {
    this.rooms = rooms
  }

  setDatabase(database) {
    this.database = database
  }

  getGameStats() {
    return {
      activeGames: this.games.size,
    }
  }
}

console.log("✅ GameEngine модуль загружен")
module.exports = GameEngine
