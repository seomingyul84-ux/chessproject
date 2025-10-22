// =========================================================
// 1. 상수 및 초기화
// =========================================================

const CHESS_API_URL = "https://chess-api.com/v1"; 

const chess = new Chess();
let board = null; 
let playerColor = 'w'; // 사용자의 선택 색상 ('w' 또는 'b')

// =========================================================
// 2. API 통신 및 난이도 조절 함수
// =========================================================

async function postChessApi(data = {}) {
    const response = await fetch(CHESS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return response.json();
}

async function getBestMoveFromChessApi(fen, selectedDepth) {
    console.log(`API에 FEN 요청: ${fen}, Depth: ${selectedDepth}`);

    const data = {
        fen: fen,
        depth: selectedDepth,
        maxThinkingTime: 50,
    };

    try {
        const responseData = await postChessApi(data);

        if (responseData.type === 'move' || responseData.type === 'bestmove') {
            console.log("API 응답:", responseData);
            return responseData.lan; 
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
    // ⚠️ 현재 턴이 플레이어의 색상이 아니면 수를 둘 수 없습니다.
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
    // 다음 턴은 무조건 컴퓨터의 턴입니다.
    window.setTimeout(computerMove, 250); 
}

// 컴퓨터 수 두기 함수
async function computerMove() {
    // ⚠️ 현재 턴이 플레이어의 턴이면 수를 두지 않습니다.
    if (chess.turn() === playerColor) {
        return;
    }
    
    const currentFen = chess.fen();
    const difficultySelect = document.getElementById('difficulty');
    const selectedDifficultyDepth = parseInt(difficultySelect.value); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Depth: ${selectedDifficultyDepth})...`;

    const bestMoveLan = await getBestMoveFromChessApi(currentFen, selectedDifficultyDepth);
    
    if (bestMoveLan) {
        chess.move(bestMoveLan, { sloppy: true }); 
        board.position(chess.fen());
        document.getElementById('status').textContent = `컴퓨터가 ${bestMoveLan} 수를 두었습니다.`;
    } else {
        document.getElementById('status').textContent = "엔진이 수를 찾지 못했습니다.";
    }
    updateStatus();
}

// 색상 변경 또는 버튼 클릭 시 게임을 새로 시작하는 함수
function startNewGame() {
    const colorSelect = document.getElementById('playerColor');
    playerColor = colorSelect.value;
    
    // 게임 리셋
    chess.reset(); 
    
    // 보드 오리엔테이션 설정
    if (playerColor === 'b') {
        board.orientation('black');
    } else {
        board.orientation('white');
    }
    board.position('start'); 
    
    updateStatus();
    
    // 흑을 선택했다면, 컴퓨터가 먼저 수를 둡니다.
    if (playerColor === 'b') {
        computerMove();
    }
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
    // 보드 초기화 및 전역 변수에 할당
    board = ChessBoard('myBoard', config);
    
    // 초기 게임 시작 (WASM 오류 때문에 바로 startNewGame 호출)
    startNewGame(); 
    
    // 색상 변경 이벤트 리스너 추가
    document.getElementById('playerColor').addEventListener('change', startNewGame);
});