// 核心模块导出
export { EventEmitter } from './EventEmitter';
export { Task, TaskQueue } from './TaskQueue';
export { type Chunk, createChunk, calcChunkHash, calcChunksHash } from './Chunk';
export { type ChunkSplitorEvents, ChunkSplitor } from './ChunkSplitor';
export { MultiThreadSplitor } from './MultiThreadSplitor';
export { SingleThreadSplitor } from './SingleThreadSplitor';