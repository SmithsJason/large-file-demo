import { ChunkSplitor } from './ChunkSplitor';
import { EventEmitter } from './EventEmitter';
import { type Chunk, calcChunkHash } from './Chunk';

/**
 * 单线程分片处理器
 * 使用时间切片避免阻塞主线程
 */
export class SingleThreadSplitor extends ChunkSplitor {
  private batchSize: number;
  private delay: number;

  constructor(file: File, chunkSize: number = 1024 * 1024 * 5, batchSize: number = 3, delay: number = 10) {
    super(file, chunkSize);
    this.batchSize = batchSize; // 每批处理的分片数量
    this.delay = delay; // 批次间的延迟时间（毫秒）
  }

  /**
   * 计算分片hash
   * @param chunks 分片数组
   * @param emitter 事件发射器
   */
  async calcHash(chunks: Chunk[], emitter: EventEmitter<'chunks'>): Promise<void> {
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, i + this.batchSize);
      
      // 并行处理当前批次
      const promises = batch.map(async (chunk) => {
        chunk.hash = await calcChunkHash(chunk);
        return chunk;
      });
      
      const results = await Promise.all(promises);
      emitter.emit('chunks', results);
      
      // 时间切片：让出主线程，避免阻塞UI
      if (i + this.batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
    }
  }

  /**
   * 设置批处理参数
   * @param batchSize 每批处理的分片数量
   * @param delay 批次间的延迟时间
   */
  setBatchConfig(batchSize: number, delay: number) {
    this.batchSize = Math.max(1, batchSize);
    this.delay = Math.max(0, delay);
  }

  /**
   * 销毁资源
   */
  dispose(): void {
    // 单线程模式无需特殊清理
  }
}