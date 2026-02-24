import SparkMD5 from 'spark-md5';
import { EventEmitter } from './EventEmitter';
import { type Chunk, createChunk } from './Chunk';

/**
 * 分片的相关事件
 * chunks: 一部分分片产生了
 * wholeHash: 整个文件的hash计算完成
 * drain: 所有分片处理完成
 */
export type ChunkSplitorEvents = 'chunks' | 'wholeHash' | 'drain';

/**
 * 分片处理抽象类
 * 使用模板模式，允许不同的分片计算策略
 */
export abstract class ChunkSplitor extends EventEmitter<ChunkSplitorEvents> {
  protected chunkSize: number; // 分片大小（单位字节）
  protected file: File; // 待分片的文件
  protected hash?: string; // 整个文件的hash
  protected chunks: Chunk[]; // 分片列表
  private handleChunkCount = 0; // 已计算hash的分片数量
  private spark = new SparkMD5(); // 计算hash的工具
  private hasSplited = false; // 是否已经分片

  constructor(file: File, chunkSize: number = 1024 * 1024 * 5) {
    super();
    this.file = file;
    this.chunkSize = chunkSize;
    // 获取分片数组
    const chunkCount = Math.ceil(this.file.size / this.chunkSize);
    this.chunks = new Array(chunkCount)
      .fill(0)
      .map((_, index) => createChunk(this.file, index, this.chunkSize));
  }

  /**
   * 开始分片处理
   */
  split() {
    if (this.hasSplited) {
      return;
    }
    this.hasSplited = true;
    
    const emitter = new EventEmitter<'chunks'>();
    const chunksHandler = (chunks: Chunk[]) => {
      this.emit('chunks', chunks);
      chunks.forEach((chunk) => {
        this.spark.append(chunk.hash);
      });
      this.handleChunkCount += chunks.length;
      if (this.handleChunkCount === this.chunks.length) {
        // 计算完成
        emitter.off('chunks', chunksHandler);
        this.hash = this.spark.end();
        this.emit('wholeHash', this.hash);
        this.spark.destroy();
        this.emit('drain');
      }
    };
    
    emitter.on('chunks', chunksHandler);
    this.calcHash(this.chunks, emitter);
  }

  /**
   * 计算每一个分片的hash - 抽象方法，由子类实现
   * @param chunks 分片数组
   * @param emitter 事件发射器
   */
  abstract calcHash(chunks: Chunk[], emitter: EventEmitter<'chunks'>): void;

  /**
   * 分片完成后一些需要销毁的工作 - 抽象方法，由子类实现
   */
  abstract dispose(): void;

  /**
   * 获取文件信息
   */
  getFileInfo() {
    return {
      name: this.file.name,
      size: this.file.size,
      type: this.file.type,
      chunkSize: this.chunkSize,
      chunkCount: this.chunks.length,
      hash: this.hash
    };
  }

  /**
   * 获取所有分片
   */
  getChunks(): Chunk[] {
    return [...this.chunks];
  }

  /**
   * 获取处理进度
   */
  getProgress() {
    return {
      total: this.chunks.length,
      completed: this.handleChunkCount,
      percentage: this.chunks.length > 0 ? (this.handleChunkCount / this.chunks.length) * 100 : 0
    };
  }
}