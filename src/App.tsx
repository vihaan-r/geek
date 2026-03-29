import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Cpu } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am SmolLM2-135M, running entirely locally on your device. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState('Initializing model...');
  const [progress, setProgress] = useState<{ file: string; progress: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const worker = useRef<Worker | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize Web Worker
  useEffect(() => {
    worker.current = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module'
    });

    const onMessageReceived = (e: MessageEvent) => {
      const { type, message, progress, text, error } = e.data;

      switch (type) {
        case 'status':
          setStatus(message);
          break;
        case 'progress':
          if (progress.status === 'progress') {
            setProgress({ file: progress.file, progress: progress.progress });
          } else if (progress.status === 'done') {
            setProgress(null);
          }
          break;
        case 'ready':
          setIsReady(true);
          setStatus('Ready');
          break;
        case 'update':
          // Update the last message (which is the assistant's response)
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg.role === 'assistant') {
              lastMsg.content = text;
            }
            return newMessages;
          });
          break;
        case 'complete':
          setIsGenerating(false);
          break;
        case 'error':
          console.error('Worker Error:', error);
          setStatus(`Error: ${error}`);
          setIsGenerating(false);
          break;
      }
    };

    worker.current.addEventListener('message', onMessageReceived);
    worker.current.postMessage({ type: 'init' });

    return () => {
      worker.current?.removeEventListener('message', onMessageReceived);
      worker.current?.terminate();
    };
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isReady || isGenerating) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setIsGenerating(true);

    worker.current?.postMessage({
      type: 'generate',
      messages: newMessages
    });
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-50 text-neutral-900 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-neutral-200 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
            <Cpu size={24} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">SmolLM2 Local Chat</h1>
            <p className="text-xs text-neutral-500 font-medium">
              {isReady ? 'On-Device AI Ready' : status}
            </p>
          </div>
        </div>
        
        {/* Progress Bar (if downloading) */}
        {!isReady && progress && (
          <div className="flex flex-col items-end gap-1 max-w-[200px] w-full hidden sm:flex">
            <div className="text-xs text-neutral-500 truncate w-full text-right">
              Downloading {progress.file}...
            </div>
            <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Mobile Progress Bar */}
      {!isReady && progress && (
        <div className="sm:hidden w-full px-4 py-2 bg-white border-b border-neutral-100">
          <div className="text-[10px] text-neutral-500 truncate mb-1">
            Downloading {progress.file}...
          </div>
          <div className="w-full h-1 bg-neutral-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300 ease-out"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={cn(
              "flex w-full",
              msg.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div className={cn(
              "flex max-w-[85%] sm:max-w-[75%] gap-3",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}>
              {/* Avatar */}
              <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1",
                msg.role === 'user' ? "bg-blue-600 text-white" : "bg-neutral-200 text-neutral-600"
              )}>
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              
              {/* Bubble */}
              <div className={cn(
                "px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-blue-600 text-white rounded-tr-sm" 
                  : "bg-white border border-neutral-200 text-neutral-800 rounded-tl-sm"
              )}>
                {msg.content || (
                  <span className="flex items-center gap-2 text-neutral-400">
                    <Loader2 size={14} className="animate-spin" />
                    Thinking...
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="p-4 bg-white border-t border-neutral-200">
        <form 
          onSubmit={handleSend}
          className="max-w-4xl mx-auto relative flex items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!isReady || isGenerating}
            placeholder={!isReady ? "Downloading model..." : "Type a message..."}
            className="w-full pl-5 pr-14 py-4 bg-neutral-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-full outline-none transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || !isReady || isGenerating}
            className="absolute right-2 p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-neutral-300 disabled:text-neutral-500 transition-colors"
          >
            <Send size={18} className={cn(isGenerating && "opacity-0")} />
            {isGenerating && <Loader2 size={18} className="absolute top-2.5 left-2.5 animate-spin" />}
          </button>
        </form>
        <div className="text-center mt-3 text-[11px] text-neutral-400">
          Model: HuggingFaceTB/SmolLM2-135M-Instruct (ONNX WebGPU)
        </div>
      </footer>
    </div>
  );
}
