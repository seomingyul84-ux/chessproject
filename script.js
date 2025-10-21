// script.js 파일 - 최종

// Global Variables for the Game
var game = new Chess(); 
var board = null;       
var engine = null;      
var START_TIME = 1000;  

var eloSlider = document.getElementById('elo-slider');
var eloDisplay = document.getElementById('elo-display');
var startButton = document.getElementById('start-button');

// --- Initialization and Engine Setup ---

eloSlider.oninput = function() {
    eloDisplay.textContent = this.value;
}

function initEngine() {
    if (engine) {
        engine.terminate(); 
    }
    
    // Web Worker 생성 (Web Server 환경에서 정상 작동)
    engine = new Worker('stockfish.js'); 
    
    engine.onmessage = function (event) {
        var line = event.data;
        
        if (line.startsWith('bestmove')) {
            var bestMove = line.split(' ')[1];
            
            if (bestMove === '(none)') {
                alert('Game Over: Checkmate or Stalemate!');
                return;
            }

            game.move(bestMove, { sloppy: true });
            board.position(game.fen());
            
            if (game.game_over()) {
                alert('게임 종료! 컴퓨터 승리.');
            }
        }
    };
    
    engine.postMessage('uci'); 
    engine.postMessage('isready');
}

function setEloAndStartGame() {
    var selectedElo = eloSlider.value;
    
    engine.postMessage('setoption name UCI_LimitStrength value true');
    engine.postMessage(`setoption name UCI_Elo value ${selectedElo}`); 
    
    game = new Chess();
    board.position('start');
    engine.postMessage('ucinewgame');
    engine.postMessage('isready');
    
    console.log(`새 게임이 ELO ${selectedElo}로 시작되었습니다.`);
}

// --- Game Interaction ---

function onDrop (source, target) {
    var move = game.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    if (move === null) return 'snapback';

    if (game.game_over()) {
        alert('게임 종료! 사용자 승리: ' + (game.in_checkmate() ? '체크메이트' : '무승부'));
        return;
    }
    
    window.setTimeout(makeEngineMove, 250);
};

function onSnapEnd () {
    board.position(game.fen());
};

function makeEngineMove() {
    var fen = game.fen(); 
    
    engine.postMessage(`position fen ${fen}`); 
    engine.postMessage(`go movetime ${START_TIME}`);
}

// Chessboard 설정
var config = {
    draggable: true,
    position: 'start',
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    // 이미지 경로 설정: 'chessboardjs/img/' 폴더 아래에 기물 파일들이 직접 위치해야 함
    pieceTheme: 'chessboardjs/img/{piece}.png' 
};

$(document).ready(function() {
    board = Chessboard('board', config);
    
    startButton.addEventListener('click', function() {
        initEngine(); 
        setTimeout(setEloAndStartGame, 500); 
    });

    initEngine();
});