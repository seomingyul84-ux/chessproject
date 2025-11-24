// script.js

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
const IS_FREE_CAPTURE_THRESHOLD = 100; 
const EXCHANGE_UP_THRESHOLD = 150; 
// 🌟🌟🌟 익스체인지 다운 감지를 위해 최소 허용 손실 값을 -150으로 조정했습니다.
// Rook for Knight (-200), Bishop for Pawn (-200) 손실을 차단합니다.
const MAX_ACCEPTABLE_LOSS_IN_RANDOM_MOVE = -150; 
const HIGH_VALUE_PIECE_THRESHOLD = 300; // 나이트, 비숍, 룩, 퀸

let selectedSquare = null; 
const MIN_LEVEL_FOR_ANTI_BLUNDER = 15; 
let originalStatusText = '';

// 특정 칸이 상대방 기물에 의해 공격받고 있는지 확인하는 함수
function isSquareAttacked(square, chess, byColor) {
    const pieces = chess.board();
    
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const piece = pieces[i][j];
            if (piece && piece.color === byColor) {
                const pieceSquare = piece.square;
                const moves = chess.moves({ square: pieceSquare, verbose: true });
                
                for (let k = 0; k < moves.length; k++) {
                    if (moves[k].to === square) {
                        return true; 
                    }
                }
            }
        }
    }
    return false; 
}

// 이동 시 발생하는 순수 기물 가치 이득을 계산하는 함수
function getNetMaterialGain(move, currentChess) {
    if (!move.captured) return 0;

    const capturedPieceValue = PIECE_VALUES[move.captured.toLowerCase()] || 0;
    const movedPiece = currentChess.get(move.from);
    const movedPieceValue = PIECE_VALUES[movedPiece.type.toLowerCase()] || 0;

    return capturedPieceValue - movedPieceValue;
}

// ... (Stockfish 통신 함수들은 변경 없음) ...
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

// ... (UI 관련 함수들은 변경 없음) ...
function removeHighlights() {
    $('#myBoard .square-55d63').removeClass('highlight-dot highlight-capture'); 
}
function highlightMoves(square) {
    const moves = chess.moves({ square: square, verbose: true });
    if (moves.length === 0) return;
    for (let i = 0; i < moves.length; i++) {
        const targetSquare = moves[i].to;
        const targetSquareClass = `.square-${targetSquare}`;
        if (moves[i].captured) { 
            $(`#myBoard ${targetSquareClass}`).addClass('highlight-capture');
        } else {
            $(`#myBoard ${targetSquareClass}`).addClass('highlight-dot');
        }
    }
}
function showTemporaryWarning(message) {
    const statusElement = document.getElementById('status');
    originalStatusText = statusElement.textContent; 
    statusElement.textContent = message; 
    statusElement.style.color = '#ff4747'; 
    setTimeout(() => {
        if (statusElement.textContent === message) {
            updateStatus(true); 
        }
    }, 2000);
}
function showPromotionDialog(from, to) {
    isEngineThinking = true; 
    
    const promotionPiece = prompt(
        "폰 승진: 어떤 기물로 승진하시겠습니까?\n" +
        "퀸(q), 룩(r), 비숍(b), 나이트(n) 중 하나를 입력하세요.", 
        "q" 
    );

    const validPromotions = ['q', 'r', 'b', 'n'];
    let chosenPromotion = promotionPiece ? promotionPiece.toLowerCase() : 'q';
    
    if (!validPromotions.includes(chosenPromotion)) {
        alert("잘못된 입력입니다. 자동으로 퀸(q)으로 승진됩니다.");
        chosenPromotion = 'q';
    }

    const moveResult = chess.move({ 
        from: from, 
        to: to, 
        promotion: chosenPromotion 
    });

    if (moveResult) {
        console.log(`[Promotion] Move: ${moveResult.san}, Promoted to: ${chosenPromotion}`);
        if (playerColor === 'w' && chess.history().length === 1) {
            setDifficultySliderState(false);
        }
        if (playerColor === 'b' && chess.history().length === 2 && moveResult.color === 'b') {
            setDifficultySliderState(false);
        }
        
        board.position(chess.fen());
        updateStatus();
        
        isEngineThinking = false;
        window.setTimeout(computerMove, 250);
    } else {
        alert("승진 처리 중 오류가 발생했습니다. 게임을 새로 시작해야 할 수 있습니다.");
        isEngineThinking = false;
        startNewGame();
    }
}


