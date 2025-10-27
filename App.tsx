
import React, { useState, useCallback } from 'react';
import { AppState, InterviewConfig, FeedbackReport, TranscriptMessage, HistoricalInterview } from './types';
import SetupScreen from './components/SetupScreen';
import InterviewScreen from './components/InterviewScreen';
import FeedbackScreen from './components/FeedbackScreen';
import { GithubIcon } from './components/icons/Icons';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig | null>(null);
  const [feedbackReport, setFeedbackReport] = useState<FeedbackReport | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [viewingHistoryReport, setViewingHistoryReport] = useState<HistoricalInterview | null>(null);


  const handleStartInterview = useCallback((config: InterviewConfig) => {
    setInterviewConfig(config);
    setAppState(AppState.INTERVIEW);
    setFeedbackReport(null);
    setTranscript([]);
    setViewingHistoryReport(null);
  }, []);

  const handleInterviewEnd = useCallback((finalTranscript: TranscriptMessage[], report: FeedbackReport) => {
    if (!interviewConfig) return;

    const historyItem: HistoricalInterview = {
        id: `interview-${Date.now()}`,
        timestamp: Date.now(),
        config: interviewConfig,
        report: report,
        transcript: finalTranscript,
    };
    
    try {
        const history = JSON.parse(localStorage.getItem('interviewHistory') || '[]');
        history.unshift(historyItem);
        localStorage.setItem('interviewHistory', JSON.stringify(history.slice(0, 10))); // Keep last 10 interviews
    } catch(e) {
        console.error("Failed to save to localStorage", e);
    }

    setTranscript(finalTranscript);
    setFeedbackReport(report);
    setAppState(AppState.FEEDBACK);
  }, [interviewConfig]);

  const handlePracticeAgain = useCallback(() => {
    setInterviewConfig(null);
    setFeedbackReport(null);
    setTranscript([]);
    setViewingHistoryReport(null);
    setAppState(AppState.SETUP);
  }, []);
  
  const handleViewHistory = useCallback((item: HistoricalInterview) => {
    setInterviewConfig(item.config);
    setFeedbackReport(item.report);
    setTranscript(item.transcript);
    setViewingHistoryReport(item);
    setAppState(AppState.FEEDBACK);
  }, []);


  const renderContent = () => {
    switch (appState) {
      case AppState.SETUP:
        return <SetupScreen onStartInterview={handleStartInterview} onViewHistory={handleViewHistory} />;
      case AppState.INTERVIEW:
        if (!interviewConfig) return null;
        return <InterviewScreen config={interviewConfig} onInterviewEnd={handleInterviewEnd} />;
      case AppState.FEEDBACK:
        if (!feedbackReport || !interviewConfig) return null;
        return <FeedbackScreen report={feedbackReport} transcript={transcript} onPracticeAgain={handlePracticeAgain} isHistoryView={!!viewingHistoryReport} />;
      default:
        return <SetupScreen onStartInterview={handleStartInterview} onViewHistory={handleViewHistory} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-gray-200 font-sans flex flex-col items-center p-4">
      <header className="w-full max-w-5xl flex justify-between items-center py-4">
        <h1 className="text-2xl md:text-3xl font-bold text-white">AI Interview Coach</h1>
        <a href="https://github.com/google/aistudio-apps" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors">
          <GithubIcon className="w-6 h-6" />
        </a>
      </header>
      <main className="w-full max-w-5xl flex-grow flex items-center justify-center">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
