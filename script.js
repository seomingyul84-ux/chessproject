// =========================================================
// 1. 상수 및 초기화
// =========================================================

const chess = new Chess();
let board = null; 
let playerColor = 'w'; 
let isEngineThinking = false; 

// ⭐ Stockfish Worker 초기화 변수
let stockfish = null;
let lastMoveInfo = {}; 

// ♟️ 기물 가치 정의 (CP 단위)
const PIECE_VALUES = {
    'p': 100, 'n': 300, 'b': 300, 
    'r': 500, 'q': 900, 'k': 0 
};

// 🛡️ 기물 헌납 방지 임계값 (나이트/비숍 이상의 가치 손실은 블런더로 간주)
const MATERIAL_LOSS_THRESHOLD = -300; 

// 🖱️ [클릭 기능]: 클릭 기반 이동을 위한 상태 변수
let selectedSquare = null; 

/**
 * move를 뒀을 때 기물 가치의 순손실을 계산합니다.
 * @param {object} move - chess.js move 객체 (verbose: true)
 * @param {object} currentChess - 현재 chess.js 객체
 * @returns {number} 순 기물 이득 (CP)
 */
function getMaterialLoss(move, currentChess) {
    const fromPiece = currentChess.get(move.from);
    if (!fromPiece) return 0;
    let capturedPieceValue = 0;
    let movedPieceValue = PIECE_VALUES[fromPiece.type.toLowerCase()] || 0;

    if (move.captured) {
        capturedPieceValue = PIECE_VALUES[move.captured.toLowerCase()] || 0;
    }
    const netValue = capturedPieceValue - movedPieceValue;

    // 기물 헌납 판단: 잡는 기물 없이 나이트/비숍 이상을 공짜로 주는 경우
    if (!move.captured && movedPieceValue >= PIECE_VALUES['n']) {
        return -301; 
    }
    
    return netValue; 
}

// =========================================================
// 2. Stockfish Engine (UCI) 통신 함수
// =========================================================

function initStockfish() {
    try {
        stockfish = new Worker('./lib/stockfish.min.js'); 
    } catch (e) {
         document.getElementById('status').textContent = "⚠️ Stockfish 엔진 로드 실패! 파일 경로를 확인하세요.";
         console.error("Stockfish Worker 초기화 실패:", e);
         return;
    }

    stockfish.onmessage = handleStockfishMessage;
    stockfish.postMessage('uci');
    stockfish.postMessage('isready');
    stockfish.postMessage('setoption name Use NNUE value true');
    stockfish.postMessage('setoption name Threads value 4'); 
}

function handleStockfishMessage(event) {
    const message = event.data;
    
    if (message.startsWith('info')) {
        const scoreMatch = message.match(/score\s+(cp|mate)\s+([\-0-9]+)/);
        if (scoreMatch) {
            lastMoveInfo.scoreType = scoreMatch[1];
            lastMoveInfo.scoreValue = parseInt(scoreMatch[2].replace('+', '')); 
        }
    }
    
    if (message.startsWith('bestmove')) {
        const bestMoveLan = message.split(' ')[1];
        lastMoveInfo.bestmove = bestMoveLan;
        console.log(`[SF Output] Best Move: ${bestMoveLan}, Score: ${lastMoveInfo.scoreType} ${lastMoveInfo.scoreValue}`);
        executeEngineMove(); 
    }
}

function getBestMove(fen, selectedDepth) {
    lastMoveInfo = {
        bestmove: null, scoreType: null, scoreValue: null, depth: 0
    };
    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Depth: ${selectedDepth})...`;
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
    let promotion = (uciMove.length === 5) ? uciMove.substring(4, 5) : undefined;
    
    try {
        return chess.move({ from: from, to: to, promotion: promotion });
    } catch (e) {
        console.error("UCI Move 실행 중 예외 발생:", e);
        return null;
    }
}

// ----------------------------------------------------
// 🖱️ 클릭 기반 이동 로직
// ----------------------------------------------------

function removeHighlights() {
    $('#myBoard .square-55d63').removeClass('highlight-dot');
}

function highlightMoves(square) {
    const moves = chess.moves({
        square: square,
        verbose: true
    });
    if (moves.length === 0) return;
    for (let i = 0; i < moves.length; i++) {
        $(`#myBoard .square-${moves[i].to}`).addClass('highlight-dot');
    }
}

