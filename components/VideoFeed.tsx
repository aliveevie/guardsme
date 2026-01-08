import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface VideoFeedProps {
  onStreamReady: (stream: MediaStream) => void;
  isActive: boolean;
}

export interface VideoFeedHandle {
  captureFrame: () => string | null;
}

const VideoFeed = forwardRef<VideoFeedHandle, VideoFeedProps>(({ onStreamReady, isActive }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      if (!videoRef.current || !canvasRef.current) return null;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return null;

      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Return base64 string without the data prefix for API consumption
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.7);
      return dataUrl.split(',')[1];
    }
  }));

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment', // Prefer back camera for safety apps
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          onStreamReady(stream);
        }
      } catch (err) {
        console.error("Error accessing media devices:", err);
      }
    };

    if (isActive) {
      startCamera();
    }

    return () => {
        // Cleanup logic could go here, but for this SPA we usually keep camera hot
    };
  }, [isActive, onStreamReady]);

  return (
    <div className="relative w-full h-full bg-black">
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        muted 
        className="w-full h-full object-cover opacity-80"
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* HUD Reticle Overlay */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-64 h-64 border border-white/20 rounded-lg relative">
           <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-green-500"></div>
           <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-green-500"></div>
           <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-green-500"></div>
           <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-green-500"></div>
           <div className="absolute inset-0 flex items-center justify-center">
             <div className="w-2 h-2 bg-green-500/50 rounded-full animate-pulse"></div>
           </div>
        </div>
      </div>
      
      {/* Scan line effect */}
      <div className="scan-line"></div>
    </div>
  );
});

VideoFeed.displayName = 'VideoFeed';
export default VideoFeed;