const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FileUtils = require('../utils/fileUtils');
const ChunkService = require('./chunkService');

/**
 * 文件服务
 * 负责文件的管理、合并和访问
 */
class FileService {
  constructor() {
    this.filesDir = path.join(__dirname, '../../uploads/files');
    this.metadataDir = path.join(__dirname, '../../uploads/metadata');
    this.chunkService = new ChunkService();
    this.init();
  }

  /**
   * 初始化文件目录
   */
  async init() {
    await FileUtils.ensureDir(this.filesDir);
    await FileUtils.ensureDir(this.metadataDir);
  }

  /**
   * 创建文件上传记录
   * @param {Object} fileInfo 文件信息
   * @param {string} uploadId 上传ID
   * @returns {Promise<Object>} 文件记录
   */
  async createFileRecord(fileInfo, uploadId) {
    const fileRecord = {
      uploadId,
      fileName: fileInfo.fileName,
      fileSize: fileInfo.fileSize,
      fileType: fileInfo.fileType,
      lastModified: fileInfo.lastModified,
      status: 'uploading', // uploading, completed, failed
      chunks: [], // 分片哈希值列表（仅在 merge 时一次性写入）
      fileHash: null,
      fileUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.saveFileMetadata(uploadId, fileRecord);
    return fileRecord;
  }

  /**
   * 保存文件元数据
   * @param {string} uploadId 上传ID
   * @param {Object} metadata 元数据
   */
  async saveFileMetadata(uploadId, metadata) {
    const metadataPath = path.join(this.metadataDir, `${uploadId}.json`);
    metadata.updatedAt = new Date().toISOString();
    await fs.writeJson(metadataPath, metadata, { spaces: 2 });
  }

  /**
   * 读取文件元数据
   * @param {string} uploadId 上传ID
   * @returns {Promise<Object|null>} 文件元数据
   */
  async getFileMetadata(uploadId) {
    try {
      const metadataPath = path.join(this.metadataDir, `${uploadId}.json`);
      return await fs.readJson(metadataPath);
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查文件是否已存在（基于文件哈希）
   * @param {string} fileHash 文件哈希值
   * @returns {Promise<Object|null>} 已存在的文件信息
   */
  async findFileByHash(fileHash) {
    try {
      const metadataFiles = await fs.readdir(this.metadataDir);
      
      for (const file of metadataFiles) {
        if (file.endsWith('.json')) {
          const metadata = await fs.readJson(path.join(this.metadataDir, file));
          if (metadata.fileHash === fileHash && metadata.status === 'completed') {
            return metadata;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('查找文件时发生错误:', error);
      return null;
    }
  }

  /**
   * 合并文件分片
   * @param {string} uploadId 上传ID
   * @param {string} fileHash 文件哈希值
   * @param {Array<string>} chunks 前端提供的完整分片hash列表（按索引排序）
   * @returns {Promise<string>} 文件访问URL
   */
  async mergeFile(uploadId, fileHash, chunks) {
    const metadata = await this.getFileMetadata(uploadId);
    if (!metadata) {
      throw new Error('文件记录不存在');
    }

    // chunks 列表由前端传入，这是唯一可靠的数据来源
    // 前端在内存中维护完整的分片信息，不存在并发竞态问题
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('缺少分片列表，请传入 chunks 参数');
    }

    // 验证所有分片文件是否存在于磁盘上
    for (let i = 0; i < chunks.length; i++) {
      if (!chunks[i]) {
        throw new Error(`分片 ${i} 的 hash 为空`);
      }
      if (!(await this.chunkService.chunkExists(chunks[i]))) {
        throw new Error(`分片 ${i} 不存在于磁盘: ${chunks[i]}`);
      }
    }

    // 一次性写入完整的 metadata
    metadata.chunks = chunks;
    metadata.fileHash = fileHash;
    metadata.status = 'completed';
    metadata.fileUrl = this.generateFileUrl(uploadId, metadata.fileName);
    
    await this.saveFileMetadata(uploadId, metadata);

    console.log(`文件合并完成: ${metadata.fileName} (${FileUtils.formatFileSize(metadata.fileSize)})`);
    return metadata.fileUrl;
  }

  /**
   * 生成文件访问URL
   * @param {string} uploadId 上传ID
   * @param {string} fileName 文件名
   * @returns {string} 文件URL
   */
  generateFileUrl(uploadId, fileName) {
    return `/api/upload/file/${uploadId}/${encodeURIComponent(fileName)}`;
  }

  /**
   * 获取合并后的完整文件路径，如果尚未合并则先执行合并
   * @param {string} uploadId 上传ID
   * @returns {Promise<string>} 合并后的文件路径
   */
  async getMergedFilePath(uploadId) {
    const mergedPath = path.join(this.filesDir, `${uploadId}.dat`);

    // 如果合并文件已存在，直接返回
    if (await fs.pathExists(mergedPath)) {
      return mergedPath;
    }

    const metadata = await this.getFileMetadata(uploadId);
    if (!metadata || metadata.status !== 'completed') {
      throw new Error('文件不存在或未完成上传');
    }

    if (!metadata.chunks || metadata.chunks.length === 0) {
      throw new Error('文件分片信息缺失，无法读取文件');
    }

    // 将所有分片按顺序写入合并文件
    const { pipeline } = require('stream/promises');
    const writeStream = fs.createWriteStream(mergedPath);

    for (let i = 0; i < metadata.chunks.length; i++) {
      const chunkHash = metadata.chunks[i];
      const chunkStream = this.chunkService.createChunkReadStream(chunkHash);
      // 使用 pipeline 正确处理背压，end: false 防止提前关闭写入流
      await pipeline(chunkStream, writeStream, { end: false });
    }

    writeStream.end();
    // 等待写入流完全结束
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log(`文件合并到磁盘: ${mergedPath} (${metadata.chunks.length} 个分片)`);
    return mergedPath;
  }

  /**
   * 创建文件读取流
   * @param {string} uploadId 上传ID
   * @returns {Promise<ReadStream>} 文件读取流
   */
  async createFileReadStream(uploadId) {
    const mergedPath = await this.getMergedFilePath(uploadId);
    return fs.createReadStream(mergedPath);
  }

  /**
   * 获取文件信息
   * @param {string} uploadId 上传ID
   * @returns {Promise<Object|null>} 文件信息
   */
  async getFileInfo(uploadId) {
    const metadata = await this.getFileMetadata(uploadId);
    if (!metadata) {
      return null;
    }

    return {
      uploadId: metadata.uploadId,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      fileType: metadata.fileType,
      status: metadata.status,
      fileHash: metadata.fileHash,
      fileUrl: metadata.fileUrl,
      uploadProgress: this.calculateUploadProgress(metadata),
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt
    };
  }

  /**
   * 计算上传进度
   * @param {Object} metadata 文件元数据
   * @returns {Object} 进度信息
   */
  calculateUploadProgress(metadata) {
    const totalChunks = metadata.chunks.length;
    const uploadedChunks = metadata.chunks.filter(chunk => chunk !== null).length;
    
    return {
      totalChunks,
      uploadedChunks,
      percentage: totalChunks > 0 ? Math.round((uploadedChunks / totalChunks) * 100) : 0
    };
  }

  /**
   * 获取缺失的分片列表
   * @param {string} uploadId 上传ID
   * @param {Array<string>} allChunkHashes 所有分片哈希值
   * @returns {Promise<Array<string>>} 缺失的分片哈希值
   */
  async getMissingChunks(uploadId, allChunkHashes) {
    const metadata = await this.getFileMetadata(uploadId);
    if (!metadata) {
      return allChunkHashes; // 如果文件记录不存在，所有分片都缺失
    }

    const existingChunks = new Set(metadata.chunks.filter(chunk => chunk !== null));
    return allChunkHashes.filter(hash => !existingChunks.has(hash));
  }

  /**
   * 删除文件记录
   * @param {string} uploadId 上传ID
   */
  async deleteFileRecord(uploadId) {
    try {
      const metadataPath = path.join(this.metadataDir, `${uploadId}.json`);
      await fs.unlink(metadataPath);
    } catch (error) {
      console.warn(`删除文件记录失败: ${uploadId}`, error);
    }
  }

  /**
   * 获取文件列表
   * @param {Object} options 查询选项
   * @returns {Promise<Array>} 文件列表
   */
  async getFileList(options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    const files = [];

    try {
      const metadataFiles = await fs.readdir(this.metadataDir);
      
      for (const file of metadataFiles) {
        if (file.endsWith('.json')) {
          const metadata = await fs.readJson(path.join(this.metadataDir, file));
          
          if (!status || metadata.status === status) {
            files.push({
              uploadId: metadata.uploadId,
              fileName: metadata.fileName,
              fileSize: metadata.fileSize,
              status: metadata.status,
              createdAt: metadata.createdAt,
              fileUrl: metadata.fileUrl
            });
          }
        }
      }

      // 按创建时间排序
      files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // 分页
      return files.slice(offset, offset + limit);
      
    } catch (error) {
      console.error('获取文件列表时发生错误:', error);
      return [];
    }
  }
}

module.exports = FileService;