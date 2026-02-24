# 大文件上传系统

这是一个基于 **Vue 3** 与 **Node.js** 的大文件上传演示项目，完整实现了 **分片上传、断点续传、秒传/去重、分片合并** 等企业级常见能力，适合作为实际业务接入或学习参考用例。

## 功能特性

- **分片上传**：将大文件切分为多个分片并并发上传，提升上传效率。
- **断点续传**：上传中断后可从已有分片继续上传，避免重复传输。
- **文件秒传 / 去重**：通过文件 Hash 判断是否已上传，已存在则直接返回结果。
- **分片合并**：服务端负责将已上传的分片安全合并为完整文件。
- **上传进度可视化**：前端实时展示上传进度和状态。

## 技术栈

### 前端
- Vue 3 + Composition API
- Vite
- Element Plus
- Pinia
- Axios
- Spark-MD5（用于文件 Hash 计算）

### 后端
- Node.js
- Express.js
- Multer
- jsonwebtoken
- fs-extra

## 项目结构

```bash
large-file-upload/
├── frontend/          # Vue3 前端项目
├── backend/           # Node.js 后端项目
└── README.md
```

## 快速开始

### 1. 启动后端服务

```bash
cd backend
npm install
npm run dev
```

默认会在本地某一端口（如 `http://localhost:3000`）启动上传接口服务，你可以根据代码中的配置进行调整。

### 2. 启动前端服务

```bash
cd frontend
npm install
npm run dev
```

前端启动后，浏览器访问 Vite 输出的本地地址（通常为 `http://localhost:5173`），即可打开大文件上传页面。

## 核心上传流程（API 概览）

1. **创建/初始化上传**：`POST /api/upload/create`  
   用于初始化一次上传任务，返回上传标识等信息。
2. **Hash 校验（秒传判断）**：`PATCH /api/upload/verify`  
   根据文件 Hash 判断是否已经上传过，支持断点续传。
3. **分片上传**：`POST /api/upload/chunk`  
   上传单个文件分片，支持并发上传。
4. **分片合并**：`POST /api/upload/merge`  
   所有分片上传完成后，触发合并生成最终文件。

> 详细的参数字段与返回结构可以在接口实现文件中查看或根据实际业务进行扩展。

## 适用场景

- 需要支持 **大文件上传（如视频、压缩包、安装包等）** 的 Web 项目。
- 希望在现有系统中接入 **分片上传 + 秒传 + 断点续传** 能力。
- 学习前后端协作实现大文件上传的完整方案与代码结构。