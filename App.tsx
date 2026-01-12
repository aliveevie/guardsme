import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import VideoFeed, { VideoFeedHandle } from './components/VideoFeed';
import ReasoningHUD from './components/ReasoningHUD';
import { SystemLog, ThreatLevel, DeepScanResult } from './types';
import { performDeepScan } from './services/geminiService';
import { decode, decodeAudioData, encode, float32ToInt16 } from './services/audioUtils';
import { playAlertSound } from './services/soundUtils';
import { Eye, Brain, Play, Square, ShieldAlert, CheckCircle, Loader2, Clock, FileText, AlertTriangle, RotateCcw, Lock, Camera, Trash2, Save, UserCheck, KeyRound } from 'lucide-react';

const SYSTEM_INSTRUCTION = `You are GuardsME, an Autonomous Forensic Monitoring Agent.

CORE OBJECTIVE:
Secure the terminal against unauthorized physical access.

PROTOCOL:
1.  **BASELINE**: The individual initially authorized is the "Principal".
2.  **MONITORING**: 
    -   Principal Present: "Status: Authorized. Principal Verified."
    -   Room Empty: "Status: Secure. Terminal Vacant."
    -   Unknown Subject: "ALERT: Unauthorized Biometric Detected."
3.  **ESCALATION LOGIC**:
    -   Unknown subject approaches -> "WARNING: Unidentified subject in proximity."
    -   Unknown subject interacts with inputs -> "DANGER: Unauthorized peripheral interaction detected."

VOICE STYLE:
Formal, military-grade brevity.`;

type PatrolState = 'IDLE' | 'BASELINE' | 'REVIEW' | 'ACTIVE' | 'AUTH' | 'SUMMARY';

interface EvidenceItem {
    id: string;
    timestamp: string;
    image: string; // base64
    type: 'SNAPSHOT' | 'INTRUSION';
}

