<template>
  <div class="realtime-monitor">
    <!-- 控制面板 -->
    <el-card class="control-panel">
      <template #header>
        <div class="panel-header">
          <span>实时监控控制台</span>
          <div class="control-buttons">
            <el-button 
              v-if="!isMonitoring" 
              type="primary" 
              @click="startMonitoring"
              :loading="startingCamera"
            >
              <el-icon><VideoCamera /></el-icon>
              {{ startingCamera ? '启动中...' : '开始监控' }}
            </el-button>
            <el-button 
              v-else 
              type="danger" 
              @click="stopMonitoring"
            >
              <el-icon><VideoPause /></el-icon>
              停止监控
            </el-button>
            <el-button @click="showSettings = true">
              <el-icon><Setting /></el-icon>
              设置
            </el-button>
          </div>
        </div>
      </template>

      <el-row :gutter="20" class="control-row">
        <el-col :span="6">
          <el-form-item label="视频源">
            <el-select v-model="monitorConfig.source" :disabled="isMonitoring">
              <el-option label="摄像头" value="camera" />
              <el-option label="RTSP流" value="rtsp" disabled />
              <el-option label="本地文件" value="file" disabled />
            </el-select>
          </el-form-item>
        </el-col>
        
        <el-col :span="6">
          <el-form-item label="检测模式">
            <el-select v-model="monitorConfig.mode" :disabled="isMonitoring">
              <el-option label="仅预览" value="preview" />
              <el-option label="实时检测" value="realtime" />
            </el-select>
          </el-form-item>
        </el-col>
        
        <el-col :span="6">
          <el-form-item label="录制">
            <el-switch 
              v-model="monitorConfig.recording" 
              :disabled="!isMonitoring"
              active-text="录制中" 
              inactive-text="不录制"
            />
          </el-form-item>
        </el-col>
        
        <el-col :span="6">
          <el-form-item label="报警">
            <el-switch 
              v-model="monitorConfig.alertEnabled" 
              active-text="启用" 
              inactive-text="禁用"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </el-card>

    <!-- 监控主界面 -->
    <el-row :gutter="20" class="monitor-main">
      <!-- 视频显示区域 -->
      <el-col :span="16">
        <el-card class="video-card">
          <template #header>
            <div class="video-header">
              <span>实时画面</span>
              <div class="video-controls">
                <el-tag 
                  :type="isMonitoring ? 'success' : 'info'"
                  size="small"
                >
                  {{ isMonitoring ? '监控中' : '已停止' }}
                </el-tag>
                <span v-if="isMonitoring" class="fps-indicator">
                  {{ currentFPS }} FPS
                </span>
                <span v-if="cameraError" class="error-indicator">
                  <el-icon><Warning /></el-icon>
                  摄像头错误
                </span>
              </div>
            </div>
          </template>

          <div class="video-container">
            <div v-if="!isMonitoring" class="video-placeholder">
              <el-icon size="64"><VideoCamera /></el-icon>
              <p>点击开始监控</p>
              <p class="placeholder-hint">将显示摄像头实时画面</p>
            </div>
            
            <div v-else-if="cameraError" class="video-error">
              <el-icon size="64"><Warning /></el-icon>
              <p>摄像头访问失败</p>
              <p class="error-message">{{ cameraError }}</p>
              <el-button type="primary" @click="retryCamera">
                重试
              </el-button>
            </div>
            
            <div v-else class="video-display">
              <video 
                ref="videoElement" 
                class="video-stream"
                autoplay 
                muted
                playsinline
                @loadedmetadata="onVideoLoaded"
                @error="onVideoError"
              />
              
              <!-- 检测信息覆盖层 -->
              <div class="detection-overlay">
                <div class="detection-info">
                  <div class="info-item">
                    <span class="label">检测对象:</span>
                    <span class="value">{{ currentDetections.length }}</span>
                  </div>
                  <div class="info-item">
                    <span class="label">处理时间:</span>
                    <span class="value">{{ processingTime }}ms</span>
                  </div>
                  <div class="info-item">
                    <span class="label">分辨率:</span>
                    <span class="value">{{ videoResolution }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 侧边信息面板 -->
      <el-col :span="8">
        <!-- 实时检测结果 -->
        <el-card class="detection-card">
          <template #header>
            <span>实时检测</span>
          </template>
          
          <div class="detection-list">
            <div 
              v-for="detection in currentDetections" 
              :key="detection.id"
              class="detection-item"
              :class="{ 'alert': detection.isAlert }"
            >
              <div class="detection-icon">
                <el-icon v-if="detection.isAlert"><Warning /></el-icon>
                <el-icon v-else><User /></el-icon>
              </div>
              <div class="detection-content">
                <div class="detection-behavior">{{ detection.behavior }}</div>
                <div class="detection-confidence">
                  置信度: {{ (detection.confidence * 100).toFixed(1) }}%
                </div>
              </div>
            </div>
            
            <div v-if="currentDetections.length === 0" class="no-detections">
              <el-icon size="32"><Search /></el-icon>
              <p>暂无检测结果</p>
            </div>
          </div>
        </el-card>

        <!-- 报警记录 -->
        <el-card class="alert-card">
          <template #header>
            <div class="card-header">
              <span>实时报警</span>
              <el-badge :value="realtimeAlerts.length" :max="99" />
            </div>
          </template>
          
          <div class="alert-list">
            <div 
              v-for="alert in realtimeAlerts.slice(0, 5)" 
              :key="alert.id"
              class="alert-item"
              :class="alert.level"
            >
              <div class="alert-time">{{ formatTime(alert.timestamp) }}</div>
              <div class="alert-behavior">{{ alert.behavior }}</div>
              <div class="alert-confidence">{{ (alert.confidence * 100).toFixed(1) }}%</div>
            </div>
            
            <div v-if="realtimeAlerts.length === 0" class="no-alerts">
              <el-icon size="32"><Check /></el-icon>
              <p>暂无报警</p>
            </div>
          </div>
        </el-card>

        <!-- 系统状态 -->
        <el-card class="status-card">
          <template #header>
            <span>系统状态</span>
          </template>
          
          <div class="status-info">
            <div class="status-item">
              <span class="status-label">运行时长:</span>
              <span class="status-value">{{ monitoringDuration }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">检测总数:</span>
              <span class="status-value">{{ totalDetections }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">报警次数:</span>
              <span class="status-value">{{ realtimeAlerts.length }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">摄像头状态:</span>
              <span class="status-value" :class="cameraStatusClass">
                {{ cameraStatusText }}
              </span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 设置对话框 -->
    <el-dialog
      v-model="showSettings"
      title="监控设置"
      width="600px"
    >
      <el-form :model="settings" label-width="120px">
        <el-form-item label="检测置信度">
          <el-slider
            v-model="settings.confidence"
            :min="0.1"
            :max="1.0"
            :step="0.05"
            show-stops
            show-input
          />
        </el-form-item>
        
        <el-form-item label="报警行为">
          <el-checkbox-group v-model="settings.alertBehaviors">
            <el-checkbox label="fall down">跌倒</el-checkbox>
            <el-checkbox label="fight">打斗</el-checkbox>
            <el-checkbox label="enter">闯入</el-checkbox>
            <el-checkbox label="exit">离开</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        
        <el-form-item label="摄像头设置">
          <el-select v-model="settings.cameraId" placeholder="选择摄像头" :disabled="isMonitoring">
            <el-option 
              v-for="camera in availableCameras" 
              :key="camera.deviceId"
              :label="camera.label"
              :value="camera.deviceId"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="视频质量">
          <el-select v-model="settings.videoQuality" placeholder="选择视频质量" :disabled="isMonitoring">
            <el-option label="低质量 (640x480)" value="low" />
            <el-option label="中等质量 (1280x720)" value="medium" />
            <el-option label="高质量 (1920x1080)" value="high" />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showSettings = false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { 
  VideoCamera, VideoPause, Setting, Warning, User, Search, Check 
} from '@element-plus/icons-vue'
import { useRealtimeMonitor } from '@/composables/useRealtimeMonitor';

export default {
  name: 'RealtimeMonitor',
  components: {
    VideoCamera, VideoPause, Setting, Warning, User, Search, Check
  },
  setup() {
    const videoElement = ref(null)
    const showSettings = ref(false)
    const currentFPS = ref(0)
    const processingTime = ref(0)
    const currentDetections = ref([])
    const realtimeAlerts = ref([])
    const monitoringDuration = ref('00:00:00')
    const totalDetections = ref(0)
    const availableCameras = ref([])
    const videoResolution = ref('--')
    
    const monitorConfig = reactive({
      source: 'camera',
      mode: 'preview', // 默认仅预览
      recording: false,
      alertEnabled: true
    })
    
    const settings = reactive({
      confidence: 0.5,
      alertBehaviors: ['fall down', 'fight', 'enter', 'exit'],
      cameraId: '',
      videoQuality: 'medium'
    })

    const { 
      isMonitoring, 
      startingCamera, 
      cameraError,
      videoResolution: composableVideoResolution,
      startMonitoring: startCamera, 
      stopMonitoring: stopCamera,
      getErrorMessage
    } = useRealtimeMonitor(videoElement, computed(() => settings));
    
    let websocket = null
    let monitoringStartTime = null
    let durationTimer = null
    let animationFrameId = null

    // 计算属性
    const cameraStatusClass = computed(() => {
      if (cameraError.value) return 'error'
      if (isMonitoring.value) return 'success'
      return 'info'
    })

    const cameraStatusText = computed(() => {
      if (cameraError.value) return '错误'
      if (isMonitoring.value) return '正常'
      return '未启动'
    })

    // 获取可用摄像头列表
    const getAvailableCameras = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true }); // 请求权限以获取设备标签
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter(device => device.kind === 'videoinput')
        
        availableCameras.value = videoDevices.map(device => ({
          deviceId: device.deviceId,
          label: device.label || `摄像头 ${availableCameras.value.length + 1}`
        }))
        
        if (!settings.cameraId && availableCameras.value.length > 0) {
          settings.cameraId = availableCameras.value[0].deviceId
        }
      } catch (error) {
        console.error('获取摄像头列表失败:', error)
        cameraError.value = getErrorMessage(error)
      }
    }

    // 获取视频约束
    const getVideoConstraints = () => {
      const qualityMap = {
        low: { width: { ideal: 640 }, height: { ideal: 480 } },
        medium: { width: { ideal: 1280 }, height: { ideal: 720 } },
        high: { width: { ideal: 1920 }, height: { ideal: 1080 } }
      }
      
      const quality = qualityMap[settings.videoQuality] || qualityMap.medium
      
      return {
        video: {
          deviceId: settings.cameraId ? { exact: settings.cameraId } : undefined,
          ...quality,
          frameRate: { ideal: 30 }
        }
      }
    }

    // 开始监控
    const startMonitoring = async () => {
      await startCamera();
      if (isMonitoring.value) {
        monitoringStartTime = new Date()
        ElMessage.success('摄像头启动成功')
        
        startDurationTimer()
        updateFPS()
        
        if (monitorConfig.mode === 'realtime') {
          connectWebSocket()
        }
      }
    }

    // 停止监控
    const stopMonitoring = async () => {
      await stopCamera();
      currentDetections.value = []
      
      if (websocket) {
        websocket.close()
        websocket = null
      }
      
      if (durationTimer) {
        clearInterval(durationTimer)
        durationTimer = null
      }

      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      
      ElMessage.success('监控已停止')
    }

    // 重试摄像头
    const retryCamera = () => {
      cameraError.value = ''
      startMonitoring()
    }

    // 视频加载完成
    const onVideoLoaded = () => {
      // videoResolution is now handled by the composable
    }

    // 视频错误处理
    const onVideoError = (event) => {
      console.error('视频播放错误:', event.target.error)
      cameraError.value = `视频播放失败: ${event.target.error.message}`
    }

    // FPS 计算
    let lastFrameTime = performance.now()
    let frameCounter = 0
    const updateFPS = (now) => {
      if (!isMonitoring.value) return
      frameCounter++
      if (now - lastFrameTime > 1000) {
        currentFPS.value = Math.round(frameCounter / ((now - lastFrameTime) / 1000))
        lastFrameTime = now
        frameCounter = 0
      }
      animationFrameId = requestAnimationFrame(updateFPS)
    }

    // WebSocket连接
    const connectWebSocket = () => {
      const wsUrl = `ws://${window.location.host}/ws/realtime`
      websocket = new WebSocket(wsUrl)
      
      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        handleWebSocketMessage(data)
      }
      
      websocket.onerror = (error) => {
        console.error('WebSocket错误:', error)
      }
    }

    // 处理WebSocket消息
    const handleWebSocketMessage = (data) => {
      switch (data.type) {
        case 'detection':
          currentDetections.value = data.detections || []
          processingTime.value = data.processingTime || 0
          totalDetections.value += data.detections?.length || 0
          break
          
        case 'alert':
          handleAlert(data.alert)
          break
      }
    }

    // 处理报警
    const handleAlert = (alert) => {
      realtimeAlerts.value.unshift({
        ...alert,
        id: Date.now(),
        timestamp: new Date(),
        level: 'high'
      })
      
      if (realtimeAlerts.value.length > 50) {
        realtimeAlerts.value.pop()
      }
    }

    // 开始计时
    const startDurationTimer = () => {
      durationTimer = setInterval(() => {
        if (!monitoringStartTime) return
        const now = new Date()
        const diff = now - monitoringStartTime
        const hours = Math.floor(diff / 3600000)
        const minutes = Math.floor((diff % 3600000) / 60000)
        const seconds = Math.floor((diff % 60000) / 1000)
        
        monitoringDuration.value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      }, 1000)
    }

    // 保存设置
    const saveSettings = () => {
      localStorage.setItem('realtimeMonitorSettings', JSON.stringify(settings))
      ElMessage.success('设置已保存')
      showSettings.value = false
      
      if (isMonitoring.value) {
        stopMonitoring().then(() => {
          setTimeout(() => startMonitoring(), 100)
        })
      }
    }

    // 格式化时间
    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleTimeString()
    }

    onMounted(async () => {
      const savedSettings = localStorage.getItem('realtimeMonitorSettings')
      if (savedSettings) {
        try {
          Object.assign(settings, JSON.parse(savedSettings))
        } catch (e) { console.error("Failed to parse settings", e) }
      }
      await getAvailableCameras()
    })

    onUnmounted(() => {
      stopMonitoring()
    })

    return {
      videoElement,
      isMonitoring,
      startingCamera,
      showSettings,
      currentFPS,
      processingTime,
      currentDetections,
      realtimeAlerts,
      monitoringDuration,
      totalDetections,
      cameraError,
      availableCameras,
      videoResolution,
      monitorConfig,
      settings,
      cameraStatusClass,
      cameraStatusText,
      startMonitoring,
      stopMonitoring,
      retryCamera,
      onVideoLoaded,
      onVideoError,
      saveSettings,
      formatTime
    }
  }
}
</script>

