import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2, Cpu, Plus, MessageSquare, Settings, Copy, Edit2, Check, Archive, Trash2, X, PanelLeftClose, PanelLeftOpen, BrainCircuit } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  archived: boolean;
};

const generateId = () => Math.random().toString(36).substring(2, 15);

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem('smollm2-chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState('Initializing model...');
  const [progress, setProgress] = useState<{ file: string; progress: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const worker = useRef<Worker | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentChatIdRef = useRef(currentChatId);

  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  const currentChat = chats.find(c => c.id === currentChatId) || null;
  const activeChats = chats.filter(c => !c.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  const archivedChats = chats.filter(c => c.archived).sort((a, b) => b.updatedAt - a.updatedAt);

  useEffect(() => {
    localStorage.setItem('smollm2-chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages]);

  useEffect(() => {
    worker.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    const onMessageReceived = (e: MessageEvent) => {
      const { type, message, progress, text, error } = e.data;
      const activeId = currentChatIdRef.current;
      
      switch (type) {
        case 'status': setStatus(message); break;
        case 'progress':
          if (progress.status === 'progress') setProgress({ file: progress.file, progress: progress.progress });
          else if (progress.status === 'done') setProgress(null);
          break;
        case 'ready':
          setIsReady(true);
          setStatus('Ready');
          break;
        case 'update':
          setChats(prev => prev.map(chat => {
            if (chat.id === activeId) {
              const newMessages = [...chat.messages];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg.role === 'assistant') {
                lastMsg.content = text;
              }
              return { ...chat, messages: newMessages, updatedAt: Date.now() };
            }
            return chat;
          }));
          break;
        case 'complete':
          setIsGenerating(false);
          setChats(prev => prev.map(chat => {
            if (chat.id === activeId && chat.title === 'New Chat' && chat.messages.length >= 2) {
              const firstUserMsg = chat.messages.find(m => m.role === 'user')?.content || 'New Chat';
              const title = firstUserMsg.length > 30 ? firstUserMsg.substring(0, 30) + '...' : firstUserMsg;
              return { ...chat, title };
            }
            return chat;
          }));
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

  const createNewChat = () => {
    const newChat: Chat = {
      id: generateId(),
      title: 'New Chat',
      messages: [{ id: generateId(), role: 'assistant', content: 'Hello! I am SmolLM2-135M, running entirely locally on your device. How can I help you today?' }],
      updatedAt: Date.now(),
      archived: false
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  useEffect(() => {
    if (chats.length === 0) {
      createNewChat();
    } else if (!currentChatId) {
      setCurrentChatId(chats[0].id);
    }
  }, [chats.length, currentChatId]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !isReady || isGenerating || !currentChatId) return;

    const userMessage: Message = { id: generateId(), role: 'user', content: input.trim() };
    const assistantMessage: Message = { id: generateId(), role: 'assistant', content: '' };
    
    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        return { ...chat, messages: [...chat.messages, userMessage, assistantMessage], updatedAt: Date.now() };
      }
      return chat;
    }));
    
    const messagesForModel = currentChat ? [...currentChat.messages, userMessage] : [userMessage];
    
    setInput('');
    setIsGenerating(true);

    worker.current?.postMessage({
      type: 'generate',
      messages: messagesForModel.map(m => ({ role: m.role, content: m.content }))
    });
  };

  const handleEdit = (messageId: string) => {
    if (!currentChat || isGenerating) return;
    const msgIndex = currentChat.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    
    const msgToEdit = currentChat.messages[msgIndex];
    if (msgToEdit.role !== 'user') return;

    setInput(msgToEdit.content);
    
    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        return { ...chat, messages: chat.messages.slice(0, msgIndex), updatedAt: Date.now() };
      }
      return chat;
    }));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleArchive = (chatId: string) => {
    setChats(prev => prev.map(chat => 
      chat.id === chatId ? { ...chat, archived: !chat.archived } : chat
    ));
    if (currentChatId === chatId) {
      const nextChat = chats.find(c => c.id !== chatId && !c.archived);
      setCurrentChatId(nextChat ? nextChat.id : null);
    }
  };

  const deleteChat = (chatId: string) => {
    setChats(prev => prev.filter(chat => chat.id !== chatId));
    if (currentChatId === chatId) {
      const nextChat = chats.find(c => c.id !== chatId && !c.archived);
      setCurrentChatId(nextChat ? nextChat.id : null);
    }
  };

  const renderMessageContent = (content: string) => {
    const thinkMatch = content.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
    const mainText = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();
    
    return (
      <div className="flex flex-col gap-3">
        {thinkMatch && (
          <details className="group bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
              <BrainCircuit size={16} className="text-blue-500" />
              Reasoning Process
              <span className="ml-auto text-xs opacity-50 group-open:hidden">Click to expand</span>
            </summary>
            <div className="px-4 pb-4 pt-1 text-sm text-zinc-500 whitespace-pre-wrap border-t border-white/5 mt-1">
              {thinkMatch[1].trim() || "Thinking..."}
            </div>
          </details>
        )}
        {mainText && <div className="whitespace-pre-wrap leading-relaxed">{mainText}</div>}
        {!mainText && !thinkMatch && <div className="whitespace-pre-wrap leading-relaxed">{content}</div>}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 font-sans overflow-hidden selection:bg-blue-500/30">
      {/* Sidebar */}
      <aside className={cn(
        "fixed md:relative z-40 h-full w-72 bg-[#18181b] border-r border-white/5 flex flex-col transition-transform duration-300 ease-in-out",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:border-none"
      )}>
        <div className="p-4 flex items-center justify-between">
          <button 
            onClick={createNewChat}
            className="flex-1 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
          >
            <Plus size={18} />
            New Chat
          </button>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden ml-2 p-2.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 rounded-xl transition-colors"
          >
            <PanelLeftClose size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 mb-2 mt-2">Recent Chats</div>
          {activeChats.map(chat => (
            <div key={chat.id} className="group relative flex items-center">
              <button
                onClick={() => { setCurrentChatId(chat.id); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
                className={cn(
                  "flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left truncate transition-colors",
                  currentChatId === chat.id ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                )}
              >
                <MessageSquare size={16} className="shrink-0" />
                <span className="truncate">{chat.title}</span>
              </button>
              <button
                onClick={() => toggleArchive(chat.id)}
                className="absolute right-2 p-1.5 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg hover:bg-white/10"
                title="Archive Chat"
              >
                <Archive size={14} />
              </button>
            </div>
          ))}
          {activeChats.length === 0 && (
            <div className="text-sm text-zinc-600 px-3 py-4 text-center">No recent chats</div>
          )}
        </div>

        <div className="p-4 border-t border-white/5">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-xl transition-colors"
          >
            <Settings size={18} />
            Settings & Archive
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 rounded-xl transition-colors"
            >
              {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                <Cpu size={20} />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-zinc-100 leading-tight">SmolLM2 Local</h1>
                <p className="text-[11px] text-zinc-500 font-medium">
                  {isReady ? 'On-Device AI Ready' : status}
                </p>
              </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          {!isReady && progress && (
            <div className="flex flex-col items-end gap-1.5 max-w-[200px] w-full hidden sm:flex">
              <div className="text-[10px] text-zinc-400 truncate w-full text-right uppercase tracking-wider font-medium">
                Downloading {progress.file}
              </div>
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
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
          <div className="sm:hidden w-full px-4 py-3 bg-white/5 border-b border-white/5">
            <div className="text-[10px] text-zinc-400 truncate mb-1.5 uppercase tracking-wider font-medium">
              Downloading {progress.file}
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8 scroll-smooth">
          {currentChat?.messages.map((msg, idx) => (
            <div 
              key={msg.id} 
              className={cn(
                "flex w-full group",
                msg.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              <div className={cn(
                "flex max-w-[90%] sm:max-w-[80%] gap-4",
                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}>
                {/* Avatar */}
                <div className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 shadow-sm",
                  msg.role === 'user' ? "bg-blue-600 text-white" : "bg-zinc-800 border border-white/10 text-zinc-300"
                )}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                
                {/* Bubble & Actions */}
                <div className={cn("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}>
                  <div className={cn(
                    "px-5 py-3.5 text-[15px] shadow-sm",
                    msg.role === 'user' 
                      ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm" 
                      : "bg-[#18181b] border border-white/5 text-zinc-200 rounded-2xl rounded-tl-sm"
                  )}>
                    {msg.content ? renderMessageContent(msg.content) : (
                      <span className="flex items-center gap-2 text-zinc-500">
                        <Loader2 size={14} className="animate-spin" />
                        Generating response...
                      </span>
                    )}
                  </div>
                  
                  {/* Message Actions */}
                  <div className={cn(
                    "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-1",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}>
                    <button
                      onClick={() => handleCopy(msg.content, msg.id)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-md transition-colors"
                      title="Copy message"
                    >
                      {copiedId === msg.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                    {msg.role === 'user' && (
                      <button
                        onClick={() => handleEdit(msg.id)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-md transition-colors"
                        title="Edit message"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gradient-to-t from-[#09090b] via-[#09090b] to-transparent pt-10">
          <form 
            onSubmit={handleSend}
            className="max-w-3xl mx-auto relative flex items-end bg-[#18181b] border border-white/10 rounded-3xl shadow-lg focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all"
          >
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!isReady || isGenerating}
              placeholder={!isReady ? "Downloading model..." : "Message SmolLM2..."}
              className="w-full max-h-[200px] min-h-[56px] pl-6 pr-14 py-4 bg-transparent border-none text-zinc-100 placeholder:text-zinc-500 resize-none outline-none disabled:opacity-50"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || !isReady || isGenerating}
              className="absolute right-2 bottom-2 p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:bg-white/5 disabled:text-zinc-600 transition-colors"
            >
              <Send size={18} className={cn(isGenerating && "opacity-0")} />
              {isGenerating && <Loader2 size={18} className="absolute top-2.5 left-2.5 animate-spin" />}
            </button>
          </form>
          <div className="text-center mt-3 text-xs text-zinc-600 font-medium">
            AI can make mistakes. Verify important information.
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#18181b] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h2 className="text-lg font-semibold text-zinc-100">Settings & Archive</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-100 rounded-xl hover:bg-white/5 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">Archived Chats</h3>
              <div className="space-y-2">
                {archivedChats.length === 0 ? (
                  <p className="text-sm text-zinc-600 py-4 text-center">No archived chats</p>
                ) : (
                  archivedChats.map(chat => (
                    <div key={chat.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <span className="text-sm text-zinc-300 truncate pr-4">{chat.title}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          onClick={() => toggleArchive(chat.id)}
                          className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                          title="Unarchive"
                        >
                          <Archive size={16} />
                        </button>
                        <button 
                          onClick={() => deleteChat(chat.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          title="Delete permanently"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-white/5">
                <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">Data Management</h3>
                <button 
                  onClick={() => {
                    if (confirm('Are you sure you want to delete ALL chats? This cannot be undone.')) {
                      setChats([]);
                      setCurrentChatId(null);
                      setIsSettingsOpen(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-xl font-medium transition-colors"
                >
                  <Trash2 size={18} />
                  Clear All Chat History
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
