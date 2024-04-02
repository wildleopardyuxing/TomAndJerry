document.addEventListener('DOMContentLoaded', () => {
    let ws;
    let id;
    let gameStarted = false;
    
    // All elements.
    const serverIpInput = document.getElementById('serverIp');
    const joinButton = document.getElementById('joinButton');
    const exitButton = document.getElementById('exitButton');
    const startButton = document.getElementById('startButton');
    const joinButtonZone = document.getElementById('join-button');
    const otherButtonZone = document.getElementById('other-buttons');
    const playerList = document.getElementById('player-list');
    const joinGame = document.getElementById('join-game');
    const gameUI = document.getElementById('game-ui');
    const gameCanvas = document.getElementById('gameCanvas');
    const gameOverElement = document.getElementById('game-over');
    const gameOverExitButton = document.getElementById('gameOverExitButton');
    const gameOverRestartButton = document.getElementById('gameOverRestartButton');
    const ctx = gameCanvas.getContext('2d');

    // Player icons.
    const catIcon = new Image();
    catIcon.src = './img/cat.png';
    const mouseIcon = new Image();
    mouseIcon.src = './img/mouse.png';
    const wallIcon = new Image();
    wallIcon.src = './img/wall.png';
    const cheeseIcon = new Image();
    cheeseIcon.src = './img/cheese.png';

    // Button event listeners.
    joinButton.addEventListener('click', function() {
        const serverIp = serverIpInput.value;
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            connectToServer(serverIp);
        }
    });
    exitButton.addEventListener('click', disconnect);
    startButton.addEventListener('click', startGame);
    gameOverExitButton.addEventListener('click', disconnect);
    gameOverRestartButton.addEventListener('click', startGame);

    // Player move controller.
    document.addEventListener('keydown', (e) => {
        if (!gameStarted) return;

        let direction;
        switch (e.key) {
            case 'ArrowUp': direction = 'up'; break;
            case 'ArrowDown': direction = 'down'; break;
            case 'ArrowLeft': direction = 'left'; break;
            case 'ArrowRight': direction = 'right'; break;
        }
        if (direction) {
            ws.send(JSON.stringify({ type: 'move', direction }));
        }
    });

    // Creates WebSocket connection and event controllers.
    function connectToServer(serverIp) {
        ws = new WebSocket(`ws://${serverIp}:8080`);

        ws.onopen = function() {
            console.log("Connected to server");
            joinButtonZone.style.display = 'none';
            otherButtonZone.style.display = 'inline-block';
            playerList.style.opacity = 1;
        };

        ws.onmessage = function(event) {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        };
        
        ws.onclose = function() {
            console.log("Disconnected from server");
        };

        ws.onerror = function() {
            console.log("WebSocket error");
        };
    }

    // Reloads the page while disconnects.
    function disconnect() {
        if (ws) {
            ws.close();
        }
        window.location.reload();
    }

    // Handles WebSocket messages.
    function handleWebSocketMessage(message) {
        switch(message.type) {
            // Store the id.
            case 'id':
                id = message.id;
                break;
            // Update the player list.
            case 'playerList':
                handlePlayerList(message.data.players);
                break;
            // Initiate the game area while game starts.
            case 'gameStarted':
                initGameArea();
                gameOverElement.style.display = 'none';
                break;
            // Update the game states data.
            case 'update':
                if (!gameStarted) {
                    initGameArea();
                }
                updateTimerDisplay(message.data.gameTime);
                updateScoreboard(message.data.players);
                updateGameCanvas(message.data);
                break;
            // Show game over message while game ends.
            case 'gameOver':
                gameStarted = false;
                updateGameCanvas(message.data);
                showGameOver(message.data.winner);
                break;
        }
    }

    // Starts the game.
    function startGame() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'startGame' }));
        }
    }

    // Initiates the game area.
    function initGameArea() {
        gameStarted = true;
        document.body.style.backgroundImage = 'none';
        playerList.style.display = 'none';
        joinGame.style.display = 'none';
        gameUI.style.display = 'flex';
    }

    // Updates the player list.
    function handlePlayerList(players) {
        const playerListElement = document.getElementById('player-list');
        playerListElement.innerHTML = '';

        const infoItem = document.createElement('div');
        infoItem.className = "header";
        infoItem.textContent = `已有${players.length}名玩家加入游戏`;
        playerListElement.appendChild(infoItem);

        players.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.textContent = player.ip;
            playerListElement.appendChild(playerItem);
        });
    
        // Show the start button only if there are more than 2 players.
        if (players.length >= 2) {
            startButton.disabled = '';
        } else {
            startButton.disabled = 'disabled';
        }
    }

    // Updates the timer.
    function updateTimerDisplay(gameTime) {
        const minutes = Math.floor(gameTime / 60).toString().padStart(2, '0');
        const seconds = (gameTime % 60).toString().padStart(2, '0');
        document.getElementById('timer').textContent = `倒计时 ${minutes}:${seconds}`;
    }

    // Updates the score board.
    function updateScoreboard(players) {
        const scoreboardElement = document.getElementById('scoreboard');
        scoreboardElement.innerHTML = '';

        // Sorting and assign medals.
        players.sort((player1, player2) => {
            const score1 = player1.score.cats + player1.score.mice;
            const score2 = player2.score.cats + player2.score.mice;
            if (score1 === score2) {
                // if they have the same score, whose time smaller win.
                return player1.score.time - player2.score.time;
            } else {
                return score2 - score1;
            }
        });
        assignMedalClasses(players);

        // Prepares the table header and self score.
        const tableSelf = document.createElement('table');
        const theadSelf = document.createElement('thead');
        const tbodySelf = document.createElement('tbody');
        const headerRowSelf = document.createElement('tr');
        ['名次', 'IP地址', '总得分 (猫/鼠)'].forEach(headerText => {
            const headerCell = document.createElement('th');
            headerCell.textContent = headerText;
            headerRowSelf.appendChild(headerCell);
        });
        theadSelf.appendChild(headerRowSelf);
        tableSelf.appendChild(theadSelf);
        tableSelf.appendChild(tbodySelf);
        tableSelf.className = 'self';

        self = players.filter(player => { return player.id === id });
        self.forEach(player => {
            tbodySelf.appendChild(createPlayerScoreRow(player));
        });

        // Prepares the whole sorted score board.
        const tableAll = document.createElement('table');
        const tbodyAll = document.createElement('tbody');
        tableAll.appendChild(tbodyAll);
        tableAll.className = 'all';

        players.forEach(player => {
            tbodyAll.appendChild(createPlayerScoreRow(player));
        });

        // Adds both tables.
        scoreboardElement.appendChild(tableSelf);
        scoreboardElement.appendChild(tableAll);
    }

    // Assign medal class for each player.
    // Notes: might be multiple players have the same score,
    // they will win the same medal in this case.
    function assignMedalClasses(players) {
        let rank = 1;
        let prevTotalScore = -1;
        let medalsAssigned = 0;
        
        players.forEach((player, index) => {
          const totalScore = player.score.cats + player.score.mice;
          if (totalScore === 0) return;

          if (totalScore !== prevTotalScore) {
            rank = index + 1;
          }
          prevTotalScore = totalScore;
          player.rank = rank;

          if (rank === 1 && medalsAssigned < 3) {
            player.medal = 'gold';
            medalsAssigned++;
          } else if (rank === 2 && medalsAssigned < 3) {
            player.medal = 'silver';
            medalsAssigned++;
          } else if (rank === 3 && medalsAssigned < 3) {
            player.medal = 'bronze';
            medalsAssigned++;
          } else {
            player.medal = '';
          }
        });
      }

    // Creates a row for the scoreboard of the given player.
    function createPlayerScoreRow(player) {
        const row = document.createElement('tr');
        if (player.medal === 'gold') {
            row.className = 'gold';
        } else if (player.medal === 'silver') {
            row.className = 'silver';
        } else if (player.medal === 'bronze') {
            row.className = 'bronze';
        }

        // First cell: rank
        const rankCell = document.createElement('td');
        rankCell.className = 'rank';
        rankCell.textContent = player.rank;
        row.appendChild(rankCell);

        // Second cell: IP
        const ipCell = document.createElement('td');
        ipCell.className = 'ip';
        ipCell.textContent = player.ip;
        row.appendChild(ipCell);

        // First cell: score
        const scoreCell = document.createElement('td');
        scoreCell.className = 'score';
        scoreCell.textContent = `${player.score.cats + player.score.mice} (${player.score.cats}/${player.score.mice})`;
        row.appendChild(scoreCell);

        return row;
    }

    // Updates the game canvas using the game states data.
    function updateGameCanvas(data) {
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

        // Draw the obstacles.
        data.obstacles.forEach(obstacle => {
            for (let x = obstacle.x; x < obstacle.x + obstacle.width; x += 40) {
                for (let y = obstacle.y; y < obstacle.y + obstacle.height; y += 40) {
                    ctx.drawImage(wallIcon, x, y, 40, 40);
                }
            }
        });

        // Draw the cheeses.
        data.cheeses.forEach(cheese => {
            const targetWidth = cheese.size * 2;
            const targetHeight = cheese.size * 2;
            const adjustedX = cheese.position.x - cheese.size;
            const adjustedY = cheese.position.y - cheese.size;
            ctx.drawImage(cheeseIcon, adjustedX, adjustedY, targetWidth, targetHeight);
        });

        // Draw the players.
        data.players.forEach(player => {
            // If it is yourself, draw a circle underneath.
            if (player.id === id) {
                ctx.beginPath(); 
                ctx.arc(player.position.x, player.position.y, player.size + 1, 0, Math.PI * 2, true);
                ctx.fillStyle = '#50a5f5';
                ctx.fill();
            }

            const playerIcon = player.role === 'cat' ? catIcon : mouseIcon;
            const targetWidth = player.size * 2;
            const targetHeight = player.size * 2;
            const adjustedX = player.position.x - player.size;
            const adjustedY = player.position.y - player.size;
            ctx.drawImage(playerIcon, adjustedX, adjustedY, targetWidth, targetHeight);

            // Show the player's IP on top of it.
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(player.ip, player.position.x, player.position.y - 15);
        });
    }

    // Shows game over information.
    function showGameOver(winner) {
        const winnerElement = document.getElementById('winner');
        winnerElement.innerHTML = winner === 'cats' ? '猫' : '鼠';
        gameOverElement.style.display = 'flex';
    }
});
