
export enum AppState {
  SETUP,
  INTERVIEW,
  FEEDBACK,
}

export enum InterviewType {
  BEHAVIORAL = "Behavioral",
  TECHNICAL = "Technical",
  SYSTEM_DESIGN = "System Design",
}

export interface InterviewConfig {
  resumeText: string;
  jobDescriptionText: string;
  interviewType: InterviewType;
}

export interface TranscriptMessage {
  speaker: 'USER' | 'AI';
  text: string;
}

export interface FeedbackReport {
  overallScore: number;
  answerQuality: {
    score: number;
    feedback: string;
    example: string;
  };
  communicationSkills: {
    score: number;
    feedback: string;
    fillerWords: number;
    pace: string;
  };
  contentFeedback: {
    score: number;
    feedback: string;
    missedOpportunities: string[];
  };
}

export interface HistoricalInterview {
  id: string;
  timestamp: number;
  config: InterviewConfig;
  report: FeedbackReport;
  transcript: TranscriptMessage[];
}
