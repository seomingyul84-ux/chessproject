// =========================================================
// 1. 상수 및 초기화 (RapidAPI 설정)
// =========================================================

// 🚨🚨🚨 발급받은 실제 API 키와 호스트 값입니다.
const RAPIDAPI_KEY = "98c1a1d50bmshece777cb590225ep14cbbbjsn12fcb6a75780"; 
const RAPIDAPI_HOST = "chess-stockfish-16-api.p.rapidapi.com";
const STOCKFISH_API_URL = "https://" + RAPIDAPI_HOST + "/best-move"; 

const chess = new Chess();
let board = null; 
let playerColor = 'w'; // 사용자의 선택 색상 ('w' 또는 'b')
let isEngineThinking = false; // 엔진 계산 중 플래그 (이중 실행 방지)

// =========================================================
// 2. API 통신 및 난이도 조절 함수 (RapidAPI StockFish 16용)
// =========================================================

// POST 요청을 위한 헬퍼 함수 (Header 및 TimeOut 포함)
async function postRapidApi(fen, selectedDepth) {
    // fen과 depth를 Form Data 형식으로 보냅니다.
    const formBody = new URLSearchParams({
        fen: fen,
        depth: selectedDepth 
    });

    const fetchPromise = fetch(STOCKFISH_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded", // Form Data 형식
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
        },
        body: formBody.toString(),
    });

    // 5초 타임아웃 Promise 생성
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API 응답 시간 초과 (Timeout)")), 5000)
    );

    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!response.ok) {
         // HTTP 상태 코드 오류 발생 시
         throw new Error(`HTTP 오류! 상태 코드: ${response.status}`);
    }
    
    return response.json();
}

async function getBestMoveFromStockfishApi(fen, selectedDepth) {
    console.log(`Stockfish API에 FEN 요청: ${fen}, Depth: ${selectedDepth}`);

    try {
        const responseData = await postRapidApi(fen, selectedDepth);

        // API 응답 구조: { "position": "...", "bestmove": "e2e4", ... }
        if (responseData && responseData.bestmove) {
            console.log("Stockfish API 응답 성공:", responseData);
            return responseData.bestmove; 
        } else {
            document.getElementById('status').textContent = `API 오류: Stockfish가 수를 찾지 못했습니다.`;
            console.error("API가 유효하지 않은 응답 반환:", responseData);
            return null;
        }
    } catch (error) {
        if (error.message.includes("Timeout")) {
            document.getElementById('status').textContent = "⚠️ 엔진이 수를 찾지 못했습니다. (API 타임아웃)";
        } else if (error.message.includes("HTTP")) {
            // 키 오류, 구독 오류 등 RapidAPI 관련 HTTP 오류 처리
            document.getElementById('status').textContent = `API 통신 오류: ${error.message}. 키를 확인하세요.`;
        } else {
            document.getElementById('status').textContent = "API 통신 오류가 발생했습니다. (연결 실패)";
        }
        console.error("Stockfish API 통신 오류:", error);
        return null;
    }
}

// =========================================================
// 3. 게임 로직 및 이벤트 핸들러
// =========================================================

// 사용자가 수를 둔 후 호출되는 함수
function onDrop (source, target) {
    if (chess.turn() !== playerColor) {
        return 'snapback'; 
    }
    
    const move = chess.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    if (move === null) return 'snapback'; 

    updateStatus();
    window.setTimeout(computerMove, 250); 
}

// 컴퓨터 수 두기 함수
async function computerMove() {
    if (chess.game_over()) {
        updateStatus();
        return; 
    }
    if (isEngineThinking) return; 
    if (chess.turn() === playerColor) {
        console.log("LOG: 현재는 플레이어 차례이므로 컴퓨터는 수를 두지 않습니다.");
        return;
    }
    
    isEngineThinking = true; 
    
    let currentFen = chess.fen(); 

    // FEN 문자열 오류 방지 및 강제 수정 로직 (FEN 필드 6개 방어)
    const fenParts = currentFen.split(' ');
    if (fenParts.length < 6) {
        currentFen = currentFen + ' 0 1'; 
        console.warn(`WARN: FEN 필드가 부족하여 ' 0 1'을 강제 추가했습니다. 수정된 FEN: ${currentFen}`);
    }
    
    console.log("DEBUG: 전송되는 현재 FEN:", currentFen); 
    
    const difficultySelect = document.getElementById('difficulty');
    const selectedDifficultyDepth = parseInt(difficultySelect.value); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Depth: ${selectedDifficultyDepth})...`;

    const bestMoveLan = await getBestMoveFromStockfishApi(currentFen, selectedDifficultyDepth);
    
    let moveWasSuccessful = false; 

    if (bestMoveLan) {
        console.log(`API에서 받은 수: ${bestMoveLan}`); 
        
        // Stockfish API는 UCB 포맷(e2e4)을 반환하므로 chess.move()의 sloppy 옵션으로 처리
        const moveResult = chess.move(bestMoveLan, { sloppy: true }); 
        
        if (moveResult) {
            board.position(chess.fen()); 
            document.getElementById('status').textContent = `컴퓨터가 ${bestMoveLan} 수를 두었습니다.`;
            moveWasSuccessful = true; 
        } else {
            document.getElementById('status').textContent = `⚠️ 오류: API가 반환한 수(${bestMoveLan})를 보드에 적용할 수 없습니다.`;
        }
    } 
    
    isEngineThinking = false; 
    
    // 수가 성공적으로 두어졌을 때만 상태를 업데이트하여 턴이 넘어가는 것을 방지
    if (moveWasSuccessful) {
        updateStatus();
    }
}

// 색상 변경 또는 버튼 클릭 시 게임을 새로 시작하는 함수
function startNewGame() {
    const colorSelect = document.getElementById('playerColor');
    playerColor = colorSelect.value;
    
    chess.reset(); 
    board.position('start'); 
    
    if (playerColor === 'b') {
        board.orientation('black');
    } else {
        board.orientation('white');
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
    onSnapEnd: function() { board.position(chess.fen()); },
    
    // 로컬 이미지 경로 사용 (이전 이미지 오류 해결용): 'img' 폴더 바로 아래에 파일이 있다고 가정
    pieceTheme: 'img/{piece}.png'
};

// 페이지 로드 시 보드 초기화
$(document).ready(function() {
    board = ChessBoard('myBoard', config);
    startNewGame(); 
    document.getElementById('playerColor').addEventListener('change', startNewGame);
    
    // 난이도 초기값 Depth 8로 설정
    document.getElementById('difficulty').value = '8'; 
});
