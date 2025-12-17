import React from 'react';
import { LayoutDashboard, Server, ShieldAlert, Settings, Activity } from 'lucide-react';

const Sidebar: React.FC = () => {
  return (
    <div className="w-20 md:w-64 bg-slate-900 text-white flex-shrink-0 flex flex-col h-screen sticky top-0">
      <div className="p-4 md:p-6 flex items-center justify-center md:justify-start gap-3 border-b border-slate-700">
        <div className="bg-orange-500 p-2 rounded-lg">
          <Activity size={24} className="text-white" />
        </div>
        <span className="hidden md:block font-bold text-lg tracking-tight">NetSentinel</span>
      </div>
      
      <nav className="flex-1 py-6 flex flex-col gap-2 px-2 md:px-4">
        <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active />
        <NavItem icon={<Server size={20} />} label="Device Groups" />
        <NavItem icon={<ShieldAlert size={20} />} label="Security Audits" />
        <div className="flex-1"></div>
        <NavItem icon={<Settings size={20} />} label="Settings" />
      </nav>

      <div className="p-4 border-t border-slate-700 hidden md:block">
        <div className="text-xs text-slate-400">Connected to:</div>
        <div className="text-sm font-semibold truncate">panorama-hq-primary.local</div>
      </div>
    </div>
  );
};

const NavItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean }> = ({ icon, label, active }) => (
  <button className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${active ? 'bg-orange-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
    {icon}
    <span className="hidden md:block text-sm font-medium">{label}</span>
  </button>
);

export default Sidebar;
