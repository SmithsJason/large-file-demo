import { ChunkSplitor } from './ChunkSplitor';
import { SingleThreadSplitor } from './SingleThreadSplitor';
import { EventEmitter } from './EventEmitter';
import { type Chunk } from './Chunk';

/**
 * 多线程分片处理器
 * 使用Web Worker进行并行hash计算
 */
export class MultiThreadSplitor extends ChunkSplitor {
  private workers: Worker[] = [];
  private workerCount: number;
  private singleThreadFallback: SingleThreadSplitor | null = null;

  constructor(file: File, chunkSize: number = 1024 * 1024 * 5) {
    super(file, chunkSize);
    this.workerCount = navigator.hardwareConcurrency || 4;
    this.initWorkers();
  }

  /**
   * 初始化Worker
   */
  private initWorkers() {
    try {
      // 创建Worker脚本内容
      const workerScript = `
        importScripts('https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js');
        
        self.onmessage = function(e) {
          const chunks = e.data;
          const results = [];
          
          let completed = 0;
          chunks.forEach((chunkData, index) => {
            const spark = new SparkMD5.ArrayBuffer();
            const reader = new FileReader();
            
            reader.onload = function(event) {
              spark.append(event.target.result);
              const hash = spark.end();
              
              results[index] = {
                ...chunkData,
                hash: hash
              };
              
              completed++;
              if (completed === chunks.length) {
                self.postMessage(results);
              }
            };
            
            reader.readAsArrayBuffer(chunkData.blob);
          });
        };
      `;

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);

      for (let i = 0; i < this.workerCount; i++) {
        const worker = new Worker(workerUrl);
        this.workers.push(worker);
      }
    } catch (error) {
      console.warn('Web Worker 创建失败，将使用单线程模式:', error);
      this.workerCount = 0;
    }
  }

  /**
   * 计算分片hash
   * @param chunks 分片数组
   * @param emitter 事件发射器
   */
  calcHash(chunks: Chunk[], emitter: EventEmitter<'chunks'>): void {
    if (this.workers.length === 0) {
      // 降级到单线程模式
      this.getSingleThreadFallback().calcHash(chunks, emitter);
      return;
    }

    const workerSize = Math.ceil(chunks.length / this.workers.length);
    let completedWorkers = 0;

    for (let i = 0; i < this.workers.length; i++) {
      const worker = this.workers[i];
      const start = i * workerSize;
      const end = Math.min((i + 1) * workerSize, chunks.length);
      const workerChunks = chunks.slice(start, end);

      if (workerChunks.length === 0) continue;

      worker.onmessage = (e) => {
        const results = e.data as Chunk[];
        emitter.emit('chunks', results);
        
        completedWorkers++;
        if (completedWorkers === this.workers.length) {
          // 所有Worker完成
        }
      };

      worker.onerror = (error) => {
        console.error('Worker 执行错误:', error);
        // 降级处理
        this.getSingleThreadFallback().calcHash(workerChunks, emitter);
      };

      // 发送数据给Worker
      const workerData = workerChunks.map(chunk => ({
        blob: chunk.blob,
        start: chunk.start,
        end: chunk.end,
        index: chunk.index,
        hash: ''
      }));
      
      worker.postMessage(workerData);
    }
  }

  /**
   * 获取单线程降级处理器（懒初始化）
   */
  private getSingleThreadFallback(): SingleThreadSplitor {
    if (!this.singleThreadFallback) {
      this.singleThreadFallback = new SingleThreadSplitor(this.file, this.chunkSize);
    }
    return this.singleThreadFallback;
  }

  /**
   * 销毁资源
   */
  dispose(): void {
    this.workers.forEach(worker => {
      worker.terminate();
    });
    this.workers = [];
    this.singleThreadFallback?.dispose();
    this.singleThreadFallback = null;
  }
}