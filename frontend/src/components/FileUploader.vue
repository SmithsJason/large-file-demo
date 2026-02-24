<template>
  <div class="file-uploader">
    <!-- 拖拽上传区域 -->
    <div
      class="upload-area"
      :class="{ 
        'drag-over': isDragOver,
        'uploading': isUploading 
      }"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @click="triggerFileSelect"
    >
      <div class="upload-content">
        <el-icon class="upload-icon" :size="48">
          <UploadFilled v-if="!isUploading" />
          <Loading v-else />
        </el-icon>
        
        <div class="upload-text">
          <p class="primary-text">
            {{ isUploading ? '上传中...' : '点击或拖拽文件到此处上传' }}
          </p>
          <p class="secondary-text">
            支持大文件上传，自动分片处理
          </p>
        </div>
        
        <!-- 总体进度条 -->
        <div v-if="isUploading && totalProgress > 0" class="total-progress">
          <el-progress 
            :percentage="totalProgress" 
            :stroke-width="8"
            :show-text="false"
          />
          <span class="progress-text">{{ totalProgress }}%</span>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入框 -->
    <input
      ref="fileInput"
      type="file"
      multiple
      style="display: none"
      @change="handleFileSelect"
    />

    <!-- 上传设置 -->
    <div class="upload-settings">
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="分片大小">
            <el-select v-model="chunkSize" :disabled="isUploading">
              <el-option label="1MB" :value="1024 * 1024" />
              <el-option label="2MB" :value="2 * 1024 * 1024" />
              <el-option label="5MB" :value="5 * 1024 * 1024" />
              <el-option label="10MB" :value="10 * 1024 * 1024" />
            </el-select>
          </el-form-item>
        </el-col>
        
        <el-col :span="8">
          <el-form-item label="并发数">
            <el-select v-model="concurrency" :disabled="isUploading">
              <el-option label="2" :value="2" />
              <el-option label="4" :value="4" />
              <el-option label="6" :value="6" />
              <el-option label="8" :value="8" />
            </el-select>
          </el-form-item>
        </el-col>
        
        <el-col :span="8">
          <el-form-item label="多线程">
            <el-switch 
              v-model="enableMultiThread" 
              :disabled="isUploading"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </div>

    <!-- 操作按钮 -->
    <div class="upload-actions">
      <el-button 
        type="primary" 
        :disabled="!hasFiles || isUploading"
        @click="startAllUploads"
      >
        <el-icon><Upload /></el-icon>
        开始上传
      </el-button>
      
      <el-button 
        :disabled="!isUploading"
        @click="pauseAllUploads"
      >
        <el-icon><VideoPause /></el-icon>
        暂停全部
      </el-button>
      
      <el-button 
        :disabled="!hasPausedTasks"
        @click="resumeAllUploads"
      >
        <el-icon><VideoPlay /></el-icon>
        恢复全部
      </el-button>
      
      <el-button 
        type="danger" 
        :disabled="!hasFiles"
        @click="clearAllTasks"
      >
        <el-icon><Delete /></el-icon>
        清空全部
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  UploadFilled, 
  Loading, 
  Upload, 
  VideoPause, 
  VideoPlay, 
  Delete 
} from '@element-plus/icons-vue'
import { useUploadStore } from '@/stores/upload'
import { UploadStatus, UploadController } from '@/sdk'

// Store
const uploadStore = useUploadStore()

// 响应式数据
const fileInput = ref<HTMLInputElement>()
const isDragOver = ref(false)
const chunkSize = ref(5 * 1024 * 1024) // 5MB
const concurrency = ref(4)
const enableMultiThread = ref(true)

// 计算属性
const isUploading = computed(() => uploadStore.uploadingTasks.length > 0)
const hasFiles = computed(() => uploadStore.taskList.length > 0)
const totalProgress = computed(() => uploadStore.totalProgress)

const hasPausedTasks = computed(() => {
  return uploadStore.taskList.some(task => task.status === UploadStatus.PAUSED)
})

// 事件处理
const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
}

const handleDragEnter = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = true
}

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  
  // 只有当离开整个拖拽区域时才设置为false
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX
  const y = e.clientY
  
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    isDragOver.value = false
  }
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = false
  
  const files = Array.from(e.dataTransfer?.files || [])
  processFiles(files)
}

