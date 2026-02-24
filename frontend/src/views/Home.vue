<template>
  <div class="home">
    <div class="header">
      <h1>大文件上传系统</h1>
      <p class="subtitle">支持分片上传、断点续传、文件去重的企业级上传解决方案</p>
    </div>

    <div class="main-content">
      <!-- 文件上传器 -->
      <div class="upload-section">
        <FileUploader />
      </div>

      <!-- 上传任务列表 -->
      <div class="task-section">
        <UploadTaskList />
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats">
      <el-card>
        <template #header>
          <span>系统统计</span>
        </template>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-statistic title="总上传任务" :value="totalTasks" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="成功完成" :value="completedTasks" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="当前进行中" :value="uploadingTasks" />
          </el-col>
        </el-row>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import FileUploader from '@/components/FileUploader.vue'
import UploadTaskList from '@/components/UploadTaskList.vue'
import { useUploadStore } from '@/stores/upload'

// Store
const uploadStore = useUploadStore()

// 计算属性
const totalTasks = computed(() => uploadStore.taskList.length)
const completedTasks = computed(() => uploadStore.completedTasks.length)
const uploadingTasks = computed(() => uploadStore.uploadingTasks.length)
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 20px;
}

.header {
  text-align: center;
  margin-bottom: 40px;
  padding: 40px 20px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  backdrop-filter: blur(10px);
}

.header h1 {
  font-size: 2.5rem;
  color: #303133;
  margin: 0 0 16px 0;
  font-weight: 600;
}

.subtitle {
  font-size: 1.1rem;
  color: #606266;
  margin: 0;
  line-height: 1.6;
}

.main-content {
  display: flex;
  flex-direction: column;
  gap: 40px;
  margin-bottom: 60px;
}

.upload-section,
.task-section {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  padding: 30px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.features {
  margin-bottom: 40px;
  text-align: center;
}

.features h2 {
  font-size: 2rem;
  color: #303133;
  margin-bottom: 40px;
  font-weight: 600;
}

.feature-item {
  text-align: center;
  padding: 30px 20px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  height: 100%;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  backdrop-filter: blur(10px);
}

.feature-item:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.feature-icon {
  color: #409eff;
  margin-bottom: 16px;
}

.feature-item h3 {
  font-size: 1.2rem;
  color: #303133;
  margin: 0 0 12px 0;
  font-weight: 600;
}

.feature-item p {
  color: #606266;
  margin: 0;
  line-height: 1.6;
}

.stats {
  max-width: 600px;
  margin: 0 auto;
}

.stats :deep(.el-card) {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: none;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.stats :deep(.el-card__header) {
  background: transparent;
  border-bottom: 1px solid rgba(235, 238, 245, 0.6);
  font-weight: 600;
  font-size: 1.1rem;
}

@media (max-width: 768px) {
  .home {
    padding: 15px;
  }

  .header {
    padding: 30px 20px;
    margin-bottom: 30px;
  }

  .header h1 {
    font-size: 2rem;
  }

  .subtitle {
    font-size: 1rem;
  }

  .main-content {
    gap: 30px;
    margin-bottom: 40px;
  }

  .upload-section,
  .task-section {
    padding: 20px;
  }

  .features h2 {
    font-size: 1.5rem;
    margin-bottom: 30px;
  }

  .feature-item {
    padding: 20px 15px;
    margin-bottom: 20px;
  }
}

@media (max-width: 480px) {
  .header h1 {
    font-size: 1.8rem;
  }

  .features h2 {
    font-size: 1.3rem;
  }
}
</style>