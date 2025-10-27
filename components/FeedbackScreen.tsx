
import React from 'react';
import { FeedbackReport, TranscriptMessage } from '../types';
import { AwardIcon, MessageCircleIcon, BarChartIcon, ThumbsUpIcon, TranscriptIcon } from './icons/Icons';

interface FeedbackScreenProps {
  report: FeedbackReport;
  transcript: TranscriptMessage[];
  onPracticeAgain: () => void;
  isHistoryView: boolean;
}

const ScoreDonut: React.FC<{ score: number }> = ({ score }) => {
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (score / 100) * circumference;
    const color = score > 75 ? 'text-green-400' : score > 50 ? 'text-yellow-400' : 'text-red-400';

    return (
        <div className="relative w-32 h-32">
            <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle className="text-slate-700" strokeWidth="10" stroke="currentColor" fill="transparent" r="45" cx="50" cy="50" />
                <circle
                    className={color}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="45"
                    cx="50"
                    cy="50"
                    transform="rotate(-90 50 50)"
                />
            </svg>
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-bold text-white">{score}</span>
        </div>
    );
};

const FeedbackCard: React.FC<{ icon: React.ReactNode; title: string; score: number; children: React.ReactNode; }> = ({ icon, title, score, children }) => (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
        <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center mr-4">{icon}</div>
            <h3 className="text-xl font-bold text-white flex-grow">{title}</h3>
            <span className="text-2xl font-bold text-indigo-400">{score}<span className="text-sm">/100</span></span>
        </div>
        <div className="space-y-3 text-gray-300">{children}</div>
    </div>
);

const FeedbackScreen: React.FC<FeedbackScreenProps> = ({ report, transcript, onPracticeAgain, isHistoryView }) => {
  return (
    <div className="w-full max-w-4xl p-8 space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-extrabold text-white">Your Interview Report</h2>
        <p className="text-gray-400 mt-2">Here's a breakdown of your performance. Use this feedback to excel in your next real interview!</p>
      </div>
      
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 bg-slate-800/50 p-8 rounded-2xl border border-slate-700">
        <div className="flex-shrink-0">
          <ScoreDonut score={report.overallScore} />
        </div>
        <div className="text-center md:text-left">
          <h3 className="text-2xl font-bold text-white">Overall Readiness Score</h3>
          <p className="text-gray-300 mt-2 max-w-md">
            {report.overallScore > 75 ? "Excellent work! You're well-prepared and demonstrate strong skills." : report.overallScore > 50 ? "Good job! You have a solid foundation, but there's room for improvement in key areas." : "A good starting point. Let's focus on the feedback to build your confidence and skills."}
          </p>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <FeedbackCard icon={<AwardIcon className="w-5 h-5 text-indigo-400" />} title="Answer Quality" score={report.answerQuality.score}>
            <p>{report.answerQuality.feedback}</p>
            <div className="bg-slate-700/50 p-3 rounded-md">
              <p className="text-sm font-semibold text-gray-400 mb-1">Example of a stronger answer:</p>
              <p className="text-sm font-italic">"{report.answerQuality.example}"</p>
            </div>
        </FeedbackCard>

        <FeedbackCard icon={<MessageCircleIcon className="w-5 h-5 text-indigo-400" />} title="Communication Skills" score={report.communicationSkills.score}>
            <p>{report.communicationSkills.feedback}</p>
            <div className="flex justify-between items-center text-sm bg-slate-700/50 p-3 rounded-md">
                <span>Filler Words Detected: <span className="font-bold text-white">{report.communicationSkills.fillerWords}</span></span>
                <span>Speaking Pace: <span className="font-bold text-white">{report.communicationSkills.pace}</span></span>
            </div>
        </FeedbackCard>
        
        <FeedbackCard icon={<BarChartIcon className="w-5 h-5 text-indigo-400" />} title="Content & Relevance" score={report.contentFeedback.score}>
            <p>{report.contentFeedback.feedback}</p>
            {report.contentFeedback.missedOpportunities.length > 0 && (
                 <div className="bg-slate-700/50 p-3 rounded-md">
                    <p className="text-sm font-semibold text-gray-400 mb-2">Missed Opportunities:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                        {report.contentFeedback.missedOpportunities.map((opp, i) => <li key={i}>{opp}</li>)}
                    </ul>
                 </div>
            )}
        </FeedbackCard>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
            <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center mr-4"><TranscriptIcon className="w-5 h-5 text-indigo-400"/></div>
                <h3 className="text-xl font-bold text-white flex-grow">Interview Transcript</h3>
            </div>
            <div className="h-40 overflow-y-auto bg-slate-900/50 p-3 rounded-md space-y-2 text-sm">
                {transcript.map((msg, i) => (
                    <p key={i}><span className={`font-bold ${msg.speaker === 'AI' ? 'text-indigo-400' : 'text-gray-300'}`}>{msg.speaker}:</span> {msg.text}</p>
                ))}
            </div>
        </div>

      </div>

      <div className="text-center pt-4">
        <button onClick={onPracticeAgain} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full transition-colors duration-300">
          {isHistoryView ? 'Start New Interview' : 'Practice Again'}
        </button>
      </div>

    </div>
  );
};

export default FeedbackScreen;
