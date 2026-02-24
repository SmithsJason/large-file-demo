import axios, { type AxiosInstance, type AxiosProgressEvent } from 'axios';
import type { 
  RequestStrategy, 
  CreateFileResponse, 
  HashVerifyResponse, 
  UploadProgressCallback 
} from './RequestStrategy';
import type { Chunk } from '../core';

/**
 * 基于Axios的请求策略实现
 */
export class AxiosRequestStrategy implements RequestStrategy {
  private axios: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string = '/api/upload') {
    this.baseURL = baseURL;
    this.axios = axios.create({
      baseURL,
      timeout: 120000, // 120秒超时（大文件分片上传需要更长时间）
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 请求拦截器
    this.axios.interceptors.request.use(
      (config) => {
        console.log(`[Upload SDK] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('[Upload SDK] 请求错误:', error);
        return Promise.reject(error);
      }
    );

    // 响应拦截器：统一解包后端 { success, data } 格式
    this.axios.interceptors.response.use(
      (response) => {
        // 后端返回格式为 { success, data, message }，将 data 字段提升到 response.data
        if (response.data && response.data.success && response.data.data !== undefined) {
          response.data = response.data.data;
        }
        return response;
      },
      (error) => {
        console.error('[Upload SDK] 响应错误:', error);
        if (error.response) {
          const { status, data } = error.response;
          throw new Error(`HTTP ${status}: ${data.message || '请求失败'}`);
        } else if (error.request) {
          throw new Error('网络连接失败，请检查网络状态');
        } else {
          throw new Error(`请求配置错误: ${error.message}`);
        }
      }
    );
  }

  /**
   * 创建文件上传任务
   */
  async createFile(file: File): Promise<CreateFileResponse> {
    const response = await this.axios.post('/create', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      lastModified: file.lastModified
    });

    return response.data;
  }

  /**
   * 上传分片数据
   */
  async uploadChunk(
    uploadToken: string,
    chunk: Chunk,
    onProgress?: UploadProgressCallback
  ): Promise<void> {
    const formData = new FormData();
    formData.append('chunk', chunk.blob);
    formData.append('chunkIndex', chunk.index.toString());
    formData.append('chunkHash', chunk.hash);
    formData.append('chunkStart', chunk.start.toString());
    formData.append('chunkEnd', chunk.end.toString());

    await this.axios.post('/chunk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Upload-Token': uploadToken
      },
      onUploadProgress: (progressEvent: AxiosProgressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentage = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress({
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percentage,
            chunk
          });
        }
      }
    });
  }

  /**
   * 合并文件分片
   */
  async mergeFile(uploadToken: string, fileHash: string, chunks?: string[]): Promise<string> {
    const response = await this.axios.post('/merge', {
      fileHash,
      chunks
    }, {
      headers: {
        'Upload-Token': uploadToken
      }
    });

    return response.data.url;
  }

  /**
   * Hash校验请求
   */
  async verifyHash(
    uploadToken: string,
    hash: string,
    type: 'chunk' | 'file',
    chunkIndex?: number
  ): Promise<HashVerifyResponse> {
    const headers: Record<string, string> = {
      'Upload-Token': uploadToken,
      'Upload-Hash': hash,
      'Upload-Hash-Type': type
    };
    // 传递 chunkIndex 以便后端在 chunk 秒传时同步更新 metadata
    if (type === 'chunk' && chunkIndex !== undefined) {
      headers['Upload-Chunk-Index'] = chunkIndex.toString();
    }
    const response = await this.axios.patch('/verify', {}, { headers });

    return response.data;
  }

  /**
   * 设置请求基础URL
   */
  setBaseURL(baseURL: string) {
    this.baseURL = baseURL;
    this.axios.defaults.baseURL = baseURL;
  }

  /**
   * 设置请求超时时间
   */
  setTimeout(timeout: number) {
    this.axios.defaults.timeout = timeout;
  }

  /**
   * 添加请求头
   */
  setHeader(key: string, value: string) {
    this.axios.defaults.headers.common[key] = value;
  }
}