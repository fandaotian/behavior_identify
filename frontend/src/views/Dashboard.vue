<template>
  <div class="dashboard">
    <!-- 系统状态卡片 -->
    <el-row :gutter="20" class="status-cards">
      <el-col :span="6">
        <el-card class="status-card">
          <div class="card-content">
            <div class="card-icon online">
              <el-icon size="32"><VideoCamera /></el-icon>
            </div>
            <div class="card-info">
              <h3>{{ stats.activeTasks }}</h3>
              <p>活跃任务</p>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="status-card">
          <div class="card-content">
            <div class="card-icon warning">
              <el-icon size="32"><Warning /></el-icon>
            </div>
            <div class="card-info">
              <h3>{{ stats.todayAlerts }}</h3>
              <p>今日报警</p>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="status-card">
          <div class="card-content">
            <div class="card-icon success">
              <el-icon size="32"><DataAnalysis /></el-icon>
            </div>
            <div class="card-info">
              <h3>{{ stats.totalDetections }}</h3>
              <p>检测总数</p>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :span="6">
        <el-card class="status-card">
          <div class="card-content">
            <div class="card-icon info">
              <el-icon size="32"><Clock /></el-icon>
            </div>
            <div class="card-info">
              <h3>{{ systemUptime }}</h3>
              <p>系统运行时间</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 主要内容区域 -->
    <el-row :gutter="20" class="main-content">
      <!-- 实时监控预览 -->
      <el-col :span="16">
        <el-card class="preview-card">
          <template #header>
            <div class="card-header">
              <span>实时监控预览</span>
              <el-button type="primary" size="small" @click="$router.push('/realtime')">
                查看详情
              </el-button>
            </div>
          </template>
          
          <div class="monitor-preview">
            <div v-if="!isMonitoring" class="no-monitor">
              <el-icon size="64"><VideoCamera /></el-icon>
              <p>暂无实时监控</p>
              <el-button type="primary" @click="handleStartMonitoring" :loading="startingCamera">{{ startingCamera ? '启动中...' : '开始监控' }}</el-button>
            </div>
            
            <div v-else-if="cameraError" class="video-error">
              <el-icon size="64"><Warning /></el-icon>
              <p>摄像头访问失败</p>
              <p class="error-message">{{ cameraError }}</p>
              <el-button type="primary" @click="handleStartMonitoring">
                重试
              </el-button>
            </div>

            <div v-else class="monitor-active">
              <video 
                ref="videoPreview" 
                class="video-preview" 
                autoplay 
                muted
                playsinline
                @loadedmetadata="onVideoLoaded"
              />
              <div class="monitor-overlay">
                <div class="monitor-info">
                  <span class="status-indicator online"></span>
                  <span>监控中 - {{ currentFPS }} FPS</span>
                </div>
                <el-button type="danger" size="small" @click="handleStopMonitoring" circle>
                  <el-icon><VideoPause /></el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <!-- 最近报警 -->
      <el-col :span="8">
        <el-card class="alerts-card">
          <template #header>
            <div class="card-header">
              <span>最近报警</span>
              <el-button type="text" size="small" @click="$router.push('/alerts')">
                查看全部
              </el-button>
            </div>
          </template>
          
          <div class="alerts-list">
            <div 
              v-for="alert in recentAlerts" 
              :key="alert.id"
              class="alert-item"
              :class="alert.level"
            >
              <div class="alert-icon">
                <el-icon><Warning /></el-icon>
              </div>
              <div class="alert-content">
                <div class="alert-title">{{ alert.behavior }}</div>
                <div class="alert-time">{{ formatTime(alert.timestamp) }}</div>
                <div class="alert-location">{{ alert.location }}</div>
              </div>
            </div>
            
            <div v-if="recentAlerts.length === 0" class="no-alerts">
              <el-icon size="32"><Check /></el-icon>
              <p>暂无报警记录</p>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 统计图表 -->
    <el-row :gutter="20" class="charts-section">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>检测行为分布</span>
          </template>
          <div id="behaviorChart" class="chart-container"></div>
        </el-card>
      </el-col>
      
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>24小时检测趋势</span>
          </template>
          <div id="trendChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted, toRefs } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoCamera, Warning, DataAnalysis, Clock, Check, VideoPause } from '@element-plus/icons-vue'
import { useRealtimeMonitor } from '@/composables/useRealtimeMonitor'

