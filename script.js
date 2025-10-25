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

// POST 요청을 위한 헬퍼 함수
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

    // 5초 Timeout 설정
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API 응답 시간 초과 (Timeout)")), 5000)
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!response.ok) {
         throw new Error(`HTTP 오류! 상태 코드: ${response.status}`);
    }
    
    return response.json();
}

// Best Move와 Depth를 반환하는 함수
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

function onDrop (source, target) {
    if (chess.turn() !== playerColor) {
        return 'snapback'; 
    }
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
    // FEN이 불완전할 경우 보정 (Stockfish API 호환성)
    const fenParts = currentFen.split(' ');
    if (fenParts.length < 6) {
        currentFen = currentFen + ' 0 1'; 
    }
    
    // 🌟🌟🌟 슬라이더에서 난이도 값 읽어오기 🌟🌟🌟
    const difficultySlider = document.getElementById('difficultySlider');
    const selectedSkillLevel = parseInt(difficultySlider.value); 
    
    // API Depth 계산: 난이도 기반 탐색 Depth
    const apiDepth = Math.max(6, Math.floor(selectedSkillLevel * 0.7) + 4); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Level: ${selectedSkillLevel}, Depth: ${apiDepth})...`;

    // 1. API를 호출하여 Stockfish의 최적의 수(Best Move)를 가져옵니다.
    const result = await getBestMoveAndDepthFromStockfishApi(currentFen, apiDepth);
    const bestMoveLan = result.bestmove;
    
    let moveWasSuccessful = false; 
    let finalMove = null;
    const moves = chess.moves({ verbose: true });


    if (bestMoveLan) {
        
        // 🌟🌟🌟 [난이도 로직] 🌟🌟🌟
        const MAX_DIFFICULTY = 30;
        const bestMoveProbability = selectedSkillLevel / MAX_DIFFICULTY;
        
        // 🌟🌟🌟 [체크 방어 로직]: AI 킹이 체크 상태일 때 Best Move 강제 🌟🌟🌟
        let forceBestMove = false;
        if (chess.in_check()) {
            forceBestMove = true;
            console.log(`LOG: 킹이 체크 상태이므로 최적의 수 선택을 강제합니다.`);
        }
        
        if (forceBestMove || Math.random() < bestMoveProbability) {
            // Best Move 선택 (최적의 수)
            // UCI(lan) to SAN 변환을 위해 sloppy: true 옵션을 사용
            finalMove = chess.move(bestMoveLan, { sloppy: true }).san;
            console.log(`LOG: Best Move 선택 (${forceBestMove ? '체크 방어' : (bestMoveProbability * 100).toFixed(0) + '% 확률'}): ${finalMove}`);
        } else {
            // Random Move 선택 로직
            let randomMoves = moves.filter(move => move.lan !== bestMoveLan);
            
            // 🌟🌟🌟 [Level 15 이상: M1 위협 방지 로직] 🌟🌟🌟
            if (selectedSkillLevel >= 15) {
                console.log(`LOG: Level ${selectedSkillLevel}이므로 M1 위협 방지 필터를 적용합니다.`);
                
                const safeRandomMoves = randomMoves.filter(move => {
                    const tempChess = new Chess(chess.fen());
                    tempChess.move(move); 
                    
                    const opponentMoves = tempChess.moves({ verbose: true });
                    for (const oppMove of opponentMoves) {
                        const tempOppChess = new Chess(tempChess.fen()); 
                        tempOppChess.move(oppMove); 
                        
                        if (tempOppChess.in_checkmate()) {
                            return false; // M1 위협이 있는 수 제외
                        }
                    }
                    return true; 
                });
                randomMoves = safeRandomMoves;
            }

            // 🌟🌟🌟 [모든 난이도: 기물 헌납 방지 로직] 🌟🌟🌟
            const MATERIAL_LOSS_THRESHOLD = 200; // 폰 2개 또는 마이너 기물 헌납 방지
            
            const noBlunderRandomMoves = randomMoves.filter(aiMove => {
                const tempChess = new Chess(chess.fen());
                
                // 1. AI가 수를 둔 후 (aiMove)
                tempChess.move(aiMove); 
                
                const opponentMoves = tempChess.moves({ verbose: true });
                
                for (const oppMove of opponentMoves) {
                    const tempOppChess = new Chess(tempChess.fen()); 
                    
                    // 2. 상대방이 수를 둠 (oppMove)
                    const moveResult = tempOppChess.move(oppMove);
                    
                    if (moveResult) {
                        let lostPieceValue = 0;
                        
                        // 상대방이 기물을 잡았는지 확인 (순 손해)
                        if (moveResult.captured) {
                            lostPieceValue = getPieceValue(moveResult.captured);
                        }
                        
                        // 200CP 이상 손해를 유발하는 상대의 반격 수가 존재한다면,
                        if (lostPieceValue >= MATERIAL_LOSS_THRESHOLD) {
                            return false; // 이 aiMove는 위험합니다.
                        }
                    }
                }
                return true; // 이 aiMove는 안전합니다.
            });
            
            randomMoves = noBlunderRandomMoves; // 최종 안전한 수 목록으로 갱신

            if (randomMoves.length > 0) {
                // 안전한 수 중 랜덤 선택
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                finalMove = chess.move(randomMove, { sloppy: true }).san; 
                console.log(`LOG: Random Move 선택 (헌납 필터 적용): ${finalMove}`);
            } else {
                // 안전한 Random Move가 없으면 Best Move로 회귀
                finalMove = chess.move(bestMoveLan, { sloppy: true }).san; 
                console.warn("LOG: 안전한 Random Move가 없어 Best Move로 강제 회귀.");
            }
        }
        
        // 3. 최종 선택된 수를 보드에 적용합니다.
        const moveResult = chess.move(finalMove, { sloppy: true }); 
        
        if (moveResult) {
            if (board) board.position(chess.fen()); 
            document.getElementById('status').textContent = `컴퓨터가 ${finalMove} 수를 두었습니다.`;
            moveWasSuccessful = true; 
        } else {
            document.getElementById('status').textContent = `⚠️ 오류: ${finalMove} 수를 보드에 적용할 수 없습니다.`;
        }
    
    } else {
        // [B] Best Move 찾기 실패 시 (대체 로직: 모든 유효한 수 중 랜덤 선택)
        const moves = chess.moves({ verbose: true });

        if (moves.length > 0) {
            const randomMove = moves[Math.floor(Math.random() * moves.length)];
            finalMove = randomMove.san;
            console.warn(`LOG: Best Move 찾기 실패! 유효한 Random Move(${finalMove})로 강제 대체합니다.`);
            document.getElementById('status').textContent = `⚠️ 엔진이 수를 찾지 못했지만, 유효한 수(${finalMove})로 대체합니다.`;
        } else {
            // 게임 끝이거나 수가 없는 경우
            isEngineThinking = false;
            updateStatus();
            return; 
        }
    }
    
    isEngineThinking = false; 
    
    if (moveWasSuccessful) {
        updateStatus();
    }
}

// 색상 변경 또는 버튼 클릭 시 게임을 새로 시작하는 함수
function startNewGame() {
    const colorSelect = document.getElementById('playerColor');
    playerColor = colorSelect.value;
    chess.reset(); 
    if (board) board.position('start'); 
    
    // 플레이어 색상에 따라 보드 방향 설정
    if (playerColor === 'b') {
        if (board) board.orientation('black');
    } else {
        if (board) board.orientation('white');
    }
    
    updateStatus();
    
    // AI가 흑이고 게임이 백 턴이면 AI가 먼저 시작
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

// 보드 설정
const config = {
    draggable: true,
    position: 'start',
    onDrop: onDrop,
    onSnapEnd: function() { 
        // 잘못된 이동 후 제자리로 돌아가도록 보드 상태 동기화
        if (board) board.position(chess.fen()); 
    },
    pieceTheme: 'img/{piece}.png'
};

// =========================================================
// 4. 초기화 로직 (DOM 준비 완료 후 실행)
// =========================================================

// DOM이 준비되면 보드를 초기화합니다.
$(document).ready(function() {
    board = ChessBoard('myBoard', config); 
    startNewGame(); 
    
    // 이벤트 리스너 설정
    document.getElementById('playerColor').addEventListener('change', startNewGame);
    console.log("체스보드 초기화 성공.");
});
