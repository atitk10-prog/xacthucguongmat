
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";
import { Attendee, RecognitionResult } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async recognizeFace(liveImageBase64: string, registeredAttendees: Attendee[]): Promise<RecognitionResult> {
    // Luôn sử dụng Gemini 3 Flash cho tốc độ phản hồi nhanh nhất
    const model = 'gemini-3-flash-preview';
    
    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: liveImageBase64.split(',')[1] || liveImageBase64,
      },
    };

    const attendeeContext = registeredAttendees.map(a => 
      `ID: ${a.id}, Name: ${a.name}, Role: ${a.role}`
    ).join('\n');

    const prompt = `
      Danh sách:
      ${attendeeContext}

      Xác định người trong ảnh. Nếu độ khớp >= 60%, trả về ID.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          // TỐI ƯU TỐC ĐỘ: Vô hiệu hóa thinking budget để nhận phản hồi ngay lập tức
          thinkingConfig: { thinkingBudget: 0 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchedId: { type: Type.STRING, nullable: true },
              confidence: { type: Type.NUMBER },
              reason: { type: Type.STRING }
            },
            required: ["matchedId", "confidence"]
          }
        },
      });

      const result = JSON.parse(response.text || '{}');
      return {
        matchedId: result.matchedId || null,
        confidence: result.confidence || 0,
        reason: result.reason
      };
    } catch (error) {
      console.error("Fast Face recognition error:", error);
      return { matchedId: null, confidence: 0, reason: "Lỗi kết nối AI" };
    }
  }
}

export const geminiService = new GeminiService();
