// =========================================================
// 1. 상수 및 초기화
// =========================================================

const chess = new Chess();
let board = null; 
let playerColor = 'w'; 
let isEngineThinking = false; 

// ⭐ Stockfish Worker 초기화 변수
let stockfish = null;
let lastMoveInfo = {}; // 엔진의 마지막 bestmove와 mate/cp 정보를 저장


// =========================================================
// 2. Stockfish Engine (UCI) 통신 함수
// =========================================================

function initStockfish() {
    // Stockfish.js가 로드되었는지 확인하고 Worker 초기화
    try {
        // './lib/stockfish.min.js' 경로를 사용합니다.
        // Worker 생성 시, Stockfish.min.js는 stockfish.wasm 파일이 같은 폴더에 있다고 가정합니다.
        stockfish = new Worker('./lib/stockfish.min.js'); 
    } catch (e) {
         document.getElementById('status').textContent = "⚠️ Stockfish 엔진 로드 실패! 파일 경로를 확인하세요.";
         console.error("Stockfish Worker 초기화 실패:", e);
         return;
    }

    stockfish.onmessage = handleStockfishMessage;
    
    // UCI 초기화 및 설정 명령
    stockfish.postMessage('uci');
    stockfish.postMessage('isready');
    
    // 엔진 설정 (성능 최적화)
    stockfish.postMessage('setoption name Use NNUE value true');
    stockfish.postMessage('setoption name Threads value 4'); 
}

function handleStockfishMessage(event) {
    const message = event.data;
    
    // 1. 평가 정보 (Mate/CP score) 파싱
    if (message.startsWith('info')) {
        const depthMatch = message.match(/depth\s+(\d+)/);
        const scoreMatch = message.match(/score\s+(cp|mate)\s+([\-0-9]+)/);
        
        if (scoreMatch) {
            lastMoveInfo.scoreType = scoreMatch[1];
            // M1일 때 값 1, M2일 때 값 2 등으로 표시됨 (숫자 앞에 +는 제거)
            lastMoveInfo.scoreValue = parseInt(scoreMatch[2].replace('+', '')); 
            if (depthMatch) {
                lastMoveInfo.depth = parseInt(depthMatch[1]);
            }
        }
    }
    
    // 2. 최종 최적 수 (Best Move) 처리
    if (message.startsWith('bestmove')) {
        const bestMoveLan = message.split(' ')[1];
        lastMoveInfo.bestmove = bestMoveLan;
        
        console.log(`[SF Output] Best Move: ${bestMoveLan}, Score: ${lastMoveInfo.scoreType} ${lastMoveInfo.scoreValue}`);
        
        // 탐색이 완료되었으므로 다음 수 실행
        executeEngineMove(); 
    }
}

