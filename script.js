// =========================================================
// 1. 상수 및 초기화
// =========================================================

const CHESS_API_URL = "https://chess-api.com/v1"; 

// chess.js 및 chessboard.js 인스턴스 초기화
const chess = new Chess();
let board = null; // chessboard.js 인스턴스

// =========================================================
// 2. API 통신 및 난이도 조절 함수 (Depth 사용)
// =========================================================

// POST 요청을 위한 기본 Fetch 함수
async function postChessApi(data = {}) {
    const response = await fetch(CHESS_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data),
    });
    return response.json();
}

// FEN과 Depth를 받아 최적의 수를 반환합니다.
async function getBestMoveFromChessApi(fen, selectedDepth) {
    console.log(`API에 FEN 요청: ${fen}, Depth: ${selectedDepth}`);

    const data = {
        fen: fen,
        depth: selectedDepth, // 난이도 조절
        maxThinkingTime: 50,
    };

    try {
        const responseData = await postChessApi(data);

        if (responseData.type === 'move' || responseData.type === 'bestmove') {
            console.log("API 응답:", responseData);
            return responseData.lan; // Long Algebraic Notation (예: 'g1f3') 반환
        } else {
            document.getElementById('status').textContent = `API 오류: ${responseData.text}`;
            return null;
        }
    } catch (error) {
        document.getElementById('status').textContent = "API 통신 오류가 발생했습니다.";
        console.error("API 통신 오류:", error);
        return null;
    }
}

// =========================================================
// 3. 게임 로직 및 이벤트 핸들러
// =========================================================

// 사용자가 수를 둔 후 호출되는 함수
function onDrop (source, target) {
    const move = chess.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    if (move === null) return 'snapback'; // 유효하지 않은 수

    updateStatus();
    window.setTimeout(computerMove, 250); // 컴퓨터 차례
}

// 컴퓨터 수 두기 함수
async function computerMove() {
    const currentFen = chess.fen();
    
    // UI에서 선택된 난이도 가져오기
    const difficultySelect = document.getElementById('difficulty');
    const selectedDifficultyDepth = parseInt(difficultySelect.value); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Depth: ${selectedDifficultyDepth})...`;

    const bestMoveLan = await getBestMoveFromChessApi(currentFen, selectedDifficultyDepth);
    
    if (bestMoveLan) {
        chess.move(bestMoveLan, { sloppy: true }); 
        board.position(chess.fen()); // 보드 업데이트
        document.getElementById('status').textContent = `컴퓨터가 ${bestMoveLan} 수를 두었습니다.`;
    } else {
        document.getElementById('status').textContent = "엔진이 수를 찾지 못했습니다.";
    }
    updateStatus();
}

// 상태 업데이트 함수
function updateStatus() {
    let status = '';
    
    if (chess.in_checkmate()) {
        status = '체크메이트!';
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
    
    // ✅ 이미지 로딩 문제 해결: CDN에서 조각 이미지를 가져오도록 지정
    pieceTheme: 'https://cdn.rawgit.com/oakmac/chessboardjs/v0.3.0/img/chesspieces/wikipedia/{piece}.png'
    
};

// 페이지 로드 시 보드 초기화
$(document).ready(function() {
    board = ChessBoard('myBoard', config);
    updateStatus();
});