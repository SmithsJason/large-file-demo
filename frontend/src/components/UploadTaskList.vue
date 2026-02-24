<template>
  <div class="upload-task-list">
    <div class="task-header">
      <h3>上传任务列表</h3>
      <div class="task-stats">
        <el-tag type="info">总计: {{ taskList.length }}</el-tag>
        <el-tag type="warning">进行中: {{ uploadingTasks.length }}</el-tag>
        <el-tag type="success">已完成: {{ completedTasks.length }}</el-tag>
        <el-tag type="danger">失败: {{ failedTasks.length }}</el-tag>
      </div>
    </div>

    <div class="task-filters">
      <el-radio-group v-model="filterStatus" @change="handleFilterChange">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="uploading">上传中</el-radio-button>
        <el-radio-button label="completed">已完成</el-radio-button>
        <el-radio-button label="failed">失败</el-radio-button>
      </el-radio-group>
    </div>

    <div class="task-list">
      <div 
        v-for="task in filteredTasks" 
        :key="task.id"
        class="task-item"
        :class="{ 
          'active': task.id === activeTaskId,
          'completed': task.status === UploadStatus.COMPLETED,
          'failed': task.status === UploadStatus.ERROR
        }"
        @click="setActiveTask(task.id)"
      >
        <!-- 文件信息 -->
        <div class="task-info">
          <div class="file-icon">
            <el-icon :size="24">
              <Document />
            </el-icon>
          </div>
          
          <div class="file-details">
            <div class="file-name" :title="task.file.name">
              {{ task.file.name }}
            </div>
            <div class="file-meta">
              <span>{{ formatFileSize(task.file.size) }}</span>
              <span class="separator">•</span>
              <span>{{ getStatusText(task.status) }}</span>
              <span v-if="task.progress.speed > 0" class="separator">•</span>
              <span v-if="task.progress.speed > 0">{{ formatSpeed(task.progress.speed) }}</span>
            </div>
          </div>
        </div>

        <!-- 进度信息 -->
        <div class="task-progress">
          <div class="progress-bar">
            <el-progress 
              :percentage="task.progress.percentage" 
              :status="getProgressStatus(task.status)"
              :stroke-width="6"
              :show-text="false"
            />
          </div>
          
          <div class="progress-info">
            <span class="percentage">{{ Math.round(task.progress.percentage) }}%</span>
            <span v-if="task.progress.remainingTime > 0" class="time">
              剩余 {{ formatRemainingTime(task.progress.remainingTime) }}
            </span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="task-actions">
          <!-- 上传中状态 -->
          <template v-if="task.status === UploadStatus.UPLOADING || task.status === UploadStatus.SPLITTING">
            <el-button 
              size="small" 
              type="warning"
              @click.stop="pauseUpload(task.id)"
            >
              <el-icon><VideoPause /></el-icon>
            </el-button>
          </template>

          <!-- 暂停状态 -->
          <template v-else-if="task.status === UploadStatus.PAUSED">
            <el-button 
              size="small" 
              type="primary"
              @click.stop="resumeUpload(task.id)"
            >
              <el-icon><VideoPlay /></el-icon>
            </el-button>
          </template>

          <!-- 失败状态 -->
          <template v-else-if="task.status === UploadStatus.ERROR">
            <el-button 
              size="small" 
              type="primary"
              @click.stop="retryUpload(task.id)"
            >
              <el-icon><Refresh /></el-icon>
            </el-button>
          </template>

          <!-- 完成状态 -->
          <template v-else-if="task.status === UploadStatus.COMPLETED && task.fileUrl">
            <el-button 
              size="small" 
              type="success"
              @click.stop="downloadFile(task)"
            >
              <el-icon><Download /></el-icon>
            </el-button>
          </template>

          <!-- 空闲状态 -->
          <template v-else-if="task.status === UploadStatus.IDLE">
            <el-button 
              size="small" 
              type="primary"
              @click.stop="startUpload(task.id)"
            >
              <el-icon><Upload /></el-icon>
            </el-button>
          </template>

          <!-- 删除按钮 -->
          <el-button 
            size="small" 
            type="danger"
            @click.stop="removeTask(task.id)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>

        <!-- 错误信息 -->
        <div v-if="task.error" class="task-error">
          <el-alert 
            :title="task.error" 
            type="error" 
            :closable="false"
            show-icon
          />
        </div>

        <!-- 详细进度信息 -->
        <div v-if="showDetails && task.id === activeTaskId" class="task-details">
          <el-descriptions :column="2" size="small">
            <el-descriptions-item label="文件大小">
              {{ formatFileSize(task.file.size) }}
            </el-descriptions-item>
            <el-descriptions-item label="文件类型">
              {{ task.file.type || '未知' }}
            </el-descriptions-item>
            <el-descriptions-item label="已上传">
              {{ formatFileSize(task.progress.loaded) }}
            </el-descriptions-item>
            <el-descriptions-item label="上传速度">
              {{ task.progress.speed > 0 ? formatSpeed(task.progress.speed) : '--' }}
            </el-descriptions-item>
            <el-descriptions-item label="分片进度">
              {{ task.progress.uploadedChunks }} / {{ task.progress.totalChunks }}
            </el-descriptions-item>
            <el-descriptions-item label="剩余时间">
              {{ task.progress.remainingTime > 0 ? formatRemainingTime(task.progress.remainingTime) : '--' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="task.startTime" label="开始时间">
              {{ new Date(task.startTime).toLocaleString() }}
            </el-descriptions-item>
            <el-descriptions-item v-if="task.endTime" label="完成时间">
              {{ new Date(task.endTime).toLocaleString() }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="filteredTasks.length === 0" class="empty-state">
      <el-empty description="暂无上传任务" />
    </div>

    <!-- 详情切换 -->
    <div class="task-footer">
      <el-button 
        text 
        type="primary"
        @click="showDetails = !showDetails"
      >
        {{ showDetails ? '隐藏详情' : '显示详情' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Document,
  VideoPause,
  VideoPlay,
  Refresh,
  Download,
  Upload,
  Delete
} from '@element-plus/icons-vue'
import { useUploadStore } from '@/stores/upload'
import { UploadStatus } from '@/sdk'
import type { UploadTask } from '@/stores/upload'

// Store
const uploadStore = useUploadStore()

// 响应式数据
const filterStatus = ref('all')
const showDetails = ref(false)

// 计算属性
const taskList = computed(() => uploadStore.taskList)
const uploadingTasks = computed(() => uploadStore.uploadingTasks)
const completedTasks = computed(() => uploadStore.completedTasks)
const failedTasks = computed(() => uploadStore.failedTasks)
const activeTaskId = computed(() => uploadStore.activeTaskId)

const filteredTasks = computed(() => {
  switch (filterStatus.value) {
    case 'uploading':
      return taskList.value.filter(task => 
        task.status === UploadStatus.UPLOADING || 
        task.status === UploadStatus.SPLITTING ||
        task.status === UploadStatus.MERGING ||
        task.status === UploadStatus.PAUSED
      )
    case 'completed':
      return taskList.value.filter(task => task.status === UploadStatus.COMPLETED)
    case 'failed':
      return taskList.value.filter(task => task.status === UploadStatus.ERROR)
    default:
      return taskList.value
  }
})

// 方法
const handleFilterChange = () => {
  // 过滤变化时的处理逻辑
}

const setActiveTask = (taskId: string) => {
  uploadStore.setActiveTask(taskId)
}

const startUpload = async (taskId: string) => {
  try {
    await uploadStore.startUpload(taskId)
  } catch (error) {
    ElMessage.error(`上传失败: ${(error as Error).message}`)
  }
}

const pauseUpload = (taskId: string) => {
  uploadStore.pauseUpload(taskId)
  ElMessage.info('已暂停上传')
}

const resumeUpload = (taskId: string) => {
  uploadStore.resumeUpload(taskId)
  ElMessage.info('已恢复上传')
}

const retryUpload = async (taskId: string) => {
  try {
    await uploadStore.retryUpload(taskId)
    ElMessage.success('重试上传已开始')
  } catch (error) {
    ElMessage.error(`重试失败: ${(error as Error).message}`)
  }
}

const removeTask = async (taskId: string) => {
  const task = uploadStore.getTask(taskId)
  if (!task) return

  try {
    await ElMessageBox.confirm(
      `确定要删除上传任务 "${task.file.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    uploadStore.removeTask(taskId)
    ElMessage.success('任务已删除')
  } catch {
    // 用户取消删除
  }
}

const downloadFile = (task: UploadTask) => {
  if (task.fileUrl) {
    // 使用 window.open 触发浏览器下载，兼容大文件
    window.open(task.fileUrl, '_blank')
  }
}

const getStatusText = (status: UploadStatus): string => {
  const statusMap = {
    [UploadStatus.IDLE]: '等待上传',
    [UploadStatus.SPLITTING]: '分片处理中',
    [UploadStatus.UPLOADING]: '上传中',
    [UploadStatus.PAUSED]: '已暂停',
    [UploadStatus.MERGING]: '合并中',
    [UploadStatus.COMPLETED]: '已完成',
    [UploadStatus.ERROR]: '上传失败'
  }
  return statusMap[status] || '未知状态'
}

const getProgressStatus = (status: UploadStatus) => {
  if (status === UploadStatus.COMPLETED) return 'success'
  if (status === UploadStatus.ERROR) return 'exception'
  return undefined
}

const formatFileSize = (bytes: number) => uploadStore.formatFileSize(bytes)
const formatSpeed = (bytesPerSecond: number) => uploadStore.formatSpeed(bytesPerSecond)
const formatRemainingTime = (seconds: number) => uploadStore.formatRemainingTime(seconds)
</script>

<style scoped>
.upload-task-list {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.task-header h3 {
  margin: 0;
  color: #303133;
}

.task-stats {
  display: flex;
  gap: 8px;
}

.task-filters {
  margin-bottom: 20px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  cursor: pointer;
  transition: all 0.3s ease;
}

.task-item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.task-item.active {
  border-color: #409eff;
  background: #f0f9ff;
}

.task-item.completed {
  border-color: #67c23a;
}

.task-item.failed {
  border-color: #f56c6c;
}

.task-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.file-icon {
  color: #909399;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.file-meta {
  font-size: 14px;
  color: #909399;
}

.separator {
  margin: 0 8px;
}

.task-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.progress-bar {
  flex: 1;
}

.progress-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 80px;
}

.percentage {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.time {
  font-size: 12px;
  color: #909399;
}

.task-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.task-error {
  margin-top: 12px;
}

.task-details {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.task-footer {
  text-align: center;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

@media (max-width: 768px) {
  .task-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .task-stats {
    flex-wrap: wrap;
  }

  .task-info {
    flex-direction: column;
    align-items: flex-start;
  }

  .task-progress {
    flex-direction: column;
    align-items: stretch;
  }

  .progress-info {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }

  .task-actions {
    justify-content: center;
  }
}
</style>