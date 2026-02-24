// 大文件上传SDK主入口

// 导出核心模块
export * from './core';

// 导出客户端模块
export * from './client';

// 便捷导出主要类
export { UploadController, UploadStatus } from './client/UploadController';
export { AxiosRequestStrategy } from './client/AxiosRequestStrategy';
export { MultiThreadSplitor, SingleThreadSplitor } from './core';