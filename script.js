// =========================================================
// 1. 상수 및 초기화 (RapidAPI StockFish 16 설정)
// =========================================================

// 🚨 실제 API 키와 호스트 값입니다. (이전에 확인된 값 유지)
const RAPIDAPI_KEY = "98c1a1d50bmshece777cb590225ep14cbbbjsn12fcb6a75780"; 
const RAPIDAPI_HOST = "chess-stockfish-16-api.p.rapidapi.com";
// ✅ 정확한 엔드포인트 경로
const STOCKFISH_API_URL = "https://" + RAPIDAPI_HOST + "/chess/api"; 

const chess = new Chess();
let board = null; 
let playerColor = 'w'; 
let isEngineThinking = false; 

// =========================================================
// 2. API 통신 함수 (RapidAPI StockFish 16용)
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

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API 응답 시간 초과 (Timeout)")), 5000)
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!response.ok) {
         throw new Error(`HTTP 오류! 상태 코드: ${response.status}`);
    }
    
    return response.json();
}

async function getBestMoveFromStockfishApi(fen, selectedDepth) {
    console.log(`Stockfish API에 FEN 요청: ${fen}, Depth: ${selectedDepth}`); 

    try {
        const responseData = await postRapidApi(fen, selectedDepth);

        if (responseData && responseData.bestmove) {
            return responseData.bestmove; 
        } else {
            document.getElementById('status').textContent = `API 오류: Stockfish가 수를 찾지 못했습니다.`;
            return null;
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
        return null;
    }
}

// =========================================================
// 3. 게임 로직 및 이벤트 핸들러 (난이도 및 체크 방어 로직)
// =========================================================

function onDrop (source, target) {
    if (chess.turn() !== playerColor) {
        return 'snapback'; 
    }
    const move = chess.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback'; 
    updateStatus();
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
    
    const difficultySelect = document.getElementById('difficulty');
    const selectedSkillLevel = parseInt(difficultySelect.value); 
    
    // API Depth 계산: M1 위협 방지를 위해 최소 Depth 6 유지
    const apiDepth = Math.max(6, Math.floor(selectedSkillLevel * 0.7) + 4); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Level: ${selectedSkillLevel}, Depth: ${apiDepth})...`;

    // 1. API를 호출하여 Stockfish의 최적의 수(Best Move)를 가져옵니다.
    const bestMoveLan = await getBestMoveFromStockfishApi(currentFen, apiDepth);
    
    let moveWasSuccessful = false; 
    let finalMove = null;

    if (bestMoveLan) {
        const moves = chess.moves({ verbose: true });
        
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
            finalMove = bestMoveLan;
            console.log(`LOG: Best Move 선택 (${forceBestMove ? '체크 방어' : (bestMoveProbability * 100).toFixed(0) + '% 확률'}): ${finalMove}`);
        } else {
            // Random Move 선택 로직
            let randomMoves = moves.filter(move => move.lan !== bestMoveLan);
            
            // 🌟🌟🌟 [M1 위협 방지 필터]: 난이도 15 이상일 때만 적용 🌟🌟🌟
            if (selectedSkillLevel >= 15) {
                console.log(`LOG: Level ${selectedSkillLevel}이므로 M1 위협 방지 필터를 적용합니다.`);
                
                // M1 위협이 없는 안전한 수만 필터링
                const safeRandomMoves = randomMoves.filter(move => {
                    const tempChess = new Chess(chess.fen());
                    tempChess.move(move); // AI가 랜덤 수를 뒀다고 가정
                    
                    // 상대방의 모든 수를 시뮬레이션하여 M1 기회가 있는지 확인
                    const opponentMoves = tempChess.moves({ verbose: true });
                    for (const oppMove of opponentMoves) {
                        const tempOppChess = new Chess(tempOppChess.fen());
                        tempOppChess.move(oppMove); // 상대가 이 수를 뒀을 때
                        if (tempOppChess.in_checkmate()) {
                            return false; // 상대방이 M1을 걸 수 있다면, 이 Random Move는 안전하지 않음
                        }
                    }
                    return true; // 안전한 Random Move
                });
                
                // 필터링된 안전한 수 목록으로 교체
                randomMoves = safeRandomMoves;
            }

            if (randomMoves.length > 0) {
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                finalMove = randomMove.san; 
                console.log(`LOG: Random Move 선택: ${finalMove}`);
            } else {
                // M1 필터링 결과 남은 수가 없거나, 원래부터 Random Move가 없으면 Best Move로 회귀
                finalMove = bestMoveLan; 
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

// 보드 설정
const config = {
    draggable: true,
    position: 'start',
    onDrop: onDrop,
    onSnapEnd: function() { 
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
    document.getElementById('difficulty').value = '15'; // 기본 보통 난이도 (15/30 = 50% 확률)
    console.log("체스보드 초기화 성공.");
});
