import { 
  EventEmitter, 
  TaskQueue, 
  Task, 
  ChunkSplitor, 
  MultiThreadSplitor,
} from '../core';
import type { Chunk } from '../core';
import type { RequestStrategy, UploadProgressCallback } from './RequestStrategy';
import { AxiosRequestStrategy } from './AxiosRequestStrategy';

/**
 * 上传状态枚举
 */
export enum UploadStatus {
  IDLE = 'idle',           // 空闲
  SPLITTING = 'splitting', // 分片中
  UPLOADING = 'uploading', // 上传中
  PAUSED = 'paused',       // 暂停
  MERGING = 'merging',     // 合并中
  COMPLETED = 'completed', // 完成
  ERROR = 'error'          // 错误
}

/**
 * 上传事件类型
 */
export type UploadEvents = 
  | 'progress'      // 上传进度
  | 'chunkProgress' // 分片进度
  | 'statusChange'  // 状态变化
  | 'complete'      // 上传完成
  | 'error'         // 上传错误
  | 'pause'         // 暂停
  | 'resume';       // 恢复

/**
 * 上传进度信息
 */
export interface UploadProgress {
  loaded: number;        // 已上传字节数
  total: number;         // 总字节数
  percentage: number;    // 上传百分比
  speed: number;         // 上传速度（字节/秒）
  remainingTime: number; // 预计剩余时间（秒）
  uploadedChunks: number; // 已上传分片数
  totalChunks: number;   // 总分片数
}

/**
 * 上传配置选项
 */
export interface UploadOptions {
  chunkSize?: number;           // 分片大小，默认5MB
  concurrency?: number;         // 并发数，默认4
  retryCount?: number;          // 重试次数，默认3
  retryDelay?: number;          // 重试延迟，默认1000ms
  enableMultiThread?: boolean;  // 是否启用多线程，默认true
  requestStrategy?: RequestStrategy; // 请求策略
}

/**
 * 上传控制器
 * 核心上传逻辑控制类
 */
export class UploadController extends EventEmitter<UploadEvents> {
  private file: File;
  private options: Required<UploadOptions>;
  private requestStrategy: RequestStrategy;
  private splitor?: ChunkSplitor;
  private taskQueue: TaskQueue;
  
  // 状态管理
  private status: UploadStatus = UploadStatus.IDLE;
  private uploadToken?: string;
  private fileHash?: string;
  private chunks: Chunk[] = [];
  private uploadedChunks: Set<number> = new Set();
  private failedChunks: Map<number, number> = new Map(); // 分片索引 -> 重试次数
  
  // 进度统计
  private startTime?: number;
  private uploadedBytes = 0;
  private lastProgressTime = 0;
  private lastUploadedBytes = 0;
  // 防止重复完成（秒传 + drain 可能同时触发）
  private _completed = false;

  constructor(file: File, options: UploadOptions = {}) {
    super();
    this.file = file;
    this.options = {
      chunkSize: options.chunkSize || 5 * 1024 * 1024, // 5MB
      concurrency: options.concurrency || 4,
      retryCount: options.retryCount || 3,
      retryDelay: options.retryDelay || 1000,
      enableMultiThread: options.enableMultiThread !== false,
      requestStrategy: options.requestStrategy || new AxiosRequestStrategy()
    };
    
    this.requestStrategy = this.options.requestStrategy;
    this.taskQueue = new TaskQueue(this.options.concurrency);
    
    this.setupTaskQueueEvents();
  }

  /**
   * 设置任务队列事件监听
   */
  private setupTaskQueueEvents() {
    this.taskQueue.on('start', () => {
      if (this.status === UploadStatus.PAUSED) {
        this.setStatus(UploadStatus.UPLOADING);
        this.emit('resume');
      }
    });

    this.taskQueue.on('pause', () => {
      if (this.status === UploadStatus.UPLOADING) {
        this.setStatus(UploadStatus.PAUSED);
        this.emit('pause');
      }
    });

    this.taskQueue.on('drain', () => {
      this.handleUploadComplete();
    });
  }

