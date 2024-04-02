const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
const { v4: uuidv4 } = require('uuid');

const speed = 10;
const catSize = 12;
const mouseSize = 8;
const cheeseSize = 10;
const canvasSize = { width: 800, height: 600 };

// Game states
let gameTime;
let gameTimer;
let gameStarted = false;
let obstacles = [];
let cheeses = [];
let players = [];

// All related Websocket actions.
wss.on('connection', function connection(ws, req) {
    const ip = req.socket.remoteAddress.replace(/^::ffff:/, '');
    console.log(`New player connected from ${ip}`);

    // Creates a new player and append to the player list.
    const player = { 
      ws,
      id: null,
      ip: ip,
      role: 'mouse',
      // A player could have two kinds of scores:
      // if it started as a mouse, got some mice score by fleeing,
      // then changed to a cat after been caught, got cats score by catching other mice.
      score: { cats: 0, mice: 0, time: 0 },
      position: getRandomPosition(),
      lastMoveTime: 0,
      size: mouseSize,
      isCaught: false
    };
    players.push(player);
    console.log(`${players.length} player(s) now`);

    // Gives every new player a unique id, and passes to the client.
    const uniqueId = uuidv4();
    player.id = uniqueId;
    ws.send(JSON.stringify({ type: 'id', id: uniqueId }));

    // Updates the player list to all players.
    updatePlayerList();

    // Handles the messages from the players.
    ws.on('message', function incoming(message) {
      const parsedMessage = JSON.parse(message);

      if (parsedMessage.type === 'startGame') {
        // Starts the game, only if received the 'startGame' message
        // and also there are more then two players connected.
        if (!gameStarted && players.length >= 2) {
            startGame();
            console.log("Game started!");
        }
      } else if (gameStarted) {
        // Players only have the 'move' action during the game.
        switch (parsedMessage.type) {
            case 'move':
                handleMove(player, parsedMessage.direction);
                // Every move triggers a broadcast.
                updateGameStates();
                break;
        }
      }
    });

    // Handles the disconnection.
    ws.on('close', function() {
      // Finds who gonna disconnect.
      const playerIndex = players.findIndex(p => p.ws === ws);
      if (playerIndex !== -1) {
          // Logs and removes the player.
          console.log(`Player disconnected: ${players[playerIndex].ip}`);
          players.splice(playerIndex, 1);
      }
      console.log(`${players.length} player(s) left`);

      // If the game has not been started, notifies all players to update the player list.
      if (!gameStarted) {
        updatePlayerList();
      }

      // Checks if the game ends, for example, the last mouse disconnected.
      checkGameEnd();
    });
});

function updatePlayerList() {
  const gameState = {
    players: players.map(
      ({ id, ip, role, score, position, size }) => ({ id, ip, role, score, position, size })
    ),
  };
  notifyPlayers('playerList', gameState);
}

function updateGameStates() {
  const gameState = {
    players: players.map(
      ({ id, ip, lastMoveTime, role, score, position, size }) => ({ id, ip, lastMoveTime, role, score, position, size })
    ),
    obstacles: obstacles.map(
      ({ x, y, width, height }) => ({ x, y, width, height })
    ),
    cheeses: cheeses.map(({ position, size }) => ({ position, size })),
    gameStarted,
    gameTime
  };
  notifyPlayers('update', gameState);
}

function updateFinalStates(winner) {
  const gameState = {
    players: players.map(
      ({ id, ip, role, score, position, size }) => ({ id, ip, role, score, position, size })
    ),
    obstacles: obstacles.map(
      ({ x, y, width, height }) => ({ x, y, width, height })
    ),
    cheeses: cheeses.map(({ position, size }) => ({ position, size })),
    gameStarted,
    winner
  };
  notifyPlayers('gameOver', gameState);
}

function notifyPlayers(type, data) {
  players.forEach(({ ws }) => ws.send(JSON.stringify({ type: type, data: data })));
}

function handleMove(player, direction) {
  if (!player) return;

  const now = Date.now();
  const moveCooldown = 100;
  if (now - player.lastMoveTime < moveCooldown) return;
 
  let newPos = { ...player.position };
  switch (direction) {
    case 'up': newPos.y -= speed; break;
    case 'down': newPos.y += speed; break;
    case 'left': newPos.x -= speed; break;
    case 'right': newPos.x += speed; break;
  }

  // Makes sure players would not colliding with obstacles or out of canvas while moving.
  if (!isCollidingWithObstacles(newPos, player.size)) {
    newPos.x = Math.max(player.size, Math.min(newPos.x, canvasSize.width - player.size));
    newPos.y = Math.max(player.size, Math.min(newPos.y, canvasSize.height - player.size));
    player.position = newPos;
  }

  player.lastMoveTime = now;

  // Checks if a cat catches a mouse for every move.
  checkCatches();
}

function startGame() {
  if (gameStarted) return;

  gameStarted = true;
  notifyPlayers('gameStarted');

  // Regenerates and resets all.
  players.forEach(player => {
    player.role = 'mouse';
    player.size = mouseSize;
    player.isCaught = false;
    player.score = { cats: 0, mice: 0, time: 0 };
  });
  assignRoles();
  cheeses = [];
  obstacles = generateObstacles();
  players.forEach(player => {
    player.position = getRandomPosition(player);
  });

  // Refreshes the game instantly.
  updateGameStates();
  
  // Resets the timers.
  gameTime = 300;
  clearInterval(gameTimer);
  gameTimer = setInterval(() => {
    gameTime--;
    // Every time-change triggers a broadcast.
    updateGameStates();
    // There drops a cheese every several (depend on mouse player count) seconds.
    const mice = players.filter(player => player.role === 'mouse');
    if ((300 - gameTime) % Math.floor(30 / mice.length) === 0) {
      dropACheese();
    }
    // Pause: Every mouse gets a score after 30 seconds.
    // if ((300 - gameTime) % 30 === 0) {
    //   mouseFleeScore();
    // }

    // If the time ends, stops the timer and check the winner.
    if (gameTime <= 0) {
        clearInterval(gameTimer);
        checkGameEnd();
    }
  }, 1000);
}

