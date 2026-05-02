/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  Upload, 
  Play, 
  Volume2, 
  Waves, 
  Plus, 
  History, 
  Settings, 
  Info,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
  category: string;
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [clonedVoices, setClonedVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [inputText, setInputText] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clone' | 'generate'>('clone');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    checkHealth();
    fetchVoices();
  }, []);

  const checkHealth = async (retries = 3) => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHasApiKey(data.hasApiKey);
    } catch (err) {
      console.error('Health check failed', err);
      if (retries > 0) {
        setTimeout(() => checkHealth(retries - 1), 2000);
      }
    }
  };

  const fetchVoices = async (retries = 3) => {
    try {
      const res = await fetch('/api/voices');
      const data = await res.json();
      if (data.voices) {
        const clonedOnly = data.voices.filter((v: any) => v.category === 'cloned');
        setClonedVoices(clonedOnly);
        if (clonedOnly.length > 0 && !selectedVoiceId) {
          setSelectedVoiceId(clonedOnly[0].voice_id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch voices', err);
      if (retries > 0) {
        setTimeout(() => fetchVoices(retries - 1), 2000);
      }
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('File size too large. Max 10MB.');
        return;
      }
      setAudioBlob(file);
      setError(null);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError('Microphone access denied or not available.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClone = async () => {
    if (!audioBlob) return;
    setIsCloning(true);
    setError(null);

    const formData = new FormData();
    formData.append('audio', audioBlob, 'cloned_voice.wav');
    formData.append('name', `Clone ${new Date().toLocaleTimeString()}`);

    try {
      const res = await fetch('/api/clone-voice', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      await fetchVoices();
      setActiveTab('generate');
      setSelectedVoiceId(data.voice_id);
    } catch (err: any) {
      setError(err.message || 'Failed to clone voice');
    } finally {
      setIsCloning(false);
    }
  };

  const handleSynthesize = async () => {
    if (!selectedVoiceId || !inputText) return;
    setIsSynthesizing(true);
    setError(null);
    setGeneratedAudioUrl(null);

    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_id: selectedVoiceId, text: inputText })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Synthesis failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setGeneratedAudioUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to generate speech');
    } finally {
      setIsSynthesizing(false);
    }
  };

  if (hasApiKey === false) {
    return (
      <div className="min-h-screen bg-[#0F1115] text-[#E0E0E0] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-[#1A1D24] border border-[#2A2F3A] rounded-2xl p-8 text-center space-y-6">
          <AlertCircle className="w-16 h-16 text-orange-500 mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight">API Key Required</h1>
          <p className="text-[#8E9299]">
            To use AuraClone, you need an ElevenLabs API key. Please add 
            <code className="bg-[#0F1115] px-2 py-1 rounded mx-1 text-orange-400">ELEVENLABS_API_KEY</code> 
            to your Secrets in the AI Studio sidebar.
          </p>
          <div className="pt-4">
            <a 
              href="https://elevenlabs.io/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full transition-colors font-medium"
            >
              Get ElevenLabs Key <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1115] text-[#E0E0E0] font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-bottom border-[#1A1D24] p-4 flex items-center justify-between sticky top-0 bg-[#0F1115]/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
            <Waves className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tighter uppercase italic">AuraClone</h1>
        </div>
        <div className="flex items-center gap-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1D24] border border-[#2A2F3A] rounded-full text-[10px] font-mono tracking-widest uppercase text-[#8E9299]"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
            System {hasApiKey ? 'Online' : 'Offline'}
          </motion.div>
          <button className="p-2 text-[#8E9299] hover:text-white transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
        <div className="space-y-8">
          {/* Main Visual/Interface */}
          <section className="bg-[#151619] border border-[#2A2F3A] rounded-3xl overflow-hidden shadow-2xl">
            {/* Tabs */}
            <div className="flex border-bottom border-[#2A2F3A]">
              <button 
                onClick={() => setActiveTab('clone')}
                className={`flex-1 py-4 text-xs font-mono tracking-widest uppercase transition-colors ${activeTab === 'clone' ? 'bg-[#1A1D24] text-white border-b-2 border-orange-600' : 'text-[#8E9299] hover:text-white'}`}
              >
                01. Voice Capture
              </button>
              <button 
                onClick={() => setActiveTab('generate')}
                className={`flex-1 py-4 text-xs font-mono tracking-widest uppercase transition-colors ${activeTab === 'generate' ? 'bg-[#1A1D24] text-white border-b-2 border-orange-600' : 'text-[#8E9299] hover:text-white'}`}
              >
                02. Neural Synthesis
              </button>
            </div>

            <div className="p-8 min-h-[400px] flex flex-col justify-center">
              {activeTab === 'clone' ? (
                <div className="space-y-12 text-center">
                  <div className="flex items-center justify-center gap-6">
                    <div className="relative">
                      <motion.div 
                        animate={isRecording ? { scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] } : {}}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 rounded-full bg-orange-600/20 blur-xl"
                      />
                      <button 
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isCloning}
                        className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg ${isRecording ? 'bg-orange-600 animate-pulse' : 'bg-[#2A2F3A] hover:bg-[#3A3F4A]'}`}
                        title="Record Identity"
                      >
                        {isRecording ? <Square className="fill-white" /> : <Mic size={32} />}
                      </button>
                    </div>

                    <div className="text-[#2A2F3A] font-light text-2xl select-none">OR</div>

                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isCloning || isRecording}
                      className="w-24 h-24 rounded-full bg-[#1A1D24] border-2 border-dashed border-[#2A2F3A] flex flex-col items-center justify-center gap-1 text-[#8E9299] hover:border-orange-600/50 hover:text-white transition-all group"
                      title="Upload Identity Sample"
                    >
                      <Upload className="group-hover:-translate-y-1 transition-transform" />
                      <span className="text-[10px] font-mono uppercase">Upload</span>
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept="audio/*" 
                      className="hidden" 
                    />
                  </div>

                  <div className="space-y-4">
                    <h2 className="text-3xl font-light tracking-tight">
                      {isRecording ? 'Capturing Audio Core...' : 'Ready for Capture'}
                    </h2>
                    <p className="text-[#8E9299] font-mono text-sm uppercase tracking-wider">
                      {isRecording ? `TIME: ${formatTime(recordingTime)}` : 'MIN 10S SAMPLE RECOMMENDED'}
                    </p>
                  </div>

                  {audioBlob && !isRecording && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#1A1D24] border border-[#2A2F3A] p-6 rounded-2xl flex flex-col sm:flex-row items-center gap-6 max-w-lg mx-auto"
                    >
                      <div className="flex-1 text-left">
                        <p className="text-xs text-[#8E9299] font-mono mb-1 uppercase">Sample Ready</p>
                        <p className="text-sm font-medium">New Identity Sample.wav</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setAudioBlob(null)}
                          className="p-3 text-[#8E9299] hover:text-red-500 transition-colors"
                          title="Discard"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={handleClone}
                          disabled={isCloning}
                          className="px-6 py-3 bg-white text-black rounded-full font-bold text-sm tracking-tight hover:bg-gray-200 transition-colors flex items-center gap-2"
                        >
                          {isCloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          {isCloning ? 'Cloning...' : 'Integrate Voice'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-[#8E9299] uppercase tracking-widest pl-2">Input Manifest</label>
                    <textarea 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Enter identity source text for synthesis..."
                      className="w-full bg-[#1A1D24] border border-[#2A2F3A] rounded-2xl p-6 h-40 text-lg font-light focus:outline-none focus:border-orange-600/50 transition-colors resize-none placeholder:text-[#3A3F4A]"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                      {clonedVoices.length === 0 ? (
                        <p className="text-xs text-[#8E9299] font-mono italic">No cloned identities found. Capture one first.</p>
                      ) : (
                        clonedVoices.map(voice => (
                          <button 
                            key={voice.voice_id}
                            onClick={() => setSelectedVoiceId(voice.voice_id)}
                            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${selectedVoiceId === voice.voice_id ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-600/20' : 'bg-[#1A1D24] border-[#2A2F3A] text-[#8E9299] hover:border-[#3A3F4A]'}`}
                          >
                            {voice.name}
                          </button>
                        ))
                      )}
                    </div>
                    <button 
                      onClick={handleSynthesize}
                      disabled={isSynthesizing || !selectedVoiceId || !inputText}
                      className="px-8 py-4 bg-white text-black rounded-xl font-bold tracking-tight hover:bg-gray-200 transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      {isSynthesizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5 transition-transform group-hover:scale-110" />}
                      Generate
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Status Bar */}
            <div className="bg-[#1A1D24] p-3 border-t border-[#2A2F3A] flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-[#5A5F6A]">
              <div className="flex gap-4">
                <span>Buffer: Stable</span>
                <span>Latency: 124ms</span>
                <span>Bitrate: 320kbps</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 bg-[#5A5F6A] rounded-full animate-pulse" />
                Processing Engine Ready
              </div>
            </div>
          </section>

          {/* Results Area */}
          <AnimatePresence>
            {generatedAudioUrl && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-orange-600/10 border border-orange-500/20 rounded-2xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/30">
                      <Play className="w-5 h-5 fill-white text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-mono uppercase text-orange-500 tracking-wider">Output Success</p>
                      <h3 className="font-bold">Generated Synthetic Signal</h3>
                    </div>
                  </div>
                  <a 
                    href={generatedAudioUrl} 
                    download="aura_clone_output.mp3"
                    className="text-xs font-mono text-orange-500 hover:underline"
                  >
                    Export File
                  </a>
                </div>
                <audio src={generatedAudioUrl} controls className="w-full h-10 opacity-80" autoPlay />
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 text-red-500"
            >
              <AlertCircle size={20} />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="bg-[#1A1D24] border border-[#2A2F3A] rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#8E9299] uppercase tracking-widest border-b border-[#2A2F3A] pb-3">
              <History className="w-3 h-3" /> Cloned Identities
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
              {clonedVoices.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <div className="w-10 h-10 bg-[#0F1115] rounded-full flex items-center justify-center mx-auto opacity-20">
                    <Mic className="w-5 h-5" />
                  </div>
                  <p className="text-xs text-[#5A5F6A] italic">Identity log empty</p>
                </div>
              ) : (
                clonedVoices.map(voice => (
                  <div key={voice.voice_id} className="group flex items-center justify-between gap-3 p-3 bg-[#0F1115] border border-[#2A2F3A] rounded-xl hover:border-[#3A3F4A] transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{voice.name}</p>
                      <p className="text-[10px] font-mono text-[#5A5F6A] uppercase">{voice.voice_id.slice(0, 8)}</p>
                    </div>
                    <button 
                      onClick={() => setSelectedVoiceId(voice.voice_id)}
                      className={`p-2 rounded-lg transition-all ${selectedVoiceId === voice.voice_id ? 'bg-orange-600 text-white' : 'bg-[#1A1D24] text-[#5A5F6A] group-hover:text-white'}`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#1A1D24] border border-[#2A2F3A] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#8E9299] uppercase tracking-widest border-b border-[#2A2F3A] pb-3">
              <Info className="w-3 h-3" /> Neural Specs
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-[11px]">
                <span className="text-[#5A5F6A]">Model</span>
                <span className="font-mono">eleven_multilingual_v2</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#5A5F6A]">Cloning Type</span>
                <span className="font-mono">Instant Core</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#5A5F6A]">Stability</span>
                <span className="font-mono">50%</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-[#5A5F6A]">Similarity</span>
                <span className="font-mono">75%</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Background Decor */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-1/4 w-1/2 h-1/2 bg-orange-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-blue-600/5 rounded-full blur-[120px]" />
      </div>
    </div>
  );
}
