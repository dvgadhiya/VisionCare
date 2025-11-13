import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Settings } from 'lucide-react';

export function CameraControls({ fps, quality, onFpsChange, onQualityChange }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Camera Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="fps" className="text-sm">
            Frame Rate: <span className="font-semibold">{fps} FPS</span>
          </Label>
          <input
            id="fps"
            type="range"
            min="1"
            max="30"
            value={fps}
            onChange={(e) => onFpsChange(Number(e.target.value))}
            className="w-full mt-2"
          />
        </div>
        
        <div>
          <Label htmlFor="quality" className="text-sm">
            Quality: <span className="font-semibold">{quality}%</span>
          </Label>
          <input
            id="quality"
            type="range"
            min="30"
            max="100"
            value={quality}
            onChange={(e) => onQualityChange(Number(e.target.value))}
            className="w-full mt-2"
          />
        </div>
      </CardContent>
    </Card>
  );
}
