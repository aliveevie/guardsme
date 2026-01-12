import React from 'react';
import { SystemLog, ThreatLevel } from '../types';
import { Activity, Lock, ShieldAlert, ShieldCheck, BrainCircuit, ScanLine } from 'lucide-react';

interface ReasoningHUDProps {
  logs: SystemLog[];
  threatLevel: ThreatLevel;
  audioVolume: number;
}

const ReasoningHUD: React.FC<ReasoningHUDProps> = ({ logs, threatLevel, audioVolume }) => {
  
  const getThemeColor = () => {
    switch (threatLevel) {
      case ThreatLevel.DANGER: return 'text-red-500 border-red-500 bg-red-950/80 shadow-[0_0_20px_rgba(220,38,38,0.5)]';
      case ThreatLevel.CAUTION: return 'text-amber-500 border-amber-500 bg-amber-950/60 shadow-[0_0_20px_rgba(245,158,11,0.3)]';
      case ThreatLevel.ANALYZING: return 'text-blue-400 border-blue-400 bg-blue-950/60';
      default: return 'text-blue-500 border-blue-500 bg-blue-950/40';
    }
  };

  const getStatusText = () => {
    switch (threatLevel) {
        case ThreatLevel.DANGER: return "UNAUTHORIZED ACCESS";
        case ThreatLevel.CAUTION: return "IDENTITY UNVERIFIED";
        case ThreatLevel.ANALYZING: return "VERIFYING IDENTITY";
        default: return "SYSTEM LOCKED";
    }
  };

  const getIcon = () => {
    switch (threatLevel) {
        case ThreatLevel.DANGER: return <ShieldAlert className="w-8 h-8 animate-bounce" />;
        case ThreatLevel.CAUTION: return <Activity className="w-8 h-8 animate-pulse" />;
        case ThreatLevel.ANALYZING: return <BrainCircuit className="w-8 h-8 animate-spin" />;
        default: return <Lock className="w-8 h-8" />;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 pb-32 safe-area-inset-bottom">
      
      {/* Top Bar: Status */}
      <div className={`flex items-center justify-between backdrop-blur-md p-4 rounded-lg border-l-4 transition-all duration-300 ${getThemeColor()}`}>
        <div className="flex items-center gap-4">
            {getIcon()}
            <div>
                <h2 className="font-bold text-xl tracking-widest uppercase">GuardsME</h2>
                <div className="text-xs opacity-90 font-mono flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${threatLevel === ThreatLevel.DANGER ? 'bg-red-400' : 'bg-blue-400'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${threatLevel === ThreatLevel.DANGER ? 'bg-red-500' : 'bg-blue-500'}`}></span>
                    </span>
                    {getStatusText()}
                </div>
            </div>
        </div>
        <div className="flex flex-col items-end">
             {/* Audio visualizer simulation */}
             <div className="flex items-end gap-1 h-8">
                {[...Array(5)].map((_, i) => (
                    <div 
                        key={i} 
                        className={`w-1 rounded-t-sm transition-all duration-75 ${threatLevel === ThreatLevel.DANGER ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ height: `${Math.max(15, Math.random() * (audioVolume * 150))}%` }}
                    />
                ))}
             </div>
             <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">Sentry Mode</span>
        </div>
      </div>

      {/* Radar Scan Effect (Only when SAFE) */}
      {threatLevel === ThreatLevel.SAFE && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-blue-500/10 rounded-full flex items-center justify-center">
             <div className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent animate-spin-slow opacity-30"></div>
             <ScanLine className="w-8 h-8 text-blue-500/20 animate-pulse" />
          </div>
      )}

      {/* Middle Right: System Logs (Matrix style) */}
      <div className="self-end w-full max-w-md flex flex-col gap-2 overflow-hidden items-end justify-end h-3/5 mask-image-gradient">
        {logs.slice(-8).map((log) => (
          <div key={log.id} className="bg-black/80 backdrop-blur-md p-3 rounded-l-lg border-r-4 border-white/20 text-right animate-in slide-in-from-right-10 fade-in duration-300 shadow-xl w-full">
            <div className="flex items-center justify-end gap-2 text-[10px] text-gray-500 font-mono uppercase mb-1">
               <span className={log.source === 'PERCEPTION' ? 'text-blue-400' : 'text-gray-500'}>{log.source}</span>
               <span>{log.timestamp}</span>
            </div>
            <p className={`text-sm font-medium shadow-black drop-shadow-md leading-relaxed whitespace-pre-wrap ${log.message.toUpperCase().includes("DANGER") || log.message.toUpperCase().includes("WARNING") ? 'text-red-400 font-bold border-red-500' : 'text-gray-200'}`}>
                {log.message}
            </p>
          </div>
        ))}
      </div>

    </div>
  );
};

export default ReasoningHUD;