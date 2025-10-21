// server.js 파일 최종 버전 (WASM MIME 타입 및 404 처리 개선)

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. WASM MIME 타입 처리 및 정적 파일 서비스
app.use(express.static(path.join(__dirname, '/'), { 
    setHeaders: (res, filePath) => {
        // .wasm 확장자 파일에 대해 Content-Type을 강제로 application/wasm으로 설정
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
    }
})); 

// 2. 404 Not Found 핸들러 (HTML 응답 방지)
// 정적 파일에서 찾지 못한 모든 요청은 404를 반환하도록 합니다.
app.use((req, res) => {
    // WASM 파일 요청 실패 시, HTML(3c 21 44 4f) 대신 명시적인 에러 메시지를 반환합니다.
    res.status(404).send('404 Not Found. Check your file paths (especially WASM).');
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});