export const playAlertSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // Double beep pattern for attention without panic
    const now = ctx.currentTime;
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);

    // Second beep
    osc.frequency.setValueAtTime(600, now + 0.25);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.35);
    
    gain.gain.setValueAtTime(0, now + 0.25);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.3);
    gain.gain.linearRampToValueAtTime(0, now + 0.45);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.5);
  } catch (e) {
    console.error("Audio alert failed", e);
  }
};