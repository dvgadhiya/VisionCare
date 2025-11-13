import { useState, useCallback } from 'react';
import { Navbar } from '../components/Navbar';
import { VideoFeed, type BlinkData, type BlinkStats } from '../components/VideoFeed';
import { 
  Eye, 
  Smile, 
  Activity, 
  TrendingUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';

type LogItem = { id: number; time: string; message: string; type: 'info' | 'success' | 'error' };
type BlinkHistoryItem = { time: string; blinks: number; ear: number };

export function DashboardPage() {
  
  // Detection mode
  const [detectionMode] = useState<'simple' | 'advanced'>('simple');
  
  // Stats state
  const [blinkStats, setBlinkStats] = useState<BlinkStats>({
    totalBlinks: 0,
    blinksPerMin: 0,
    rateStatus: 'Normal',
    earValue: 0,
  });
  
  const [emotionStats] = useState({
    emotion: 'N/A',
    emotionConf: 0,
    redness: 'N/A',
    rednessConf: 0,
  });
  
  const [blinkHistory, setBlinkHistory] = useState<BlinkHistoryItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);

  // Logging helper
  const addLog = useCallback((message: string, type: LogItem['type'] = 'info') => {
    const newLog: LogItem = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      message,
      type,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 50)); // Keep last 50 logs
  }, []);

  // Blink detection callbacks
  const handleBlinkDetected = useCallback((blinkData: BlinkData) => {
    addLog(`Blink detected! EAR: ${blinkData.ear.toFixed(3)} (${blinkData.quality})`, 'success');
  }, [addLog]);

  const handleStatsUpdate = useCallback((stats: BlinkStats) => {
    setBlinkStats(stats);
    
    // Add to history for chart
    setBlinkHistory(prev => {
      const newData = [...prev, {
        time: new Date().toLocaleTimeString(),
        blinks: stats.blinksPerMin,
        ear: stats.earValue,
      }];
      return newData.slice(-20); // Keep last 20 data points
    });
  }, []);

  // All detection is now handled by VideoFeed component

  const getRateStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'normal': return 'bg-green-500';
      case 'high': return 'bg-yellow-500';
      case 'low': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Real-Time Blink Detection Dashboard
          </h1>
          <p className="text-gray-600">
            MediaPipe Face Mesh • Eye Aspect Ratio • {detectionMode === 'simple' ? 'Simple' : 'Advanced'} Detection Mode
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Video Feed - Takes 2 columns */}
          <div className="lg:col-span-2">
            <VideoFeed
              onBlinkDetected={handleBlinkDetected}
              onStatsUpdate={handleStatsUpdate}
              detectionMode={detectionMode}
            />
          </div>

          {/* Right column - could add controls here */}
          <div className="space-y-6">
            {/* Future: Add detection mode toggle, threshold controls, etc. */}
          </div>
        </div>

        {/* Stats Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Total Blinks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{blinkStats.totalBlinks}</div>
              <p className="text-xs text-gray-500 mt-1">{blinkStats.blinksPerMin.toFixed(1)}/min</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                EAR Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{blinkStats.earValue.toFixed(3)}</div>
              <p className="text-xs text-gray-500 mt-1">Eye Aspect Ratio</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smile className="h-4 w-4" />
                Emotion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{emotionStats.emotion}</div>
              <p className="text-xs text-gray-500 mt-1">{emotionStats.emotionConf.toFixed(1)}% confidence</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Blink Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                {blinkStats.rateStatus}
                <span className={`inline-block h-2 w-2 rounded-full ${getRateStatusColor(blinkStats.rateStatus)}`}></span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Details Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Blink History Chart */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Blink History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-gray-400">
                  Chart visualization - {blinkHistory.length} data points
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Additional Stats */}
          <div className="space-y-6">
            {/* Emotion Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Smile className="h-4 w-4" />
                  Emotion Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Current Emotion</span>
                    <Badge>{emotionStats.emotion}</Badge>
                  </div>
                  <Progress value={emotionStats.emotionConf} className="h-2" />
                  <p className="text-xs text-gray-500 mt-1">
                    {emotionStats.emotionConf.toFixed(1)}% confidence
                  </p>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Eye Redness</span>
                    <Badge variant={emotionStats.redness === 'Normal' ? 'default' : 'destructive'}>
                      {emotionStats.redness}
                    </Badge>
                  </div>
                  <Progress value={emotionStats.rednessConf} className="h-2" />
                  <p className="text-xs text-gray-500 mt-1">
                    {emotionStats.rednessConf.toFixed(1)}% confidence
                  </p>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Activity Log */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-sm text-gray-400">No activity yet</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-2 text-sm">
                    <span className="text-gray-500">{log.time}</span>
                    <span className={`font-medium ${
                      log.type === 'success' ? 'text-green-600' :
                      log.type === 'error' ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