<style scoped>
.realtime-monitor {
  padding: 0;
}

.control-panel {
  margin-bottom: 20px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-buttons {
  display: flex;
  gap: 12px;
}

.control-row {
  margin-top: 16px;
}

.monitor-main {
  margin-bottom: 20px;
}

.video-card {
  height: 600px;
}

.video-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.video-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fps-indicator {
  font-size: 12px;
  color: #67c23a;
  font-weight: bold;
}

.error-indicator {
  font-size: 12px;
  color: #f56c6c;
  display: flex;
  align-items: center;
  gap: 4px;
}

.video-container {
  height: 520px;
  position: relative;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

.video-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
}

.video-placeholder p {
  margin: 16px 0 0 0;
  font-size: 16px;
}

.placeholder-hint {
  font-size: 12px;
  color: #c0c4cc;
  margin-top: 8px !important;
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

.video-display {
  height: 100%;
  position: relative;
}

.video-stream {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.detection-overlay {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
}

.detection-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.detection-card,
.alert-card,
.status-card {
  margin-bottom: 16px;
  height: 180px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detection-list,
.alert-list {
  height: 120px;
  overflow-y: auto;
}

.detection-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  background: #f5f7fa;
}

.detection-item.alert {
  background: #fef0f0;
  border-left: 3px solid #f56c6c;
}

.detection-content {
  flex: 1;
  font-size: 12px;
}

.detection-behavior {
  font-weight: bold;
  color: #303133;
  margin-bottom: 2px;
}

.detection-confidence {
  color: #909399;
}

.alert-item {
  padding: 6px 8px;
  border-radius: 4px;
  margin-bottom: 6px;
  font-size: 12px;
  background: #fef0f0;
  border-left: 3px solid #f56c6c;
}

.alert-time {
  color: #909399;
  margin-bottom: 2px;
}

.alert-behavior {
  font-weight: bold;
  color: #303133;
  margin-bottom: 2px;
}

.no-detections,
.no-alerts {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
}

.no-detections p,
.no-alerts p {
  margin: 8px 0 0 0;
  font-size: 12px;
}

.status-info {
  padding: 8px 0;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.status-label {
  font-size: 12px;
  color: #606266;
}

.status-value {
  font-size: 12px;
  color: #303133;
  font-weight: bold;
}

.status-value.success {
  color: #67c23a;
}

.status-value.error {
  color: #f56c6c;
}

.status-value.info {
  color: #909399;
}
</style> 