const fs = require('fs-extra');
const path = require('path');
const FileUtils = require('../utils/fileUtils');

/**
 * 分片服务
 * 负责分片的存储、管理和检索
 */
class ChunkService {
  constructor() {
    this.chunksDir = path.join(__dirname, '../../uploads/chunks');
    this.init();
  }

  /**
   * 初始化分片目录
   */
  async init() {
    await FileUtils.ensureDir(this.chunksDir);
  }

  /**
   * 保存分片
   * @param {string} chunkHash 分片哈希值
   * @param {Buffer} chunkData 分片数据
   * @returns {Promise<string>} 分片文件路径
   */
  async saveChunk(chunkHash, chunkData) {
    const chunkPath = this.getChunkPath(chunkHash);
    
    // 检查分片是否已存在
    if (await FileUtils.fileExists(chunkPath)) {
      return chunkPath;
    }

    // 验证分片哈希
    const actualHash = FileUtils.calculateBufferHash(chunkData);
    if (actualHash !== chunkHash) {
      throw new Error('分片哈希值不匹配');
    }

    // 保存分片文件
    await fs.writeFile(chunkPath, chunkData);
    
    console.log(`分片已保存: ${chunkHash} (${FileUtils.formatFileSize(chunkData.length)})`);
    return chunkPath;
  }

  /**
   * 检查分片是否存在
   * @param {string} chunkHash 分片哈希值
   * @returns {Promise<boolean>} 分片是否存在
   */
  async chunkExists(chunkHash) {
    const chunkPath = this.getChunkPath(chunkHash);
    return await FileUtils.fileExists(chunkPath);
  }

  /**
   * 获取分片文件路径
   * @param {string} chunkHash 分片哈希值
   * @returns {string} 分片文件路径
   */
  getChunkPath(chunkHash) {
    // 使用哈希值的前两位作为子目录，避免单个目录文件过多
    const subDir = chunkHash.substring(0, 2);
    const chunkDir = path.join(this.chunksDir, subDir);
    
    // 确保子目录存在
    fs.ensureDirSync(chunkDir);
    
    return path.join(chunkDir, `${chunkHash}.chunk`);
  }

  /**
   * 读取分片数据
   * @param {string} chunkHash 分片哈希值
   * @returns {Promise<Buffer>} 分片数据
   */
  async readChunk(chunkHash) {
    const chunkPath = this.getChunkPath(chunkHash);
    
    if (!(await FileUtils.fileExists(chunkPath))) {
      throw new Error(`分片不存在: ${chunkHash}`);
    }

    return await fs.readFile(chunkPath);
  }

  /**
   * 创建分片读取流
   * @param {string} chunkHash 分片哈希值
   * @returns {ReadStream} 分片读取流
   */
  createChunkReadStream(chunkHash) {
    const chunkPath = this.getChunkPath(chunkHash);
    return FileUtils.createReadStream(chunkPath);
  }

  /**
   * 批量检查分片存在性
   * @param {Array<string>} chunkHashes 分片哈希值数组
   * @returns {Promise<Object>} 检查结果 { existing: [], missing: [] }
   */
  async batchCheckChunks(chunkHashes) {
    const existing = [];
    const missing = [];

    for (const hash of chunkHashes) {
      if (await this.chunkExists(hash)) {
        existing.push(hash);
      } else {
        missing.push(hash);
      }
    }

    return { existing, missing };
  }

  /**
   * 获取分片信息
   * @param {string} chunkHash 分片哈希值
   * @returns {Promise<Object>} 分片信息
   */
  async getChunkInfo(chunkHash) {
    const chunkPath = this.getChunkPath(chunkHash);
    
    if (!(await FileUtils.fileExists(chunkPath))) {
      return null;
    }

    const stats = await fs.stat(chunkPath);
    return {
      hash: chunkHash,
      size: stats.size,
      path: chunkPath,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime
    };
  }

  /**
   * 获取分片存储统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStorageStats() {
    const stats = {
      totalChunks: 0,
      totalSize: 0,
      directories: 0
    };

    try {
      const walkDir = async (dir) => {
        const items = await fs.readdir(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const itemStats = await fs.stat(itemPath);
          
          if (itemStats.isDirectory()) {
            stats.directories++;
            await walkDir(itemPath);
          } else if (item.endsWith('.chunk')) {
            stats.totalChunks++;
            stats.totalSize += itemStats.size;
          }
        }
      };

      await walkDir(this.chunksDir);
      
    } catch (error) {
      console.error('获取存储统计信息时发生错误:', error);
    }

    return {
      ...stats,
      totalSizeFormatted: FileUtils.formatFileSize(stats.totalSize),
      averageChunkSize: stats.totalChunks > 0 ? Math.round(stats.totalSize / stats.totalChunks) : 0
    };
  }
}

module.exports = ChunkService;