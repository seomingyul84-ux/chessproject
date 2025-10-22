const express = require('express');
const path = require('path');

const app = express();
// Render 환경 변수 또는 기본 포트 3000 사용
const PORT = process.env.PORT || 3000; 

// 정적 파일 서비스
app.use(express.static(path.join(__dirname, '/'))); 

// 404 Not Found 핸들러
app.use((req, res) => {
    res.status(404).send('404 Not Found.');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});