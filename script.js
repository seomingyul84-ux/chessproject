// =========================================================
// 1. 상수 및 초기화
// =========================================================

const chess = new Chess();
let board = null; 
let playerColor = 'w'; 
let isEngineThinking = false; 

// ⭐ [추가]: Stockfish Worker 초기화
let stockfish = null;
let lastMoveInfo = {}; // 엔진의 마지막 bestmove와 mate/cp 정보를 저장

// 기물 가치 정의 (CP 단위)
const PIECE_VALUES = {
    'p': 100, 'n': 300, 'b': 300, 
    'r': 500, 'q': 900, 'k': 0 
};

function getPieceValue(piece) {
    if (!piece) return 0;
    return PIECE_VALUES[piece.toLowerCase()] || 0;
}


// =========================================================
// 2. Stockfish Engine (UCI) 통신 함수
// =========================================================

function initStockfish() {
    // 🚨 stockfish.min.js가 성공적으로 로드되었다면 'Stockfish' 객체가 전역으로 존재해야 합니다.
    if (typeof Stockfish === 'function') {
        stockfish = new Stockfish('./lib/stockfish.min.js'); // Worker 파일 경로 지정
    } else {
         // Stockfish.js가 로드되지 않았다면 Worker()로 직접 시도
        try {
             stockfish = new Worker('./lib/stockfish.min.js');
        } catch (e) {
             document.getElementById('status').textContent = "⚠️ Stockfish 엔진 로드 실패! 파일 경로를 확인하세요.";
             console.error("Stockfish Worker 초기화 실패:", e);
             return;
        }
    }

    stockfish.onmessage = handleStockfishMessage;
    
    // UCI 초기화 명령
    stockfish.postMessage('uci');
    stockfish.postMessage('isready');
    
    // 엔진 설정 (선택 사항)
    stockfish.postMessage('setoption name Use NNUE value true');
    stockfish.postMessage('setoption name Threads value 4'); // 사용하는 코어 수에 맞게 조정
}

