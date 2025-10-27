import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Blob, LiveServerMessage, Chat } from '@google/genai';
import { InterviewConfig, TranscriptMessage, FeedbackReport } from '../types';
import { generateFeedbackReport } from '../services/geminiService';
import { StopIcon, LoadingSpinner, RobotIcon, MicIcon } from './icons/Icons';
import { decode, encode, decodeAudioData } from '../utils/audioUtils';

interface InterviewScreenProps {
  config: InterviewConfig;
  onInterviewEnd: (transcript: TranscriptMessage[], report: FeedbackReport) => void;
}

const InterviewScreen: React.FC<InterviewScreenProps> = ({ config, onInterviewEnd }) => {
  const [status, setStatus] = useState('Initializing...');
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);

  // Refs for managing AI and audio state
  const chatRef = useRef<Chat | null>(null);
  // FIX: Using `any` for the session promise as `LiveSession` is not an exported type.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveTranscriptionRef = useRef<string>('');
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  
  // A ref to ensure cleanup happens only once
  const cleanupPerformedRef = useRef(false);

  const cleanupLiveSession = useCallback(async () => {
    if (cleanupPerformedRef.current) return;
    
    // Stop microphone stream
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    
    // Disconnect audio processing
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    
    // Close audio contexts
    if (audioContextsRef.current) {
      try {
        await audioContextsRef.current.input.close();
        await audioContextsRef.current.output.close();
      } catch (e) {
        console.error("Error closing audio contexts:", e);
      }
      audioContextsRef.current = null;
    }

    // Close AI Live session
    if (sessionPromiseRef.current) {
        try {
            const session = await sessionPromiseRef.current;
            session.close();
        } catch(e) {
            console.error("Error closing live session:", e);
        }
        sessionPromiseRef.current = null;
    }
    
    cleanupPerformedRef.current = true;
  }, []);
  
  const handleStopRecording = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setStatus('Processing answer...');
    await cleanupLiveSession();

    const userMessageText = liveTranscriptionRef.current.trim();
    liveTranscriptionRef.current = '';

    // Finalize the user's message in the transcript
    setTranscript(prev => {
        const newTranscript = [...prev];
        if (newTranscript.length > 0 && newTranscript[newTranscript.length - 1].speaker === 'USER') {
            newTranscript[newTranscript.length - 1].text = userMessageText || "(No speech detected)";
        }
        return newTranscript;
    });

    if (userMessageText && chatRef.current) {
        setIsAiTyping(true);
        setStatus('AI is thinking...');

        const newAiMessage: TranscriptMessage = { speaker: 'AI', text: '' };
        setTranscript(prev => [...prev, newAiMessage]);
        
        try {
            const responseStream = await chatRef.current.sendMessageStream({ message: userMessageText });

            let currentAiText = '';
            for await (const chunk of responseStream) {
                currentAiText += chunk.text;
                setTranscript(prev => {
                    const updatedTranscript = [...prev];
                    updatedTranscript[updatedTranscript.length - 1] = { speaker: 'AI', text: currentAiText };
                    return updatedTranscript;
                });
            }
        } catch (error) {
            console.error("Error sending message to chat:", error);
            setStatus("An error occurred with the AI.");
        } finally {
            setIsAiTyping(false);
            setStatus('Ready for your answer.');
        }
    } else {
        setStatus('Ready for your answer.');
    }
}, [isRecording, cleanupLiveSession]);


const handleStartRecording = useCallback(async () => {
    if (isRecording || isAiTyping) return;
    setIsRecording(true);
    setStatus('Listening...');
    liveTranscriptionRef.current = '';
    cleanupPerformedRef.current = false; // Reset cleanup flag for the new session

    const newUserMessage: TranscriptMessage = { speaker: 'USER', text: '...' };
    setTranscript(prev => [...prev, newUserMessage]);

    try {
        if (!process.env.API_KEY) throw new Error("API Key not found");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextsRef.current = { input: inputAudioContext, output: outputAudioContext };

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO], // Still required, but we'll ignore audio output
                inputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => {
                    const source = inputAudioContext.createMediaStreamSource(stream);
                    mediaStreamSourceRef.current = source;
                    const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob: Blob = {
                            data: encode(new Uint8Array(new Int16Array(inputData.map(v => v * 32768)).buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        sessionPromiseRef.current?.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        const transcription = message.serverContent.inputTranscription.text;
                        liveTranscriptionRef.current += transcription;
                        setTranscript(prev => {
                            const newTranscript = [...prev];
                            newTranscript[newTranscript.length - 1] = { speaker: 'USER', text: liveTranscriptionRef.current + '...' };
                            return newTranscript;
                        });
                    }
                    // FIX: Per Gemini API guidelines, audio output from a Live session must be handled.
                    // This app's logic uses the Live API for transcription only and does not expect audio output.
                    // The presence of audio data is logged for debugging, but not played.
                    if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
                        console.warn("Received unexpected audio data from Live API during transcription, ignoring.");
                    }
                },
                onerror: (e) => { console.error('Session error:', e); setStatus('Session error.'); },
                onclose: () => {},
            },
        });
        await sessionPromiseRef.current;
    } catch (error) {
        console.error('Failed to start recording:', error);
        setStatus('Mic error. Check permissions.');
        setIsRecording(false);
    }
}, [isRecording, isAiTyping]);


