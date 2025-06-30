import { ref, nextTick } from 'vue';
import { ElMessage } from 'element-plus';

function getErrorMessage(error) {
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return '摄像头权限被拒绝，请在浏览器设置中允许访问。';
  } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return '未找到可用摄像头设备。';
  } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return '摄像头可能被其他应用占用。';
  } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
    return '摄像头不支持请求的分辨率或帧率。';
  } else {
    return error.message || '未知错误';
  }
}

export function useRealtimeMonitor(videoElement, settings) {
  const isMonitoring = ref(false);
  const startingCamera = ref(false);
  const cameraError = ref('');
  const videoResolution = ref('--');

  let mediaStream = null;

  const startMonitoring = async () => {
    if (isMonitoring.value || startingCamera.value) return;

    startingCamera.value = true;
    cameraError.value = '';

    try {
      const qualityMap = {
        low: { width: { ideal: 640 }, height: { ideal: 480 } },
        medium: { width: { ideal: 1280 }, height: { ideal: 720 } },
        high: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      };
      
      const quality = qualityMap[settings?.value?.videoQuality] || qualityMap.medium;

      const constraints = {
        video: {
          deviceId: settings?.value?.cameraId ? { exact: settings.value.cameraId } : undefined,
          ...quality,
          frameRate: { ideal: 30 },
        },
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      isMonitoring.value = true;
      await nextTick();

      if (videoElement.value) {
        videoElement.value.srcObject = mediaStream;
        await videoElement.value.play();
        const { videoWidth, videoHeight } = videoElement.value;
        videoResolution.value = `${videoWidth}x${videoHeight}`;
      } else {
        throw new Error('视频元素未在DOM中找到');
      }
    } catch (error) {
      console.error('启动摄像头失败:', error);
      isMonitoring.value = false;
      cameraError.value = getErrorMessage(error);
      ElMessage.error(`启动摄像头失败: ${cameraError.value}`);
    } finally {
      startingCamera.value = false;
    }
  };

  const stopMonitoring = async () => {
    if (!isMonitoring.value && !mediaStream) return;
    
    isMonitoring.value = false;
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }

    if (videoElement.value) {
      videoElement.value.srcObject = null;
    }
  };

  return {
    isMonitoring,
    startingCamera,
    cameraError,
    videoResolution,
    startMonitoring,
    stopMonitoring,
    getErrorMessage,
  };
} 