const multer = require('multer');
const TokenManager = require('../utils/tokenManager');
const FileService = require('../services/fileService');
const ChunkService = require('../services/chunkService');
const FileUtils = require('../utils/fileUtils');

// 配置multer用于处理文件上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB 单个分片最大限制
  }
});

/**
 * 上传控制器
 */
class UploadController {
  constructor() {
    this.fileService = new FileService();
    this.chunkService = new ChunkService();
    
    // 默认分片大小：5MB
    this.defaultChunkSize = 5 * 1024 * 1024;
  }

  /**
   * 创建文件上传任务
   * POST /api/upload/create
   */
  async createFile(req, res) {
    try {
      const { fileName, fileSize, fileType, lastModified } = req.body;

      // 验证必需参数
      if (!fileName || !fileSize) {
        return res.status(400).json({
          success: false,
          message: '缺少必需参数：fileName 和 fileSize'
        });
      }

      // 验证文件大小
      const maxFileSize = 10 * 1024 * 1024 * 1024; // 10GB
      if (fileSize > maxFileSize) {
        return res.status(400).json({
          success: false,
          message: `文件大小超过限制：${FileUtils.formatFileSize(maxFileSize)}`
        });
      }

      // 生成上传令牌
      const uploadToken = TokenManager.generateUploadToken({
        fileName,
        fileSize,
        fileType,
        lastModified
      });

      // 获取上传ID
      const uploadId = TokenManager.getUploadId(uploadToken);

      // 创建文件记录
      await this.fileService.createFileRecord({
        fileName,
        fileSize,
        fileType,
        lastModified
      }, uploadId);

      res.json({
        success: true,
        data: {
          uploadToken,
          chunkSize: this.defaultChunkSize
        }
      });

      console.log(`创建上传任务: ${fileName} (${FileUtils.formatFileSize(fileSize)})`);

    } catch (error) {
      console.error('创建文件上传任务失败:', error);
      res.status(500).json({
        success: false,
        message: '创建上传任务失败',
        error: error.message
      });
    }
  }

  /**
   * Hash校验
   * PATCH /api/upload/verify
   */
  async verifyHash(req, res) {
    try {
      const uploadHash = req.headers['upload-hash'];
      const hashType = req.headers['upload-hash-type'];
      const { uploadId } = req.uploadInfo;

      if (!uploadHash || !hashType) {
        return res.status(400).json({
          success: false,
          message: '缺少必需的请求头：Upload-Hash 和 Upload-Hash-Type'
        });
      }

      let result = { hasFile: false };

      if (hashType === 'chunk') {
        // 分片hash校验：只检查分片文件是否存在于磁盘上
        const chunkExists = await this.chunkService.chunkExists(uploadHash);
        result.hasFile = chunkExists;

      } else if (hashType === 'file') {
        // 文件hash校验
        const existingFile = await this.fileService.findFileByHash(uploadHash);
        
        if (existingFile) {
          result.hasFile = true;
          result.url = existingFile.fileUrl;
        } else {
          // 返回还需要上传的分片列表
          const metadata = await this.fileService.getFileMetadata(uploadId);
          if (metadata && metadata.chunks.length > 0) {
            const missingChunks = metadata.chunks
              .map((chunk, index) => chunk ? null : index)
              .filter(index => index !== null);
            result.rest = missingChunks;
          }
        }
      } else {
        return res.status(400).json({
          success: false,
          message: '无效的hash类型，必须是 chunk 或 file'
        });
      }

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Hash校验失败:', error);
      res.status(500).json({
        success: false,
        message: 'Hash校验失败',
        error: error.message
      });
    }
  }

