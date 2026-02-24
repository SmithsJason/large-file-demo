import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { UploadController, UploadStatus } from '@/sdk'
import type { UploadProgress } from '@/sdk'

/**
 * 上传任务接口
 */
export interface UploadTask {
  id: string
  file: File
  controller: UploadController
  status: UploadStatus
  progress: UploadProgress
  error?: string
  fileUrl?: string
  startTime?: number
  endTime?: number
}

/**
 * 上传状态管理
 */
export const useUploadStore = defineStore('upload', () => {
  // 状态
  const tasks = ref<Map<string, UploadTask>>(new Map())
  const activeTaskId = ref<string | null>(null)

  // 计算属性
  const taskList = computed(() => Array.from(tasks.value.values()))
  
  const activeTask = computed(() => {
    return activeTaskId.value ? tasks.value.get(activeTaskId.value) : null
  })

  const uploadingTasks = computed(() => {
    return taskList.value.filter(task => 
      task.status === UploadStatus.UPLOADING || 
      task.status === UploadStatus.SPLITTING ||
      task.status === UploadStatus.MERGING
    )
  })

  const completedTasks = computed(() => {
    return taskList.value.filter(task => task.status === UploadStatus.COMPLETED)
  })

  const failedTasks = computed(() => {
    return taskList.value.filter(task => task.status === UploadStatus.ERROR)
  })

  const totalProgress = computed(() => {
    const activeTasks = uploadingTasks.value
    if (activeTasks.length === 0) return 0

    const totalPercentage = activeTasks.reduce((sum, task) => {
      return sum + (task.progress?.percentage || 0)
    }, 0)

    return Math.round(totalPercentage / activeTasks.length)
  })

  // 方法
  /**
   * 创建上传任务
   */
  function createTask(file: File): string {
    const taskId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const controller = new UploadController(file, {
      chunkSize: 5 * 1024 * 1024, // 5MB
      concurrency: 4,
      retryCount: 3,
      enableMultiThread: true
    })

    const task: UploadTask = {
      id: taskId,
      file,
      controller,
      status: UploadStatus.IDLE,
      progress: {
        loaded: 0,
        total: file.size,
        percentage: 0,
        speed: 0,
        remainingTime: 0,
        uploadedChunks: 0,
        totalChunks: 0
      },
      startTime: Date.now()
    }

    // 监听上传事件
    setupTaskEvents(task)

    tasks.value.set(taskId, task)
    activeTaskId.value = taskId

    return taskId
  }

  /**
   * 设置任务事件监听
   */
  function setupTaskEvents(task: UploadTask) {
    const { controller } = task

    // 状态变化
    controller.on('statusChange', (status: UploadStatus) => {
      task.status = status
      if (status === UploadStatus.COMPLETED) {
        task.endTime = Date.now()
      }
    })

    // 进度更新
    controller.on('progress', (progress: UploadProgress) => {
      task.progress = { ...progress }
    })

    // 上传完成
    controller.on('complete', (fileUrl: string) => {
      task.fileUrl = fileUrl
      task.status = UploadStatus.COMPLETED
      task.endTime = Date.now()
    })

    // 上传错误
    controller.on('error', (error: Error) => {
      task.error = error.message
      task.status = UploadStatus.ERROR
      task.endTime = Date.now()
    })

    // 暂停
    controller.on('pause', () => {
      task.status = UploadStatus.PAUSED
    })

    // 恢复
    controller.on('resume', () => {
      task.status = UploadStatus.UPLOADING
    })
  }

  /**
   * 开始上传
   */
  async function startUpload(taskId: string): Promise<void> {
    const task = tasks.value.get(taskId)
    if (!task) {
      throw new Error('上传任务不存在')
    }

    try {
      task.startTime = Date.now()
      await task.controller.start()
    } catch (error) {
      task.error = (error as Error).message
      task.status = UploadStatus.ERROR
      task.endTime = Date.now()
      throw error
    }
  }

  /**
   * 暂停上传
   */
  function pauseUpload(taskId: string): void {
    const task = tasks.value.get(taskId)
    if (task) {
      task.controller.pause()
    }
  }

  /**
   * 恢复上传
   */
  function resumeUpload(taskId: string): void {
    const task = tasks.value.get(taskId)
    if (task) {
      task.controller.resume()
    }
  }

  /**
   * 取消上传
   */
  function cancelUpload(taskId: string): void {
    const task = tasks.value.get(taskId)
    if (task) {
      task.controller.cancel()
      tasks.value.delete(taskId)
      if (activeTaskId.value === taskId) {
        activeTaskId.value = null
      }
    }
  }

  /**
   * 重试上传
   */
  async function retryUpload(taskId: string): Promise<void> {
    const task = tasks.value.get(taskId)
    if (!task) {
      throw new Error('上传任务不存在')
    }

    // 重新创建控制器
    task.controller = new UploadController(task.file, {
      chunkSize: 5 * 1024 * 1024,
      concurrency: 4,
      retryCount: 3,
      enableMultiThread: true
    })

    // 重新设置事件监听
    setupTaskEvents(task)

    // 重置状态
    task.error = undefined
    task.status = UploadStatus.IDLE
    task.startTime = Date.now()
    task.endTime = undefined

    // 开始上传
    await startUpload(taskId)
  }

  /**
   * 删除任务
   */
  function removeTask(taskId: string): void {
    const task = tasks.value.get(taskId)
    if (task) {
      // 如果任务正在进行，先取消
      if (task.status === UploadStatus.UPLOADING || task.status === UploadStatus.SPLITTING) {
        task.controller.cancel()
      }
      
      tasks.value.delete(taskId)
      
      if (activeTaskId.value === taskId) {
        // 设置下一个活跃任务
        const remainingTasks = Array.from(tasks.value.values())
        activeTaskId.value = remainingTasks.length > 0 ? remainingTasks[0].id : null
      }
    }
  }

  /**
   * 清空所有任务
   */
  function clearAllTasks(): void {
    // 取消所有进行中的任务
    tasks.value.forEach(task => {
      if (task.status === UploadStatus.UPLOADING || task.status === UploadStatus.SPLITTING) {
        task.controller.cancel()
      }
    })
    
    tasks.value.clear()
    activeTaskId.value = null
  }

  /**
   * 获取任务
   */
  function getTask(taskId: string): UploadTask | undefined {
    return tasks.value.get(taskId)
  }

  /**
   * 设置活跃任务
   */
  function setActiveTask(taskId: string | null): void {
    activeTaskId.value = taskId
  }

  /**
   * 格式化文件大小
   */
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * 格式化上传速度
   */
  function formatSpeed(bytesPerSecond: number): string {
    return formatFileSize(bytesPerSecond) + '/s'
  }

  /**
   * 格式化剩余时间
   */
  function formatRemainingTime(seconds: number): string {
    if (seconds === 0 || !isFinite(seconds)) return '--'
    
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    } else if (minutes > 0) {
      return `${minutes}:${secs.toString().padStart(2, '0')}`
    } else {
      return `${secs}s`
    }
  }

  return {
    // 状态
    tasks,
    activeTaskId,
    
    // 计算属性
    taskList,
    activeTask,
    uploadingTasks,
    completedTasks,
    failedTasks,
    totalProgress,
    
    // 方法
    createTask,
    setupTaskEvents,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    removeTask,
    clearAllTasks,
    getTask,
    setActiveTask,
    formatFileSize,
    formatSpeed,
    formatRemainingTime
  }
})