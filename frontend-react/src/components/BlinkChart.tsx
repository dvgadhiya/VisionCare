import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

export function BlinkChart({ data }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Blink Rate History
        </CardTitle>
        <CardDescription>
          Real-time tracking of blink rate and EAR values
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis 
                  dataKey="time" 
                  className="text-xs"
                  tick={{ fill: '#6b7280' }}
                />
                <YAxis 
                  yAxisId="left"
                  className="text-xs"
                  tick={{ fill: '#6b7280' }}
                  label={{ value: 'Blinks/Min', angle: -90, position: 'insideLeft' }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  className="text-xs"
                  tick={{ fill: '#6b7280' }}
                  label={{ value: 'EAR', angle: 90, position: 'insideRight' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="blinks" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  dot={{ fill: '#6366f1', r: 3 }}
                  name="Blinks/Min"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="ear" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ fill: '#10b981', r: 3 }}
                  name="EAR Value"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p>Start camera to see blink rate data</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
