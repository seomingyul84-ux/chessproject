// server.js 파일 내용

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 프로젝트 루트 폴더의 모든 파일을 정적 파일로 서비스
app.use(express.static(path.join(__dirname, '/'))); 

// 모든 요청에 대해 index.html 파일을 응답 (SPA 기본 구조)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); 
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});