  /**
   * 开始上传
   */
  async start(): Promise<string> {
    try {
      this.setStatus(UploadStatus.SPLITTING);
      this.startTime = Date.now();
      
      // 1. 创建上传任务
      await this.createUploadTask();
      
      // 2. 开始分片处理
      await this.startSplitting();
      
      return new Promise((resolve, reject) => {
        this.once('complete', (url: string) => resolve(url));
        this.once('error', (error: Error) => reject(error));
      });
      
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * 创建上传任务
   */
  private async createUploadTask() {
    try {
      const response = await this.requestStrategy.createFile(this.file);
      this.uploadToken = response.uploadToken;
      
      // 如果服务器返回了建议的分片大小，使用服务器的配置
      if (response.chunkSize && response.chunkSize !== this.options.chunkSize) {
        this.options.chunkSize = response.chunkSize;
      }
    } catch (error) {
      throw new Error(`创建上传任务失败: ${error}`);
    }
  }

  /**
   * 开始分片处理
   */
  private async startSplitting() {
    // 创建分片处理器
    this.splitor = this.options.enableMultiThread 
      ? new MultiThreadSplitor(this.file, this.options.chunkSize)
      : new MultiThreadSplitor(this.file, this.options.chunkSize); // 暂时都使用MultiThreadSplitor

    // 监听分片事件
    this.splitor.on('chunks', this.handleChunks.bind(this));
    this.splitor.on('wholeHash', this.handleWholeHash.bind(this));
    this.splitor.on('drain', this.handleSplitComplete.bind(this));

    // 开始分片
    this.splitor.split();
  }

  /**
   * 处理分片生成事件
   */
  private handleChunks(chunks: Chunk[]) {
    this.chunks.push(...chunks);
    
    // 立即开始上传这些分片（不等待整体hash）
    chunks.forEach(chunk => {
      const task = new Task(this.uploadChunk.bind(this), chunk);
      this.taskQueue.addAndStart(task);
    });

    this.setStatus(UploadStatus.UPLOADING);
  }

  /**
   * 处理整体文件hash计算完成
   */
  private async handleWholeHash(hash: string) {
    this.fileHash = hash;
    
    if (!this.uploadToken) return;

    try {
      // 校验文件是否已存在
      const verifyResult = await this.requestStrategy.verifyHash(
        this.uploadToken, 
        hash, 
        'file'
      );

      if (verifyResult.hasFile && verifyResult.url) {
        // 文件已存在，直接完成
        this.handleUploadSuccess(verifyResult.url);
        return;
      }

      // 根据服务器返回的rest信息，重新安排上传任务
      if (verifyResult.rest && verifyResult.rest.length > 0) {
        this.optimizeUploadTasks(verifyResult.rest);
      }
    } catch (error) {
      console.warn('文件hash校验失败:', error);
      // 继续正常上传流程
    }
  }

  /**
   * 优化上传任务（根据服务器已有分片信息）
   */
  private optimizeUploadTasks(restHashes: string[]) {
    const restHashSet = new Set(restHashes);
    
    // 标记已存在的分片为已上传
    this.chunks.forEach(chunk => {
      if (!restHashSet.has(chunk.hash)) {
        this.uploadedChunks.add(chunk.index);
        this.uploadedBytes += chunk.blob.size;
      }
    });

    this.updateProgress();
  }

  /**
   * 上传单个分片
   */
  private async uploadChunk(chunk: Chunk): Promise<void> {
    if (!this.uploadToken) {
      throw new Error('上传令牌不存在');
    }

    // 检查是否已上传
    if (this.uploadedChunks.has(chunk.index)) {
      return;
    }

    const maxRetries = this.options.retryCount;
    const currentRetries = this.failedChunks.get(chunk.index) || 0;

    try {
      // 先校验分片是否已存在
      const verifyResult = await this.requestStrategy.verifyHash(
        this.uploadToken,
        chunk.hash,
        'chunk',
        chunk.index
      );

      if (verifyResult.hasFile) {
        // 分片已存在，标记为已上传
        this.markChunkUploaded(chunk);
        return;
      }

      // 上传分片数据
      const onProgress: UploadProgressCallback = (progress) => {
        this.emit('chunkProgress', {
          chunk,
          progress
        });
      };

      await this.requestStrategy.uploadChunk(this.uploadToken, chunk, onProgress);
      this.markChunkUploaded(chunk);

    } catch (error) {
      if (currentRetries < maxRetries) {
        // 重试
        this.failedChunks.set(chunk.index, currentRetries + 1);
        
        // 延迟后重新添加任务
        setTimeout(() => {
          const retryTask = new Task(this.uploadChunk.bind(this), chunk);
          this.taskQueue.addAndStart(retryTask);
        }, this.options.retryDelay * Math.pow(2, currentRetries) * (0.5 + Math.random() * 0.5));
        
      } else {
        // 超过重试次数，抛出错误
        throw new Error(`分片 ${chunk.index} 上传失败: ${error}`);
      }
    }
  }

  /**
   * 标记分片已上传
   */
  private markChunkUploaded(chunk: Chunk) {
    if (!this.uploadedChunks.has(chunk.index)) {
      this.uploadedChunks.add(chunk.index);
      this.uploadedBytes += chunk.blob.size;
      this.failedChunks.delete(chunk.index);
      this.updateProgress();
    }
  }

  /**
   * 处理分片完成
   */
  private handleSplitComplete() {
    // 分片处理完成，但上传可能还在进行
  }

  /**
   * 处理上传完成
   */
  private async handleUploadComplete() {
    // 如果已经完成（秒传等场景），不再重复处理
    if (this._completed) return;

    if (this.uploadedChunks.size < this.chunks.length) {
      // 还有分片未上传完成
      return;
    }

    if (!this.fileHash || !this.uploadToken) {
      // 等待文件hash计算完成
      return;
    }

    try {
      this.setStatus(UploadStatus.MERGING);
      
      // 构建完整的 chunks hash 列表（按索引排序），确保后端能获取正确的分片信息
      const chunkHashes = this.chunks
        .sort((a, b) => a.index - b.index)
        .map(c => c.hash);

      // 请求合并文件
      const fileUrl = await this.requestStrategy.mergeFile(this.uploadToken, this.fileHash, chunkHashes);
      this.handleUploadSuccess(fileUrl);
      
    } catch (error) {
      this.handleError(new Error(`文件合并失败: ${error}`));
    }
  }

  /**
   * 处理上传成功
   */
  private handleUploadSuccess(fileUrl: string) {
    if (this._completed) return;
    this._completed = true;

    this.setStatus(UploadStatus.COMPLETED);
    this.emit('complete', fileUrl);
    this.cleanup();
  }

  /**
   * 处理上传错误
   */
  private handleError(error: Error) {
    this.setStatus(UploadStatus.ERROR);
    this.emit('error', error);
    this.cleanup();
  }

  /**
   * 更新上传进度
   */
  private updateProgress() {
    const now = Date.now();
    const timeElapsed = (now - (this.startTime || now)) / 1000;
    const timeSinceLastUpdate = (now - this.lastProgressTime) / 1000;
    
    // 计算上传速度
    let speed = 0;
    if (timeSinceLastUpdate > 0) {
      const bytesUploaded = this.uploadedBytes - this.lastUploadedBytes;
      speed = bytesUploaded / timeSinceLastUpdate;
    }

    // 计算预计剩余时间
    const remainingBytes = this.file.size - this.uploadedBytes;
    const remainingTime = speed > 0 ? remainingBytes / speed : 0;

    const progress: UploadProgress = {
      loaded: this.uploadedBytes,
      total: this.file.size,
      percentage: this.file.size > 0 ? (this.uploadedBytes / this.file.size) * 100 : 0,
      speed,
      remainingTime,
      uploadedChunks: this.uploadedChunks.size,
      totalChunks: this.chunks.length
    };

    this.emit('progress', progress);
    
    this.lastProgressTime = now;
    this.lastUploadedBytes = this.uploadedBytes;
  }

  /**
   * 设置状态
   */
  private setStatus(status: UploadStatus) {
    if (this.status !== status) {
      this.status = status;
      this.emit('statusChange', status);
    }
  }

  /**
   * 暂停上传
   */
  pause() {
    if (this.status === UploadStatus.UPLOADING) {
      this.taskQueue.pause();
    }
  }

  /**
   * 恢复上传
   */
  resume() {
    if (this.status === UploadStatus.PAUSED) {
      this.taskQueue.start();
    }
  }

  /**
   * 取消上传
   */
  cancel() {
    this.taskQueue.clear();
    this.setStatus(UploadStatus.IDLE);
    this.cleanup();
  }

  /**
   * 获取当前状态
   */
  getStatus(): UploadStatus {
    return this.status;
  }

  /**
   * 获取文件信息
   */
  getFileInfo() {
    return {
      name: this.file.name,
      size: this.file.size,
      type: this.file.type,
      hash: this.fileHash,
      uploadToken: this.uploadToken
    };
  }

  /**
   * 清理资源
   */
  private cleanup() {
    if (this.splitor) {
      this.splitor.dispose();
      this.splitor = undefined;
    }
    this.taskQueue.clear();
    this.removeAllListeners();
  }
}