const triggerFileSelect = () => {
  if (!isUploading.value) {
    fileInput.value?.click()
  }
}

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  const files = Array.from(target.files || [])
  processFiles(files)
  
  // 清空input值，允许重复选择同一文件
  target.value = ''
}

const processFiles = (files: File[]) => {
  if (files.length === 0) return
  
  // 验证文件
  const validFiles = files.filter(file => {
    if (file.size === 0) {
      ElMessage.warning(`文件 "${file.name}" 为空，已跳过`)
      return false
    }
    
    const maxSize = 10 * 1024 * 1024 * 1024 // 10GB
    if (file.size > maxSize) {
      ElMessage.warning(`文件 "${file.name}" 超过10GB限制，已跳过`)
      return false
    }
    
    return true
  })
  
  if (validFiles.length === 0) {
    ElMessage.warning('没有有效的文件可以上传')
    return
  }
  
  // 创建上传任务
  validFiles.forEach(file => {
    const taskId = uploadStore.createTask(file)
    
    // 更新任务的上传配置
    const task = uploadStore.getTask(taskId)
    if (task) {
      task.controller = new (task.controller.constructor as any)(file, {
        chunkSize: chunkSize.value,
        concurrency: concurrency.value,
        enableMultiThread: enableMultiThread.value,
        retryCount: 3
      })
      
      // 重新设置事件监听
      uploadStore.setupTaskEvents?.(task)
    }
  })
  
  ElMessage.success(`已添加 ${validFiles.length} 个文件到上传队列`)
}

const startAllUploads = async () => {
  const pendingTasks = uploadStore.taskList.filter(
    task => task.status === UploadStatus.IDLE
  )
  
  if (pendingTasks.length === 0) {
    ElMessage.warning('没有待上传的文件')
    return
  }
  
  try {
    // 并发开始所有上传任务
    const promises = pendingTasks.map(task => uploadStore.startUpload(task.id))
    await Promise.allSettled(promises)
  } catch (error) {
    console.error('批量上传失败:', error)
  }
}

const pauseAllUploads = () => {
  const uploadingTasks = uploadStore.uploadingTasks
  uploadingTasks.forEach(task => {
    if (task.status === UploadStatus.UPLOADING) {
      uploadStore.pauseUpload(task.id)
    }
  })
  
  ElMessage.info('已暂停所有上传任务')
}

const resumeAllUploads = () => {
  const pausedTasks = uploadStore.taskList.filter(
    task => task.status === UploadStatus.PAUSED
  )
  
  pausedTasks.forEach(task => {
    uploadStore.resumeUpload(task.id)
  })
  
  ElMessage.info('已恢复所有暂停的上传任务')
}

const clearAllTasks = () => {
  uploadStore.clearAllTasks()
  ElMessage.info('已清空所有上传任务')
}

// 生命周期
onMounted(() => {
  // 阻止页面默认的拖拽行为
  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', (e) => e.preventDefault())
})
</script>

<style scoped>
.file-uploader {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.upload-area {
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background-color: #fafafa;
  margin-bottom: 20px;
}

.upload-area:hover {
  border-color: #409eff;
  background-color: #f0f9ff;
}

.upload-area.drag-over {
  border-color: #409eff;
  background-color: #e6f7ff;
  transform: scale(1.02);
}

.upload-area.uploading {
  border-color: #67c23a;
  background-color: #f0f9ff;
  cursor: not-allowed;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.upload-icon {
  color: #909399;
  transition: color 0.3s ease;
}

.upload-area:hover .upload-icon {
  color: #409eff;
}

.upload-text .primary-text {
  font-size: 16px;
  color: #303133;
  margin: 0 0 8px 0;
  font-weight: 500;
}

.upload-text .secondary-text {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.total-progress {
  width: 100%;
  max-width: 300px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-text {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
  min-width: 40px;
}

.upload-settings {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.upload-settings :deep(.el-form-item) {
  margin-bottom: 0;
}

.upload-settings :deep(.el-form-item__label) {
  font-size: 14px;
  color: #606266;
}

.upload-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.upload-actions .el-button {
  min-width: 100px;
}

@media (max-width: 768px) {
  .upload-area {
    padding: 30px 15px;
  }
  
  .upload-settings {
    padding: 15px;
  }
  
  .upload-settings .el-col {
    margin-bottom: 16px;
  }
  
  .upload-actions {
    flex-direction: column;
    align-items: center;
  }
  
  .upload-actions .el-button {
    width: 200px;
  }
}
</style>