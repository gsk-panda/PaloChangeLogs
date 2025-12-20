import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DailyStat } from '../types';
import { getMSTDate } from '../utils/dateUtils';

interface StatsChartProps {
  data: DailyStat[];
  selectedDate?: string;
  onDateSelect?: (date: string) => void;
}

const StatsChart: React.FC<StatsChartProps> = ({ data, selectedDate, onDateSelect }) => {
  const handleClick = (state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
      const clickedData = state.activePayload[0].payload;
      if (onDateSelect) {
        onDateSelect(clickedData.date);
      }
    }
  };

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          onClick={handleClick}
          margin={{
            top: 10,
            right: 10,
            left: -20,
            bottom: 0,
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }} 
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            tickFormatter={(value) => {
              try {
                const [year, month, day] = value.split('-').map(Number);
                const d = new Date(year, month - 1, day);
                return new Intl.DateTimeFormat('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                }).format(d);
              } catch (e) {
                return value;
              }
            }}
          />
          <YAxis 
            tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 500 }} 
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            cursor={{ fill: '#1e293b' }}
            contentStyle={{ 
              borderRadius: '8px', 
              border: '1px solid #334155', 
              backgroundColor: '#0f172a',
              color: '#e2e8f0',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)',
              padding: '8px 12px',
              fontSize: '12px'
            }}
            itemStyle={{ color: '#e2e8f0' }}
            labelFormatter={(label) => {
              const d = getMSTDate(label);
              return new Intl.DateTimeFormat('en-US', { 
                timeZone: 'America/Denver',
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              }).format(d);
            }}
          />
          <Bar dataKey="changes" radius={[4, 4, 0, 0]} barSize={40}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.date === selectedDate ? '#f97316' : '#475569'} 
                className="transition-all duration-300 hover:opacity-80"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StatsChart;