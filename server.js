const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(express.static(path.join(__dirname, '/'))); 

app.use((req, res) => {
    res.status(404).send('404 Not Found.');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});