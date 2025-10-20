import React, { useState } from 'react';
import { Mic, MicOff, MessageSquare, Volume2, VolumeX } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Conversation } from '@elevenlabs/client';

interface MentorPanelProps {
  mentorName?: string;
  mentorImage?: string;
}

export function MentorPanel({ 
  mentorName = "Anna", 
  mentorImage = "https://images.unsplash.com/photo-1511629091441-ee46146481b6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWFjaGVyJTIwbWVudG9yJTIwYWl8ZW58MXx8fHwxNzYwODc0NzgxfDA&ixlib=rb-4.1.0&q=80&w=1080"
}: MentorPanelProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [showChat, setShowChat] = useState(false);
  const [conversationRef, setConversationRef] = useState<any>(null);
  const WORKER_AGENT_URL = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/agent";


  const handleStartConversation = async () => {
    try {
      setIsListening(true);
      setShowChat(true);
      setMessages([{ role: 'ai', text: 'Calling your AI mentor...' }]);
      
      const res = await fetch(WORKER_AGENT_URL);
      const data = await res.json();
      if (!res.ok || !data.signed_url) {
        setMessages(prev => [...prev, { role: 'ai', text: '⚠️ Unable to get a signed session. Try again later.' }]);
        setIsListening(false);
        return;
      }

      const convo = await Conversation.startSession({
        signedUrl: data.signed_url,
        connectionType: "websocket",
        clientTools: {
          logMessage: async ({ message }) => setMessages(prev => [...prev, { role: 'ai', text: message }]),
          onUserMessage: async ({ message }) => setMessages(prev => [...prev, { role: 'user', text: message }]),
          onEnd: async () => setMessages(prev => [...prev, { role: 'ai', text: '✅ Conversation ended.' }]),
        },
      });

      setConversationRef(convo);
      setIsListening(false);
      setIsSpeaking(true);
    } catch (err) {
      console.error('Conversation start error', err);
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Error starting conversation.' }]);
      setIsListening(false);
    }
  };

  const handleAskQuestion = async () => {
    if (!conversationRef) {
      setMessages(prev => [...prev, { role: 'ai', text: 'ℹ️ Start the session first.' }]);
      return;
    }
    try {
      setIsListening(true);
      const userQuestion = "Can you explain this concept in more detail?";
      setMessages(prev => [...prev, { role: 'user', text: userQuestion }]);
      await conversationRef.sendUserMessage(userQuestion);
    } catch (e) {
      console.error('sendUserMessage error', e);
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Failed to send message.' }]);
    } finally {
      setIsListening(false);
    }
  };

  return (
    <div className="relative h-full min-h-[500px] lg:min-h-[600px] rounded-3xl overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Mentor Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: `url(${mentorImage})`,
          filter: isListening || isSpeaking ? 'brightness(0.7)' : 'brightness(1)',
          transition: 'filter 0.3s ease'
        }}
      />
      
      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      
      {/* Status Indicator */}
      {(isListening || isSpeaking) && (
        <div className="absolute top-4 left-4 right-4 z-10">
          <Card className="bg-white/95 backdrop-blur-sm px-4 py-3 shadow-lg border-0">
            <div className="flex items-center gap-3">
              {isListening && (
                <>
                  <div className="flex gap-1">
                    <div className="w-1 h-6 bg-[#1376C8] rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <div className="w-1 h-6 bg-[#1376C8] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="w-1 h-6 bg-[#1376C8] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[#1376C8]">Listening...</span>
                </>
              )}
              {isSpeaking && (
                <>
                  <Volume2 className="text-[#00CE8D] animate-pulse" size={24} />
                  <span className="text-[#00CE8D]">{mentorName} is speaking...</span>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
      
      {/* Chat Messages */}
      {showChat && messages.length > 0 && (
        <div className="absolute top-20 left-4 right-4 z-10 max-h-[calc(100%-180px)] overflow-y-auto space-y-2">
          {messages.map((msg, idx) => (
            <Card 
              key={idx} 
              className={`p-3 shadow-lg border-0 max-w-[85%] ${
                msg.role === 'ai' 
                  ? 'bg-white/95 backdrop-blur-sm ml-0' 
                  : 'bg-[#1376C8]/95 text-white ml-auto'
              }`}
            >
              <p className="m-0 text-sm">{msg.text}</p>
            </Card>
          ))}
        </div>
      )}
      
      {/* Control Buttons */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        {!showChat ? (
          <Button
            onClick={handleStartConversation}
            size="lg"
            className="bg-[#00CE8D] hover:bg-[#00b87d] text-white shadow-2xl rounded-full w-16 h-16 p-0"
          >
            <MessageSquare size={28} />
          </Button>
        ) : (
          <>
            <Button
              onClick={handleAskQuestion}
              disabled={isListening || isSpeaking}
              size="lg"
              className="bg-[#1376C8] hover:bg-[#0f5fa4] text-white shadow-2xl rounded-full w-16 h-16 p-0 disabled:opacity-50"
            >
              {isListening ? <MicOff size={28} /> : <Mic size={28} />}
            </Button>
            <Button
              onClick={() => setShowChat(!showChat)}
              size="lg"
              variant="secondary"
              className="bg-white/90 hover:bg-white text-[#1376C8] shadow-xl rounded-full w-16 h-16 p-0"
            >
              {isSpeaking ? <VolumeX size={28} /> : <Volume2 size={28} />}
            </Button>
          </>
        )}
      </div>
      
      {/* Mentor Name Badge */}
      <div className="absolute bottom-4 left-4 z-10">
        <Card className="bg-white/95 backdrop-blur-sm px-4 py-2 shadow-lg border-0">
          <p className="m-0 text-[#1376C8]">AI Mentor: {mentorName}</p>
        </Card>
      </div>
    </div>
  );
}