export default {
  name: 'Dashboard',
  components: {
    VideoCamera, Warning, DataAnalysis, Clock, Check, VideoPause
  },
  setup() {
    const stats = reactive({
      activeTasks: 0,
      todayAlerts: 0,
      totalDetections: 0
    })
    
    const systemUptime = ref('0天0小时')
    const currentFPS = ref(0)
    const recentAlerts = ref([])
    const videoPreview = ref(null)

    // 从 composable 获取监控逻辑
    const { isMonitoring, startingCamera, cameraError, startMonitoring, stopMonitoring } = useRealtimeMonitor(videoPreview);
    
    let updateTimer = null
    let websocket = null

    // 获取系统统计信息
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/statistics/overview')
        if (response.ok) {
          const data = await response.json()
          Object.assign(stats, data)
        }
      } catch (error) {
        console.error('获取统计信息失败:', error)
      }
    }

    // 获取系统运行时间
    const fetchUptime = async () => {
      try {
        const response = await fetch('/api/system/uptime')
        if (response.ok) {
          const data = await response.json()
          systemUptime.value = data.uptime
        }
      } catch (error) {
        console.error('获取系统运行时间失败:', error)
      }
    }

    // 获取最近报警
    const fetchRecentAlerts = async () => {
      try {
        const response = await fetch('/api/alerts?limit=5&recent=true')
        if (response.ok) {
          const data = await response.json()
          recentAlerts.value = data.alerts || []
        }
      } catch (error) {
        console.error('获取最近报警失败:', error)
      }
    }

    // 封装开始监控操作
    const handleStartMonitoring = async () => {
      await startMonitoring();
      if (isMonitoring.value) {
        ElMessage.success('监控已启动');
        connectWebSocket();
      }
    };

    // 封装停止监控操作
    const handleStopMonitoring = async () => {
      await stopMonitoring();
      if (websocket) {
        websocket.close();
        websocket = null;
      }
      ElMessage.info('监控已停止');
    };

    // WebSocket连接
    const connectWebSocket = () => {
      const wsUrl = `ws://${window.location.host}/ws/realtime`
      websocket = new WebSocket(wsUrl)
      
      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'frame_info') {
          currentFPS.value = data.fps
        } else if (data.type === 'alert') {
          // 新报警，更新报警列表
          fetchRecentAlerts()
        }
      }
      
      websocket.onerror = (error) => {
        console.error('WebSocket错误:', error)
      }
    }

    // 格式化时间
    const formatTime = (timestamp) => {
      const date = new Date(timestamp)
      const now = new Date()
      const diff = now - date
      
      if (diff < 60000) {
        return '刚刚'
      } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}分钟前`
      } else if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`
      } else {
        return date.toLocaleDateString()
      }
    }

    // 视频加载完成
    const onVideoLoaded = () => {
      console.log('视频预览加载完成')
    }

    // 初始化图表
    const initCharts = () => {
      // 这里可以集成ECharts或其他图表库
      // 暂时用占位符
    }

    onMounted(() => {
      fetchStats()
      fetchUptime()
      fetchRecentAlerts()
      initCharts()
      
      // 定期更新数据
      updateTimer = setInterval(() => {
        fetchStats()
        fetchUptime()
        fetchRecentAlerts()
      }, 30000)
    })

    onUnmounted(() => {
      if (updateTimer) {
        clearInterval(updateTimer)
      }
      if (websocket) {
        websocket.close()
      }
    })

    return {
      stats,
      systemUptime,
      isMonitoring,
      startingCamera,
      cameraError,
      currentFPS,
      recentAlerts,
      videoPreview,
      handleStartMonitoring,
      handleStopMonitoring,
      formatTime,
      onVideoLoaded
    }
  }
}
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.status-cards {
  margin-bottom: 20px;
}

.status-card {
  transition: transform 0.2s;
}

.status-card:hover {
  transform: translateY(-2px);
}

.card-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.card-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.card-icon.online {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.card-icon.warning {
  background: linear-gradient(135deg, #e6a23c, #f0a020);
}

.card-icon.success {
  background: linear-gradient(135deg, #409eff, #66b1ff);
}

.card-icon.info {
  background: linear-gradient(135deg, #909399, #b1b5b8);
}

.card-info h3 {
  margin: 0 0 4px 0;
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.card-info p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.main-content {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-card {
  height: 400px;
}

.monitor-preview {
  height: 320px;
  position: relative;
}

.no-monitor {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
}

.no-monitor p {
  margin: 16px 0;
  font-size: 16px;
}

.monitor-active {
  height: 100%;
  position: relative;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

.video-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.monitor-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.monitor-info {
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-indicator.online {
  background: #67c23a;
  box-shadow: 0 0 6px #67c23a;
}

.alerts-card {
  height: 400px;
}

.alerts-list {
  height: 320px;
  overflow-y: auto;
}

.alert-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  border-left: 3px solid;
  background: #fafafa;
}

.alert-item.high {
  border-left-color: #f56c6c;
  background: #fef0f0;
}

.alert-item.medium {
  border-left-color: #e6a23c;
  background: #fdf6ec;
}

.alert-item.low {
  border-left-color: #409eff;
  background: #ecf5ff;
}

.alert-icon {
  color: #f56c6c;
  margin-top: 2px;
}

.alert-content {
  flex: 1;
}

.alert-title {
  font-weight: bold;
  color: #303133;
  margin-bottom: 4px;
}

.alert-time {
  font-size: 12px;
  color: #909399;
  margin-bottom: 2px;
}

.alert-location {
  font-size: 12px;
  color: #606266;
}

.no-alerts {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
}

.no-alerts p {
  margin: 12px 0 0 0;
}

.charts-section {
  margin-bottom: 20px;
}

.chart-container {
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
  border-radius: 4px;
  color: #909399;
  font-size: 14px;
}

.chart-container::before {
  content: "图表加载中...";
}

.video-error {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #f56c6c;
  padding: 20px;
  box-sizing: border-box;
}

.error-message {
  font-size: 14px;
  color: #909399;
  margin: 8px 0 16px 0;
  text-align: center;
  max-width: 300px;
  line-height: 1.5;
}
</style> 