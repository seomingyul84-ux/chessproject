const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// WASM 관련 설정 (MIME 타입)을 모두 제거하고,
// 현재 디렉토리의 파일만 정적으로 서비스합니다.
// 이제 클라이언트(브라우저)는 외부 API로 통신합니다.
app.use(express.static(path.join(__dirname, '/'))); 

// 404 Not Found 핸들러 유지 (선택 사항이지만 권장)
app.use((req, res) => {
    res.status(404).send('404 Not Found. API 호출은 클라이언트(script.js)에서 이루어집니다.');
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});