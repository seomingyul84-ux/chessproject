// =========================================================
// 1. 상수 및 초기화
// =========================================================

const CHESS_API_URL = "https://chess-api.com/v1"; 

const chess = new Chess();
let board = null; 
let playerColor = 'w'; // 사용자의 선택 색상 ('w' 또는 'b')
let isEngineThinking = false; // 엔진 계산 중 플래그 (이중 실행 방지)

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
        maxThinkingTime: 50, // API 응답 시간 (ms)
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
        document.getElementById('status').textContent = "API 통신 오류가 발생했습니다. (연결 실패)";
        console.error("API 통신 오류:", error);
        return null;
    }
}

// =========================================================
// 3. 게임 로직 및 이벤트 핸들러
// =========================================================

// 사용자가 수를 둔 후 호출되는 함수
function onDrop (source, target) {
    // 1. 현재 턴이 플레이어의 색상이 아니면 수를 둘 수 없습니다.
    if (chess.turn() !== playerColor) {
        return 'snapback'; 
    }
    
    // 2. 유효한 수인지 확인 후 둠
    const move = chess.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    if (move === null) return 'snapback'; // 유효하지 않은 수

    updateStatus();
    
    // 3. 수가 유효하다면, 0.25초 후 컴퓨터의 턴을 호출합니다.
    window.setTimeout(computerMove, 250); 
}

// 컴퓨터 수 두기 함수
async function computerMove() {
    // 1. 게임 종료/계산 중/플레이어 턴 확인
    if (chess.game_over()) {
        updateStatus();
        return; 
    }
    if (isEngineThinking) return; 
    if (chess.turn() === playerColor) {
        console.log("LOG: 현재는 플레이어 차례이므로 컴퓨터는 수를 두지 않습니다.");
        return;
    }
    
    // 2. 계산 시작 플래그 ON
    isEngineThinking = true; 
    
    const currentFen = chess.fen();
    const difficultySelect = document.getElementById('difficulty');
    const selectedDifficultyDepth = parseInt(difficultySelect.value); 

    document.getElementById('status').textContent = `컴퓨터가 생각 중입니다 (Depth: ${selectedDifficultyDepth})...`;

    const bestMoveLan = await getBestMoveFromChessApi(currentFen, selectedDifficultyDepth);
    
    if (bestMoveLan) {
        // 성공: 수 두기
        chess.move(bestMoveLan, { sloppy: true }); 
        board.position(chess.fen());
        document.getElementById('status').textContent = `컴퓨터가 ${bestMoveLan} 수를 두었습니다.`;
    } else {
        // 실패: API가 수를 반환하지 못함
        document.getElementById('status').textContent = "⚠️ 엔진이 최적의 수를 찾지 못했거나, API 통신에 실패했습니다. (로그 확인)";
    }
    
    // 4. 계산 종료 플래그 OFF
    isEngineThinking = false; 
    
    updateStatus();
}

// 색상 변경 또는 버튼 클릭 시 게임을 새로 시작하는 함수
function startNewGame() {
    const colorSelect = document.getElementById('playerColor');
    playerColor = colorSelect.value;
    
    // 게임 리셋
    chess.reset(); 
    board.position('start'); 
    
    // 보드 오리엔테이션 설정
    if (playerColor === 'b') {
        board.orientation('black');
    } else {
        board.orientation('white');
    }
    
    updateStatus();
    
    // 흑을 선택했고, 현재 턴이 백(w)이라면, 컴퓨터가 선공합니다.
    if (playerColor === 'b' && chess.turn() === 'w') {
        window.setTimeout(computerMove, 500); // 0.5초 대기 후 호출
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
    
    // ✅ 이미지 로딩 문제 해결: CDN에서 조각 이미지를 가져오도록 지정
    pieceTheme: 'https://cdn.rawgit.com/oakmac/chessboardjs/v0.3.0/img/chesspieces/wikipedia/{piece}.png'
    
};

// 페이지 로드 시 보드 초기화
$(document).ready(function() {
    // 보드 초기화 및 전역 변수에 할당
    board = ChessBoard('myBoard', config);
    
    // 초기 게임 시작
    startNewGame(); 
    
    // 색상 변경 이벤트 리스너 추가 (index.html에서 onclick="startNewGame()"으로 대체되었으므로 사실상 불필요하지만 유지)
    document.getElementById('playerColor').addEventListener('change', startNewGame);
})
