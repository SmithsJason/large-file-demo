import SparkMD5 from 'spark-md5';

/**
 * 分片接口定义
 */
export type Chunk = {
  blob: Blob; // 分片的二进制数据
  start: number; // 分片的起始位置
  end: number; // 分片的结束位置
  hash: string; // 分片的hash值
  index: number; // 分片在文件中的索引
}

/**
 * 创建一个不带hash的chunk
 * @param file 原始文件
 * @param index 分片索引
 * @param chunkSize 分片大小
 */
export function createChunk(
  file: File,
  index: number,
  chunkSize: number
): Chunk {
  const start = index * chunkSize;
  const end = Math.min((index + 1) * chunkSize, file.size);
  const blob = file.slice(start, end);
  return {
    blob,
    start,
    end,
    hash: '',
    index,
  };
}

/**
 * 计算chunk的hash值
 * @param chunk 分片对象
 */
export function calcChunkHash(chunk: Chunk): Promise<string> {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();
    
    fileReader.onload = (e) => {
      try {
        spark.append(e.target?.result as ArrayBuffer);
        resolve(spark.end());
      } catch (error) {
        reject(error);
      }
    };
    
    fileReader.onerror = () => {
      reject(new Error('文件读取失败'));
    };
    
    fileReader.readAsArrayBuffer(chunk.blob);
  });
}

/**
 * 批量计算分片hash
 * @param chunks 分片数组
 */
export async function calcChunksHash(chunks: Chunk[]): Promise<Chunk[]> {
  const promises = chunks.map(async (chunk) => {
    chunk.hash = await calcChunkHash(chunk);
    return chunk;
  });
  
  return Promise.all(promises);
}