/**
 * 🌟 onSquareClick: 기물 선택 및 이동 처리
 */
function onSquareClick(square) {
    if (chess.turn() !== playerColor || isEngineThinking) {
        return; 
    }
    const piece = chess.get(square);

    // 1. 이전에 기물이 선택된 상태 (이동 시도 또는 새 기물 선택)
    if (selectedSquare) {
        const move = chess.move({ from: selectedSquare, to: square, promotion: 'q' });

        // A. 합법적인 이동 성공
        if (move) {
            removeHighlights();
            selectedSquare = null;
            board.position(chess.fen());
            updateStatus();
            window.setTimeout(computerMove, 250); 
            return;
        } 
        
        // B. 이동 실패 시, 자신의 다른 기물인지 확인 (선택 변경)
        if (piece && piece.color === playerColor) {
            removeHighlights();
            selectedSquare = square;
            highlightMoves(square);
            return;
        }
        
        // C. 합법적이지 않은 곳 클릭 (선택 해제)
        removeHighlights();
        selectedSquare = null;
        return;
    }

    // 2. 기물이 선택되지 않은 상태 (기물 선택 시도)
    if (piece && piece.color === playerColor) {
        selectedSquare = square;
        highlightMoves(square);
    } else {
        selectedSquare = null;
        removeHighlights();
    }
}

