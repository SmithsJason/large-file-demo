import type { Chunk } from '../core';

/**
 * 文件上传响应接口
 */
export interface CreateFileResponse {
  uploadToken: string;
  chunkSize: number;
}

/**
 * Hash校验响应接口
 */
export interface HashVerifyResponse {
  hasFile: boolean;
  rest?: string[]; // 文件hash校验时返回，表示还需要上传的分片hash列表
  url?: string; // 文件已存在时返回的访问地址
}

/**
 * 上传进度回调接口
 */
export interface UploadProgressCallback {
  (progress: {
    loaded: number;
    total: number;
    percentage: number;
    chunk?: Chunk;
  }): void;
}

/**
 * 请求策略接口
 * 使用策略模式解耦具体的HTTP请求库
 */
export interface RequestStrategy {
  /**
   * 创建文件上传任务
   * @param file 文件对象
   */
  createFile(file: File): Promise<CreateFileResponse>;

  /**
   * 上传分片数据
   * @param uploadToken 上传令牌
   * @param chunk 分片对象
   * @param onProgress 进度回调
   */
  uploadChunk(
    uploadToken: string,
    chunk: Chunk,
    onProgress?: UploadProgressCallback
  ): Promise<void>;

  /**
   * 合并文件分片
   * @param uploadToken 上传令牌
   * @param fileHash 文件hash
   * @param chunks 完整的分片hash列表（按索引排序）
   */
  mergeFile(uploadToken: string, fileHash: string, chunks?: string[]): Promise<string>;

  /**
   * Hash校验请求
   * @param uploadToken 上传令牌
   * @param hash hash值
   * @param type 校验类型：chunk（分片）或 file（文件）
   */
  verifyHash(
    uploadToken: string,
    hash: string,
    type: 'chunk' | 'file',
    chunkIndex?: number
  ): Promise<HashVerifyResponse>;
}