import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';

export function StatsCard({ title, value, icon, subtitle, trend, trendValue, badge }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">
          {title}
        </CardTitle>
        <div className="text-gray-400">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {value}
              {badge && badge}
            </div>
            {subtitle && (
              <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-2">
                {trend === 'up' ? (
                  <ArrowUpIcon className="h-3 w-3 text-green-500" />
                ) : trend === 'down' ? (
                  <ArrowDownIcon className="h-3 w-3 text-red-500" />
                ) : null}
                <span className="text-xs text-gray-600">{trendValue}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