  /**
   * 分片上传
   * POST /api/upload/chunk
   */
  async uploadChunk(req, res) {
    try {
      const { uploadId } = req.uploadInfo;
      const { chunkIndex, chunkHash, chunkStart, chunkEnd } = req.body;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '缺少分片文件'
        });
      }

      if (chunkHash === undefined || chunkIndex === undefined) {
        return res.status(400).json({
          success: false,
          message: '缺少必需参数：chunkHash 和 chunkIndex'
        });
      }

      const chunkData = req.file.buffer;
      
      // 验证分片大小
      if (chunkStart !== undefined && chunkEnd !== undefined) {
        const expectedSize = parseInt(chunkEnd) - parseInt(chunkStart);
        if (chunkData.length !== expectedSize) {
          return res.status(400).json({
            success: false,
            message: '分片大小不匹配'
          });
        }
      }

      // 保存分片
      await this.chunkService.saveChunk(chunkHash, chunkData);

      res.json({
        success: true,
        message: '分片上传成功'
      });

      console.log(`分片上传成功: ${chunkHash} (索引: ${chunkIndex})`);

    } catch (error) {
      console.error('分片上传失败:', error);
      res.status(500).json({
        success: false,
        message: '分片上传失败',
        error: error.message
      });
    }
  }

  /**
   * 合并文件
   * POST /api/upload/merge
   */
  async mergeFile(req, res) {
    try {
      const { uploadId } = req.uploadInfo;
      const { fileHash, chunks } = req.body;

      if (!fileHash || !chunks) {
        return res.status(400).json({
          success: false,
          message: '缺少必需参数：fileHash 和 chunks'
        });
      }

      // 检查文件是否已存在
      const existingFile = await this.fileService.findFileByHash(fileHash);
      if (existingFile) {
        return res.json({
          success: true,
          data: {
            url: existingFile.fileUrl,
            message: '文件已存在，无需重复上传'
          }
        });
      }

      // 合并文件（传入前端提供的完整 chunks 列表）
      const fileUrl = await this.fileService.mergeFile(uploadId, fileHash, chunks);

      res.json({
        success: true,
        data: {
          url: fileUrl
        }
      });

    } catch (error) {
      console.error('文件合并失败:', error);
      res.status(500).json({
        success: false,
        message: '文件合并失败',
        error: error.message
      });
    }
  }

  /**
   * 获取文件
   * GET /api/upload/file/:uploadId/:fileName
   */
  async getFile(req, res) {
    try {
      const { uploadId, fileName } = req.params;

      // 获取文件信息
      const fileInfo = await this.fileService.getFileInfo(uploadId);
      if (!fileInfo || fileInfo.status !== 'completed') {
        return res.status(404).json({
          success: false,
          message: '文件不存在或未完成上传'
        });
      }

      // 禁用请求超时，大文件下载可能需要很长时间
      req.setTimeout(0);
      res.setTimeout(0);

      // 设置响应头
      res.setHeader('Content-Type', fileInfo.fileType || 'application/octet-stream');
      res.setHeader('Content-Length', fileInfo.fileSize);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.fileName)}"`);
      // 禁用传输编码压缩，避免大文件被缓冲
      res.setHeader('Cache-Control', 'no-store');

      // 创建文件流并响应
      const fileStream = await this.fileService.createFileReadStream(uploadId);

      // 当客户端断开连接时，销毁读取流以释放资源
      req.on('close', () => {
        if (!res.writableEnded) {
          fileStream.destroy();
        }
      });

      fileStream.on('error', (error) => {
        console.error('文件流读取错误:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: '文件读取失败'
          });
        } else {
          res.end();
        }
      });

      fileStream.pipe(res);

      console.log(`文件下载: ${fileInfo.fileName} (${FileUtils.formatFileSize(fileInfo.fileSize)})`);

    } catch (error) {
      console.error('获取文件失败:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: '获取文件失败',
          error: error.message
        });
      }
    }
  }

  /**
   * 获取上传进度
   * GET /api/upload/progress/:uploadId
   */
  async getProgress(req, res) {
    try {
      const { uploadId } = req.params;

      const fileInfo = await this.fileService.getFileInfo(uploadId);
      if (!fileInfo) {
        return res.status(404).json({
          success: false,
          message: '上传任务不存在'
        });
      }

      res.json({
        success: true,
        data: fileInfo
      });

    } catch (error) {
      console.error('获取上传进度失败:', error);
      res.status(500).json({
        success: false,
        message: '获取上传进度失败',
        error: error.message
      });
    }
  }

  /**
   * 获取文件列表
   * GET /api/upload/files
   */
  async getFileList(req, res) {
    try {
      const { status, limit, offset } = req.query;

      const files = await this.fileService.getFileList({
        status,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined
      });

      res.json({
        success: true,
        data: files
      });

    } catch (error) {
      console.error('获取文件列表失败:', error);
      res.status(500).json({
        success: false,
        message: '获取文件列表失败',
        error: error.message
      });
    }
  }

  /**
   * 获取存储统计信息
   * GET /api/upload/stats
   */
  async getStats(req, res) {
    try {
      const stats = await this.chunkService.getStorageStats();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('获取统计信息失败:', error);
      res.status(500).json({
        success: false,
        message: '获取统计信息失败',
        error: error.message
      });
    }
  }

  /**
   * 获取multer中间件
   */
  getUploadMiddleware() {
    return upload.single('chunk');
  }
}

module.exports = UploadController;