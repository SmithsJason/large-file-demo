const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// JWT密钥，生产环境应该从环境变量读取
const JWT_SECRET = process.env.JWT_SECRET || 'large-file-upload-secret-key';

/**
 * Token管理器
 * 负责生成和验证上传令牌
 */
class TokenManager {
  /**
   * 生成上传令牌
   * @param {Object} fileInfo 文件信息
   * @returns {string} JWT令牌
   */
  static generateUploadToken(fileInfo) {
    const uploadId = uuidv4();
    const payload = {
      uploadId,
      fileName: fileInfo.fileName,
      fileSize: fileInfo.fileSize,
      fileType: fileInfo.fileType,
      createdAt: Date.now()
    };

    return jwt.sign(payload, JWT_SECRET, { 
      expiresIn: '24h' // 24小时过期
    });
  }

  /**
   * 验证上传令牌
   * @param {string} token JWT令牌
   * @returns {Object} 解码后的payload
   */
  static verifyUploadToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('无效的上传令牌');
    }
  }

  /**
   * 从令牌中提取上传ID
   * @param {string} token JWT令牌
   * @returns {string} 上传ID
   */
  static getUploadId(token) {
    const payload = this.verifyUploadToken(token);
    return payload.uploadId;
  }

  /**
   * 检查令牌是否过期
   * @param {string} token JWT令牌
   * @returns {boolean} 是否过期
   */
  static isTokenExpired(token) {
    try {
      const payload = jwt.decode(token);
      return payload.exp * 1000 < Date.now();
    } catch (error) {
      return true;
    }
  }
}

module.exports = TokenManager;