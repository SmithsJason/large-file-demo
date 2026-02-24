/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'spark-md5' {
  export default class SparkMD5 {
    static ArrayBuffer: any
    static hash(str: string): string
    append(str: string): void
    end(): string
    destroy(): void
  }
}