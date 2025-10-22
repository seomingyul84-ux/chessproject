const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 클라이언트 파일(HTML, CSS, JS)을 서비스합니다.
// WASM MIME 타입 설정은 제거되었습니다.
app.use(express.static(path.join(__dirname, '/'))); 

// 404 Not Found 핸들러
app.use((req, res) => {
    res.status(404).send('404 Not Found.');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});