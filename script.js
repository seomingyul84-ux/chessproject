// =========================================================
// 1. 상수 정의 (Chess-API.com 정보)
// =========================================================

const CHESS_API_URL = "https://chess-api.com/v1"; 
// 이 API는 인증 키가 필요 없으므로, CHESS_API_KEY는 정의하지 않습니다.

// =========================================================
// 2. 난이도 설정 (Depth 기반 ELO 난이도 간접 조절)
// =========================================================

// 사용자가 설정한 난이도를 이 변수에 연결해야 합니다.
// (예: 드롭다운이나 슬라이더 값)
// 18이 가장 강하며 (약 2750 ELO), 12가 기본 (약 2350 ELO)입니다.
// 쉬운 난이도를 위해 5~8 사이로 설정할 수 있습니다.
let selectedDifficultyDepth = 10; // 초기 난이도: Depth 10으로 설정 (약 2000 ELO 추정)

// =========================================================
// 3. API 통신 함수
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

// =========================================================
// 4. 엔진 호출 및 최적 수 반환 함수
// =========================================================

// FEN과 Depth를 받아 최적의 수를 반환합니다.
async function getBestMoveFromChessApi(fen, selectedDepth) {
    console.log(`API에 FEN 요청: ${fen}, Depth: ${selectedDepth}`);

    const data = {
        fen: fen,
        depth: selectedDepth, // 난이도 조절
        maxThinkingTime: 50,  // (선택 사항: 밀리초)
    };

    try {
        const responseData = await postChessApi(data);

        // API는 'move' 또는 'bestmove' 타입을 반환합니다.
        if (responseData.type === 'move' || responseData.type === 'bestmove') {
            console.log("API 응답:", responseData);
            // 최적의 수 (SAN 또는 LAN) 반환
            // 여기서는 LAN(Long Algebraic Notation, 예: 'g1f3')을 사용하겠습니다.
            return responseData.lan; 
        } else {
            console.error("API 오류 또는 정보 메시지:", responseData.text);
            return null;
        }
    } catch (error) {
        console.error("API 통신 오류:", error);
        return null;
    }
}


// =========================================================
// 5. 게임 로직 (예시)
// =========================================================

// chess.js 인스턴스는 html 파일에서 로드된 라이브러리에 의해 생성된다고 가정합니다.
const chess = new Chess(); 
// let board = ChessBoard('myBoard', config); // chessboard.js를 사용한다고 가정

// 예시: 사용자가 수를 둔 후 컴퓨터 차례가 되었을 때
async function computerMove() {
    // 1. 현재 FEN을 가져옵니다.
    const currentFen = chess.fen();
    
    // 2. API를 호출하여 최적 수를 얻습니다.
    const bestMoveLan = await getBestMoveFromChessApi(currentFen, selectedDifficultyDepth);
    
    if (bestMoveLan) {
        // 3. chess.js를 이용해 수를 둡니다.
        chess.move(bestMoveLan, { sloppy: true }); 
        
        // 4. 보드를 업데이트합니다.
        // board.position(chess.fen()); 
        
        console.log(`컴퓨터의 수: ${bestMoveLan}`);
    } else {
        console.warn("엔진이 수를 찾지 못했습니다.");
    }
}

// 이 함수를 사용자 수를 처리하는 이벤트 핸들러에서 호출해야 합니다.
// (예: onDrop 함수 내에서)