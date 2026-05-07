import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Mic, MicOff, X, Volume2, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GeminiLiveVoiceProps {
  onClose: () => void;
  systemInstruction?: string;
}

export const GeminiLiveVoice: React.FC<GeminiLiveVoiceProps> = ({ onClose, systemInstruction }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);

  const startSession = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            startMicrophone();
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const binary = atob(base64Audio);
              const buffer = new Int16Array(binary.length / 2);
              for (let i = 0; i < buffer.length; i++) {
                buffer[i] = (binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8));
              }
              audioQueueRef.current.push(buffer);
              if (!isPlayingRef.current) {
                processAudioQueue();
              }
            }

            // Handle transcription
            const modelText = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (modelText) {
              setTranscript(prev => [...prev, { role: 'model', text: modelText }]);
            }

            const interrupt = message.serverContent?.interrupted;
            if (interrupt) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Connection error. Please check your API key and network.");
            stopSession();
          },
          onclose: () => {
            stopSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: systemInstruction || "You are a helpful assistant.",
        },
      });
      
      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to connect to Gemini Live:", err);
      setError("Failed to initialize session.");
      setIsConnecting(false);
    }
  };

  const startMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        // Convert to Base64
        const uint8 = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Data = btoa(binary);
        
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setError("Microphone access denied.");
    }
  };

  const processAudioQueue = async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const pcmData = audioQueueRef.current.shift()!;
    
    const audioBuffer = audioContextRef.current.createBuffer(1, pcmData.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < pcmData.length; i++) {
      channelData[i] = pcmData[i] / 32768.0;
    }
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      processAudioQueue();
    };
    source.start();
  };

  const stopSession = () => {
    setIsActive(false);
    setIsConnecting(false);
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (sessionRef.current) {
      // sessionRef.current.close() might be needed if SDK supports it directly
      sessionRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  useEffect(() => {
    return () => stopSession();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
    >
      <div className="w-full max-w-lg bg-surface border border-border rounded-sm shadow-2xl flex flex-col overflow-hidden relative aspect-[4/5] sm:aspect-auto sm:h-[600px]">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-bg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/20 rounded-sm">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-text-primary">Gemini Live</h3>
              <p className="text-[10px] text-text-secondary uppercase font-bold tracking-tighter">Real-time Voice Conversation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-hover rounded-full transition-colors text-text-secondary">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Visualizer Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-12 relative">
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* Animated Rings */}
            <AnimatePresence>
              {isActive && (
                <>
                  <motion.div 
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1.5, opacity: 0.1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                    className="absolute inset-0 bg-accent rounded-full"
                  />
                  <motion.div 
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 2, opacity: 0.05 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeOut", delay: 0.5 }}
                    className="absolute inset-0 bg-accent rounded-full"
                  />
                </>
              )}
            </AnimatePresence>
            
            {/* Main Microphone Button */}
            <button 
              onClick={isActive ? stopSession : startSession}
              disabled={isConnecting}
              className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 z-10 ${
                isActive 
                  ? 'bg-accent text-bg shadow-[0_0_50px_rgba(var(--color-accent-rgb),0.5)] scale-110' 
                  : 'bg-surface border-4 border-border text-text-secondary hover:border-accent/40 scale-100'
              }`}
            >
              {isConnecting ? (
                <Loader2 className="w-12 h-12 animate-spin" />
              ) : isActive ? (
                <Mic className="w-12 h-12" />
              ) : (
                <MicOff className="w-12 h-12" />
              )}
            </button>
          </div>
          
          <div className="mt-12 text-center">
            <h4 className={`text-xl font-serif mb-2 transition-colors duration-500 ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
              {isConnecting ? 'Connecting...' : isActive ? 'Listening & Speaking' : 'Ready to Talk?'}
            </h4>
            <p className="text-xs text-text-secondary uppercase tracking-[0.2em] font-bold">
              {isActive ? 'Tap to end session' : 'Tap to start live route optimization'}
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mt-8 p-3 bg-red-500/10 border border-red-500/20 rounded-sm text-red-500 text-[10px] uppercase font-bold tracking-widest text-center"
            >
              {error}
            </motion.div>
          )}
        </div>

        {/* Audio Indicator */}
        <div className="p-6 bg-bg border-t border-border mt-auto">
          <div className="flex items-center gap-4 text-text-secondary">
            <Volume2 className={`w-4 h-4 ${isPlayingRef.current ? 'text-accent' : 'opacity-30'}`} />
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <motion.div 
                animate={{ 
                  width: isPlayingRef.current ? ['0%', '100%'] : '0%',
                }}
                transition={{ repeat: Infinity, duration: 1 }}
                className="h-full bg-accent"
              />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {isPlayingRef.current ? 'Assistant Speaking' : 'Idle'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
