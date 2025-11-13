import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

export function ActivityLog({ logs }) {
  const getLogIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getLogBadgeVariant = (type) => {
    switch (type) {
      case 'success':
        return 'default';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] w-full">
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No activity yet. Start the camera to begin.
              </p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  {getLogIcon(log.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{log.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{log.time}</p>
                  </div>
                  <Badge variant={getLogBadgeVariant(log.type)} className="shrink-0">
                    {log.type}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
