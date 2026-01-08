import { GoogleGenAI, Type } from "@google/genai";
import { DeepScanResult, ThreatLevel } from "../types";

// Deep Scan utilizes Gemini 3 Pro with Thinking Config to analyze complex spatial threats
export const performDeepScan = async (base64Image: string): Promise<DeepScanResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Schema for structured safety output
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
        description: "A detailed 2-sentence explanation of the visual evidence leading to this conclusion."
      },
      action: {
        type: Type.STRING,
        description: "A specific, imperative instruction for the user (e.g., 'Walk towards the lighted store')."
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 100."
      }
    },
    required: ["threatLevel", "analysis", "action", "confidence"]
  };

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
            text: `You are GuardsME, a highly advanced personal safety agent. 
            Analyze this image for potential safety risks to the user.
            Look for: stalking behaviors, hidden figures, traffic risks, isolation, or aggressive postures.
            
            If the scene looks normal, explain why it is safe (e.g., "Well lit public area").
            If there is risk, explain the specific threat vector.
            
            Think deeply about the implications of the spatial arrangement.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        thinkingConfig: {
          thinkingBudget: 2048 // Allocating budget for spatial reasoning
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
      analysis: "System unable to verify scene. Remain alert.",
      action: "Stay in open areas.",
      confidence: 0
    };
  }
};