function handleOpeningMove() {
    let moveUci = null;
    const history = chess.history({ verbose: true });
    
    // 오프닝 로직: 게임 초반 2수까지는 강제 오프닝 적용
    if (history.length < 2) {
        if (chess.turn() === 'w' && playerColor === 'b') {
            const rand = Math.random();
            moveUci = (rand < 0.60) ? 'e2e4' : 'd2d4';
        } else if (chess.turn() === 'b' && playerColor === 'w' && history.length === 1) {
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
            if (board) board.position(chess.fen()); 
            document.getElementById('status').textContent = `컴퓨터가 오프닝 수(${moveResult.san})를 두었습니다.`;
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
    
    // 🌟 Depth 11 고정
    const selectedDepth = 11; 

    getBestMove(currentFen, selectedDepth);
}

/**
 * Stockfish 응답(bestmove)을 받아 최종 수를 실행하는 함수
 */
function executeEngineMove() {
    isEngineThinking = true;
    const bestMoveLan = lastMoveInfo.bestmove;
    let moveResult = null;
    
    // --- 난이도/M1 로직 설정 ---
    const difficultySlider = document.getElementById('difficultySlider');
    const selectedSkillLevel = parseInt(difficultySlider.value);
    const MAX_DIFFICULTY = 30;
    const bestMoveProbability = selectedSkillLevel / MAX_DIFFICULTY;
    
    // 🚨 M1/체크 강제 실행 조건
    let forceBestMove = chess.in_check() || (lastMoveInfo.scoreType === 'mate' && lastMoveInfo.scoreValue === 1);
    
    // ----------------------------
    
    if (bestMoveLan && bestMoveLan !== '(none)') { 
        
        // 🌟🌟🌟 M1 강제 및 확률 기반 실행 🌟🌟🌟
        if (forceBestMove || Math.random() < bestMoveProbability) {
            
            moveResult = executeUciMove(bestMoveLan);
            
            if (moveResult) {
                if (forceBestMove) {
                    console.log(`LOG: 👑 MATE/CHECK 강제 Best Move 선택: ${moveResult.san}`);
                } else {
                    console.log(`LOG: Best Move 선택 (확률 통과): ${moveResult.san}`);
                }
            } else {
                console.error(`LOG: Best Move (${bestMoveLan}) 적용 실패!`);
            }

        } else {
            // 🎲 Random Move 선택 로직
            const moves = chess.moves({ verbose: true }); 
            let randomMoves = moves.filter(m => m.lan !== bestMoveLan);
            
            // ⚠️ 블런더 필터: M1 허용 방지 + 기물 헌납 방지
            const safeRandomMoves = randomMoves.filter(move => {
                // 1. M1 허용 방지
                const tempChess = new Chess(chess.fen());
                tempChess.move(move.lan, { sloppy: true }); 
                if (tempChess.in_checkmate()) return false; 
                
                // 2. 기물 헌납 방지
                const loss = getMaterialLoss(move, chess);
                if (loss < MATERIAL_LOSS_THRESHOLD) {
                    return false; 
                }
                
                return true; 
            });
            randomMoves = safeRandomMoves; 
            
            if (randomMoves.length > 0) {
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                const randomMoveUci = randomMove.from + randomMove.to + (randomMove.promotion || '');
                
                moveResult = executeUciMove(randomMoveUci); 
                
                if (moveResult) {
                    console.log(`LOG: Random Move 선택 (확률 불만족): ${moveResult.san}`);
                } else {
                    console.error(`LOG: Random Move (${randomMoveUci}) 적용 실패!`); 
                }

            } else {
                // 안전한 Random Move가 없으면 Best Move로 강제 회귀
                moveResult = executeUciMove(bestMoveLan);
                if (moveResult) {
                    console.warn("LOG: 안전한 Random Move가 없어 Best Move로 강제 회귀.");
                } else {
                    console.error(`LOG: Best Move (${bestMoveLan}) 회귀 적용 실패!`);
                }
            }
        }
        
        // 최종 적용 결과를 보드에 반영
        if (moveResult) {
             if (board) board.position(chess.fen()); 
             document.getElementById('status').textContent = `컴퓨터가 ${moveResult.san} 수를 두었습니다.`;
        } else {
             document.getElementById('status').textContent = `⚠️ 오류: 수를 보드에 적용할 수 없습니다.`;
        }
    
    } else {
        document.getElementById('status').textContent = `⚠️ 엔진이 수를 찾지 못했습니다.`;
    } 
    
    isEngineThinking = false; 
    if (moveResult) updateStatus();
}


// =========================================================
// 4. 난이도 및 보드 초기화 로직
// =========================================================

function startNewGame() {
    const colorSelect = document.getElementById('playerColor');
    playerColor = colorSelect.value;
    chess.reset(); 
    if (board) board.position('start'); 
    
    // 🖱️ [클릭 기능]: 새 게임 시 선택 상태 초기화 및 점 제거
    selectedSquare = null; 
    removeHighlights(); 
    
    if (playerColor === 'b') {
        if (board) board.orientation('black');
    } else {
        if (board) board.orientation('white');
    }
    
    updateStatus();
    
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

function updateDifficultyDisplay(level) {
    const FIXED_DEPTH = 11;
    $('#difficultyLevel').text(level);
    $('#depthDisplay').text(FIXED_DEPTH); 
    $('#controlBoxHeader').text(`레벨 ${level}`);
}


// =========================================================
// 5. 초기 실행
// =========================================================

// 🌟 [핵심 변경]: onDrop 대신 onSquareClick 사용
const config = {
    draggable: false, 
    position: 'start',
    onSquareClick: onSquareClick, // 클릭 기반 이동 등록
    pieceTheme: 'img/{piece}.png' 
};

window.addEventListener('load', function() {
    initStockfish();

    setTimeout(() => {
        try {
            board = ChessBoard('myBoard', config); 
            
            const difficultySlider = $('#difficultySlider');
            updateDifficultyDisplay(difficultySlider.val());
            difficultySlider.on('input', function() {
                const level = $(this).val();
                updateDifficultyDisplay(level);
            });
            
            startNewGame(); 
            
            // 🎨 점(dot) 표시를 위한 CSS 스타일 추가
            $('head').append('<style>.highlight-dot { background-image: radial-gradient(circle, #555 15%, transparent 16%); }</style>');

        } catch (e) {
            console.error("CRITICAL ERROR: 초기화 실패!", e);
        }
    }, 250); 
});
