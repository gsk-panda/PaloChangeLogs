import React from 'react';
import { LayoutDashboard, Activity } from 'lucide-react';

const Sidebar: React.FC = () => {
  return (
    <div className="w-20 md:w-64 bg-slate-950 text-slate-300 flex-shrink-0 flex flex-col h-screen sticky top-0 border-r border-slate-800 z-20">
      {/* Branding */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-orange-500 to-red-600 p-2 rounded-lg shadow-lg shadow-orange-900/20">
            <Activity size={20} className="text-white" />
          </div>
          <span className="hidden md:block font-bold text-lg tracking-wide text-white">
            PANO<span className="text-slate-500 font-light">VISION</span>
          </span>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 py-6 flex flex-col gap-1 px-3">
        <div className="px-3 mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wider hidden md:block">
          Overview
        </div>
        <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active />
      </nav>

      {/* Footer / Status */}
      <div className="p-4 border-t border-slate-800 bg-slate-950 hidden md:block">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse"></div>
          <div>
             <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Connected to</div>
             <div className="text-xs font-semibold text-slate-300 truncate max-w-[140px]" title="panorama.officeours.com">panorama.officeours.com</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const NavItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean }> = ({ icon, label, active }) => (
  <button className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
    active 
      ? 'bg-slate-900 text-white shadow-md border-l-2 border-orange-500' 
      : 'hover:bg-slate-900/50 hover:text-white border-l-2 border-transparent'
  }`}>
    <span className={`transition-colors ${active ? 'text-orange-500' : 'text-slate-500 group-hover:text-slate-300'}`}>
      {icon}
    </span>
    <span className="hidden md:block text-sm font-medium">{label}</span>
  </button>
);

export default Sidebar;