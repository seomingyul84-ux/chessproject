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
// 3. 게임 로직 및 이벤트 핸들러 (Skill Level 모방 로직 적용)
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
        if (chess.turn() === playerColor) console.log("LOG: 플레이어 차례이므로 건너뜁니다.");
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
    
    const apiDepth = Math.max(4, Math.floor(selectedSkillLevel * 0.7) + 4); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Skill Level: ${selectedSkillLevel}, Depth: ${apiDepth})...`;

    // 1. API를 호출하여 Stockfish의 최적의 수(Best Move)를 가져옵니다.
    const bestMoveLan = await getBestMoveFromStockfishApi(currentFen, apiDepth);
    
    let moveWasSuccessful = false; 
    let finalMove = null;

    if (bestMoveLan) {
        // moves는 verbose: true로 상세 객체를 가져옵니다.
        const moves = chess.moves({ verbose: true });
        
        // 2. Skill Level에 따른 Best Move 선택 확률 계산 (난이도 조절 핵심)
        const bestMoveProbability = 0.2 + (0.8 * (selectedSkillLevel / 20));
        
        if (Math.random() < bestMoveProbability) {
            finalMove = bestMoveLan;
            console.log(`LOG: Best Move 선택 (${(bestMoveProbability * 100).toFixed(0)}% 확률): ${finalMove}`);
        } else {
            // Best Move를 제외한 나머지 수를 필터링
            const randomMoves = moves.filter(move => move.lan !== bestMoveLan);
            
            if (randomMoves.length > 0) {
                const randomMove = randomMoves[Math.floor(Math.random() * randomMoves.length)];
                // 🌟🌟🌟 수정된 부분: .lan 대신 .san을 사용하여 안정성 확보 🌟🌟🌟
                finalMove = randomMove.san; 
                console.log(`LOG: Random Move 선택: ${finalMove}`);
            } else {
                // 랜덤 수를 찾지 못하면 Best Move를 사용 (최후의 수단)
                finalMove = bestMoveLan; 
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
    // 로컬 파일 사용으로 ChessBoard 정의가 보장됩니다.
    board = ChessBoard('myBoard', config); 
    startNewGame(); 
    
    // 이벤트 리스너 설정
    document.getElementById('playerColor').addEventListener('change', startNewGame);
    document.getElementById('difficulty').value = '8'; 
    console.log("체스보드 초기화 성공.");
});
