
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { InterviewConfig, TranscriptMessage, FeedbackReport } from '../types';
import { generateFeedbackReport } from '../services/geminiService';
import { MicIcon, MicOffIcon, StopIcon, LoadingSpinner, RobotIcon } from './icons/Icons';
import { decode, encode, decodeAudioData } from '../utils/audioUtils';


interface InterviewScreenProps {
  config: InterviewConfig;
  onInterviewEnd: (transcript: TranscriptMessage[], report: FeedbackReport) => void;
}

const InterviewScreen: React.FC<InterviewScreenProps> = ({ config, onInterviewEnd }) => {
  const [status, setStatus] = useState('Connecting...');
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());

  const endInterview = useCallback(async () => {
    setStatus('Generating your feedback report...');
    setIsGeneratingReport(true);

    // Stop microphone
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
    }
    if(scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
    }
    if(sourceRef.current) {
        sourceRef.current.disconnect();
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
    }

    // Stop playback
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        audioSourcesRef.current.forEach(source => source.stop());
        outputAudioContextRef.current.close();
    }

    // Close session
    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (error) {
        console.error("Error closing session:", error);
      }
    }
    
    try {
        const report = await generateFeedbackReport(transcript, config);
        onInterviewEnd(transcript, report);
    } catch (error) {
        console.error("Failed to generate report:", error);
        setStatus("Error generating report. Please try again.");
    }
  }, [transcript, config, onInterviewEnd]);

  useEffect(() => {
    const startSession = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        const systemInstruction = `You are an expert interviewer conducting a ${config.interviewType} interview. The candidate's resume is: "${config.resumeText}". The job description is: "${config.jobDescriptionText}". Start by introducing yourself briefly, then ask the first question. Ask relevant follow-up questions and maintain a professional, conversational tone.`;

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' }}},
                systemInstruction: systemInstruction,
                inputAudioTranscription: {},
                outputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => {
                    setStatus('Connected. The interview will begin shortly.');
                    const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                    sourceRef.current = source;
                    const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;
                    
                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob: Blob = {
                            data: encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        sessionPromiseRef.current?.then((session) => {
                            if (!isMuted) {
                                session.sendRealtimeInput({ media: pcmBlob });
                            }
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.outputTranscription) {
                        currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                    }
                    if (message.serverContent?.inputTranscription) {
                        currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                    }
                    if (message.serverContent?.turnComplete) {
                        setTranscript(prev => {
                           const newTranscript = [...prev];
                           if(currentInputTranscriptionRef.current.trim()) {
                               newTranscript.push({ speaker: 'USER', text: currentInputTranscriptionRef.current.trim() });
                           }
                           if(currentOutputTranscriptionRef.current.trim()) {
                               newTranscript.push({ speaker: 'AI', text: currentOutputTranscriptionRef.current.trim() });
                           }
                           currentInputTranscriptionRef.current = '';
                           currentOutputTranscriptionRef.current = '';
                           return newTranscript;
                        });
                    }

                    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (audioData) {
                        const outputContext = outputAudioContextRef.current;
                        if (!outputContext) return;

                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputContext.currentTime);
                        const audioBuffer = await decodeAudioData(decode(audioData), outputContext, 24000, 1);
                        const source = outputContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputContext.destination);
                        source.addEventListener('ended', () => {
                            audioSourcesRef.current.delete(source);
                        });
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioSourcesRef.current.add(source);
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Session error:', e);
                    setStatus('Connection error. Please refresh and try again.');
                },
                onclose: () => {
                    setStatus('Interview session ended.');
                },
            },
        });

      } catch (error) {
        console.error('Failed to start interview:', error);
        setStatus('Failed to access microphone. Please check permissions and refresh.');
      }
    };

    startSession();

    return () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
        }
        if(sourceRef.current) {
            sourceRef.current.disconnect();
        }
        inputAudioContextRef.current?.close().catch(console.error);
        outputAudioContextRef.current?.close().catch(console.error);
        sessionPromiseRef.current?.then(session => session.close()).catch(console.error);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const transcriptContainerRef = useRef<HTMLDivElement>(null);

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
            <h2 className="text-xl font-bold text-white">Live Interview Session</h2>
            <p className="text-sm text-indigo-400 animate-pulse">{status}</p>
        </div>
        <div ref={transcriptContainerRef} className="flex-grow p-6 space-y-6 overflow-y-auto">
            {transcript.map((msg, index) => (
                <div key={index} className={`flex items-start gap-4 ${msg.speaker === 'USER' ? 'justify-end' : 'justify-start'}`}>
                    {msg.speaker === 'AI' && <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center"><RobotIcon className="w-6 h-6 text-white"/></div>}
                    <div className={`max-w-md p-4 rounded-2xl ${msg.speaker === 'AI' ? 'bg-slate-700 rounded-tl-none' : 'bg-indigo-600 text-white rounded-br-none'}`}>
                        <p className="text-sm">{msg.text}</p>
                    </div>
                </div>
            ))}
        </div>
        <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-center items-center gap-6">
            <button onClick={() => setIsMuted(!isMuted)} className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-600'}`}>
                {isMuted ? <MicOffIcon className="w-6 h-6 text-white" /> : <MicIcon className="w-6 h-6 text-white" />}
            </button>
            <button onClick={endInterview} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full transition-colors">
                <StopIcon className="w-5 h-5"/>
                <span>End Interview</span>
            </button>
        </div>
    </div>
  );
};

export default InterviewScreen;
