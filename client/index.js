(function ($) {
  let io = window.io.connect()
  let Connect4 = {
    DOM: {},
    playerName: '',
    playerID: '',
    verified: null,
    locked: false,
    waitlist: [],
    played: 0,
    renderTick: false,
    Game: {
      gameId: null,
      myTurn: false,
      myColor: '',
      opponentID: '',
      opponentName: '',
      places: [[],[],[],[],[],[],[],[],[]]
    },
    color: {
      blue: '#102aed',
      red: '#ed1010'
    }
  }

  window.requestAnimFrame = (function() {
    return window.requestAnimationFrame       ||
           window.webkitRequestAnimationFrame ||
           window.mozRequestAnimationFrame    ||
           function (callback) {
             window.setTimeout(callback, 1000 / 60)
           }
  })()

  function mustacheTempl (tmlTag, data) {
    let html = ''
    const tag = document.querySelector('#' + tmlTag)

    if (!tag) return ''
    html = tag.innerHTML
    html = window.Mustache.to_html(html, data)
    return html
  }

  function pointerOnCanvas (e) {
    let x
    let y

    if (e.changedTouches) {
      let touch = e.changedTouches[0]
      if (touch) {
        e.pageX = touch.pageX
        e.pageY = touch.pageY
      }
    }

    if (e.pageX || e.pageY) { 
      x = e.pageX
      y = e.pageY
    } else {
      x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft
      y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop
    }

    x -= Connect4.DOM.canvas.offsetLeft
    y -= Connect4.DOM.canvas.offsetTop

    return {x: x, y: y}
  }

  let GameDrawer = {
    drawMyBoard: true,
    boardStaticState: null,

    mX: 0,
    mY: 0,

    padding: 32,

    gridX: 0,
    gridY: 0,

    gridSize: 64,
    mouseOn: false,

    bw: 576,
    bh: 576,

    startGame: () => {
      Connect4.Game.places = [[],[],[],[],[],[],[],[],[]]
      Connect4.ctx.clearRect(0, 0, Connect4.canvasW, Connect4.canvasH)
      Connect4.Game.myTurn = true

      let p = GameDrawer.padding

      Connect4.ctx.beginPath()
      for (let x = 0; x <= GameDrawer.bw; x += GameDrawer.gridSize) {
        Connect4.ctx.moveTo(0.5 + x + p, p)
        Connect4.ctx.lineTo(0.5 + x + p, GameDrawer.bh + p)
      }

      for (let x = 0; x <= GameDrawer.bh; x += GameDrawer.gridSize) {
        Connect4.ctx.moveTo(p, 0.5 + x + p)
        Connect4.ctx.lineTo(GameDrawer.bw + p, 0.5 + x + p)
      }
      Connect4.ctx.closePath()

      Connect4.ctx.lineWidth = 1
      Connect4.ctx.strokeStyle = "black"
      Connect4.ctx.stroke()

      GameDrawer.boardStaticState = new Image()
      GameDrawer.boardStaticState.src = Connect4.DOM.canvas.toDataURL()
      GameDrawer.boardStaticState.onload = () => {
        Connect4.renderTick = true
        GameDrawer.gameLoop()
      }
    },

    possible: (column) => {
      let inTable = Connect4.Game.places[column]
      if (inTable.length === 9) {
        return false
      }
      return true
    },

    click: () => {
      if (!Connect4.Game.gameId) return

      if (Connect4.Game.myTurn && GameDrawer.mouseOn) {
        let column = GameDrawer.gridX - 1
        if (GameDrawer.possible(column)) {
          io.emit('place_at', {column: column, gameId: Connect4.Game.gameId})
          Connect4.Game.myTurn = false
        }
      }
    },

    updater: () => {
      for (let i in Connect4.Game.places) {
        let col = Connect4.Game.places[i]
        for (let p in col) {
          let piece = col[p]
          if (piece.dy < piece.y) {
            piece.dy += 0.5
          } else {
            piece.dy = piece.y
          }
          Connect4.ctx.fillStyle = Connect4.color[piece.color]
          Connect4.ctx.fillRect((parseInt(i) * GameDrawer.gridSize) + GameDrawer.padding, 
            (piece.dy * GameDrawer.gridSize) + GameDrawer.padding, GameDrawer.gridSize, GameDrawer.gridSize)
        }
      }
      if (!Connect4.renderTick || !Connect4.Game.gameId) return
      if (Connect4.Game.myTurn) {
        if (GameDrawer.mouseOn) {
          let pos = (GameDrawer.gridX * GameDrawer.gridSize)

          Connect4.ctx.beginPath()
          Connect4.ctx.moveTo(pos - 8, (GameDrawer.padding / 2) - 4)
          Connect4.ctx.lineTo(pos, (GameDrawer.padding / 2) + 4)
          Connect4.ctx.lineTo(pos + 8, (GameDrawer.padding / 2) - 4)
          Connect4.ctx.closePath()

          Connect4.ctx.lineWidth = 10
          Connect4.ctx.strokeStyle = Connect4.color[Connect4.Game.myColor]
          Connect4.ctx.stroke()
        }
      }
    },

    gameLoop: () => {
      Connect4.ctx.clearRect(0, 0, Connect4.canvasW, Connect4.canvasH)
      if (!Connect4.renderTick) return

      GameDrawer.updater()

      Connect4.ctx.drawImage(GameDrawer.boardStaticState, 0, 0)
      requestAnimFrame(GameDrawer.gameLoop)
    },

    initialize: () => {
      Connect4.DOM.canvas.addEventListener('mousemove', (e) => {
        let p = pointerOnCanvas(e)

        if (p.x > GameDrawer.padding && p.y > GameDrawer.padding) {
          let gridX = Math.floor((p.x + GameDrawer.padding) / GameDrawer.gridSize)
          let gridY = Math.floor((p.y + GameDrawer.padding) / GameDrawer.gridSize)

          if (gridX <= 9 && gridY <= 9) {
            GameDrawer.mouseOn = true

            GameDrawer.gridX = gridX
            GameDrawer.gridY = gridY
          } else {
            GameDrawer.mouseOn = false
          }
        } else {
          GameDrawer.mouseOn = false
        }
      })

      Connect4.DOM.canvas.addEventListener('mouseleave', (e) => {
        GameDrawer.mouseOn = false
      })

      Connect4.DOM.canvas.addEventListener('click', (e) => {
        GameDrawer.click()
      })

      document.addEventListener('keydown', (e) => {
        if (GameDrawer.placingShips && e.keyCode === 82) {
          if (GameDrawer.shipOrientation === 0) {
            GameDrawer.shipOrientation = 1
          } else {
            GameDrawer.shipOrientation = 0
          }
        } 
      })
    }
  }

  function getStored (variable) {
    let result = null
    if (!window.localStorage) {
      return null
    }

    if (window.localStorage.game_store) {
      try {
        let obj = JSON.parse(window.localStorage.game_store)
        if (obj[variable] != null) {
          result = obj[variable]
        }
      } catch (e) {
        result = null
      }
    }

    return result
  }

  function storeVar (variable, value) {
    if (!window.localStorage) {
      return null
    }

    if (window.localStorage.game_store) {
      try {
        let obj = JSON.parse(window.localStorage.game_store)
        obj[variable] = value
        window.localStorage.game_store = JSON.stringify(obj)
      } catch (e) {
        return null
      }
    } else {
      let obj = {}
      obj[variable] = value
      window.localStorage.game_store = JSON.stringify(obj)
    }
  }

  function playerNameValidation (name) {
    if (/^([A-Z0-9_\-@]{3,20})$/i.test(name)) {
      return true
    }
    return false
  }

  function logWarning (msg) {
    Connect4.DOM.joinWarn.innerHTML = msg
  }

  function logStatus (msg) {
    Connect4.DOM.statusCurrent.innerHTML = msg
  }

  function joinGame (game) {
    Connect4.played += 1

    alert('Game has started!')
    //io.emit('leave_game', {gameId: Connect4.Game.gameId})
    Connect4.Game.gameId = game.gameId
    Connect4.Game.opponentID = game.opponentId
    Connect4.Game.opponentName = game.opponentName
    Connect4.Game.myColor = game.color
    Connect4.DOM.opponentName.innerHTML = game.opponentName

    Connect4.DOM.chatbox.innerHTML = ''

    io.emit('game_poll', {gameId: Connect4.Game.gameId})

    Connect4.DOM.gameScreen.style.display = 'block'
    Connect4.DOM.selectionScreen.style.display = 'none'
    Connect4.DOM.waitlistBtns.style.display = 'block'
    Connect4.DOM.waitlistQuit.style.display = 'none'
    GameDrawer.startGame()
    addChatMessage('event', null, 'Game started!')
  }

  function attemptJoin (name) {
    if (Connect4.locked) return
    if (!io.connected) {
      return logWarning('Disconnected from server socket.')
    }

    if (playerNameValidation(name) == false) {
      return logWarning('Username not allowed.')
    }

    logWarning('Attempting to join..')
    Connect4.locked = true
    io.emit('session_create', {name: name})
  }

  function joinSuccess (data) {
    Connect4.playerName = data.name
    Connect4.playerID = data.uid
    Connect4.DOM.selectionScreen.style.display = 'block'

    storeVar('name', data.name)
    io.emit('poll_games')
    Connect4.locked = false
  }

  function joinResponse (data) {
    if (data.success !== true) {
      Connect4.locked = false
      return logWarning(data.message)
    }

    Connect4.DOM.startScreen.style.display = 'none'

    joinSuccess(data)
  }

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  function constructWaitList() {
    let finalML = ''
    for (let i in Connect4.waitlist) {
      let game = Connect4.waitlist[i]
      finalML += mustacheTempl('waitlistInstance', game)
    }
    waitlist.innerHTML = finalML
  }

  window.joinWaiting = (gameId) => {
    if (Connect4.Game.gameId) return
    io.emit('game_attempt_join', {gameId: gameId})
  }

  function gameEnds (reason, winner) {
    if (reason === 1) {
      if (winner === true) {
        alert('You won!')
        logStatus('You won!')
      } else {
        alert('You lost.')
        logStatus('You lost.')
      }
    }

    if (reason === 0 && winner === true) {
      alert('Your opponent left the game.')
      Connect4.DOM.gameScreen.style.display = 'none'
      Connect4.DOM.selectionScreen.style.display = 'block'
      Connect4.renderTick = false
    }

    if (reason === 2) {
      alert('You tied!')
      logStatus('It\'s a tie!.')
    }

    Connect4.locked = false
    Connect4.Game.gameId = null
    Connect4.Game.myTurn = false
    io.emit('poll_games')

    //Connect4.DOM.gameScreen.style.display = 'none'
    //Connect4.DOM.selectionScreen.style.display = 'block'

    Connect4.DOM.waitlistBtns.style.display = 'block'
    Connect4.DOM.waitlistQuit.style.display = 'none'
    addChatMessage('event', null, 'Disconnected')
  }

  function forceRelogin () {
    logWarning('Please log in again.')
    Connect4.DOM.gameScreen.style.display = 'none'
    Connect4.DOM.selectionScreen.style.display = 'none'
    Connect4.DOM.startScreen.style.display = 'block'
    Connect4.DOM.resultScreen.style.display = 'none'

    Connect4.locked = false
    Connect4.playerName = ''
    Connect4.Game.gameId = null
  }

  function escapeHtml(unsafe) {
    return unsafe
           .replace(/&/g, "&amp;")
           .replace(/</g, "&lt;")
           .replace(/>/g, "&gt;")
           .replace(/"/g, "&quot;")
           .replace(/'/g, "&#039;")
  }

  function addChatMessage (type, senderName, message) {
    let msgElem = '<div class="message t_' + type + '">'
    if (senderName) {
      msgElem += '<span class="sender">' + senderName + '</span>&nbsp;'
    }
    msgElem += '<span class="line">' + escapeHtml(message) + '</span>'

    Connect4.DOM.chatbox.innerHTML += msgElem
    Connect4.DOM.chatbox.scrollTop = Connect4.DOM.chatbox.scrollHeight
  }

  window.onload = () => {
    const startScreen = Connect4.DOM.startScreen = $.querySelector('#start')
    const selectionScreen = Connect4.DOM.selectionScreen = $.querySelector('#selection')
    const gameScreen = Connect4.DOM.gameScreen = $.querySelector('#game')

    const warning = Connect4.DOM.joinWarn = startScreen.querySelector('#warning_message')
    const playerName = startScreen.querySelector('#player_name')
    const startButton = startScreen.querySelector('#sock_player_init')

    const waitlist = Connect4.DOM.waitlist = selectionScreen.querySelector('#waitlist')
    const random = selectionScreen.querySelector('#waitlist_join_random')
    const newGame = selectionScreen.querySelector('#waitlist_join')
    const refresh = selectionScreen.querySelector('#waitlist_join_refresh')

    const waitlistQuit = Connect4.DOM.waitlistQuit = selectionScreen.querySelector('#waitlist_quit')
    const waitlistBtns = Connect4.DOM.waitlistBtns = selectionScreen.querySelector('.idbuttons')

    const stat_ingame = selectionScreen.querySelector('#stats_players')
    const stat_total = selectionScreen.querySelector('#stats_games')
    const stat_client = selectionScreen.querySelector('#stats_clientgames')

    const leaveBtn = gameScreen.querySelector('#leave')
    const opponentName = Connect4.DOM.opponentName = gameScreen.querySelector('#opponent_name')

    let canvas = Connect4.DOM.canvas = gameScreen.querySelector('#game_canvas')
    let ctx = Connect4.ctx = canvas.getContext('2d')

    Connect4.canvasW = canvas.width
    Connect4.canvasH = canvas.height

    Connect4.DOM.statusCurrent = gameScreen.querySelector('#g_s_stat')

    const chatbox = Connect4.DOM.chatbox = gameScreen.querySelector('#messages')
    const chatfield = Connect4.DOM.chatfield = gameScreen.querySelector('#message_send')

    GameDrawer.initialize()

    let uname = getStored('name')
    if (uname) {
      playerName.value = uname
    }

    playerName.addEventListener('keydown', (e) => {
      if (e.keyCode === 13) {
        attemptJoin(playerName.value)
      }
    }, false)

    chatfield.addEventListener('keydown', (e) => {
      if (e.keyCode === 13 && Connect4.Game.gameId) {
        if (chatfield.value != '') {
          io.emit('chat_send', {message: chatfield.value, gameId: Connect4.Game.gameId})
          addChatMessage('chat me', Connect4.playerName, chatfield.value)
          chatfield.value = ''
        }
      }
    })

    startButton.addEventListener('click', (e) => {
      attemptJoin(playerName.value)
    }, false)

    newGame.addEventListener('click', (e) => {
      if (Connect4.locked) return
      if (Connect4.Game.gameId) return
      io.emit('new_game')
      Connect4.locked = true
    })

    refresh.addEventListener('click', (e) => {
      if (Connect4.locked) return
      io.emit('poll_games')
    })

    waitlistQuit.addEventListener('click', (e) => {
      io.emit('leave_game', {gameId: Connect4.Game.gameId})
    })

    leaveBtn.addEventListener('click', (e) => {
      if (Connect4.Game.gameId) {
        io.emit('leave_game', {gameId: Connect4.Game.gameId})
      }
      Connect4.DOM.gameScreen.style.display = 'none'
      Connect4.DOM.selectionScreen.style.display = 'block'
      Connect4.renderTick = false
    })

    random.addEventListener('click', (e) => {
      Connect4.joinRandomWhenDone = true
      io.emit('poll_games')
    })

    io.on('chat', (data) => {
      addChatMessage('chat', data.name, data.message)
    })

    io.on('infmessage', (message) => {
      logStatus(message)
    })

    io.on('game_start', (data) => {
      leaveBtn.innerHTML = 'Leave game'
      joinGame(data)
    })

    io.on('left_success', () => {
      gameEnds(0, null)
    })

    io.on('turn', (val) => {
      if (val === true) {
        Connect4.Game.myTurn = true
        logStatus('Your turn.')
      } else {
        Connect4.Game.myTurn = false
        logStatus('Your opponent\'s turn.')
      }
    })

    io.on('place', (data) => {
      let col = Connect4.Game.places[data.column]
      col.push({y: 8 - col.length, color: data.color, dy: 0})
    })

    io.on('game_error', (data) => {
      alert(data.message)
      gameEnds(0, null)
      io.emit('poll_games')
    })

    io.on('force_relog', () => {
      forceRelogin()
    })

    io.on('game_end', (data) => {
      gameEnds(data.result, data.win)
      leaveBtn.innerHTML = 'Back to lobby'
    })

    io.on('game_new_done', (data) => {
      Connect4.locked = true
      Connect4.DOM.waitlist.innerHTML = '<div class="green">Waiting for an opponent..</div>'
      Connect4.DOM.waitlistBtns.style.display = 'none'
      Connect4.DOM.waitlistQuit.style.display = 'block'
      Connect4.Game.gameId = data.gameId
    })

    io.on('current_stats', (data) => {
      dataOpponentDestroyed.innerHTML = data.opponentShipsLeft
      dataMineDestroyed.innerHTML = data.myShipsLeft
    })

    io.on('login_status', joinResponse)
    io.on('poll_games_res', (data) => {
      Connect4.DOM.waitlistQuit.style.display = 'none'
      
      let list = data.list

      if (data.sessions != null) {
        stat_ingame.innerHTML = data.sessions
      }

      if (data.totalGames != null) {
        stat_total.innerHTML = data.totalGames
      }

      stat_client.innerHTML = Connect4.played

      if (!list.length) {
        waitlist.innerHTML = '<div class="red">No people currently waiting, press <b>Join Wait List</b> to enter.</div>'
        Connect4.waitlist = []

        if(Connect4.joinRandomWhenDone) {
          delete Connect4.joinRandomWhenDone
        }

        return
      }

      Connect4.waitlist = list

      if (Connect4.joinRandomWhenDone && Connect4.waitlist.length) {
        delete Connect4.joinRandomWhenDone

        let rand = getRandomInt(1, Connect4.waitlist.length)

        io.emit('game_attempt_join', {gameId: Connect4.waitlist[rand - 1].gameId})
      }

      constructWaitList()
    })

    io.on('disconnect', () => {
      gameEnds(0, null)
      forceRelogin()
      logWarning('Server disconnected')
    })
  }
})(document)
