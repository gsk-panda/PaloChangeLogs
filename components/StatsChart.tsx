import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DailyStat } from '../types';

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
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          onClick={handleClick}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="date" 
            tick={{ fill: '#64748b', fontSize: 10 }} 
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => {
              const d = new Date(value);
              return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }}
          />
          <YAxis 
            tick={{ fill: '#64748b', fontSize: 12 }} 
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            cursor={{ fill: '#f1f5f9' }}
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            labelFormatter={(label) => {
              return new Date(label).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
            }}
          />
          <Bar dataKey="changes" radius={[4, 4, 0, 0]} barSize={30}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.date === selectedDate ? '#ea580c' : '#f97316'} 
                className="transition-all duration-300"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StatsChart;