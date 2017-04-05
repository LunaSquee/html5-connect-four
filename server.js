const express = require('express')
const socketio = require('socket.io')
const http = require('http')
const path = require('path')

let app = express()
let server = http.createServer(app)
let io = socketio(server)

app.enable('trust proxy')
app.disable('x-powered-by')

app.use('/', express.static(path.join(__dirname, '/client/')))

function playerNameValidation (name) {
  if (/^([A-Z0-9_\-@]{3,20})$/i.test(name)) {
    return true
  }
  return false
}

let clients = {}
let games = {}

let totalGames = 0

// Generate a random int betweem two ints
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Generate random string of characters
function nuid(len) {
  let buf = [],
    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    charlen = chars.length

  for (let i = 0; i < len; ++i) {
    buf.push(chars[getRandomInt(0, charlen - 1)])
  }

  return buf.join('')
}

function clientsBySocketID (id) {
  let result = null

  for (let uid in clients) {
    let client = clients[uid]
    if (client.sockID === id) {
      result = uid
    }
  }

  return result
}

function determineOpponent (myIndex) {
  let opponent = 'red'
  
  if (myIndex === 'red') {
    opponent = 'blue'
  }

  return opponent
}

function killGamesClientIsIn (uid) {
  for (let gameId in games) {
    let game = games[gameId]
    if (game.blue && game.blue === uid) {
      if (!game.isWaiting && game.red) {
        clients[game.red].socket.emit('game_end', {win: true, result: 0})
      }
    } else if (game.red && game.red === uid) {
      if (clients[game.blue]) {
        clients[game.blue].socket.emit('game_end', {win: true, result: 0})
      }
    } else {
      continue
    }
    delete games[gameId]
    console.log(gameId + ' was ended abruptly on ' + uid + '\'s demand.')
  }
}

function createNewGame (uid) {
  let client = clients[uid]
  let gameId = nuid(16)

  client.socket.emit('game_new_done', {gameId: gameId})

  console.log(client.name + ' has started a new game. ID: ' + gameId)

  games[gameId] = {
    blue: uid,
    red: null,
    isWaiting: true,
    turn: 1,
    places: [[],[],[],[],[],[],[],[],[]],
    created: new Date(),
    started: null
  }
}

function joinGame (uid, gameId) {
  let me = clients[uid]

  if (!games[gameId]) {
    return me.socket.emit('game_error', {message: 'That game has ended!'})
  }

  if (games[gameId].red != null) {
    return me.socket.emit('game_error', {message: 'That game has already started!'})
  }

  if (!clients[games[gameId].blue]) {
    return me.socket.emit('game_error', {message: 'That game has ended!'})
  }

  let game = games[gameId]

  game.red = uid

  game.isWaiting = false
  game.started = new Date()

  let opponent = clients[game.blue]

  if (!opponent) {
    return me.socket.emit('game_error', {message: 'Your opponent abruptly dissappeared, what?'})
  }

  opponent.socket.emit('game_start', {gameId: gameId, opponentId: uid, opponentName: me.name, color: 'blue'})
  me.socket.emit('game_start', {gameId: gameId, opponentId: opponent.uid, opponentName: opponent.name, color: 'red'})

  game.turn = 'blue'
  clients[game.blue].socket.emit('turn', true)
  clients[uid].socket.emit('turn', false)

  totalGames += 1
}

function endGame (gameId, victoryId, loserId, status) {
  if (clients[victoryId]) {
    clients[victoryId].socket.emit('game_end', {win: true, result: status})
  }

  if (clients[loserId]) {
    clients[loserId].socket.emit('game_end', {win: false, result: status})
  }

  delete games[gameId]
  console.log(gameId + ' ended with ' + victoryId + '\'s victory.')
}

function waitingGamesList (uid) {
  let result = []
  let cap = 0

  let gamesInSession = 0
  for (let i in games) {
    let game = games[i]
    if (!game.isWaiting) {
      gamesInSession += 1
    }
  }

  for (let gameId in games) {
    if (cap >= 20) break

    let game = games[gameId]

    if (game.isWaiting) {
      let userName = clients[game.blue].name
      if (uid && game.blue === uid) continue

      result.push({
        gameId: gameId,
        name: userName,
        started: game.started
      })

      cap += 1
    }
  }

  return {
    sessions: gamesInSession,
    totalGames: totalGames,
    list: result
  }
}

function determinePlayerById (gameId, uid) {
  let game = games[gameId]

  if (!game) return null

  if (game.blue && game.blue === uid) {
    return 'blue'
  } else if (game.red && game.red === uid) {
    return 'red'
  }

  return null
}

function getPiece (game, col, index) {
  if (col > 8 || index > 8) return
  col = game.places[col]
  
  if (!col) return

  if (!col.length) {
    return
  }

  let match = null
  for (let i in col) {
    if (col[i].y === index) {
      match = col[i]
      break
    }
  }
  return match
}

