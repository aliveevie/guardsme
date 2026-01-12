import { GoogleGenAI, Type } from "@google/genai";
import { DeepScanResult, ThreatLevel } from "../types";

// Deep Scan utilizes Gemini 3 Pro with Thinking Config to analyze complex spatial threats
export const performDeepScan = async (base64Image: string, context?: string): Promise<DeepScanResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Schema for structured safety output - STRICTLY MAINTAINED
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      threatLevel: {
        type: Type.STRING,
        enum: ["SAFE", "CAUTION", "DANGER"],
        description: "The overall safety assessment of the scene."
      },
      analysis: {
        type: Type.STRING,
        description: "Forensic assessment of identity and security status."
      },
      action: {
        type: Type.STRING,
        description: "A specific, imperative protective instruction."
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 100."
      }
    },
    required: ["threatLevel", "analysis", "action", "confidence"]
  };

  const systemPrompt = context 
    ? `You are GUARDSME, a Biometric Access Control Agent. 
       TASK: Verify if the person in the image matches this authorized baseline description: "${context}".
       
       STRICT MATCHING PROTOCOL:
       1. Compare facial features, build, and attire against the provided description.
       2. IGNORE background changes. Focus solely on the subject.
       
       OUTPUT REQUIREMENTS:
       - Analysis: Start with "BIOMETRIC MATCH: [SUCCESS/FAILURE]". Then provide forensic details.
       - ThreatLevel: "SAFE" if match confirmed. "DANGER" if mismatch.
       - Action: "Grant Access" or "Deny Access".`
    : `You are GUARDSME, an Autonomous Forensic Security Agent.
       TASK: Establish a security baseline of the authorized user and environment.

       OBSERVATION PROTOCOL:
       1. CATALOG the Authorized User (Gender, Hair, Clothing, Distinguishing Features).
       2. CATALOG the Environment (Terminal state, Lighting conditions).
       
       OUTPUT REQUIREMENTS:
       - Analysis: Use formal, forensic language. Example: "SUBJECT: Male, approx 30s, wearing dark hoodie. LOCATION: Terminal 1. STATUS: Authorized baseline established."
       - ThreatLevel: "SAFE" (Default for baseline).
       - Action: "Baseline Recorded. Awaiting Protocol Start."`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Using Pro for reasoning capability
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          },
          {
            text: systemPrompt
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        thinkingConfig: {
          thinkingBudget: 4096 
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as DeepScanResult;
    } else {
      throw new Error("No analysis generated");
    }
  } catch (error) {
    console.error("Deep Scan Failed:", error);
    return {
      threatLevel: ThreatLevel.SAFE, // Fail safe
      analysis: "Sensor input degraded. Unable to process biometric data.",
      action: "Maintain Lock",
      confidence: 0
    };
  }
};