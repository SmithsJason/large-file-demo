const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * 文件工具类
 */
class FileUtils {
  /**
   * 计算文件的MD5哈希值
   * @param {string} filePath 文件路径
   * @returns {Promise<string>} MD5哈希值
   */
  static async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => {
        hash.update(data);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 计算Buffer的MD5哈希值
   * @param {Buffer} buffer 数据缓冲区
   * @returns {string} MD5哈希值
   */
  static calculateBufferHash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * 确保目录存在
   * @param {string} dirPath 目录路径
   */
  static async ensureDir(dirPath) {
    await fs.ensureDir(dirPath);
  }

  /**
   * 检查文件是否存在
   * @param {string} filePath 文件路径
   * @returns {Promise<boolean>} 文件是否存在
   */
  static async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取文件大小
   * @param {string} filePath 文件路径
   * @returns {Promise<number>} 文件大小（字节）
   */
  static async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * 创建文件流读取器
   * @param {string} filePath 文件路径
   * @param {Object} options 选项
   * @returns {ReadStream} 文件读取流
   */
  static createReadStream(filePath, options = {}) {
    return fs.createReadStream(filePath, options);
  }

  /**
   * 安全删除文件
   * @param {string} filePath 文件路径
   */
  static async safeDeleteFile(filePath) {
    try {
      if (await this.fileExists(filePath)) {
        await fs.unlink(filePath);
      }
    } catch (error) {
      console.warn(`删除文件失败: ${filePath}`, error);
    }
  }

  /**
   * 生成安全的文件名
   * @param {string} originalName 原始文件名
   * @returns {string} 安全的文件名
   */
  static generateSafeFileName(originalName) {
    // 移除危险字符，保留扩展名
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
    const timestamp = Date.now();
    return `${safeName}_${timestamp}${ext}`;
  }

  /**
   * 验证文件类型
   * @param {string} fileName 文件名
   * @param {Array} allowedTypes 允许的文件类型
   * @returns {boolean} 是否为允许的类型
   */
  static validateFileType(fileName, allowedTypes = []) {
    if (allowedTypes.length === 0) return true;
    
    const ext = path.extname(fileName).toLowerCase();
    return allowedTypes.includes(ext);
  }

  /**
   * 格式化文件大小
   * @param {number} bytes 字节数
   * @returns {string} 格式化后的大小
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = FileUtils;