function onSquareClick(square) {
    if (chess.turn() !== playerColor || isEngineThinking) {
        return; 
    }
    const piece = chess.get(square);

    if (selectedSquare) {
        let move = null;
        try {
            move = chess.move({ from: selectedSquare, to: square, promotion: 'q' });
        } catch (e) {
        }

        if (move && move.promotion) {
            chess.undo(); 
            removeHighlights();
            selectedSquare = null;
            
            showPromotionDialog(move.from, move.to);
            return;
        }

        if (move) {
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
        
        if (chess.in_check()) {
            showTemporaryWarning(`🚫 체크 상태입니다! 킹을 안전하게 이동시키거나 체크를 막는 수를 두세요.`);
        } 
        
        if (piece && piece.color === playerColor) {
            removeHighlights();
            selectedSquare = square;
            highlightMoves(square);
            return;
        }
        
        removeHighlights();
        selectedSquare = null;
        return;
    }
    
    if (piece && piece.color === playerColor) {
        selectedSquare = square;
        highlightMoves(square);
    } else {
        selectedSquare = null;
        removeHighlights();
    }
}


// ... (handleOpeningMove, computerMove 함수는 변경 없음) ...
function handleOpeningMove() {
    let moveUci = null;
    const history = chess.history({ verbose: true });
    
    if (chess.turn() === 'w' && playerColor === 'b' && history.length === 0) {
        const rand = Math.random();
        moveUci = (rand < 0.60) ? 'e2e4' : 'd2d4';
        if (moveUci) {
            setDifficultySliderState(false);
        }
    } 
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
    
    const enableAntiBlunder = (selectedSkillLevel >= MIN_LEVEL_FOR_ANTI_BLUNDER);
    
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
            const allMoves = chess.moves({ verbose: true }); 
            const opponentColor = chess.turn() === 'w' ? 'b' : 'w';
            
            // 🌟🌟🌟 안전한 수 필터링 (익스체인지 다운 감지 최종 강화) 🌟🌟🌟
            const safeMoves = allMoves.filter(move => {
                const tempChess = new Chess(chess.fen());
                const movedPiece = chess.get(move.from);
                
                try {
                    // 승진 수의 경우, 기본값인 퀸(q)으로 승진하여 안전성 검사
                    tempChess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' }, { sloppy: true }); 
                } catch (e) {
                    return false;
                }
                
                // 1. 체크메이트 당하는 수 방지 (항상 적용)
                if (tempChess.in_checkmate()) return false; 
                
                // 2. 치명적인 블런더 및 익스체인지 다운 방지 (레벨 15 이상)
                if (enableAntiBlunder && movedPiece) {
                    const movedPieceValue = PIECE_VALUES[movedPiece.type.toLowerCase()] || 0;
                    
                    // a. 고가치 기물을 움직이거나 캡처하는 경우만 검토
                    if (movedPieceValue >= HIGH_VALUE_PIECE_THRESHOLD || move.captured) { 
                        
                        const isAttackedAfterMove = isSquareAttacked(move.to, tempChess, opponentColor);
                        const capturedPieceValue = (PIECE_VALUES[move.captured ? move.captured.toLowerCase() : ''] || 0);

                        // 헌납(Free Loss) 감지: 캡처 없이 나이트/비숍 이상이 공격받는 경우
                        if (movedPieceValue >= HIGH_VALUE_PIECE_THRESHOLD && isAttackedAfterMove && !move.captured) {
                            console.log(`BLUNDER DETECTED (FREE LOSS - ${movedPiece.type}): ${move.lan}. 차단됨.`);
                            return false; 
                        }

                        // 순수 이득 = 잡은 기물 가치 - 움직인 기물 가치
                        let netGain = capturedPieceValue - movedPieceValue;
                        
                        // 익스체인지 다운 (Exchange Down) 감지: 
                        // 이동이 교환(move.captured)을 포함하거나, 이동 후 기물이 공격받는 상황(isAttackedAfterMove)에서
                        // 순 손실이 MAX_ACCEPTABLE_LOSS_IN_RANDOM_MOVE(-150)보다 클 경우 차단합니다.
                        if (isAttackedAfterMove || move.captured) { 
                            if (netGain < MAX_ACCEPTABLE_LOSS_IN_RANDOM_MOVE) { 
                                console.log(`BLUNDER DETECTED (EXCHANGE DOWN/LOSS): ${move.lan}, Net Gain: ${netGain}. 차단됨.`);
                                return false;
                            }
                        }
                    }
                }
                
                return true; 
            });
            
            let randomMoves = safeMoves.filter(m => m.lan !== bestMoveLan);
            
            
            // 3-1. 공짜 기물 캡처 수 찾기 (1순위)
            const freeCaptureMoves = randomMoves.filter(move => {
                if (!move.captured) return false;
                if (getNetMaterialGain(move, chess) < IS_FREE_CAPTURE_THRESHOLD) return false;
                
                const tempChessAfterMove = new Chess(chess.fen());
                tempChessAfterMove.move(move.lan, { sloppy: true }); 
                const isAttackedAfterCapture = isSquareAttacked(move.to, tempChessAfterMove, opponentColor);

                if (!isAttackedAfterCapture) {
                    return true; 
                }
                return false; 
            });

            // 3-2. 익스체인지 업 수 찾기 (2순위)
            const exchangeUpMoves = randomMoves.filter(move => {
                if (!move.captured) return false;
                
                const netGain = getNetMaterialGain(move, chess);
                if (netGain < EXCHANGE_UP_THRESHOLD) return false;
                
                return true; 
            });


            let moveSelected = null;
            
            if (freeCaptureMoves.length > 0) {
                moveSelected = freeCaptureMoves[Math.floor(Math.random() * freeCaptureMoves.length)];
                console.log(`LOG: Free Capture Move 선택: ${moveSelected.san}`);
            } else if (exchangeUpMoves.length > 0) {
                moveSelected = exchangeUpMoves[Math.floor(Math.random() * exchangeUpMoves.length)];
                console.log(`LOG: Exchange Up Move 선택: ${moveSelected.san}`);
            } else if (randomMoves.length > 0) {
                moveSelected = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                console.log(`LOG: General Random Move 선택: ${moveSelected.san}`);
            }

            if (moveSelected) {
                const promotionChar = moveSelected.promotion ? 'q' : '';
                const moveUci = moveSelected.from + moveSelected.to + promotionChar;

                moveResult = executeUciMove(moveUci); 
                if (!moveResult) console.error(`LOG: Random Move (${moveUci}) 적용 실패!`); 
            } else {
                moveResult = executeUciMove(bestMoveLan);
                if (moveResult) console.warn("LOG: 안전한 수가 없어 Best Move로 강제 회귀.");
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


// ... (UI 초기화 및 상태 업데이트 함수들은 변경 없음) ...
function setDifficultySliderState(isEnabled) {
    const slider = document.getElementById('difficultySlider');
    const levelControlBox = document.getElementById('levelControl');
    if (isEnabled) {
        slider.disabled = false;
        levelControlBox.style.opacity = 1.0;
        levelControlBox.title = "";
    } else {
        slider.disabled = true;
        levelControlBox.style.opacity = 0.6; 
        levelControlBox.title = "게임이 진행 중이므로 난이도 변경이 불가능합니다.";
    }
}
function startNewGame() {
    const colorSelect = document.getElementById('playerColor');
    playerColor = colorSelect.value;
    chess.reset(); 
    if (board) board.position('start'); 
    selectedSquare = null; 
    removeHighlights(); 
    setDifficultySliderState(true); 
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
function updateStatus(isRestoring = false) {
    if (isRestoring === true) {
        document.getElementById('status').textContent = originalStatusText;
    }
    let status = '';
    const statusElement = document.getElementById('status');
    let color = '#f0f0f0'; 
    if (chess.in_checkmate()) {
        status = `체크메이트! ${chess.turn() === 'w' ? '흑' : '백'} 승리`;
        setDifficultySliderState(true);
        color = '#ff6347'; 
    } else if (chess.in_draw()) {
        status = '무승부!';
        setDifficultySliderState(true);
        color = '#ffd700'; 
    } else if (chess.in_check()) {
        status = `${chess.turn() === 'w' ? '백' : '흑'} 차례입니다. (체크 상태!)`;
        color = '#ff6347'; 
    } else {
        status = `${chess.turn() === 'w' ? '백' : '흑'} 차례입니다.`;
        color = '#f0f0f0'; 
    }
    if (!isRestoring) {
        statusElement.textContent = status;
        statusElement.style.color = color;
        originalStatusText = status; 
    } else {
         statusElement.style.color = color;
    }
}
function updateDifficultyDisplay(level) {
    const FIXED_DEPTH = 11;
    $('#difficultyLevel').text(level);
    $('#depthDisplay').text(FIXED_DEPTH); 
    $('#controlBoxHeader').text(`레벨 ${level}`);
}
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
            setDifficultySliderState(true); 
            startNewGame(); 
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