function generateObstacles() {
  let obstacles = [];
  // Generates 15 obstacles at random places as random sizes,
  // all the numbers could be divided by 20.
  for (let i = 0; i < 15; i++) {
      obstacles.push({
          x: Math.floor(Math.random() * (canvasSize.width / 40)) * 40,
          y: Math.floor(Math.random() * (canvasSize.height / 40)) * 40,
          width: (Math.floor(Math.random() * 3) + 1) * 40,
          height: (Math.floor(Math.random() * 3) + 1) * 40,
      });
  }
  return obstacles;
}

function dropACheese() {
  let position;
  do {
    position = {
      x: Math.floor(Math.random() * ((canvasSize.width - 40 * 2) / 40)) * 40 + 40,
      y: Math.floor(Math.random() * ((canvasSize.height - 40 * 2) / 40)) * 40 + 40,
    };
    collision = isCollidingWithObstacles(position, cheeseSize) ||
      isCollidingWithPlayers(position, cheeseSize);
  } while (collision);
  cheeses.push({
    position: position,
    size: cheeseSize,
  });
}

function mouseFleeScore() {
  players.forEach(player => {
    if (player.role === 'mouse') {
      player.score.mice += 1;
      player.score.time = Date.now();
    }
  });
}

function assignRoles() {
  const catIndexes = new Set();
  // At least 1, and at most 2 cats will be assigned to players randomly.
  while (catIndexes.size < Math.min(2, Math.floor(players.length / 2))) {
    const randomIndex = Math.floor(Math.random() * players.length);
    catIndexes.add(randomIndex);
  }
  catIndexes.forEach(index => {
    players[index].role = 'cat';
    players[index].size = catSize;
  });
}

function getRandomPosition(player) {
  let position;
  let collision;
  let size = player ? player.size : mouseSize;
  // Makes sure every player's initial position would not colliding with
  // obstacles and other players.
  do {
    position = {
      x: Math.floor(Math.random() * (canvasSize.width - size)),
      y: Math.floor(Math.random() * (canvasSize.height - size)),
    };
    collision = isCollidingWithObstacles(position, size) ||
      isCollidingWithPlayers(position, size);
  } while (collision);

  return position;
}

function isCollidingWithObstacles(position, playerSize) {
  const radius = playerSize;

  return obstacles.some(obstacle => {
      const dx = Math.abs(position.x - (obstacle.x + obstacle.width / 2));
      const dy = Math.abs(position.y - (obstacle.y + obstacle.height / 2));

      if (dx > (obstacle.width / 2 + radius)) return false;
      if (dy > (obstacle.height / 2 + radius)) return false;

      if (dx <= (obstacle.width / 2)) return true;
      if (dy <= (obstacle.height / 2)) return true;

      const cornerDistance_sq = (dx - obstacle.width / 2) ** 2 + (dy - obstacle.height / 2) ** 2;
      return (cornerDistance_sq <= (radius ** 2));
  });
}

function isCollidingWithPlayers(position, playerSize) {
  const radius = playerSize;

  return players.some(player => {
    const dx = Math.abs(position.x - player.position.x);
    const dy = Math.abs(position.y - player.position.y);

    return (dx ** 2 + dy ** 2 <= (2 * radius) ** 2);
  });
}

function checkCatches() {
  players.forEach(catcher => {
    if (catcher.role === 'cat') {
      players.forEach(target => {
        // Checks the distances between each cat and mouse.
        if (target.role === 'mouse') {
          const dx = catcher.position.x - target.position.x;
          const dy = catcher.position.y - target.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // If cat and mouse are 'touched':
          // 1. cat got 5 points
          // 2. mouse turned into a cat
          if (distance < catcher.size + target.size) {
            catcher.score.cats += 5;
            catcher.score.time = Date.now();
            target.role = 'cat';
            target.size = catSize;
          }
        }
      });
    } else {
      cheeses = cheeses.filter(target => {
        // Checks the distances between each mouse and cheese.
        const dx = catcher.position.x - target.position.x;
        const dy = catcher.position.y - target.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
    
        // If mouse and cheese are 'touched':
        // 1. mouse got 1 point
        // 2. cheese need to be removed
        if (distance < catcher.size + target.size) {
            catcher.score.mice += 1;
            catcher.score.time = Date.now();
            return false;
        }
        // Keep the cheese since it is not touched.
        return true;
      });
    }
  });

  // Checks if the game ends for every catch.
  checkGameEnd();
}

function checkGameEnd() {
  if (!gameStarted) return;

  const cats = players.filter(player => player.role === 'cat');
  const mice = players.filter(player => player.role === 'mouse');

  if (players.length === 0) {
    console.log('All player disconnected...');
    resetGame();
  } else if (mice.length === 0) {
    console.log('Cats team win!');
    resetGame();
    updateFinalStates('cats');
  } else if (cats.length === 0 || gameTime <= 0) {
    console.log('Mice team win!');
    resetGame();
    updateFinalStates('mice');
  }
}

function resetGame() {
  console.log("Reset game");

  clearInterval(gameTimer);
  gameStarted = false;
}

console.log('Server running on port 8080');
