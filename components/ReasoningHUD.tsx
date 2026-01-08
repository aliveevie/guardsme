import React from 'react';
import { SystemLog, ThreatLevel } from '../types';
import { Activity, Shield, ShieldAlert, ShieldCheck, BrainCircuit } from 'lucide-react';

interface ReasoningHUDProps {
  logs: SystemLog[];
  threatLevel: ThreatLevel;
  audioVolume: number;
}

const ReasoningHUD: React.FC<ReasoningHUDProps> = ({ logs, threatLevel, audioVolume }) => {
  
  const getThemeColor = () => {
    switch (threatLevel) {
      case ThreatLevel.DANGER: return 'text-red-500 border-red-500 bg-red-950/30';
      case ThreatLevel.CAUTION: return 'text-amber-500 border-amber-500 bg-amber-950/30';
      case ThreatLevel.ANALYZING: return 'text-blue-400 border-blue-400 bg-blue-950/30';
      default: return 'text-green-500 border-green-500 bg-green-950/30';
    }
  };

  const getIcon = () => {
    switch (threatLevel) {
        case ThreatLevel.DANGER: return <ShieldAlert className="w-8 h-8 animate-pulse" />;
        case ThreatLevel.CAUTION: return <Activity className="w-8 h-8" />;
        case ThreatLevel.ANALYZING: return <BrainCircuit className="w-8 h-8 animate-spin" />;
        default: return <ShieldCheck className="w-8 h-8" />;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 pb-32 safe-area-inset-bottom">
      
      {/* Top Bar: Status */}
      <div className={`flex items-center justify-between backdrop-blur-sm p-3 rounded-lg border-l-4 ${getThemeColor()}`}>
        <div className="flex items-center gap-3">
            {getIcon()}
            <div>
                <h2 className="font-bold text-lg tracking-wider">GuardsME</h2>
                <div className="text-xs opacity-80 font-mono">
                    STATUS: {threatLevel}
                </div>
            </div>
        </div>
        <div className="flex flex-col items-end">
             {/* Audio visualizer simulation */}
             <div className="flex items-end gap-1 h-8">
                {[...Array(5)].map((_, i) => (
                    <div 
                        key={i} 
                        className={`w-1 bg-current transition-all duration-75`}
                        style={{ height: `${Math.max(10, Math.random() * (audioVolume * 100))}%` }}
                    />
                ))}
             </div>
             <span className="text-xs font-mono uppercase">Live Audio</span>
        </div>
      </div>

      {/* Middle Right: System Logs (Matrix style) */}
      <div className="self-end w-2/3 max-w-sm flex flex-col gap-2 overflow-hidden items-end">
        {logs.slice(-4).map((log) => (
          <div key={log.id} className="bg-black/60 backdrop-blur-md p-2 rounded border-r-2 border-white/20 text-right animate-in slide-in-from-right-10 fade-in duration-300">
            <div className="flex items-center justify-end gap-2 text-[10px] text-gray-400 font-mono uppercase mb-1">
               <span>{log.source}</span>
               <span>{log.timestamp}</span>
            </div>
            <p className="text-sm font-medium text-white shadow-black drop-shadow-md leading-tight">
                {log.message}
            </p>
          </div>
        ))}
      </div>

    </div>
  );
};

export default ReasoningHUD;