const express = require('express');
const UploadController = require('../controllers/uploadController');
const { uploadAuth, optionalUploadAuth } = require('../middleware/uploadAuth');

const router = express.Router();
const uploadController = new UploadController();

// 创建文件上传任务
router.post('/create', uploadController.createFile.bind(uploadController));

// Hash校验（需要认证）
router.patch('/verify', uploadAuth, uploadController.verifyHash.bind(uploadController));

// 分片上传（需要认证）
router.post('/chunk', 
  uploadAuth, 
  uploadController.getUploadMiddleware(), 
  uploadController.uploadChunk.bind(uploadController)
);

// 合并文件（需要认证）
router.post('/merge', uploadAuth, uploadController.mergeFile.bind(uploadController));

// 获取文件（公开访问）
router.get('/file/:uploadId/:fileName', uploadController.getFile.bind(uploadController));

// 获取上传进度（可选认证）
router.get('/progress/:uploadId', optionalUploadAuth, uploadController.getProgress.bind(uploadController));

// 获取文件列表（公开访问）
router.get('/files', uploadController.getFileList.bind(uploadController));

// 获取存储统计信息（公开访问）
router.get('/stats', uploadController.getStats.bind(uploadController));

// 健康检查
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: '上传服务运行正常',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;