const endInterview = useCallback(async () => {
    setStatus('Ending session...');
    setIsRecording(false);
    setIsAiTyping(false);
    
    await cleanupLiveSession();
    
    setStatus('Generating your feedback report...');
    setIsGeneratingReport(true);
    
    const cleanTranscript = transcript.filter(msg => msg.text.trim() !== '' && msg.text.trim() !== '...');

    try {
      const report = await generateFeedbackReport(cleanTranscript, config);
      onInterviewEnd(cleanTranscript, report);
    } catch (error) {
      console.error("Failed to generate report:", error);
      setStatus("Error generating report. Please try again.");
      setIsGeneratingReport(false);
    }
  }, [transcript, config, onInterviewEnd, cleanupLiveSession]);

  useEffect(() => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const systemInstruction = `You are an expert interviewer named CoachAI, conducting a ${config.interviewType} interview. The candidate's resume is: "${config.resumeText}". The job description is: "${config.jobDescriptionText}". Your responses must be text-only. Start by introducing yourself as CoachAI, then ask the first question. For example: "Hello, my name is CoachAI and I'm your interviewer today." Ask relevant follow-up questions and maintain a professional, conversational tone. Keep your questions and responses concise. Wait for the user's response before proceeding.`;

    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: { systemInstruction }
    });
    chatRef.current = chat;

    const startConversation = async () => {
        setIsAiTyping(true);
        setStatus('AI is preparing...');
        
        const newAiMessage: TranscriptMessage = { speaker: 'AI', text: '' };
        setTranscript([newAiMessage]);

        try {
            const responseStream = await chat.sendMessageStream({ message: "Start the interview now." });
            let currentAiText = '';
            for await (const chunk of responseStream) {
                currentAiText += chunk.text;
                setTranscript(prev => {
                    const newTranscript = [...prev];
                    newTranscript[newTranscript.length - 1] = { speaker: 'AI', text: currentAiText };
                    return newTranscript;
                });
            }
        } catch (error) {
            console.error("Failed to start conversation:", error);
            setStatus("Error initializing AI. Please refresh.");
        } finally {
            setIsAiTyping(false);
            setStatus('Ready for your answer.');
        }
    };
    
    startConversation();
    
    return () => {
        cleanupLiveSession();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  if (isGeneratingReport) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 w-full">
        <LoadingSpinner className="w-16 h-16 mb-4" />
        <h2 className="text-2xl font-bold text-white">Analyzing Your Performance</h2>
        <p className="text-gray-400 mt-2">Our AI is crunching the numbers and preparing your detailed feedback report. This might take a moment.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl h-[80vh] flex flex-col bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Interview Session</h2>
        <p className="text-sm text-indigo-400">{status}</p>
      </div>
      <div ref={transcriptContainerRef} className="flex-grow p-6 space-y-6 overflow-y-auto">
        {transcript.map((msg, index) => (
          <div key={index} className={`flex items-start gap-4 ${msg.speaker === 'USER' ? 'justify-end' : 'justify-start'}`}>
            {msg.speaker === 'AI' && <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center"><RobotIcon className="w-6 h-6 text-white" /></div>}
            <div className={`flex flex-col ${msg.speaker === 'USER' ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-gray-400 mb-1">{msg.speaker === 'AI' ? 'CoachAI' : 'You'}</span>
              <div className={`max-w-md p-4 rounded-2xl whitespace-pre-wrap ${msg.speaker === 'AI' ? 'bg-slate-700 rounded-tl-none' : 'bg-indigo-600 text-white rounded-br-none'}`}>
                <p className="text-sm">{msg.text}{isAiTyping && msg.speaker === 'AI' && index === transcript.length - 1 && <span className="animate-pulse">...</span>}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex items-center justify-center gap-6">
        {!isRecording && (
          <button
            onClick={handleStartRecording}
            disabled={isAiTyping}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-full transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
            aria-label="Record answer"
          >
            <MicIcon className="w-5 h-5" />
            <span>Record Answer</span>
          </button>
        )}
        {isRecording && (
          <button onClick={handleStopRecording} className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-full transition-colors"
          aria-label="Stop recording">
            <StopIcon className="w-5 h-5" />
            <span>Stop Recording</span>
          </button>
        )}
        <button onClick={endInterview} disabled={isRecording || isAiTyping} className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
          End Interview
        </button>
      </div>
    </div>
  );
};

export default InterviewScreen;
