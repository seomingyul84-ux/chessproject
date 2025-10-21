// server.js 파일 최종 수정 (WASM 라우팅 개선)

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. WASM 파일 MIME 타입을 Express의 setHeaders 옵션을 사용해 명시적으로 설정합니다.
app.use(express.static(path.join(__dirname, '/'), { 
    setHeaders: (res, filePath) => {
        // .wasm 확장자 파일에 대해 Content-Type을 강제로 application/wasm으로 설정
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
    }
})); 

// 2. ⚠️ 중요: Express가 위의 정적 폴더에서 파일을 찾지 못하면 404 처리 미들웨어로 넘어옵니다.

// 3. 만약 요청된 경로가 /index.html이 아니라면 (Stockfish 요청이 실패했다면) 
//    여전히 404 상태 코드를 반환하도록 명시합니다. 
//    이 코드가 없으면 Render는 default index.html을 반환할 수 있습니다.
app.use((req, res, next) => {
    // 404 오류 시 index.html을 반환하여 클라이언트 측 라우팅(SPA)을 지원합니다.
    if (req.accepts('html')) {
        res.status(404).sendFile(path.join(__dirname, 'index.html'));
        return;
    }
    next();
});

// 4. 서버 시작
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});