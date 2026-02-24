const TokenManager = require('../utils/tokenManager');

/**
 * 上传认证中间件
 * 验证上传令牌的有效性
 */
const uploadAuth = (req, res, next) => {
  try {
    // 从请求头中获取上传令牌
    const token = req.headers['upload-token'];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '缺少上传令牌'
      });
    }

    // 验证令牌
    const payload = TokenManager.verifyUploadToken(token);
    
    // 检查令牌是否过期
    if (TokenManager.isTokenExpired(token)) {
      return res.status(401).json({
        success: false,
        message: '上传令牌已过期'
      });
    }

    // 将解码后的信息添加到请求对象中
    req.uploadInfo = payload;
    req.uploadToken = token;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: '无效的上传令牌',
      error: error.message
    });
  }
};

/**
 * 可选的上传认证中间件
 * 如果有令牌则验证，没有令牌则跳过
 */
const optionalUploadAuth = (req, res, next) => {
  const token = req.headers['upload-token'];
  
  if (!token) {
    return next();
  }

  try {
    const payload = TokenManager.verifyUploadToken(token);
    req.uploadInfo = payload;
    req.uploadToken = token;
  } catch (error) {
    // 令牌无效，但不阻止请求继续
    console.warn('无效的上传令牌:', error.message);
  }

  next();
};

module.exports = {
  uploadAuth,
  optionalUploadAuth
};