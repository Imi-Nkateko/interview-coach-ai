
import { GoogleGenAI, Type } from "@google/genai";
import { InterviewConfig, TranscriptMessage, FeedbackReport } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const feedbackSchema = {
  type: Type.OBJECT,
  properties: {
    overallScore: { type: Type.INTEGER, description: "Overall interview score from 0 to 100." },
    answerQuality: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, description: "Score from 0 to 100 for answer quality." },
        feedback: { type: Type.STRING, description: "Detailed feedback on the quality of answers." },
        example: { type: Type.STRING, description: "An example of a better answer for a specific question." }
      },
      required: ['score', 'feedback', 'example']
    },
    communicationSkills: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, description: "Score from 0 to 100 for communication skills." },
        feedback: { type: Type.STRING, description: "Feedback on clarity, tone, and articulation." },
        fillerWords: { type: Type.INTEGER, description: "Total count of detected filler words like 'um', 'uh', 'like'." },
        pace: { type: Type.STRING, description: "Analysis of speaking pace (e.g., 'Good', 'Too fast', 'Too slow')." }
      },
      required: ['score', 'feedback', 'fillerWords', 'pace']
    },
    contentFeedback: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, description: "Score from 0 to 100 for content relevance." },
        feedback: { type: Type.STRING, description: "Feedback on how well answers aligned with the job description." },
        missedOpportunities: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of skills or experiences from the resume the candidate could have mentioned."
        }
      },
      required: ['score', 'feedback', 'missedOpportunities']
    }
  },
  required: ['overallScore', 'answerQuality', 'communicationSkills', 'contentFeedback']
};


export const generateFeedbackReport = async (
  transcript: TranscriptMessage[],
  config: InterviewConfig
): Promise<FeedbackReport> => {
  const transcriptText = transcript.map(msg => `${msg.speaker}: ${msg.text}`).join('\n');
  const model = "gemini-2.5-pro";

  const prompt = `
    Analyze the following interview transcript for a role requiring the skills outlined in the job description, based on the candidate's resume.
    
    Candidate Resume:
    ---
    ${config.resumeText}
    ---
    
    Job Description:
    ---
    ${config.jobDescriptionText}
    ---
    
    Interview Transcript:
    ---
    ${transcriptText}
    ---
    
    Provide a comprehensive feedback report in JSON format. Evaluate the candidate's performance based on the provided schema. The feedback should be constructive, specific, and actionable. Calculate scores logically based on the performance demonstrated in the transcript.
    `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: feedbackSchema,
      },
    });

    const reportJson = response.text.trim();
    return JSON.parse(reportJson) as FeedbackReport;

  } catch (error) {
    console.error("Error generating feedback report:", error);
    throw new Error("Failed to generate feedback report from AI.");
  }
};
