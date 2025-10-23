// =========================================================
// 1. 상수 및 초기화
// =========================================================

const CHESS_API_URL = "https://chess-api.com/v1"; 

const chess = new Chess();
let board = null; 
let playerColor = 'w'; // 사용자의 선택 색상 ('w' 또는 'b')
let isEngineThinking = false; // 엔진 계산 중 플래그 (이중 실행 방지)

// =========================================================
// 2. API 통신 및 난이도 조절 함수 (타임아웃 적용)
// =========================================================

async function postChessApi(data = {}) {
    const fetchPromise = fetch(CHESS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });

    // 5초 타임아웃 Promise 생성
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("API 응답 시간 초과 (Timeout)")), 5000) // 5초 대기
    );

    // fetch와 timeout 중 먼저 완료/실패하는 것을 선택
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    return response.json();
}

async function getBestMoveFromChessApi(fen, selectedDepth) {
    // LOGGING FIX
    const difficultySelect = document.getElementById('difficulty');
    const selectedDifficultyDepth = parseInt(difficultySelect.value);
    console.log(`API에 FEN 요청: ${fen}, Depth: ${selectedDifficultyDepth}`); 
    
    const data = {
        fen: fen,
        depth: selectedDepth,
        maxThinkingTime: 50, // API 엔진 자체의 계산 시간은 짧게 유지
    };

    try {
        const responseData = await postChessApi(data);

        if (responseData.type === 'move' || responseData.type === 'bestmove') {
            console.log("API 응답 성공:", responseData);
            return responseData.lan; 
        } else {
            document.getElementById('status').textContent = `API 오류: ${responseData.text}`;
            console.error("API가 유효하지 않은 타입의 응답 반환:", responseData);
            return null;
        }
    } catch (error) {
        // ⚠️ 타임아웃 및 일반 오류 처리
        if (error.message.includes("Timeout")) {
            document.getElementById('status').textContent = "⚠️ 엔진이 수를 찾지 못했습니다. (API 타임아웃)";
        } else {
            document.getElementById('status').textContent = "API 통신 오류가 발생했습니다. (연결 실패)";
        }
        console.error("API 통신 오류:", error);
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
    // 1. 게임 종료/계산 중/플레이어 턴 확인 (수가 멈추는 것 방지)
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
    
    const currentFen = chess.fen();
    const difficultySelect = document.getElementById('difficulty');
    const selectedDifficultyDepth = parseInt(difficultySelect.value); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Depth: ${selectedDifficultyDepth})...`;

    const bestMoveLan = await getBestMoveFromChessApi(currentFen, selectedDifficultyDepth);
    
    let moveWasSuccessful = false; // ⚠️ 플래그 초기화

    if (bestMoveLan) {
        console.log(`API에서 받은 수: ${bestMoveLan}`); 
        
        const moveResult = chess.move(bestMoveLan, { sloppy: true }); 
        
        if (moveResult) {
            board.position(chess.fen()); 
            document.getElementById('status').textContent = `컴퓨터가 ${bestMoveLan} 수를 두었습니다.`;
            moveWasSuccessful = true; // ⚠️ 성공 시 플래그 설정
        } else {
            document.getElementById('status').textContent = `⚠️ 오류: API가 반환한 수(${bestMoveLan})를 보드에 적용할 수 없습니다.`;
        }
    } else {
        // API 호출 실패, 타임아웃 등으로 bestMoveLan이 null인 경우
        // getBestMoveFromChessApi 내에서 이미 status가 업데이트되었음
    }
    
    isEngineThinking = false; 
    
    // ⚠️ 수가 성공적으로 두어졌을 때만 상태를 업데이트하여 턴이 넘어가는 것을 방지
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
    
    // 로컬 이미지 경로 사용: 'img' 폴더 바로 아래에 파일이 있다고 가정
    pieceTheme: 'img/{piece}.png'
};

// 페이지 로드 시 보드 초기화
$(document).ready(function() {
    board = ChessBoard('myBoard', config);
    startNewGame(); 
    document.getElementById('playerColor').addEventListener('change', startNewGame);
});
