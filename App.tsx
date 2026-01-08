import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import VideoFeed, { VideoFeedHandle } from './components/VideoFeed';
import ReasoningHUD from './components/ReasoningHUD';
import { SystemLog, ThreatLevel } from './types';
import { performDeepScan } from './services/geminiService';
import { decode, decodeAudioData, encode, float32ToInt16 } from './services/audioUtils';
import { Eye, Brain, Play, Square } from 'lucide-react';

const SYSTEM_INSTRUCTION = `You are GuardsME, an autonomous personal safety agent. 
Your goal is to protect the user by analyzing their environment.
Keep your responses short, tactical, and calm.
If you see a threat, announce it clearly.
If the environment is safe, confirm it briefly.
Focus on movement, shadows, and people approaching.`;

const App: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [threatLevel, setThreatLevel] = useState<ThreatLevel>(ThreatLevel.SAFE);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [volume, setVolume] = useState(0);
  
  const videoRef = useRef<VideoFeedHandle>(null);
  const sessionRef = useRef<any>(null); // Live Session
  const videoIntervalRef = useRef<number | null>(null);
  
  // Audio Contexts for Live API
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

  const connectLiveAgent = async (stream: MediaStream) => {
    try {
        if (!process.env.API_KEY) {
            alert("API Key missing! Please check environment.");
            return;
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Setup Audio Contexts
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        const inputCtx = inputAudioContextRef.current;
        const outputCtx = outputAudioContextRef.current;

        // Initialize connection
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                systemInstruction: SYSTEM_INSTRUCTION,
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                }
            },
            callbacks: {
                onopen: () => {
                    addLog("Live Perception Agent Online", "SYSTEM");
                    setIsActive(true);
                    
                    // --- AUDIO INPUT STREAMING ---
                    const source = inputCtx.createMediaStreamSource(stream);
                    const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                    
                    processor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        // Visualize volume roughly
                        const vol = inputData.reduce((acc, val) => acc + Math.abs(val), 0) / inputData.length;
                        setVolume(vol * 5); // Amplify for visualization

                        const pcmData = float32ToInt16(inputData);
                        const pcmBlob = {
                            data: encode(new Uint8Array(pcmData.buffer)),
                            mimeType: 'audio/pcm;rate=16000'
                        };
                        
                        sessionPromise.then(session => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    
                    source.connect(processor);
                    processor.connect(inputCtx.destination);
                },
                onmessage: async (msg: LiveServerMessage) => {
                    // Handle Audio Output
                    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData && outputCtx) {
                        const audioBuffer = await decodeAudioData(
                            decode(audioData),
                            outputCtx,
                            24000
                        );
                        
                        const source = outputCtx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputCtx.destination);
                        
                        // Schedule seamless playback
                        const currentTime = outputCtx.currentTime;
                        const startTime = Math.max(currentTime, nextStartTimeRef.current);
                        source.start(startTime);
                        nextStartTimeRef.current = startTime + audioBuffer.duration;
                        
                        audioSourcesRef.current.add(source);
                        source.onended = () => audioSourcesRef.current.delete(source);
                    }
                    
                    // Handle Text Transcript (if any logging needed)
                    // Note: Native audio model mainly sends audio, but sometimes turnComplete has info
                    if (msg.serverContent?.turnComplete) {
                        // We could log interactions here
                    }
                },
                onclose: () => {
                    addLog("Connection Closed", "SYSTEM");
                    setIsActive(false);
                },
                onerror: (e) => {
                    console.error(e);
                    addLog("Connection Error", "SYSTEM");
                }
            }
        });
        
        sessionRef.current = sessionPromise;

        // --- VIDEO INPUT STREAMING (SIMULATED VIDEO STREAM) ---
        // Send a frame every 500ms (2 FPS) to keep bandwidth low but awareness high
        videoIntervalRef.current = window.setInterval(async () => {
             if (videoRef.current) {
                 const base64Frame = videoRef.current.captureFrame();
                 if (base64Frame) {
                     sessionPromise.then(session => {
                         session.sendRealtimeInput({
                             media: {
                                 mimeType: 'image/jpeg',
                                 data: base64Frame
                             }
                         });
                     });
                 }
             }
        }, 500);

    } catch (e) {
        console.error("Failed to connect", e);
        addLog("Initialization Failed", "SYSTEM");
    }
  };

  const stopAgent = () => {
    // Stop Video Loop
    if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }

    // Close Audio Contexts
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();

    // Close Session (we can't explicitly close the promise wrapper easily, 
    // but stopping input essentially kills the session usefulness)
    // In a real app we'd manage the socket closer
    setIsActive(false);
    setThreatLevel(ThreatLevel.SAFE);
  };

  const handleDeepScan = async () => {
      if (!videoRef.current) return;
      
      setThreatLevel(ThreatLevel.ANALYZING);
      addLog("Initiating Deep Spatial Reasoning...", "SYSTEM");
      
      const frame = videoRef.current.captureFrame();
      if (!frame) {
          addLog("Failed to capture frame", "SYSTEM");
          setThreatLevel(ThreatLevel.SAFE);
          return;
      }

      // Pause Live Input briefly or just let it run concurrently? 
      // Running concurrently is better for "Autonomous" feel.
      
      const result = await performDeepScan(frame);
      
      setThreatLevel(result.threatLevel);
      addLog(result.analysis, "REASONING");
      addLog(`ACTION: ${result.action}`, "REASONING");
      
      // If dangerous, maybe trigger a sound or flash the screen
      if (result.threatLevel === ThreatLevel.DANGER) {
          // Play warning sound (omitted for brevity)
      }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col">
      
      {/* Background: Video Feed */}
      <div className="absolute inset-0 z-0">
         <VideoFeed 
            ref={videoRef} 
            onStreamReady={connectLiveAgent}
            isActive={isActive} 
         />
      </div>

      {/* Foreground: HUD */}
      <div className="relative z-10 w-full h-full pointer-events-none">
        {isActive ? (
             <ReasoningHUD 
                logs={logs} 
                threatLevel={threatLevel} 
                audioVolume={volume}
             />
        ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 pointer-events-auto backdrop-blur-sm">
                <div className="text-center space-y-6 max-w-md px-6">
                    <div className="flex justify-center">
                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500 animate-pulse">
                            <Eye className="w-10 h-10 text-green-500" />
                        </div>
                    </div>
                    <h1 className="text-4xl font-bold tracking-tighter text-white">GuardsME</h1>
                    <p className="text-gray-400">
                        Autonomous Personal Protection Agent.<br/>
                        Powered by Gemini 3 Pro & Live Vision.
                    </p>
                    <button 
                        onClick={() => setIsActive(true)}
                        className="bg-green-600 hover:bg-green-500 text-black font-bold py-4 px-10 rounded-full transition-all transform hover:scale-105 flex items-center gap-2 mx-auto"
                    >
                        <Play className="fill-current" />
                        ACTIVATE SYSTEM
                    </button>
                    <p className="text-xs text-gray-600 pt-8">
                        WARNING: This is an AI demonstration. Do not rely on it for life-safety situations.
                    </p>
                </div>
            </div>
        )}
      </div>

      {/* Control Deck (Bottom Sticky) */}
      {isActive && (
          <div className="absolute bottom-8 left-0 right-0 z-20 flex justify-center gap-4 pointer-events-auto">
              <button 
                onClick={handleDeepScan}
                disabled={threatLevel === ThreatLevel.ANALYZING}
                className={`
                    backdrop-blur-md border border-white/20 text-white font-mono text-sm py-3 px-6 rounded-lg 
                    flex items-center gap-2 transition-all
                    ${threatLevel === ThreatLevel.ANALYZING ? 'bg-blue-600/50' : 'bg-black/60 hover:bg-white/10'}
                `}
              >
                  <Brain className={threatLevel === ThreatLevel.ANALYZING ? 'animate-pulse' : ''} />
                  {threatLevel === ThreatLevel.ANALYZING ? 'REASONING...' : 'DEEP SCAN'}
              </button>
              
              <button 
                onClick={stopAgent}
                className="bg-red-900/80 hover:bg-red-800 text-white p-3 rounded-lg backdrop-blur-md border border-red-500/50"
              >
                  <Square className="fill-current w-5 h-5" />
              </button>
          </div>
      )}
    </div>
  );
};

export default App;