// server.js 파일 최종 버전

const express = require('express');
const path = require('path');
// const mime = require('mime'); // 🔴 mime 라이브러리 제거

const app = express();
const PORT = process.env.PORT || 3000;

// WASM 파일 MIME 타입을 Express의 setHeaders 옵션을 사용해 명시적으로 설정합니다.
app.use(express.static(path.join(__dirname, '/'), { 
    setHeaders: (res, filePath) => {
        // .wasm 확장자 파일에 대해 Content-Type을 강제로 application/wasm으로 설정
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
    }
})); 

// 모든 요청에 대해 index.html을 응답하여 클라이언트 사이드 라우팅을 지원합니다.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); 
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});