function getBestMove(fen, selectedDepth) {
    // 이전 탐색 정보 초기화
    lastMoveInfo = {
        bestmove: null,
        scoreType: null,
        scoreValue: null,
        depth: 0
    };
    
    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Depth: ${selectedDepth})...`;
    
    // UCI 명령 전송
    stockfish.postMessage(`position fen ${fen}`);
    stockfish.postMessage(`go depth ${selectedDepth}`);
}

// =========================================================
// 3. 게임 로직 및 이벤트 핸들러 (AI 로직 포함)
// =========================================================

function executeUciMove(uciMove) {
    if (!uciMove || uciMove.length < 4) return null;
    
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    let promotion = undefined;
    
    if (uciMove.length === 5) {
        promotion = uciMove.substring(4, 5);
    }
    
    try {
        return chess.move({ from: from, to: to, promotion: promotion });
    } catch (e) {
        console.error("UCI Move 실행 중 예외 발생:", e);
        return null;
    }
}

function onDrop (source, target) {
    if (chess.turn() !== playerColor || isEngineThinking) {
        return 'snapback'; 
    }
    
    const move = chess.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback'; 
    
    updateStatus();
    // 0.25초 후 AI 차례
    window.setTimeout(computerMove, 250); 
}

/**
 * AI의 오프닝 수를 강제 선택하는 함수 
 */
function handleOpeningMove() {
    let moveUci = null;
    const history = chess.history({ verbose: true });
    
    // 오프닝 로직: 게임 초반 2수까지는 강제 오프닝 적용
    if (history.length < 2) {
        // AI가 백일 때 (history.length === 0)
        if (chess.turn() === 'w' && playerColor === 'b') {
            const rand = Math.random();
            moveUci = (rand < 0.60) ? 'e2e4' : 'd2d4';
        } 
        // AI가 흑일 때 (history.length === 1)
        else if (chess.turn() === 'b' && playerColor === 'w' && history.length === 1) {
            const playerMove = history[0].san; 
            const rand = Math.random();
            
            if (playerMove === 'e4') {
                if (rand < 0.50) { moveUci = 'e7e5'; } 
                else if (rand < 0.75) { moveUci = 'c7c5'; } 
                else { moveUci = (Math.random() < 0.5) ? 'e7e6' : 'c7c6'; } 
            } else if (playerMove === 'd4') {
                moveUci = 'g8f6';
            } else if (playerMove === 'c4') {
                moveUci = 'e7e5';
            } else if (playerMove === 'Nf3' || playerMove === 'g3') {
                moveUci = 'd7d5';
            }
        }
    }
    
    if (moveUci) {
        const moveResult = executeUciMove(moveUci);
        if (moveResult) {
            const finalMoveSan = moveResult.san; 
            console.log(`LOG: 오프닝 강제 선택: ${finalMoveSan}`);
            if (board) board.position(chess.fen()); 
            document.getElementById('status').textContent = `컴퓨터가 오프닝 수(${finalMoveSan})를 두었습니다.`;
            isEngineThinking = false;
            updateStatus();
            return true; 
        } else {
            return false;
        }
    }
    return false; 
}


// 컴퓨터 수 두기 함수 (엔진 탐색 요청)
async function computerMove() {
    if (chess.game_over() || isEngineThinking || chess.turn() === playerColor || !stockfish) {
        updateStatus(); 
        return;
    }
    
    if (handleOpeningMove()) {
        return; 
    }
    
    isEngineThinking = true; 
    
    const currentFen = chess.fen(); 
    
    // 🌟 [수정]: Depth를 11로 고정
    const selectedDepth = 11; 

    // Stockfish Worker에 탐색 요청
    getBestMove(currentFen, selectedDepth);
}

/**
 * Stockfish 응답(bestmove)을 받아 최종 수를 실행하는 함수
 */
function executeEngineMove() {
    isEngineThinking = true;
    
    const bestMoveLan = lastMoveInfo.bestmove;
    let moveResult = null;
    let finalMoveSan = null;
    
    // --- 난이도/M1 로직 설정 ---
    const difficultySlider = document.getElementById('difficultySlider');
    const selectedSkillLevel = parseInt(difficultySlider.value);
    
    const MAX_DIFFICULTY = 30;
    const bestMoveProbability = selectedSkillLevel / MAX_DIFFICULTY;
    
    // 🚨 M1/체크 강제 실행 조건: M1 수(mate 1)이거나 킹이 체크당한 상태
    let forceBestMove = chess.in_check() || 
                        (lastMoveInfo.scoreType === 'mate' && lastMoveInfo.scoreValue === 1);
    
    // ----------------------------
    
    if (bestMoveLan && bestMoveLan !== '(none)') { // (none)은 수가 없을 때 응답
        
        // 🌟🌟🌟 M1 강제 및 확률 기반 실행 🌟🌟🌟
        if (forceBestMove || Math.random() < bestMoveProbability) {
            
            // Best Move 실행
            moveResult = executeUciMove(bestMoveLan);
            
            if (moveResult) {
                finalMoveSan = moveResult.san; 
                if (forceBestMove) {
                    console.log(`LOG: 👑 MATE/CHECK 강제 Best Move 선택: ${finalMoveSan}`);
                } else {
                    console.log(`LOG: Best Move 선택 (확률 통과): ${finalMoveSan}`);
                }
            } else {
                console.error(`LOG: Best Move (${bestMoveLan}) 적용 실패!`);
            }

        } else {
            // 🎲 Random Move 선택 로직
            
            const moves = chess.moves({ verbose: true }); 
            let randomMoves = moves.filter(m => m.lan !== bestMoveLan);
            
            // ⚠️ 블런더 필터: 상대에게 M1을 허용하는 수는 반드시 제외
            const safeRandomMoves = randomMoves.filter(move => {
                const tempChess = new Chess(chess.fen());
                tempChess.move(move.lan, { sloppy: true }); 
                // 해당 수를 둔 후 상대방이 체크메이트를 시킬 수 있다면 위험한 수로 판단
                return !tempChess.in_checkmate(); 
            });
            randomMoves = safeRandomMoves; 
            
            if (randomMoves.length > 0) {
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                // UCI 형식으로 변환
                const randomMoveUci = randomMove.from + randomMove.to + (randomMove.promotion || '');
                
                moveResult = executeUciMove(randomMoveUci); 
                
                if (moveResult) {
                    finalMoveSan = moveResult.san; 
                    console.log(`LOG: Random Move 선택 (확률 불만족): ${finalMoveSan}`);
                } else {
                    console.error(`LOG: Random Move (${randomMoveUci}) 적용 실패!`); 
                }

            } else {
                // 안전한 Random Move가 없으면 최선수인 Best Move로 강제 회귀
                moveResult = executeUciMove(bestMoveLan);
                if (moveResult) {
                    finalMoveSan = moveResult.san; 
                    console.warn("LOG: 안전한 Random Move가 없어 Best Move로 강제 회귀.");
                } else {
                    console.error(`LOG: Best Move (${bestMoveLan}) 회귀 적용 실패!`);
                }
            }
        }
        
        // 최종 적용 결과를 보드에 반영
        if (moveResult) {
             if (board) board.position(chess.fen()); 
             document.getElementById('status').textContent = `컴퓨터가 ${finalMoveSan} 수를 두었습니다.`;
        } else {
             document.getElementById('status').textContent = `⚠️ 오류: 수를 보드에 적용할 수 없습니다.`;
        }
    
    } else {
        document.getElementById('status').textContent = `⚠️ 엔진이 수를 찾지 못했습니다.`;
    } 
    
    isEngineThinking = false; 
    
    if (moveResult) {
        updateStatus();
    }
}


// =========================================================
// 4. 난이도 및 보드 초기화 로직
// =========================================================

function startNewGame() {
    const colorSelect = document.getElementById('playerColor');
    playerColor = colorSelect.value;
    chess.reset(); 
    if (board) board.position('start'); 
    
    if (playerColor === 'b') {
        if (board) board.orientation('black');
    } else {
        if (board) board.orientation('white');
    }
    
    updateStatus();
    
    // AI가 백일 경우 즉시 첫 수를 둠
    if (playerColor === 'b' && chess.turn() === 'w') {
        window.setTimeout(computerMove, 500); 
    }
}

function updateStatus() {
    let status = '';
    if (chess.in_checkmate()) {
        status = `체크메이트! ${chess.turn() === 'w' ? '흑' : '백'} 승리`;
    } else if (chess.in_draw()) {
        status = '무승부!';
    } else {
        status = `${chess.turn() === 'w' ? '백' : '흑'} 차례입니다.`;
    }
    document.getElementById('status').textContent = status;
}

// 🌟🌟🌟 슬라이더 값 변경 시 UI 업데이트 함수 (Depth 11 고정) 🌟🌟🌟
function updateDifficultyDisplay(level) {
    const FIXED_DEPTH = 11;
    
    $('#difficultyLevel').text(level);
    $('#depthDisplay').text(FIXED_DEPTH); // Depth 11 고정 표시
    $('#controlBoxHeader').text(`레벨 ${level}`);
}


// =========================================================
// 5. 초기 실행
// =========================================================

const config = {
    draggable: true,
    position: 'start',
    onDrop: onDrop,
    onSnapEnd: function() { 
        if (board) board.position(chess.fen());
    },
    pieceTheme: 'img/{piece}.png' 
};

window.addEventListener('load', function() {
    
    // 1. Stockfish 엔진 초기화
    initStockfish();

    setTimeout(() => {
        try {
            // 2. ChessBoard 초기화
            board = ChessBoard('myBoard', config); 
            
            // 3. 슬라이더 이벤트 바인딩
            const difficultySlider = $('#difficultySlider');
            
            updateDifficultyDisplay(difficultySlider.val());

            difficultySlider.on('input', function() {
                const level = $(this).val();
                updateDifficultyDisplay(level);
            });
            
            // 4. 게임 시작 상태로 초기화
            startNewGame(); 

        } catch (e) {
            console.error("CRITICAL ERROR: 초기화 실패!", e);
        }
    }, 250); 
});
