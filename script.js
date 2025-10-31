// =========================================================
// 1. 상수 및 초기화
// =========================================================

const chess = new Chess();
let board = null; 
let playerColor = 'w'; 
let isEngineThinking = false; 
let stockfish = null;
let lastMoveInfo = {}; 

const PIECE_VALUES = {'p': 100, 'n': 300, 'b': 300, 'r': 500, 'q': 900, 'k': 0 };
const MATERIAL_LOSS_THRESHOLD = -300; 
let selectedSquare = null; 

function getMaterialLoss(move, currentChess) {
    const fromPiece = currentChess.get(move.from);
    if (!fromPiece) return 0;
    let capturedPieceValue = 0;
    let movedPieceValue = PIECE_VALUES[fromPiece.type.toLowerCase()] || 0;
    if (move.captured) {
        capturedPieceValue = PIECE_VALUES[move.captured.toLowerCase()] || 0;
    }
    const netValue = capturedPieceValue - movedPieceValue;
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
        stockfish = new Worker('./stockfish.min.js'); 
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
    lastMoveInfo = { bestmove: null, scoreType: null, scoreValue: null, depth: 0 };
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

// 🖱️ 클릭 기반 이동 로직
function removeHighlights() {
    $('#myBoard .square-55d63').removeClass('highlight-dot');
    console.log('[Highlight] All highlights removed.'); 
}

function highlightMoves(square) {
    const moves = chess.moves({ square: square, verbose: true });
    
    console.log(`[Highlight] Found ${moves.length} moves from ${square}.`); 

    if (moves.length === 0) return;
    
    for (let i = 0; i < moves.length; i++) {
        const targetSquareClass = `.square-${moves[i].to}`;
        $(`#myBoard ${targetSquareClass}`).addClass('highlight-dot');
        console.log(`[Highlight] Attempting to add dot to ${moves[i].to} via selector: ${targetSquareClass}`);
    }
}

function onSquareClick(square) {
    // 🌟 디버깅: 함수 호출 확인 🌟
    console.log(`[Click] Square clicked: ${square}`); 

    if (chess.turn() !== playerColor || isEngineThinking) {
        console.log(`[Click] Not Player's turn or Engine thinking. Returning.`); 
        return; 
    }
    const piece = chess.get(square);

    if (selectedSquare) {
        // 1. 이동 시도
        const move = chess.move({ from: selectedSquare, to: square, promotion: 'q' });
        
        if (move) {
            console.log(`[Click] Valid move: ${move.san}`);
            removeHighlights();
            selectedSquare = null;
            board.position(chess.fen());
            updateStatus();
            window.setTimeout(computerMove, 250); 
            return;
        } 
        
        // 2. 다른 기물 선택 시도
        if (piece && piece.color === playerColor) {
            console.log(`[Click] Selection changed from ${selectedSquare} to ${square}.`);
            removeHighlights();
            selectedSquare = square;
            highlightMoves(square);
            return;
        }
        
        // 3. 무효한 이동 후 클릭 (선택 해제)
        console.log(`[Click] Invalid move or square. Deselecting.`);
        removeHighlights();
        selectedSquare = null;
        return;
    }
    
    // 4. 기물 선택 시도
    if (piece && piece.color === playerColor) {
        console.log(`[Click] Piece selected: ${square}`);
        selectedSquare = square;
        highlightMoves(square);
    } else {
        console.log(`[Click] Empty or opponent square clicked. Deselecting/No selection.`);
        selectedSquare = null;
        removeHighlights();
    }
}

/**
 * AI의 오프닝 수를 강제 선택하는 함수
 */
function handleOpeningMove() {
    let moveUci = null;
    const history = chess.history({ verbose: true });
    
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
                // 수정된 로직: d4에 대해 50% d7d5, 50% g8f6
                if (rand < 0.50) {
                    moveUci = 'd7d5'; 
                } else {
                    moveUci = 'g8f6';
                }
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


async function computerMove() {
    if (chess.game_over() || isEngineThinking || chess.turn() === playerColor || !stockfish) {
        updateStatus(); 
        return;
    }
    
    if (handleOpeningMove()) return; 
    
    isEngineThinking = true; 
    const currentFen = chess.fen(); 
    const selectedDepth = 11; 

    getBestMove(currentFen, selectedDepth);
}

function executeEngineMove() {
    isEngineThinking = true;
    const bestMoveLan = lastMoveInfo.bestmove;
    let moveResult = null;
    
    const difficultySlider = document.getElementById('difficultySlider');
    const selectedSkillLevel = parseInt(difficultySlider.value);
    const MAX_DIFFICULTY = 30;
    const bestMoveProbability = selectedSkillLevel / MAX_DIFFICULTY;
    
    let forceBestMove = chess.in_check() || (lastMoveInfo.scoreType === 'mate' && lastMoveInfo.scoreValue === 1);
    
    if (bestMoveLan && bestMoveLan !== '(none)') { 
        
        if (forceBestMove || Math.random() < bestMoveProbability) {
            moveResult = executeUciMove(bestMoveLan);
            if (moveResult) {
                console.log(`LOG: Best Move 선택: ${moveResult.san}`);
            } else {
                console.error(`LOG: Best Move (${bestMoveLan}) 적용 실패!`);
            }
        } else {
            const moves = chess.moves({ verbose: true }); 
            let randomMoves = moves.filter(m => m.lan !== bestMoveLan);
            
            const safeRandomMoves = randomMoves.filter(move => {
                const tempChess = new Chess(chess.fen());
                tempChess.move(move.lan, { sloppy: true }); 
                if (tempChess.in_checkmate()) return false; 
                
                const loss = getMaterialLoss(move, chess);
                if (loss < MATERIAL_LOSS_THRESHOLD) return false; 
                
                return true; 
            });
            randomMoves = safeRandomMoves; 
            
            if (randomMoves.length > 0) {
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                const randomMoveUci = randomMove.from + randomMove.to + (randomMove.promotion || '');
                moveResult = executeUciMove(randomMoveUci); 
                if (moveResult) {
                    console.log(`LOG: Random Move 선택: ${randomMove.san}`);
                } else {
                    console.error(`LOG: Random Move (${randomMoveUci}) 적용 실패!`); 
                }
            } else {
                moveResult = executeUciMove(bestMoveLan);
                if (moveResult) console.warn("LOG: 안전한 Random Move가 없어 Best Move로 강제 회귀.");
                else console.error(`LOG: Best Move (${bestMoveLan}) 회귀 적용 실패!`);
            }
        }
        
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
// 5. 초기 실행 (클릭 이벤트 강제 바인딩 추가)
// =========================================================

const config = {
    draggable: false, 
    position: 'start',
    onSquareClick: onSquareClick, 
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
            
            // 🌟🌟🌟 클릭 이벤트 강제 바인딩 (onSquareClick 버그 우회) 🌟🌟🌟
            // ChessBoard.js의 'square-55d63' 클래스에 직접 jQuery 이벤트를 걸어준다.
            $('#myBoard').on('click', '.square-55d63', function() {
                const square = $(this).attr('data-square');
                if (square) {
                    // 기존 onSquareClick 함수를 호출
                    onSquareClick(square);
                }
            });
            // 🌟🌟🌟 강제 바인딩 코드 끝 🌟🌟🌟


        } catch (e) {
            console.error("CRITICAL ERROR: 초기화 실패!", e);
        }
    }, 250); 
});