function detectWin (color, game) {
  let win = false
  for (let c in game.places) {
    let col = game.places[c]
    for (let p in col) {
      let piece = col[p]
      let matches = 0
      for (let i = 0; i < 4; i++) {
        let pAt = getPiece(game, parseInt(c) + i, piece.y)
        if (pAt && pAt.color === color) {
          console.log(pAt)
          matches += 1
        } else {
          matches = 0
        }
      }
      if (matches >= 4) {
        win = true
        console.log('horizontal win')
        break
      }
      matches = 0
      for (let i = 0; i < 4; i++) {
        let pAt = getPiece(game, parseInt(c), piece.y + i)
        if (pAt && pAt.color === color) {
          matches += 1
        } else {
          matches = 0
        }
      }
      if (matches >= 4) {
        console.log('vertical win')
        win = true
        break
      }
      matches = 0
      for (let i = 0; i < 4; i++) {
        let pAt = getPiece(game, parseInt(c) + i, piece.y - i)
        if (pAt && pAt.color === color) {
          matches += 1
        } else {
          matches = 0
        }
      }
      if (matches >= 4) {
        console.log('diagonal right win')
        win = true
        break
      }
      matches = 0
      for (let i = 0; i < 4; i++) {
        let pAt = getPiece(game, parseInt(c) - i, piece.y - i)
        if (pAt && pAt.color === color) {
          matches += 1
        } else {
          matches = 0
        }
      }
      if (matches >= 4) {
        console.log('diagonal left win')
        win = true
        break
      }
    }
  }
  return win
}

function detectTie (game) {
  let tie = true
  for (let c in game.places) {
    let col = game.places[c]
    if (col.length !== 9) {
      tie = false
      break
    }
  }
  return tie
}

io.on('connection', (socket) => {
  socket.on('session_create', (data) => {
    if (!data.name) {
      return socket.emit('login_status', {success: false, message: 'Invalid name.'})
    }

    if (!playerNameValidation(data.name)) {
      return socket.emit('login_status', {success: false, message: 'Invalid name.'})
    }

    let playerUid = nuid(32)

    socket.emit('login_status', {success: true, uid: playerUid, name: data.name})
    clients[playerUid] = {
      socket: socket,
      name: data.name,
      sockID: socket.conn.id
    }

    console.log('New player: "' + data.name + '" with uid ' + playerUid)
  })

  socket.on('poll_games', () => {
    let client = clientsBySocketID(socket.conn.id)
    socket.emit('poll_games_res', waitingGamesList(client))
  })

  socket.on('game_attempt_join', (data) => {
    let client = clientsBySocketID(socket.conn.id)
    
    if (!client) {
      socket.emit('game_error', {message: 'You are not logged in properly!'})
      socket.emit('force_relog')
      return
    }

    if (!data.gameId) return

    joinGame(client, data.gameId)
  })

  socket.on('leave_game', (data) => {
    let client = clientsBySocketID(socket.conn.id)
    
    if (!client) return
    killGamesClientIsIn(client)

    socket.emit('left_success')
  })

  socket.on('new_game', () => {
    let client = clientsBySocketID(socket.conn.id)
    
    if (!client) {
      socket.emit('game_error', {message: 'You are not logged in properly!'})
      socket.emit('force_relog')
      return
    }

    createNewGame(client)
  })

  socket.on('chat_send', (data) => {
    let client = clientsBySocketID(socket.conn.id)
    
    if (!client) {
      socket.emit('game_error', {message: 'You are not logged in properly!'})
      socket.emit('force_relog')
      return
    }

    let game = games[data.gameId]
    let playerInGame = determinePlayerById(data.gameId, client)

    if (!playerInGame) {
      socket.emit('game_error', {message: 'unexpected error. code: 763'})
      return
    }

    let opponent = determineOpponent(playerInGame)
    let opponentObj = game[opponent]
    let me = game[playerInGame]

    clients[opponentObj].socket.emit('chat', {name: clients[me].name, message: data.message})
  })

  socket.on('place_at', (data) => {
    let client = clientsBySocketID(socket.conn.id)
    
    if (!client) {
      socket.emit('game_error', {message: 'You are not logged in properly!'})
      socket.emit('force_relog')
      return
    }

    let game = games[data.gameId]
    let playerInGame = determinePlayerById(data.gameId, client)

    if (!playerInGame) {
      socket.emit('game_error', {message: 'unexpected error. code: 763'})
      return
    }

    if (data.column == null || data.column > 9) {
      socket.emit('game_error', {message: 'Unexpected column'})
      return
    }

    let opponent = determineOpponent(playerInGame)
    opponent = game[opponent]

    let me = game[playerInGame]

    clients[me].socket.emit('place', {column: data.column, color: playerInGame})
    clients[opponent].socket.emit('place', {column: data.column, color: playerInGame})

    game.places[data.column].push({color: playerInGame, y: 8 - game.places[data.column].length})
    console.log(game.places[data.column])

    if (detectWin(playerInGame, game)) {
      endGame(data.gameId, me, opponent, 1)
      return
    }

    if (detectTie(game)) {
      endGame(data.gameId, me, opponent, 2)
      return
    }

    clients[me].socket.emit('turn', false)
    clients[opponent].socket.emit('turn', true)
  })

  socket.on('disconnect', () => {
    let client = clientsBySocketID(socket.conn.id)
    if (!client) return

    killGamesClientIsIn(client)

    console.log('Player uid ' + client + ' left.')

    delete clients[client]
  })
})

server.listen(8245)