function handleStockfishMessage(event) {
    const message = event.data;
    
    // 1. 평가 정보 (Mate/CP score) 파싱
    if (message.startsWith('info')) {
        const depthMatch = message.match(/depth\s+(\d+)/);
        const scoreMatch = message.match(/score\s+(cp|mate)\s+([\-0-9]+)/);
        
        if (scoreMatch) {
            lastMoveInfo.scoreType = scoreMatch[1];
            lastMoveInfo.scoreValue = parseInt(scoreMatch[2]);
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
    
    // UCI 명령 전송: 현재 FEN으로 포지션을 설정하고, 지정된 깊이까지 탐색 시작
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
    if (chess.turn() !== playerColor) {
        return 'snapback'; 
    }
    
    const move = chess.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback'; 
    
    updateStatus();
    window.setTimeout(computerMove, 250); 
}

/**
 * AI의 오프닝 수를 강제 선택하는 함수 (기존 로직 유지)
 */
function handleOpeningMove() {
    let moveUci = null;
    const history = chess.history({ verbose: true });
    
    // (A. AI가 백(White)일 때, B. AI가 흑(Black)일 때 로직... 그대로 유지)
    // =================================================
    // A. AI가 백(White)일 때 (첫 수)
    // =================================================
    if (chess.turn() === 'w' && history.length === 0) {
        if (playerColor === 'b') { // AI가 백일 때만 (플레이어가 흑)
            const rand = Math.random();
            if (rand < 0.60) { moveUci = 'e2e4'; } else { moveUci = 'd2d4'; }
        }
    } 
    // =================================================
    // B. AI가 흑(Black)일 때 (상대방의 첫 수에 응수)
    // =================================================
    else if (chess.turn() === 'b' && history.length === 1) {
        if (playerColor === 'w') { // AI가 흑일 때만 (플레이어가 백)
            const playerMove = history[0].san; 
            const rand = Math.random();
            
            if (playerMove === 'e4') {
                if (rand < 0.50) { moveUci = 'e7e5'; } 
                else if (rand < 0.75) { moveUci = 'c7c5'; } 
                else if (rand < 0.875) { moveUci = (Math.random() < 0.5) ? 'e7e6' : 'c7c6'; } 
                else { return false; } 
            } else if (playerMove === 'd4') {
                moveUci = 'g8f6';
            } else if (playerMove === 'c4') {
                moveUci = 'e7e5';
            } else if (playerMove === 'Nf3' || playerMove === 'g3') {
                moveUci = 'd7d5';
            } else {
                return false; 
            }
        }
    }
    
    // =================================================
    // C. 선택된 오프닝 수 실행
    // =================================================
    if (moveUci) {
        const moveResult = executeUciMove(moveUci);
        if (moveResult) {
            const finalMoveSan = moveResult.san; 
            console.log(`LOG: 오프닝 강제 선택: ${finalMoveSan}`);
            if (board) board.position(chess.fen()); 
            document.getElementById('status').textContent = `컴퓨터가 오프닝 수(${finalMoveSan})를 두었습니다.`;
            isEngineThinking = false;
            updateStatus();
            return true; // 오프닝 수 적용 성공
        } else {
            console.error(`LOG: 오프닝 수 (${moveUci}) 적용 실패! Best Move 로직으로 넘어갑니다.`);
            return false;
        }
    }
    return false; // 오프닝 조건에 해당하지 않음
}


// 컴퓨터 수 두기 함수 (엔진 탐색 요청)
async function computerMove() {
    if (chess.game_over() || isEngineThinking || chess.turn() === playerColor || !stockfish) {
        if (chess.turn() === playerColor) console.log("LOG: 플레이어 차례이므로 건너킵니다.");
        updateStatus(); 
        return;
    }
    
    // 1. 오프닝 강제 선택 로직 실행
    if (handleOpeningMove()) {
        return; 
    }
    
    isEngineThinking = true; 
    
    const currentFen = chess.fen(); 
    
    const difficultySlider = document.getElementById('difficultySlider');
    const selectedSkillLevel = parseInt(difficultySlider.value); 
    
    // Depth 계산은 기존 로직 유지
    const apiDepth = Math.max(6, Math.floor(selectedSkillLevel * 0.7) + 4); 

    // 🌟 [수정]: API 호출 대신 Stockfish Worker에 탐색 요청
    getBestMove(currentFen, apiDepth);
    
    // executeEngineMove()가 Stockfish의 'bestmove' 응답 시 호출됩니다.
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
    
    // 🚨 M1 체크: 스톡피시가 M1을 찾았으면 무조건 Best Move 실행
    let forceBestMove = chess.in_check() || 
                        (lastMoveInfo.scoreType === 'mate' && lastMoveInfo.scoreValue === 1);
    
    // ----------------------------
    
    if (bestMoveLan) {
        
        // 🌟🌟🌟 [핵심 수정]: M1 강제 및 확률 기반 실행 🌟🌟🌟
        if (forceBestMove || Math.random() < bestMoveProbability) {
            
            // M1이거나, 체크이거나, 확률을 만족하면 Best Move 실행
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
            // 🎲 Random Move 선택 및 기존의 복잡한 필터/블런더 방지 로직 (여기서는 단순화)
            
            const moves = chess.moves({ verbose: true }); 
            let randomMoves = moves.filter(m => m.lan !== bestMoveLan);
            
            // ⚠️ M1 허용 방지 로직 (M1을 허용하는 수는 반드시 제외)
            const safeRandomMoves = randomMoves.filter(move => {
                const tempChess = new Chess(chess.fen());
                tempChess.move(move.lan, { sloppy: true }); 
                return !tempChess.in_checkmate(); // 상대에게 M1 허용 방지
            });
            randomMoves = safeRandomMoves; // 안전한 수만 남김
            
            if (randomMoves.length > 0) {
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                const randomMoveUci = randomMove.from + randomMove.to + (randomMove.promotion || '');
                
                moveResult = executeUciMove(randomMoveUci); 
                
                if (moveResult) {
                    finalMoveSan = moveResult.san; 
                    console.log(`LOG: Random Move 선택 (확률 불만족): ${finalMoveSan}`);
                } else {
                    console.error(`LOG: Random Move (${randomMoveUci}) 적용 실패!`); 
                }

            } else {
                // 안전한 수가 없으면 Best Move로 강제 회귀
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
        // Best Move 찾기 실패 시 대체 로직
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

// 🌟🌟🌟 슬라이더 값 변경 시 UI 업데이트 함수 🌟🌟🌟
function updateDifficultyDisplay(level) {
    // 난이도 레벨(1~30)을 Stockfish Depth로 변환하는 공식
    const depth = Math.max(6, Math.floor(level * 0.7) + 4);
    
    $('#difficultyLevel').text(level);
    $('#depthDisplay').text(depth);
    $('#controlBoxHeader').text(`레벨 ${level}`);
}


// =========================================================
// 5. 초기 실행 (최종 안정화된 초기화)
// =========================================================

const config = {
    draggable: true,
    position: 'start',
    onDrop: onDrop,
    onSnapEnd: function() { 
        if (board) board.position(chess.fen());
    },
    // /img 폴더 바로 아래 파일이 있음을 지정
    pieceTheme: 'img/{piece}.png' 
};

// window load 이벤트와 setTimeout을 이용한 최종 안정화 초기화
window.addEventListener('load', function() {
    console.log("LOG: window load 이벤트 발생. 250ms 후 초기화 시도.");
    
    // 1. 🌟 Stockfish 엔진 초기화 🌟
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
            
            console.log("LOG: 체스보드 및 슬라이더 초기화 성공.");

        } catch (e) {
            console.error("CRITICAL ERROR: ChessBoard 초기화 실패!", e);
            document.getElementById('status').textContent = "⚠️ 치명적 오류: Chessboard 라이브러리 로드 실패! lib 폴더 내 파일을 확인하세요.";
        }
    }, 250); // 250 밀리초 지연
});