const App: React.FC = () => {
  const [patrolState, setPatrolState] = useState<PatrolState>('IDLE');
  const [threatLevel, setThreatLevel] = useState<ThreatLevel>(ThreatLevel.SAFE);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [volume, setVolume] = useState(0);
  
  // Baseline Data
  const [baselineData, setBaselineData] = useState<DeepScanResult | null>(null);
  const [baselineImage, setBaselineImage] = useState<string | null>(null);
  
  // Session Stats
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [sessionStats, setSessionStats] = useState({ threats: 0, deepScans: 0 });
  const [sessionDuration, setSessionDuration] = useState<string>("00:00");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  
  // Auth State
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const videoRef = useRef<VideoFeedHandle>(null);
  const sessionRef = useRef<any>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const addLog = useCallback((message: string, source: 'PERCEPTION' | 'REASONING' | 'SYSTEM' = 'SYSTEM') => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      source,
      level: 'info'
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  const captureEvidence = useCallback(() => {
    if (videoRef.current) {
        const frame = videoRef.current.captureFrame();
        if (frame) {
            const newEvidence: EvidenceItem = {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: new Date().toLocaleTimeString(),
                image: frame,
                type: 'INTRUSION'
            };
            setEvidence(prev => {
                // Determine if we should add based on existing timestamps to avoid spam
                const lastItem = prev[prev.length - 1];
                if (lastItem && (Date.now() - new Date(lastItem.timestamp).getTime() < 2000)) {
                    return prev;
                }
                if (prev.length >= 8) return prev; // Cap evidence
                return [...prev, newEvidence];
            });
            addLog("EVIDENCE SECURED: Intrusion Snapshot Stored", "SYSTEM");
        }
    }
  }, [addLog]);

  const handleAgentPerception = useCallback((text: string) => {
    const upperText = text.toUpperCase();
    
    if (upperText.includes("DANGER") || upperText.includes("UNAUTHORIZED") || upperText.includes("INTRUDER") || upperText.includes("ACCESS ATTEMPT")) {
      setThreatLevel(ThreatLevel.DANGER);
      playAlertSound();
      setSessionStats(prev => ({...prev, threats: prev.threats + 1}));
      captureEvidence(); 
    } else if (upperText.includes("WARNING") || upperText.includes("CAUTION") || upperText.includes("UNKNOWN")) {
      setThreatLevel(ThreatLevel.CAUTION);
    } else if (upperText.includes("SAFE") || upperText.includes("VERIFIED") || upperText.includes("SECURE") || upperText.includes("AUTHORIZED")) {
      setThreatLevel(ThreatLevel.SAFE);
    }
    
    if (text.length > 5) {
        addLog(text, "PERCEPTION");
    }
  }, [addLog, captureEvidence]);

  const handleStreamReady = async (stream: MediaStream) => {
      streamRef.current = stream;
      if (patrolState === 'BASELINE') {
          setTimeout(async () => {
              await captureBaseline();
          }, 1000);
      }
  };

  const captureBaseline = async () => {
      if (!videoRef.current) return;
      
      addLog("INITIATING BASELINE BIOMETRIC SCAN...", "SYSTEM");
      const frame = videoRef.current.captureFrame();
      if (!frame) return;

      try {
          const result = await performDeepScan(frame);
          setBaselineData(result);
          setBaselineImage(frame); // Store the image for confirmation
          setPatrolState('REVIEW');
          addLog("BASELINE ESTABLISHED. AWAITING CONFIRMATION.", "SYSTEM");
      } catch (e) {
          console.error("Baseline failed", e);
          setPatrolState('IDLE');
          alert("Failed to capture baseline. Please try again.");
      }
  };

  const authorizeAndStart = () => {
      if (!streamRef.current) return;
      setPatrolState('ACTIVE');
      setSessionStartTime(Date.now());
      setSessionStats({ threats: 0, deepScans: 0 });
      setEvidence([]); // Clear old evidence
      addLog("SYSTEM LOCKED. MONITORING ACTIVE.", "SYSTEM");
      connectLiveAgent(streamRef.current);
  };

  const connectLiveAgent = async (stream: MediaStream) => {
    try {
        if (!process.env.API_KEY) {
            alert("API Key missing! Please check environment.");
            return;
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        const inputCtx = inputAudioContextRef.current;
        const outputCtx = outputAudioContextRef.current;

        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: SYSTEM_INSTRUCTION,
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                },
                outputAudioTranscription: { model: "gemini-2.5-flash-native-audio-preview-12-2025" }
            },
            callbacks: {
                onopen: () => {
                    addLog("LIVE SENTRY ACTIVE", "SYSTEM");
                    const source = inputCtx.createMediaStreamSource(stream);
                    const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                    processor.onaudioprocess = (e) => {
                        if (inputCtx.state === 'closed') return;
                        const inputData = e.inputBuffer.getChannelData(0);
                        const vol = inputData.reduce((acc, val) => acc + Math.abs(val), 0) / inputData.length;
                        setVolume(vol * 5); 
                        const pcmData = float32ToInt16(inputData);
                        sessionPromise.then(session => {
                            session.sendRealtimeInput({ media: { data: encode(new Uint8Array(pcmData.buffer)), mimeType: 'audio/pcm;rate=16000' } });
                        });
                    };
                    source.connect(processor);
                    processor.connect(inputCtx.destination);
                },
                onmessage: async (msg: LiveServerMessage) => {
                    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData && outputCtx && outputCtx.state !== 'closed') {
                        const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000);
                        const source = outputCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputCtx.destination);
                        source.start(Math.max(outputCtx.currentTime, nextStartTimeRef.current));
                        nextStartTimeRef.current = Math.max(outputCtx.currentTime, nextStartTimeRef.current) + audioBuffer.duration;
                    }
                    if (msg.serverContent?.outputTranscription?.text) {
                        handleAgentPerception(msg.serverContent.outputTranscription.text);
                    }
                },
                onclose: () => addLog("Connection Closed", "SYSTEM"),
                onerror: (e) => console.error("Gemini Live API Error:", e)
            }
        });
        
        sessionPromise.then(session => sessionRef.current = session).catch(() => setPatrolState('IDLE'));

        if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = window.setInterval(async () => {
             if (videoRef.current && sessionRef.current) {
                 const base64Frame = videoRef.current.captureFrame();
                 if (base64Frame) {
                     sessionRef.current.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64Frame } });
                 }
             }
        }, 500);

    } catch (e) {
        console.error("Failed to connect", e);
        setPatrolState('IDLE');
    }
  };

  const lockSystem = () => {
    // Calculate Duration
    if (sessionStartTime > 0) {
        const diff = Date.now() - sessionStartTime;
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setSessionDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }

    addLog("SYSTEM LOCKED. AUTHENTICATION REQUIRED.", "SYSTEM");
    if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    if (sessionRef.current) {
        try {
            // @ts-ignore
            sessionRef.current.close();
        } catch (e) {}
        sessionRef.current = null;
    }
    
    // Go to Auth Screen instead of Summary directly
    setPatrolState('AUTH');
    setThreatLevel(ThreatLevel.SAFE);
  };

  const handleAuthSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setAuthError(null);
      
      const formData = new FormData(e.currentTarget);
      const password = formData.get('password') as string;

      if (!password || password.length < 1) {
          setAuthError("Password required.");
          return;
      }

      setIsVerifying(true);

      // 1. Biometric Check using Gemini
      if (!videoRef.current || !baselineData) {
          setAuthError("Camera error. Cannot verify biometrics.");
          setIsVerifying(false);
          return;
      }

      const frame = videoRef.current.captureFrame();
      if (!frame) {
          setAuthError("Camera obstruction. Face verification failed.");
          setIsVerifying(false);
          return;
      }

      try {
          // Ask Gemini to compare current face with baseline analysis
          const result = await performDeepScan(frame, baselineData.analysis);
          
          if (result.threatLevel === ThreatLevel.SAFE) {
              // Success
              setPatrolState('SUMMARY');
          } else {
              setAuthError("Biometric Mismatch. Access Denied.");
          }
      } catch (err) {
          setAuthError("Verification service unavailable.");
      } finally {
          setIsVerifying(false);
      }
  };

  const discardAndClose = () => {
      if (confirm("Permanently discard all collected evidence and logs?")) {
          resetSystem();
      }
  };

  const saveAndClose = () => {
      alert("Evidence bundle encrypted and archived locally.");
      resetSystem();
  };

  const resetSystem = () => {
      setPatrolState('IDLE');
      setBaselineData(null);
      setBaselineImage(null);
      setLogs([]);
      setEvidence([]);
  };

  const handleDeepScan = async () => {
      if (!videoRef.current) return;
      setThreatLevel(ThreatLevel.ANALYZING);
      setSessionStats(prev => ({...prev, deepScans: prev.deepScans + 1}));
      addLog("INITIATING MANUAL IDENTITY VERIFICATION...", "SYSTEM");
      const frame = videoRef.current.captureFrame();
      if (!frame) return;
      
      const result = await performDeepScan(frame);
      setThreatLevel(result.threatLevel);
      addLog(result.analysis, "REASONING");
      if (result.threatLevel === ThreatLevel.DANGER) {
          playAlertSound();
          captureEvidence();
      }
  };

  useEffect(() => {
    return () => {
        // Cleanup if component unmounts
    };
  }, []);

  return (
    <div className={`relative w-full h-screen bg-black overflow-hidden flex flex-col transition-colors duration-500 ${threatLevel === ThreatLevel.DANGER ? 'ring-8 ring-inset ring-red-600' : ''}`}>
      
      {/* Background: Video Feed - Active in most states except Summary/Idle if desired, but good to keep active for Auth */}
      <div className="absolute inset-0 z-0">
         <VideoFeed 
            ref={videoRef} 
            onStreamReady={handleStreamReady}
            isActive={['BASELINE', 'REVIEW', 'ACTIVE', 'AUTH'].includes(patrolState)} 
         />
      </div>

      {/* Danger Overlay Flash */}
      <div className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-200 ${threatLevel === ThreatLevel.DANGER ? 'bg-red-900/40 animate-pulse' : 'opacity-0'}`}></div>

      {/* Baseline Review Overlay */}
      {patrolState === 'REVIEW' && baselineData && baselineImage && (
          <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
              <div className="max-w-4xl w-full bg-gray-900 border border-blue-500/50 rounded-2xl p-8 shadow-2xl flex gap-8">
                  {/* Image Column */}
                  <div className="w-1/2">
                      <h3 className="text-blue-400 font-mono text-xs uppercase tracking-widest mb-2">Baseline Snapshot</h3>
                      <img src={`data:image/jpeg;base64,${baselineImage}`} className="w-full rounded-xl border border-white/20 shadow-lg" alt="Baseline" />
                      <div className="mt-4 p-4 bg-blue-900/20 rounded-lg border border-blue-500/20">
                          <p className="text-blue-300 text-xs text-center font-mono">
                              Ensure this image clearly shows YOUR face. <br/>This will be used for biometric unlock.
                          </p>
                      </div>
                  </div>

                  {/* Info Column */}
                  <div className="w-1/2 flex flex-col">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="bg-blue-500/20 p-3 rounded-full">
                            <Lock className="w-8 h-8 text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">Baseline Captured</h2>
                            <p className="text-gray-400 text-sm">Forensic profile established.</p>
                        </div>
                    </div>

                    <div className="bg-black/50 rounded-xl p-6 mb-8 border border-white/10 flex-1 overflow-y-auto">
                        <h3 className="text-blue-400 font-mono text-xs uppercase tracking-widest mb-4">Identity Matrix</h3>
                        <div className="space-y-4 text-gray-200 leading-relaxed font-mono text-sm whitespace-pre-line">
                            {baselineData.analysis}
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button 
                            onClick={() => {
                                setPatrolState('IDLE');
                                setBaselineData(null);
                                setBaselineImage(null);
                            }}
                            className="flex-1 py-4 rounded-xl border border-white/20 text-gray-400 hover:bg-white/5 transition-colors font-semibold uppercase tracking-wider text-sm"
                        >
                            Retake
                        </button>
                        <button 
                            onClick={authorizeAndStart}
                            className="flex-1 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all transform hover:scale-[1.02] shadow-lg shadow-blue-900/50 uppercase tracking-wider text-sm"
                        >
                            Confirm Identity
                        </button>
                    </div>
                  </div>
              </div>
          </div>
      )}

      {/* AUTH SCREEN (Lock Screen) */}
      {patrolState === 'AUTH' && (
          <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="max-w-md w-full bg-gray-900 border border-red-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse"></div>
                  
                  <div className="text-center mb-8">
                      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/50">
                          <Lock className="w-10 h-10 text-red-500" />
                      </div>
                      <h2 className="text-2xl font-bold text-white tracking-widest uppercase">System Locked</h2>
                      <p className="text-red-400 font-mono text-sm mt-2">Biometric & Credential Verification Required</p>
                  </div>

                  <form onSubmit={handleAuthSubmit} className="space-y-6">
                      <div>
                          <label className="block text-gray-500 text-xs uppercase tracking-widest mb-2">Device Password</label>
                          <div className="relative">
                              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                              <input 
                                name="password" 
                                type="password" 
                                className="w-full bg-black/50 border border-white/20 rounded-lg py-4 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono"
                                placeholder="Enter system password..."
                                autoFocus
                              />
                          </div>
                      </div>

                      {authError && (
                          <div className="bg-red-900/20 border border-red-500/20 p-3 rounded-lg flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                              <span className="text-red-400 text-xs font-bold">{authError}</span>
                          </div>
                      )}

                      <button 
                        type="submit" 
                        disabled={isVerifying}
                        className="w-full bg-white text-black font-bold py-4 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                          {isVerifying ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="uppercase tracking-widest text-sm">Verifying Biometrics...</span>
                              </>
                          ) : (
                              <>
                                <UserCheck className="w-5 h-5" />
                                <span className="uppercase tracking-widest text-sm">Unlock System</span>
                              </>
                          )}
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* SUMMARY DASHBOARD */}
      {patrolState === 'SUMMARY' && (
           <div className="absolute inset-0 z-40 bg-black flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
               <div className="max-w-6xl w-full h-full flex flex-col justify-center">
                   <div className="text-center mb-8">
                       <h1 className="text-4xl font-bold text-white mb-2 tracking-tighter uppercase">Incident Report</h1>
                       <p className="text-gray-400 font-mono">SESSION ID: {Math.random().toString(36).substr(2, 6).toUpperCase()} • DURATION: {sessionDuration}</p>
                   </div>

                   <div className="flex flex-col lg:flex-row gap-8 mb-8 h-[60vh]">
                       {/* Stats Column */}
                       <div className="w-full lg:w-1/4 flex flex-col gap-4">
                           <div className="bg-gray-900/50 border border-white/10 p-6 rounded-2xl text-center flex-1 flex flex-col justify-center">
                               <AlertTriangle className={`w-10 h-10 mx-auto mb-4 ${sessionStats.threats > 0 ? 'text-red-500' : 'text-green-500'}`} />
                               <div className="text-5xl font-mono font-bold text-white mb-2">{sessionStats.threats}</div>
                               <div className="text-xs text-gray-500 uppercase tracking-widest">Security Breaches</div>
                           </div>
                           <div className="bg-gray-900/50 border border-white/10 p-6 rounded-2xl text-center flex-1 flex flex-col justify-center">
                               <Eye className="w-10 h-10 mx-auto mb-4 text-blue-400" />
                               <div className="text-2xl font-bold text-white mb-2">{evidence.length}</div>
                               <div className="text-xs text-gray-500 uppercase tracking-widest">Forensic Snapshots</div>
                           </div>
                       </div>

                       {/* Evidence Gallery */}
                       <div className="w-full lg:w-3/4 bg-gray-900/30 border border-white/10 rounded-2xl p-6 overflow-hidden flex flex-col">
                           <h3 className="text-gray-300 font-bold uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-white/10 pb-4">
                               <Camera className="w-4 h-4" /> Evidence Log
                           </h3>
                           <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
                               {evidence.length === 0 ? (
                                   <div className="h-full flex items-center justify-center flex-col text-gray-600 gap-4">
                                       <CheckCircle className="w-12 h-12 opacity-20" />
                                       <span className="italic">No unauthorized activity detected during session.</span>
                                   </div>
                               ) : (
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {evidence.map((item) => (
                                            <div key={item.id} className="bg-black/60 rounded-xl overflow-hidden border border-red-500/20 group hover:border-red-500/50 transition-colors">
                                                <div className="relative h-48">
                                                    <img src={`data:image/jpeg;base64,${item.image}`} alt="Evidence" className="w-full h-full object-cover" />
                                                    <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                                                        Intrusion
                                                    </div>
                                                </div>
                                                <div className="p-4">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-red-400 font-bold text-xs uppercase tracking-wider">Unauthorized Access</span>
                                                        <span className="text-gray-500 text-xs font-mono">{item.timestamp}</span>
                                                    </div>
                                                    <p className="text-gray-400 text-xs">Evidence ID: {item.id}</p>
                                                </div>
                                            </div>
                                        ))}
                                   </div>
                               )}
                           </div>
                       </div>
                   </div>

                   <div className="flex justify-center gap-6">
                       <button 
                           onClick={discardAndClose}
                           className="bg-red-900/10 border border-red-500/30 text-red-400 hover:bg-red-900/30 font-bold py-4 px-8 rounded-xl flex items-center gap-2 transition-colors uppercase tracking-widest text-sm"
                       >
                           <Trash2 className="w-5 h-5" />
                           Secure Delete
                       </button>
                       <button 
                           onClick={saveAndClose}
                           className="bg-white text-black font-bold py-4 px-12 rounded-xl flex items-center gap-2 hover:bg-gray-200 transition-colors shadow-lg shadow-white/10 uppercase tracking-widest text-sm"
                       >
                           <Save className="w-5 h-5" />
                           Archive Evidence
                       </button>
                   </div>
               </div>
           </div>
      )}

      {/* Loading State */}
      {patrolState === 'BASELINE' && (
          <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
              <h2 className="text-2xl font-mono text-blue-500 tracking-widest animate-pulse">ACQUIRING BIOMETRICS...</h2>
              <p className="text-gray-400 mt-2 font-mono text-sm">Hold still for forensic capture</p>
          </div>
      )}

      {/* HUD (Only visible in ACTIVE mode) */}
      <div className="relative z-10 w-full h-full pointer-events-none">
        {patrolState === 'ACTIVE' ? (
             <ReasoningHUD 
                logs={logs} 
                threatLevel={threatLevel} 
                audioVolume={volume}
             />
        ) : patrolState === 'IDLE' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 pointer-events-auto backdrop-blur-sm">
                <div className="text-center space-y-6 max-w-md px-6">
                    <div className="flex justify-center">
                        <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center border-2 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                            <Lock className="w-12 h-12 text-blue-500" />
                        </div>
                    </div>
                    <h1 className="text-4xl font-bold tracking-tighter text-white">GuardsME</h1>
                    <p className="text-gray-400">
                        Autonomous System Monitor.<br/>
                        <span className="text-sm opacity-70">Secure your terminal while you are away.</span>
                    </p>
                    <button 
                        onClick={() => setPatrolState('BASELINE')}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-10 rounded-full transition-all transform hover:scale-105 flex items-center gap-2 mx-auto shadow-lg shadow-blue-900/50 uppercase tracking-widest"
                    >
                        <Play className="fill-current w-5 h-5" />
                        Start Protocol
                    </button>
                    <p className="text-[10px] text-gray-600 pt-8 uppercase tracking-widest font-mono">
                        Identity Verification • Intrusion Detection • Evidence Capture
                    </p>
                </div>
            </div>
        )}
      </div>

      {/* Control Deck */}
      {patrolState === 'ACTIVE' && (
          <div className="absolute bottom-8 left-0 right-0 z-20 flex justify-center gap-4 pointer-events-auto">
              <button 
                onClick={handleDeepScan}
                disabled={threatLevel === ThreatLevel.ANALYZING}
                className={`
                    backdrop-blur-md border border-white/20 text-white font-mono text-sm py-3 px-6 rounded-lg 
                    flex items-center gap-2 transition-all shadow-lg uppercase tracking-wider
                    ${threatLevel === ThreatLevel.ANALYZING ? 'bg-blue-600/50' : 'bg-black/60 hover:bg-white/10'}
                `}
              >
                  <Brain className={threatLevel === ThreatLevel.ANALYZING ? 'animate-pulse' : ''} />
                  {threatLevel === ThreatLevel.ANALYZING ? 'Processing...' : 'Verify Subject'}
              </button>
              
              <button 
                onClick={lockSystem}
                className="bg-red-900/80 hover:bg-red-800 text-white p-3 rounded-lg backdrop-blur-md border border-red-500/50 shadow-lg"
              >
                  <Square className="fill-current w-5 h-5" />
              </button>
          </div>
      )}
    </div>
  );
};

export default App;