const sqlite3 = require("sqlite3").verbose()
const path = require("path")

console.log("📦 Загрузка Database модуля...")

class Database {
  constructor() {
    console.log("💾 Создание экземпляра Database...")
    this.db = null
    // Для Render используем /tmp для временных файлов
    this.dbPath = process.env.NODE_ENV === "production" ? "/tmp/mafia_game.db" : path.join(__dirname, "mafia_game.db")
    console.log(`💾 DB Path: ${this.dbPath}`)
  }

  async init() {
    console.log(`💾 Инициализация базы данных: ${this.dbPath}`)

    return new Promise((resolve, reject) => {
      console.log(`💾 Подключение к SQLite: ${this.dbPath}`)

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error("❌ Ошибка подключения к базе данных:", err)
          console.error("DB Path:", this.dbPath)
          reject(err)
        } else {
          console.log("✅ Подключение к SQLite базе данных установлено")
          console.log(`💾 Создание таблиц...`)
          this.createTables()
            .then(() => {
              console.log("✅ Все таблицы созданы/проверены")
              resolve()
            })
            .catch(reject)
        }
      })
    })
  }

  async createTables() {
    console.log("🗃️ Создание таблиц базы данных...")

    const queries = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        avatar TEXT DEFAULT '👤',
        coins INTEGER DEFAULT 100,
        nickname_effects TEXT DEFAULT '[]',
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        games_survived INTEGER DEFAULT 0,
        is_admin BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        creator_nickname TEXT NOT NULL,
        min_players INTEGER NOT NULL,
        max_players INTEGER NOT NULL,
        roles TEXT NOT NULL,
        status TEXT DEFAULT 'waiting',
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        players TEXT NOT NULL,
        roles_distribution TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        winner TEXT,
        game_log TEXT DEFAULT '[]',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME
      )`,

      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        message_type TEXT DEFAULT 'chat',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      `CREATE TABLE IF NOT EXISTS admin_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_nickname TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_nickname TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    ]

    for (const query of queries) {
      console.log(`🗃️ Выполнение запроса: ${query.substring(0, 50)}...`)
      await this.runQuery(query)
    }

    // Создаем админа Anubis если его нет
    await this.createAnubisAdmin()
    console.log("✅ Все таблицы созданы")
  }

  async createAnubisAdmin() {
    try {
      console.log("👑 Проверка/создание админа Anubis...")
      const anubis = await this.getUser("Anubis")
      if (!anubis) {
        await this.runQuery(
          `INSERT INTO users (nickname, password, coins, is_admin, avatar) 
           VALUES (?, ?, ?, ?, ?)`,
          ["Anubis", "anubis_god_password", 999999, 1, "👑"],
        )
        console.log("✅ Великий бог Anubis создан!")
      } else if (!anubis.is_admin) {
        await this.runQuery(`UPDATE users SET is_admin = 1, coins = 999999, avatar = '👑' WHERE nickname = ?`, [
          "Anubis",
        ])
        console.log("✅ Anubis получил божественные права!")
      } else {
        console.log("✅ Великий бог Anubis уже существует")
      }
    } catch (error) {
      console.error("❌ Ошибка создания Anubis:", error)
    }
  }

  runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()

      this.db.run(query, params, function (err) {
        const duration = Date.now() - startTime

        if (err) {
          console.error(`❌ SQL Error (${duration}ms):`, err.message)
          reject(err)
        } else {
          console.log(`✅ SQL Success (${duration}ms) - changes: ${this.changes}`)
          resolve({ id: this.lastID, changes: this.changes })
        }
      })
    })
  }

  getQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
  }

  allQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  }

  async getUser(nickname) {
    const user = await this.getQuery("SELECT * FROM users WHERE nickname = ?", [nickname])
    if (user && user.nickname_effects) {
      try {
        user.nickname_effects = JSON.parse(user.nickname_effects)
      } catch {
        user.nickname_effects = []
      }
    }
    return user
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error("❌ Ошибка закрытия базы данных:", err)
          } else {
            console.log("✅ База данных закрыта")
          }
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}

console.log("✅ Database модуль загружен")
module.exports = Database
