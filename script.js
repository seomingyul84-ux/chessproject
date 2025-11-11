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

// 경고 메시지를 저장할 변수
let originalStatusText = '';

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
    $('#myBoard .square-55d63').removeClass('highlight-dot highlight-capture'); 
    console.log('[Highlight] All highlights removed.'); 
}

function highlightMoves(square) {
    const moves = chess.moves({ square: square, verbose: true });
    
    console.log(`[Highlight] Found ${moves.length} moves from ${square}.`); 

    if (moves.length === 0) return;
    
    for (let i = 0; i < moves.length; i++) {
        const targetSquare = moves[i].to;
        const targetSquareClass = `.square-${targetSquare}`;
        
        if (moves[i].captured) { 
            $(`#myBoard ${targetSquareClass}`).addClass('highlight-capture');
            console.log(`[Highlight] Attempting to add capture highlight to ${targetSquare} via selector: ${targetSquareClass}`);
        } else {
            $(`#myBoard ${targetSquareClass}`).addClass('highlight-dot');
            console.log(`[Highlight] Attempting to add dot to ${targetSquare} via selector: ${targetSquareClass}`);
        }
    }
}

// 🚨 경고 메시지를 잠깐 보여주는 함수
function showTemporaryWarning(message) {
    const statusElement = document.getElementById('status');
    originalStatusText = statusElement.textContent; // 현재 상태 저장

    statusElement.textContent = message; // 경고 메시지 표시
    statusElement.style.color = '#ff4747'; // 경고 색상 (빨간색)

    // 2초 후에 원래 상태로 복구
    setTimeout(() => {
        // 복구 시점에 현재 상태가 경고 메시지가 아니면 복구하지 않음 (다른 업데이트가 있을 수 있음)
        if (statusElement.textContent === message) {
            updateStatus(true); 
        }
    }, 2000);
}


