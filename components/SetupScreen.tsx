
import React, { useState, useCallback, useEffect } from 'react';
import { InterviewConfig, InterviewType, HistoricalInterview } from '../types';
import { UploadIcon, ClockIcon } from './icons/Icons';

declare const pdfjsLib: any;

interface SetupScreenProps {
  onStartInterview: (config: InterviewConfig) => void;
  onViewHistory: (item: HistoricalInterview) => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onStartInterview, onViewHistory }) => {
  const [resumeText, setResumeText] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [jobDescriptionText, setJobDescriptionText] = useState('');
  const [interviewType, setInterviewType] = useState<InterviewType>(InterviewType.BEHAVIORAL);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoricalInterview[]>([]);

  useEffect(() => {
    try {
      const storedHistory = JSON.parse(localStorage.getItem('interviewHistory') || '[]');
      setHistory(storedHistory);
    } catch (e) {
      console.error("Failed to parse history from localStorage", e);
      setHistory([]);
    }
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data }).promise;
            let textContent = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const text = await page.getTextContent();
              textContent += text.items.map((s: any) => s.str).join(' ');
            }
            setResumeText(textContent);
            setResumeFileName(file.name);
            setError('');
          } catch (pdfError) {
            console.error('Error parsing PDF:', pdfError);
            setError('Could not parse the PDF file. Please try another file.');
            setResumeText('');
            setResumeFileName('');
          }
        };
        reader.readAsArrayBuffer(file);
      } else { // Handle .txt
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          setResumeText(text);
          setResumeFileName(file.name);
        };
        reader.readAsText(file);
      }
    }
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!resumeText || !jobDescriptionText) {
      setError('Please upload your resume and paste the job description.');
      return;
    }
    setError('');
    onStartInterview({
      resumeText,
      jobDescriptionText,
      interviewType,
    });
  };

  return (
    <div className="w-full max-w-3xl bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-slate-700">
      <h2 className="text-3xl font-bold text-center mb-2 text-white">Prepare for your Interview</h2>
      <p className="text-center text-gray-400 mb-8">Upload your resume, paste the job description, and let our AI create a personalized interview experience.</p>
      
      {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md text-center mb-6">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">1. Upload Resume (.txt, .pdf)</label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-600 border-dashed rounded-md hover:border-indigo-500 transition-colors">
            <div className="space-y-1 text-center">
              <UploadIcon className="mx-auto h-12 w-12 text-gray-500" />
              <div className="flex text-sm text-gray-400">
                <label htmlFor="file-upload" className="relative cursor-pointer bg-slate-800 rounded-md font-medium text-indigo-400 hover:text-indigo-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-slate-900 focus-within:ring-indigo-500 px-1">
                  <span>Upload a file</span>
                  <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".txt,.pdf" onChange={handleFileChange} />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">{resumeFileName ? resumeFileName : 'PDF or TXT up to 1MB'}</p>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="job-description" className="block text-sm font-medium text-gray-300 mb-2">2. Paste Job Description</label>
          <textarea
            id="job-description"
            rows={8}
            className="w-full bg-slate-900/80 border border-slate-700 rounded-md p-3 text-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            placeholder="Paste the full job description here..."
            value={jobDescriptionText}
            onChange={(e) => setJobDescriptionText(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">3. Select Interview Type</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.values(InterviewType).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setInterviewType(type)}
                className={`p-4 rounded-md text-center font-medium transition-all duration-200 ${
                  interviewType === type ? 'bg-indigo-600 text-white ring-2 ring-indigo-400' : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-md transition-colors duration-300 disabled:bg-gray-500" disabled={!resumeText || !jobDescriptionText}>
          Start Your Mock Interview
        </button>
      </form>
      
      {history.length > 0 && (
        <div className="mt-12">
          <h3 className="text-2xl font-bold text-center mb-6 text-white">Your Past Interviews</h3>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {history.map(item => (
              <button 
                key={item.id} 
                onClick={() => onViewHistory(item)}
                className="w-full text-left p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg flex justify-between items-center transition-all duration-200"
              >
                <div>
                  <p className="font-semibold text-white">{item.config.interviewType} Interview</p>
                  <p className="text-sm text-gray-400 flex items-center gap-2 mt-1">
                    <ClockIcon className="w-4 h-4" />
                    {new Date(item.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">Overall Score</p>
                  <p className="text-xl font-bold text-indigo-400">{item.report.overallScore}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SetupScreen;
