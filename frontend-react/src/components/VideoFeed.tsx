import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Video, VideoOff, Settings } from 'lucide-react';
import { FaceMesh, type Results } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';

interface VideoFeedProps {
  onBlinkDetected?: (blinkData: BlinkData) => void;
  onStatsUpdate?: (stats: BlinkStats) => void;
  detectionMode?: 'simple' | 'advanced';
}

export interface BlinkData {
  timestamp: number;
  ear: number;
  quality?: 'good' | 'poor';
}

export interface BlinkStats {
  totalBlinks: number;
  blinksPerMin: number;
  rateStatus: 'Low' | 'Normal' | 'High';
  earValue: number;
}

// Eye landmarks indices for EAR calculation
const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];

export function VideoFeed({ onBlinkDetected, onStatsUpdate, detectionMode = 'simple' }: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Blink detection state
  const blinkStateRef = useRef({
    totalBlinks: 0,
    blinkHistory: [] as number[],
    lastBlinkTime: 0,
    isBlinking: false,
    earHistory: [] as number[],
    calibrationSamples: [] as number[],
    baselineEAR: 0.25,
    earThreshold: 0.21,
    consecFrames: 0,
    consecFramesRequired: 2,
    refractoryPeriod: 200,
  });

  // Calculate Eye Aspect Ratio (EAR)
  const calculateEAR = (eyeIndices: number[], landmarks: Array<{x: number; y: number; z: number}>): number => {
    const points = eyeIndices.map(idx => landmarks[idx]);
    
    // Vertical distances
    const v1 = Math.hypot(points[1].x - points[5].x, points[1].y - points[5].y, points[1].z - points[5].z);
    const v2 = Math.hypot(points[2].x - points[4].x, points[2].y - points[4].y, points[2].z - points[4].z);
    
    // Horizontal distance
    const h = Math.hypot(points[0].x - points[3].x, points[0].y - points[3].y, points[0].z - points[3].z);
    
    return (v1 + v2) / (2.0 * h);
  };

  // Update stats callback
  const updateStats = useCallback((currentEAR: number) => {
    const state = blinkStateRef.current;
    const now = Date.now();
    const recentBlinks = state.blinkHistory.filter(t => now - t < 60000).length;
    const bpm = recentBlinks; // Already filtered to last 60s
    
    let rateStatus: 'Low' | 'Normal' | 'High' = 'Normal';
    if (bpm < 10) rateStatus = 'Low';
    else if (bpm > 20) rateStatus = 'High';
    
    onStatsUpdate?.({
      totalBlinks: state.totalBlinks,
      blinksPerMin: bpm,
      rateStatus,
      earValue: currentEAR
    });
  }, [onStatsUpdate]);

  // Simple blink detection (consecutive frames below threshold)
  const detectBlinkSimple = useCallback((ear: number) => {
    const state = blinkStateRef.current;
    const now = Date.now();
    
    if (ear < state.earThreshold) {
      state.consecFrames++;
    } else {
      // Eye opened after being closed
      if (state.consecFrames >= state.consecFramesRequired && 
          now - state.lastBlinkTime > state.refractoryPeriod) {
        // Blink detected
        state.totalBlinks++;
        state.lastBlinkTime = now;
        state.blinkHistory.push(now);
        
        // Keep only last 60 seconds of blinks
        state.blinkHistory = state.blinkHistory.filter(t => now - t < 60000);
        
        onBlinkDetected?.({
          timestamp: now,
          ear,
          quality: state.consecFrames >= 3 ? 'good' : 'poor'
        });
      }
      state.consecFrames = 0;
    }
    
    updateStats(ear);
  }, [onBlinkDetected, updateStats]);

  // Advanced blink detection with calibration and state machine
  const detectBlinkAdvanced = useCallback((ear: number) => {
    const state = blinkStateRef.current;
    const now = Date.now();
    
    // Calibration phase: collect baseline EAR
    if (state.calibrationSamples.length < 30) {
      state.calibrationSamples.push(ear);
      if (state.calibrationSamples.length === 30) {
        state.baselineEAR = state.calibrationSamples.reduce((a, b) => a + b) / 30;
        state.earThreshold = state.baselineEAR * 0.85; // 85% of baseline
      }
      return;
    }
    
    // Smooth EAR value
    state.earHistory.push(ear);
    if (state.earHistory.length > 5) {
      state.earHistory.shift();
    }
    const smoothedEAR = state.earHistory.reduce((a, b) => a + b) / state.earHistory.length;
    
    // State machine
    const earDrop = state.baselineEAR - smoothedEAR;
    const minDropThreshold = 0.03;
    
    if (!state.isBlinking && earDrop > minDropThreshold && smoothedEAR < state.earThreshold) {
      // Blink start
      state.isBlinking = true;
      state.consecFrames = 1;
    } else if (state.isBlinking && smoothedEAR < state.earThreshold) {
      // Blink ongoing
      state.consecFrames++;
    } else if (state.isBlinking && smoothedEAR >= state.earThreshold) {
      // Blink end
      if (state.consecFrames >= 2 && state.consecFrames <= 8 && 
          now - state.lastBlinkTime > state.refractoryPeriod) {
        // Valid blink
        state.totalBlinks++;
        state.lastBlinkTime = now;
        state.blinkHistory.push(now);
        state.blinkHistory = state.blinkHistory.filter(t => now - t < 60000);
        
        onBlinkDetected?.({
          timestamp: now,
          ear: smoothedEAR,
          quality: state.consecFrames >= 2 && state.consecFrames <= 5 ? 'good' : 'poor'
        });
      }
      state.isBlinking = false;
      state.consecFrames = 0;
    }
    
    updateStats(smoothedEAR);
  }, [onBlinkDetected, updateStats]);

  // MediaPipe Face Mesh callback
  const onResults = useCallback((results: Results) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || !videoRef.current) return;
    
    // Draw video frame
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      
      // Calculate bilateral EAR
      const leftEAR = calculateEAR(LEFT_EYE_INDICES, landmarks);
      const rightEAR = calculateEAR(RIGHT_EYE_INDICES, landmarks);
      const avgEAR = (leftEAR + rightEAR) / 2;
      
      // Draw eye landmarks
      ctx.fillStyle = '#00FF00';
      [...LEFT_EYE_INDICES, ...RIGHT_EYE_INDICES].forEach(idx => {
        const point = landmarks[idx];
        ctx.beginPath();
        ctx.arc(point.x * canvas.width, point.y * canvas.height, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
      
      // Detect blinks
      if (detectionMode === 'simple') {
        detectBlinkSimple(avgEAR);
      } else {
        detectBlinkAdvanced(avgEAR);
      }
      
      // Draw EAR value
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px Arial';
      ctx.fillText(`EAR: ${avgEAR.toFixed(3)}`, 10, 30);
      ctx.fillText(`Blinks: ${blinkStateRef.current.totalBlinks}`, 10, 55);
    }
    
    ctx.restore();
  }, [detectionMode, detectBlinkSimple, detectBlinkAdvanced]);

  // Initialize MediaPipe
  useEffect(() => {
    if (!videoRef.current) return;
    
    const faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      }
    });
    
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    faceMesh.onResults(onResults);
    faceMeshRef.current = faceMesh;
    
    return () => {
      faceMesh.close();
    };
  }, [onResults]);

  const startCamera = async () => {
    if (!videoRef.current || !faceMeshRef.current) return;
    
    try {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (faceMeshRef.current && videoRef.current) {
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480
      });
      
      await camera.start();
      cameraRef.current = camera;
      setIsStreaming(true);
      
      // Reset state
      blinkStateRef.current = {
        totalBlinks: 0,
        blinkHistory: [],
        lastBlinkTime: 0,
        isBlinking: false,
        earHistory: [],
        calibrationSamples: [],
        baselineEAR: 0.25,
        earThreshold: 0.21,
        consecFrames: 0,
        consecFramesRequired: 2,
        refractoryPeriod: 200,
      };
    } catch (error) {
      console.error('Camera error:', error);
    }
  };

  const stopCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    setIsStreaming(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Live Blink Detection
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            className="hidden"
            autoPlay
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full h-full object-cover"
          />
          {!isStreaming && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90">
              <div className="text-center text-white">
                <VideoOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-semibold mb-2">Camera Inactive</p>
                <p className="text-sm text-gray-400 mb-4">Click Start Camera to begin detection</p>
              </div>
            </div>
          )}
        </div>
        
        {showSettings && (
          <div className="mt-4 p-4 bg-gray-100 rounded-lg space-y-2">
            <div className="text-sm">
              <span className="font-semibold">Detection Mode:</span> {detectionMode}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {detectionMode === 'simple' ? (
                'Simple mode: Consecutive frame threshold detection'
              ) : (
                'Advanced mode: State machine with calibration'
              )}
            </div>
          </div>
        )}
        
        <div className="flex gap-3 mt-4">
          <Button 
            onClick={startCamera} 
            disabled={isStreaming}
            className="flex-1"
          >
            <Video className="h-4 w-4 mr-2" />
            Start Camera
          </Button>
          <Button 
            onClick={stopCamera} 
            disabled={!isStreaming}
            variant="destructive"
            className="flex-1"
          >
            <VideoOff className="h-4 w-4 mr-2" />
            Stop Camera
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
