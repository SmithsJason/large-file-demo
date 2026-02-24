const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 确保上传目录存在
const uploadsDir = path.join(__dirname, '../uploads');
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(path.join(uploadsDir, 'chunks'));
fs.ensureDirSync(path.join(uploadsDir, 'files'));
fs.ensureDirSync(path.join(uploadsDir, 'metadata'));

// 路由
app.use('/api/upload', uploadRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '大文件上传服务运行正常' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 大文件上传服务已启动，端口: ${PORT}`);
  console.log(`📁 文件存储目录: ${uploadsDir}`);
});