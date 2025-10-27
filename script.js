// =========================================================
// 1. 상수 및 초기화
// =========================================================

// 🚨 RapidAPI 설정 (본인의 API 키로 교체하세요)
const RAPIDAPI_KEY = "98c1a1d50bmshece777cb590225ep14cbbbjsn12fcb6a75780"; 
const RAPIDAPI_HOST = "chess-stockfish-16-api.p.rapidapi.com";
const STOCKFISH_API_URL = "https://" + RAPIDAPI_HOST + "/chess/api"; 

const chess = new Chess();
let board = null; 
let playerColor = 'w'; 
let isEngineThinking = false; 

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
// 2. API 통신 함수
// =========================================================

async function postRapidApi(fen, selectedDepth) {
    const formBody = new URLSearchParams({
        fen: fen,
        depth: selectedDepth 
    });

    const fetchPromise = fetch(STOCKFISH_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded", 
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
        },
        body: formBody.toString(),
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API 응답 시간 초과 (Timeout)")), 5000)
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!response.ok) {
         throw new Error(`HTTP 오류! 상태 코드: ${response.status}`);
    }
    
    return response.json();
}

async function getBestMoveAndDepthFromStockfishApi(fen, selectedDepth) {
    console.log(`Stockfish API에 FEN 요청: ${fen}, Depth: ${selectedDepth}`); 

    try {
        const responseData = await postRapidApi(fen, selectedDepth);

        if (responseData && responseData.bestmove) {
            return {
                bestmove: responseData.bestmove, 
                depth: responseData.depth || selectedDepth 
            };
        } else {
            document.getElementById('status').textContent = `API 오류: Stockfish가 수를 찾지 못했습니다.`;
            return { bestmove: null, depth: 0 };
        }
    } catch (error) {
        if (error.message.includes("Timeout")) {
            document.getElementById('status').textContent = "⚠️ 엔진이 수를 찾지 못했습니다. (API 타임아웃)";
        } else if (error.message.includes("HTTP")) {
            document.getElementById('status').textContent = `API 통신 오류: ${error.message}. 키/경로를 확인하세요.`;
        } else {
            document.getElementById('status').textContent = "API 통신 오류가 발생했습니다. (연결 실패)";
        }
        console.error("Stockfish API 통신 오류:", error);
        return { bestmove: null, depth: 0 };
    }
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
 * AI의 오프닝 수를 강제 선택하는 함수
 * @returns {boolean} 오프닝 수가 성공적으로 적용되었는지 여부
 */
function handleOpeningMove() {
    let moveUci = null;
    const history = chess.history({ verbose: true });
    
    // =================================================
    // A. AI가 백(White)일 때 (첫 수)
    // =================================================
    if (chess.turn() === 'w' && history.length === 0) {
        if (playerColor === 'b') { // AI가 백일 때만 (플레이어가 흑)
            const rand = Math.random();
            
            if (rand < 0.60) { // 60% 확률로 1. e4
                moveUci = 'e2e4';
            } else { // 40% 확률로 1. d4
                moveUci = 'd2d4';
            }
        }
    } 
    
    // =================================================
    // B. AI가 흑(Black)일 때 (상대방의 첫 수에 응수)
    // =================================================
    else if (chess.turn() === 'b' && history.length === 1) {
        if (playerColor === 'w') { // AI가 흑일 때만 (플레이어가 백)
            const playerMove = history[0].san; // 플레이어의 첫 수 (예: "e4", "d4")
            const rand = Math.random();
            
            if (playerMove === 'e4') {
                // 1. e4에 대한 흑의 응수 (총 확률 87.5%)
                if (rand < 0.50) { // 50%
                    moveUci = 'e7e5'; // 오픈 게임
                } else if (rand < 0.75) { // 50% + 25% = 75%
                    moveUci = 'c7c5'; // 시실리안
                } else if (rand < 0.875) { // 75% + 12.5% = 87.5%
                    // 프렌치(e6)와 카로칸(c6)을 대략 1:1로 분배하여 12.5%를 나눔
                    moveUci = (Math.random() < 0.5) ? 'e7e6' : 'c7c6'; 
                } else {
                    // 나머지 12.5%는 Stockfish의 Best Move에 맡기거나, Nf6 등으로 분배 가능 (여기서는 Best Move에 맡김)
                    // 현재 로직상 87.5%까지만 강제하고 나머지는 Best Move 로직으로 넘어감
                    return false; 
                }
            } else if (playerMove === 'd4') {
                // 1. d4에 대한 흑의 응수 (Nf6 고정)
                moveUci = 'g8f6';
            } else if (playerMove === 'c4') {
                // 1. c4 (English Opening)에 대한 흑의 응수 (e5 고정)
                moveUci = 'e7e5';
            } else if (playerMove === 'Nf3' || playerMove === 'g3') {
                // 1. Nf3 (Réti/Zukertort) 또는 1. g3에 대한 흑의 응수 (d5 고정)
                moveUci = 'd7d5';
            } else {
                // 기타 오프닝 (Best Move 로직으로 넘어감)
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
            return false; // 오프닝 수 적용 실패 시 Best Move 로직으로 넘어감
        }
    }

    return false; // 오프닝 조건에 해당하지 않음
}


// 컴퓨터 수 두기 함수 (랜덤 무브, 헌납 방지 포함)
async function computerMove() {
    if (chess.game_over() || isEngineThinking || chess.turn() === playerColor) {
        if (chess.turn() === playerColor) console.log("LOG: 플레이어 차례이므로 건너킵니다.");
        updateStatus(); 
        return;
    }
    
    // 🌟🌟🌟 오프닝 강제 선택 로직 실행 🌟🌟🌟
    if (handleOpeningMove()) {
        return; // 오프닝 수가 성공적으로 적용되었으면 함수 종료
    }
    // 🌟🌟🌟 오프닝 로직 끝 🌟🌟🌟
    
    isEngineThinking = true; 
    
    let currentFen = chess.fen(); 
    const fenParts = currentFen.split(' ');
    
    if (fenParts.length < 6) {
        const turn = chess.turn();
        const castling = fenParts[2] || '-';
        const enPassant = fenParts[3] || '-';
        currentFen = `${fenParts[0]} ${fenParts[1]} ${castling} ${enPassant} 0 1`; 
        console.warn(`LOG: FEN이 불완전하여 강제로 보강함: ${currentFen}`);
    }
    
    const difficultySlider = document.getElementById('difficultySlider');
    const selectedSkillLevel = parseInt(difficultySlider.value); 
    
    const apiDepth = Math.max(6, Math.floor(selectedSkillLevel * 0.7) + 4); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Level: ${selectedSkillLevel}, Depth: ${apiDepth})...`;

    const result = await getBestMoveAndDepthFromStockfishApi(currentFen, apiDepth);
    const bestMoveLan = result.bestmove; 

    let moveResult = null; 
    let finalMoveSan = null; 
    
    const moves = chess.moves({ verbose: true }); 

    if (bestMoveLan) {
        
        // 🌟🌟🌟 공짜 기물 잡기 (Free Material Capture) 로직 🌟🌟🌟
        let freeCaptureMove = null;
        let maxCaptureValue = 0;
        const NET_PROFIT_THRESHOLD = 150; 

        for (const move of moves) {
            if (!move.captured) continue; 

            const capturedValue = getPieceValue(move.captured);
            
            const tempChess = new Chess(chess.fen());
            tempChess.move(move.lan, { sloppy: true }); 

            let maxOpponentGain = 0; 
            const opponentMoves = tempChess.moves({ verbose: true });
            
            for (const oppMove of opponentMoves) {
                if (oppMove.captured) {
                    const opponentCapturedValue = getPieceValue(oppMove.captured);
                    maxOpponentGain = Math.max(maxOpponentGain, opponentCapturedValue);
                }
            }
            
            const netValue = capturedValue - maxOpponentGain;

            if (netValue >= NET_PROFIT_THRESHOLD && capturedValue > maxCaptureValue) {
                 maxCaptureValue = capturedValue;
                 freeCaptureMove = move;
            }
        }
        
        // Free Capture Move가 발견되면 강제 실행 
        if (freeCaptureMove) {
            const uciMove = freeCaptureMove.from + freeCaptureMove.to + (freeCaptureMove.promotion || '');
            moveResult = executeUciMove(uciMove);
            
            if (moveResult) {
                finalMoveSan = moveResult.san;
                console.log(`LOG: 💰 Free Material Capture 선택: ${finalMoveSan}`);
                
                if (board) board.position(chess.fen()); 
                document.getElementById('status').textContent = `컴퓨터가 ${finalMoveSan} 수를 두었습니다.`;
                isEngineThinking = false;
                updateStatus();
                return; 
            } else {
                console.error(`LOG: Free Capture Move 적용 실패! Best Move 로직으로 회귀.`);
            }
        }
        
        // 1. Best Move 선택 확률 로직
        const MAX_DIFFICULTY = 30;
        const bestMoveProbability = selectedSkillLevel / MAX_DIFFICULTY;
        
        let forceBestMove = chess.in_check(); 
        
        if (forceBestMove || Math.random() < bestMoveProbability) {
            moveResult = executeUciMove(bestMoveLan);
            
            if (moveResult) {
                finalMoveSan = moveResult.san; 
                console.log(`LOG: Best Move 선택: ${finalMoveSan}`);
            } else {
                console.error(`LOG: Best Move (${bestMoveLan}) 적용 실패!`);
            }

        } else {
            // 🌟🌟🌟 Random Move 선택 및 블런더 방지 로직 🌟🌟🌟
            let randomMoves = moves.filter(move => move.lan !== bestMoveLan);
            
            if (selectedSkillLevel >= 1) { 
                
                // M1 위협 방지 로직
                const safeRandomMoves = randomMoves.filter(move => {
                    const tempChess = new Chess(chess.fen());
                    tempChess.move(move.lan, { sloppy: true }); 
                    const opponentMoves = tempChess.moves({ verbose: true });
                    for (const oppMove of opponentMoves) {
                        const tempOppChess = new Chess(tempChess.fen()); 
                        tempOppChess.move(oppMove.lan, { sloppy: true }); 
                        if (tempOppChess.in_checkmate()) {
                            return false; 
                        }
                    }
                    return true; 
                });
                randomMoves = safeRandomMoves;


                // 헌납 방지 필터 (기물 손실 임계값 99 CP)
                const MATERIAL_LOSS_THRESHOLD = 99; 
                
                const noBlunderRandomMoves = randomMoves.filter(aiMove => {
                    const tempChess = new Chess(chess.fen());
                    tempChess.move(aiMove.lan, { sloppy: true }); 

                    const opponentMoves = tempChess.moves({ verbose: true });
                    
                    for (const oppMove of opponentMoves) {
                        
                        if (oppMove.captured) {
                            let capturedPieceValue = getPieceValue(oppMove.captured);
                            
                            if (capturedPieceValue > MATERIAL_LOSS_THRESHOLD) {
                                console.warn(`BLUNDER DETECTED: ${aiMove.lan} -> ${oppMove.lan} 응수 시 ${capturedPieceValue} CP 손실 유발`);
                                return false; 
                            }
                        }
                    }
                    return true; 
                });
                
                randomMoves = noBlunderRandomMoves; 
            } 

            if (randomMoves.length > 0) {
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                const randomMoveUci = randomMove.from + randomMove.to + (randomMove.promotion || '');
                
                moveResult = executeUciMove(randomMoveUci); 
                
                if (moveResult) {
                    finalMoveSan = moveResult.san; 
                    console.log(`LOG: Random Move 선택: ${finalMoveSan}`);
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
        
        // 3. 최종 적용 결과를 보드에 반영합니다.
        if (moveResult) {
             if (board) board.position(chess.fen()); 
             document.getElementById('status').textContent = `컴퓨터가 ${finalMoveSan} 수를 두었습니다.`;
        } else {
             document.getElementById('status').textContent = `⚠️ 오류: 수를 보드에 적용할 수 없습니다.`;
        }
    
    } else {
        // [B] Best Move 찾기 실패 시 대체 로직
        // (이 로직은 API 문제 시 유효한 랜덤 수로 대체합니다.)
        
        let movesToChoose = chess.moves({ verbose: true }); 
        
        if (movesToChoose.length > 0) {
            const randomMove = movesToChoose[Math.floor(Math.random() * movesToChoose.length)];
            const randomMoveUci = randomMove.from + randomMove.to + (randomMove.promotion || '');

            moveResult = executeUciMove(randomMoveUci);
            
            if (moveResult) {
                finalMoveSan = moveResult.san;
                if (board) board.position(chess.fen()); 
                document.getElementById('status').textContent = `⚠️ 엔진이 수를 찾지 못했지만, 유효한 수(${finalMoveSan})로 대체합니다.`;
            } else {
                 document.getElementById('status').textContent = `⚠️ 엔진이 수를 찾지 못했고, 대체 수도 적용 실패!`;
            }
        }
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
    console.log("LOG: window load 이벤트 발생. 250ms 후 ChessBoard 초기화 시도.");
    
    // 250ms 지연 후 초기화 시도
    setTimeout(() => {
        try {
            // 1. ChessBoard 초기화
            board = ChessBoard('myBoard', config); 
            
            // 2. 슬라이더 이벤트 바인딩
            const difficultySlider = $('#difficultySlider');
            
            updateDifficultyDisplay(difficultySlider.val());

            difficultySlider.on('input', function() {
                const level = $(this).val();
                updateDifficultyDisplay(level);
            });
            
            // 3. 게임 시작 상태로 초기화
            startNewGame(); 
            
            console.log("LOG: 체스보드 및 슬라이더 초기화 성공.");

        } catch (e) {
            console.error("CRITICAL ERROR: ChessBoard 초기화 실패!", e);
            document.getElementById('status').textContent = "⚠️ 치명적 오류: Chessboard 라이브러리 로드 실패! lib 폴더 내 파일을 확인하세요.";
        }
    }, 250); // 250 밀리초 지연
});
