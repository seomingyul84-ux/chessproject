// =========================================================
// 1. 상수 및 초기화
// =========================================================

// 🚨 RapidAPI 설정
const RAPIDAPI_KEY = "98c1a1d50bmshece777cb590225ep14cbbbjsn12fcb6a75780"; 
const RAPIDAPI_HOST = "chess-stockfish-16-api.p.rapidapi.com";
const STOCKFISH_API_URL = "https://" + RAPIDAPI_HOST + "/chess/api"; 

const chess = new Chess();
let board = null; 
let playerColor = 'w'; 
let isEngineThinking = false; 

// 기물 가치 정의 (CP 단위)
const PIECE_VALUES = {
    'p': 100, // Pawn
    'n': 300, // Knight
    'b': 300, // Bishop
    'r': 500, // Rook
    'q': 900, // Queen
    'k': 0    // King (가치 계산에서 제외)
};

function getPieceValue(piece) {
    if (!piece) return 0;
    return PIECE_VALUES[piece.toLowerCase()] || 0;
}


// =========================================================
// 2. API 통신 함수 (Best Move만 요청)
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
// 3. 게임 로직 및 이벤트 핸들러 (헌납 방지 로직 포함)
// =========================================================

// UCI 문자열을 받아서 chess.move를 안전하게 실행하는 헬퍼 함수
function executeUciMove(uciMove) {
    if (!uciMove || uciMove.length < 4) return null;
    
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    let promotion = undefined;
    
    // 프로모션 처리 (e.g., a7a8q)
    if (uciMove.length === 5) {
        promotion = uciMove.substring(4, 5);
    }
    
    try {
        // 객체 형식으로 move 실행 (가장 안정적인 방식)
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
    
    // 플레이어의 수를 UCI 포맷으로 실행
    const move = chess.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback'; 
    
    updateStatus();
    // 250ms 지연 후 AI 턴 시작
    window.setTimeout(computerMove, 250); 
}

// 컴퓨터 수 두기 함수
async function computerMove() {
    if (chess.game_over() || isEngineThinking || chess.turn() === playerColor) {
        if (chess.turn() === playerColor) console.log("LOG: 플레이어 차례이므로 건너킵니다.");
        updateStatus(); 
        return;
    }
    
    isEngineThinking = true; 
    
    let currentFen = chess.fen(); 
    const fenParts = currentFen.split(' ');
    if (fenParts.length < 6) {
        currentFen = currentFen + ' 0 1'; 
    }
    
    const difficultySlider = document.getElementById('difficultySlider');
    const selectedSkillLevel = parseInt(difficultySlider.value); 
    
    const apiDepth = Math.max(6, Math.floor(selectedSkillLevel * 0.7) + 4); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Level: ${selectedSkillLevel}, Depth: ${apiDepth})...`;

    const result = await getBestMoveAndDepthFromStockfishApi(currentFen, apiDepth);
    const bestMoveLan = result.bestmove; 

    let moveResult = null; 
    let finalMoveSan = null; 
    
    // UCI/LAN 문자열이 필요하므로 verbose: true 사용
    const moves = chess.moves({ verbose: true }); 

    if (bestMoveLan) {
        
        const MAX_DIFFICULTY = 30;
        const bestMoveProbability = selectedSkillLevel / MAX_DIFFICULTY;
        
        let forceBestMove = false;
        if (chess.in_check()) {
            forceBestMove = true;
            console.log(`LOG: 킹이 체크 상태이므로 최적의 수 선택을 강제합니다.`);
        }
        
        if (forceBestMove || Math.random() < bestMoveProbability) {
            // Best Move 선택 및 적용 (executeUciMove 사용)
            moveResult = executeUciMove(bestMoveLan);
            
            if (moveResult) {
                finalMoveSan = moveResult.san; 
                console.log(`LOG: Best Move 선택 (${forceBestMove ? '체크 방어' : (bestMoveProbability * 100).toFixed(0) + '% 확률'}): ${finalMoveSan}`);
            } else {
                console.error(`LOG: Best Move (${bestMoveLan}) 적용 실패!`);
            }

        } else {
            // Random Move 선택 로직
            let randomMoves = moves.filter(move => move.lan !== bestMoveLan);
            
            // 🌟🌟🌟 Level 10 이상 필터 적용 🌟🌟🌟
            if (selectedSkillLevel >= 10) {
                
                // 1. M1 위협 방지 로직
                console.log(`LOG: Level ${selectedSkillLevel}이므로 M1 위협 방지 필터를 적용합니다.`);
                
                const safeRandomMoves = randomMoves.filter(move => {
                    const tempChess = new Chess(chess.fen());
                    
                    // UCI/LAN 문자열을 사용하여 수 적용
                    tempChess.move(move.lan, { sloppy: true }); 
                    
                    const opponentMoves = tempChess.moves({ verbose: true });
                    for (const oppMove of opponentMoves) {
                        const tempOppChess = new Chess(tempChess.fen()); 
                        
                        // UCI/LAN 문자열을 사용하여 수 적용
                        tempOppChess.move(oppMove.lan, { sloppy: true }); 
                        
                        if (tempOppChess.in_checkmate()) {
                            return false; // M1 위협이 있는 수 제외
                        }
                    }
                    return true; 
                });
                randomMoves = safeRandomMoves;


                // 2. 기물 헌납 방지 로직 (임계값 99 CP: 폰 헌납도 방지)
                const MATERIAL_LOSS_THRESHOLD = 99; 
                
                const noBlunderRandomMoves = randomMoves.filter(aiMove => {
                    const tempChess = new Chess(chess.fen());
                    tempChess.move(aiMove.lan, { sloppy: true }); 
                    
                    const opponentMoves = tempChess.moves({ verbose: true });
                    
                    for (const oppMove of opponentMoves) {
                        const tempOppChess = new Chess(tempChess.fen()); 
                        
                        // UCI/LAN 문자열을 사용하여 수 적용
                        const opponentMoveResult = tempOppChess.move(oppMove.lan, { sloppy: true });
                        
                        if (opponentMoveResult) {
                            let lostPieceValue = 0;
                            
                            if (opponentMoveResult.captured) {
                                lostPieceValue = getPieceValue(opponentMoveResult.captured);
                            }
                            
                            if (lostPieceValue > MATERIAL_LOSS_THRESHOLD) {
                                return false; 
                            }
                        }
                    }
                    return true; 
                });
                
                randomMoves = noBlunderRandomMoves; 
            } // Level 10 이상 필터링 끝

            if (randomMoves.length > 0) {
                // 안전한 수 중 랜덤 선택 및 적용 (executeUciMove 사용)
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                
                moveResult = executeUciMove(randomMove.lan); 
                
                if (moveResult) {
                    finalMoveSan = moveResult.san; 
                    console.log(`LOG: Random Move 선택 (${selectedSkillLevel >= 10 ? '헌납 필터 적용' : '필터 미적용'}): ${finalMoveSan}`);
                } else {
                    console.error(`LOG: Random Move (${randomMove.lan}) 적용 실패!`);
                }

            } else {
                // 안전한 Random Move가 없으면 Best Move로 회귀 및 적용 (executeUciMove 사용)
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
             document.getElementById('status').textContent = `⚠️ 오류: 수를 보드에 적용할 수 없습니다. (내부 오류, 마지막 시도 수: ${finalMoveSan || bestMoveLan})`;
        }
    
    } else {
        // [B] Best Move 찾기 실패 시 (대체 로직: 모든 유효한 수 중 필터링 후 랜덤 선택)
        console.warn("LOG: Stockfish API 응답 실패. 대체 Random Move를 시도합니다.");

        let movesToChoose = chess.moves({ verbose: true }); // 모든 유효한 수로 시작
        
        // 🌟🌟🌟 Level 10 이상 필터 적용 로직 재활용 🌟🌟🌟
        if (selectedSkillLevel >= 10) {
            
            // 1. M1 위협 방지 로직
            const safeMoves = movesToChoose.filter(move => {
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
            movesToChoose = safeMoves;

            // 2. 기물 헌납 방지 로직 (임계값 99 CP)
            const MATERIAL_LOSS_THRESHOLD = 99; 
            const noBlunderMoves = movesToChoose.filter(aiMove => {
                const tempChess = new Chess(chess.fen());
                tempChess.move(aiMove.lan, { sloppy: true }); 
                const opponentMoves = tempChess.moves({ verbose: true });
                for (const oppMove of opponentMoves) {
                    const tempOppChess = new Chess(tempChess.fen()); 
                    const opponentMoveResult = tempOppChess.move(oppMove.lan, { sloppy: true });
                    if (opponentMoveResult && getPieceValue(opponentMoveResult.captured) > MATERIAL_LOSS_THRESHOLD) {
                        return false; 
                    }
                }
                return true;
            });
            movesToChoose = noBlunderMoves;
        }

        if (movesToChoose.length > 0) {
            // 필터링된 안전한 수 중 랜덤 선택 (executeUciMove 사용)
            const randomMove = movesToChoose[Math.floor(Math.random() * movesToChoose.length)];
            moveResult = executeUciMove(randomMove.lan);
            
            if (moveResult) {
                finalMoveSan = moveResult.san;
                if (board) board.position(chess.fen()); 
                console.warn(`LOG: Best Move 찾기 실패! 필터링된 Random Move(${finalMoveSan})로 대체합니다.`);
                document.getElementById('status').textContent = `⚠️ 엔진이 수를 찾지 못했지만, 유효한 수(${finalMoveSan})로 대체합니다.`;
            } else {
                 document.getElementById('status').textContent = `⚠️ 엔진이 수를 찾지 못했고, 대체 수도 적용 실패!`;
            }
        } else {
            // 필터링 후 남은 수가 없는 경우
            isEngineThinking = false;
            updateStatus();
            return; 
        }
    } // Best Move 실패 로직 끝
    
    isEngineThinking = false; 
    
    if (moveResult) {
        updateStatus();
    }
}

// 색상 변경 또는 버튼 클릭 시 게임을 새로 시작하는 함수
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
    
    if (playerColor === 'b' && chess.turn() === 'w') {
        window.setTimeout(computerMove, 500); 
    }
}

// 상태 업데이트 함수
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

const config = {
    draggable: true,
    position: 'start',
    onDrop: onDrop,
    onSnapEnd: function() { 
        if (board) board.position(chess.fen()); 
    },
    pieceTheme: 'img/{piece}.png'
};

$(document).ready(function() {
    board = ChessBoard('myBoard', config); 
    startNewGame(); 
    
    document.getElementById('playerColor').addEventListener('change', startNewGame);
    console.log("체스보드 초기화 성공.");
});