function onSquareClick(square) {
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
            
            // 난이도 슬라이더 비활성화 로직 (플레이어의 첫 수가 두어지면)
            if (playerColor === 'w' && chess.history().length === 1) {
                setDifficultySliderState(false);
            }
            if (playerColor === 'b' && chess.history().length === 2 && move.color === 'b') {
                setDifficultySliderState(false);
            }
            
            removeHighlights();
            selectedSquare = null;
            board.position(chess.fen());
            updateStatus();
            window.setTimeout(computerMove, 250); 
            return;
        } 
        
        // 이동 실패 시 경고 시스템
        if (chess.in_check()) {
            showTemporaryWarning(`🚫 체크 상태입니다! 킹을 안전하게 이동시키거나 체크를 막는 수를 두세요.`);
        } else {
            showTemporaryWarning(`⚠️ 유효하지 않은 이동입니다.`);
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

function handleOpeningMove() {
    let moveUci = null;
    const history = chess.history({ verbose: true });
    
    // AI가 백(w)일 때 (흑 플레이어의 경우)
    if (chess.turn() === 'w' && playerColor === 'b' && history.length === 0) {
        const rand = Math.random();
        moveUci = (rand < 0.60) ? 'e2e4' : 'd2d4';
        
        // 흑 플레이 시, 컴퓨터의 첫 수가 두어지면 난이도 잠금
        if (moveUci) {
            setDifficultySliderState(false);
        }
    } 
    // AI가 흑(b)일 때 (백 플레이어의 경우)
    else if (chess.turn() === 'b' && playerColor === 'w' && history.length === 1) {
        const playerMove = history[0].san; 
        const rand = Math.random();
        
        if (playerMove === 'e4') {
            if (rand < 0.50) { moveUci = 'e7e5'; } 
            else if (rand < 0.75) { moveUci = 'c7c5'; } 
            else { moveUci = (Math.random() < 0.5) ? 'e7e6' : 'c7c6'; } 
        } else if (playerMove === 'd4') {
            if (rand < 0.50) { moveUci = 'd7d5'; } 
            else { moveUci = 'g8f6'; }
        } else if (playerMove === 'c4') {
            moveUci = 'e7e5';
        } else if (playerMove === 'Nf3' || playerMove === 'g3') {
            moveUci = 'd7d5';
        }
        
        // 백 플레이 시, 컴퓨터의 응수가 두어지면 난이도 잠금
        if (moveUci) {
            setDifficultySliderState(false);
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

function setDifficultySliderState(isEnabled) {
    const slider = document.getElementById('difficultySlider');
    const levelControlBox = document.getElementById('levelControl');
    if (isEnabled) {
        slider.disabled = false;
        levelControlBox.style.opacity = 1.0;
        levelControlBox.title = "";
        console.log('[UI Control] Difficulty slider enabled.');
    } else {
        slider.disabled = true;
        levelControlBox.style.opacity = 0.6; // 시각적으로 비활성화 표시
        levelControlBox.title = "게임이 진행 중이므로 난이도 변경이 불가능합니다.";
        console.log('[UI Control] Difficulty slider disabled.');
    }
}

function startNewGame() {
    const colorSelect = document.getElementById('playerColor');
    playerColor = colorSelect.value;
    chess.reset(); 
    if (board) board.position('start'); 
    selectedSquare = null; 
    removeHighlights(); 
    
    // 새 게임 시작 시 슬라이더를 일단 활성화 상태로 둡니다. (첫 수 두기 전까지 변경 가능)
    setDifficultySliderState(true); 
    
    if (playerColor === 'b') {
        if (board) board.orientation('black');
    } else {
        if (board) board.orientation('white');
    }
    updateStatus();
    
    // 흑으로 플레이할 때 컴퓨터(백)가 첫 수를 둡니다.
    if (playerColor === 'b' && chess.turn() === 'w') {
        window.setTimeout(computerMove, 500); 
    }
}

function updateStatus(isRestoring = false) {
    if (isRestoring === true) {
        // 경고 메시지 복구 시, originalStatusText의 내용을 status에 적용
        document.getElementById('status').textContent = originalStatusText;
    }

    let status = '';
    const statusElement = document.getElementById('status');
    let color = '#f0f0f0'; // 기본색

    if (chess.in_checkmate()) {
        status = `체크메이트! ${chess.turn() === 'w' ? '흑' : '백'} 승리`;
        setDifficultySliderState(true);
        color = '#ff6347'; // 게임 오버 시 빨간색
    } else if (chess.in_draw()) {
        status = '무승부!';
        setDifficultySliderState(true);
        color = '#ffd700'; // 무승부 시 노란색
    } else if (chess.in_check()) {
        status = `${chess.turn() === 'w' ? '백' : '흑'} 차례입니다. (체크 상태!)`;
        color = '#ff6347'; // 체크 상태일 때 빨간색 경고
    } else {
        status = `${chess.turn() === 'w' ? '백' : '흑'} 차례입니다.`;
        color = '#f0f0f0'; // 일반 상태일 때 기본색
    }
    
    // 경고 메시지가 아니라면 상태와 색상 업데이트
    if (!isRestoring) {
        statusElement.textContent = status;
        statusElement.style.color = color;
        originalStatusText = status; // 원래 상태 저장
    } else {
         // 복원 시에는 텍스트는 originalStatusText로 이미 복구되었으므로 색상만 복구
         statusElement.style.color = color;
    }
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
            
            // 초기 로드 시 난이도 변경이 가능하도록 활성화
            setDifficultySliderState(true); 

            startNewGame(); 
            
            // 클릭 이벤트 강제 바인딩 (onSquareClick 버그 우회)
            $('#myBoard').on('click', '.square-55d63', function() {
                const square = $(this).attr('data-square');
                if (square) {
                    onSquareClick(square);
                }
            });

        } catch (e) {
            console.error("CRITICAL ERROR: 초기화 실패!", e);
        }
    }, 250); 
});
