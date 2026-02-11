import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";
import { UserProfile, Meal, TrendReport, FoodFact } from "../types";

// Models
const MODEL_VISION_PRO = "gemini-3-pro-preview"; // For deep analysis & thinking
const MODEL_CHAT_FLASH = "gemini-3-flash-preview"; // For quick chat & search
const MODEL_IMAGE_EDIT = "gemini-2.5-flash-image"; // For editing
const MODEL_IMAGE_GEN = "gemini-3-pro-image-preview"; // For generating
const MODEL_TTS = "gemini-2.5-flash-preview-tts";
const MODEL_LIVE = "gemini-2.5-flash-native-audio-preview-12-2025";

// Init
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Vision & Analysis (Food Logging) ---

export const analyzeFoodImage = async (base64Image: string, userProfile: UserProfile, forcedMealType?: string) => {
  const ai = getAi();
  
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const hour = now.getHours();
  
  // Irregular Eating Detection Logic
  let timeContext = `Current Time: ${timeString}.`;
  if (hour >= 20 && hour < 22) timeContext += " WARNING: Late Dinner. Warn about digestion.";
  if (hour >= 22 || hour < 5) timeContext += " WARNING: Late Night Snack. Strongly warn about sleep disruption and fat accumulation.";
  if (hour >= 14 && hour < 17) timeContext += " Afternoon Tea time.";

  // Override time context if user explicitly selected a meal type
  if (forcedMealType) {
      timeContext = `Current Time: ${timeString}. User Context: The user is logging this specifically as their ${forcedMealType}.`;
  }

  const symptomString = userProfile.activeSymptoms.length > 0 ? userProfile.activeSymptoms.join(', ') : "None";
  const flareUpContext = userProfile.activeSymptoms.length > 0 
    ? `IMPORTANT: The user is currently reporting these symptoms: [${symptomString}]. Be extremely strict about trigger foods related to these.` 
    : "User is in maintenance mode. Allow 'controlled indulgences' but warn about risks.";

  const prompt = `
    Analyze this food image for a user with the following profile:
    - Conditions: ${userProfile.conditions.join(', ')}
    - Allergies: ${userProfile.allergies.join(', ')} (CRITICAL: CHECK THESE STRICTLY)
    - Goals: ${userProfile.goals.join(', ')}
    
    ${timeContext}
    ${flareUpContext}

    You are "Mami", a caring, warm, motherly AI nutritionist.
    1. Identify the dish and ingredients.
    2. ALLERGY CHECK: If any ingredient matches the user's allergies, flag it immediately and suggest a substitute.
    3. DETECT RISKS: Check specifically for High Purine, High Sugar, High Fat, High Sodium.
    4. DETECT TAKEOUT: Is this takeout/boxed food? If so, assume high oil/salt.
    5. Estimate calories.
    6. Give a health score (1-10).
    7. Provide specific, warm advice.
    8. Return JSON.
  `;

  const response = await ai.models.generateContent({
    model: MODEL_VISION_PRO,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 4096 }, 
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          dishName: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          calories: { type: Type.NUMBER },
          healthScore: { type: Type.NUMBER },
          advice: { type: Type.STRING },
          riskTags: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Tags like 'High Purine', 'High Sugar', 'High Sodium', 'High Fat', 'Allergen', 'Late Night'"
          },
          isTakeout: { type: Type.BOOLEAN },
          mealType: { type: Type.STRING, enum: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] },
          allergenDetected: { type: Type.STRING, description: "Name of the allergen found, or empty string if none." },
          substitutes: { type: Type.STRING, description: "Suggested substitute if allergen found, or healthy alternative if unhealthy." }
        }
      }
    }
  });

  return response.text ? JSON.parse(response.text) : null;
};

// --- Dynamic Symptom Generation ---

export const generateSymptomChecklist = async (description: string, user: UserProfile): Promise<string[]> => {
    const ai = getAi();
    const prompt = `
        User Description of how they feel: "${description}"
        Known Conditions: ${user.conditions.join(', ')}

        Based on the user's description, generate a list of 3-6 specific, short symptom names (1-3 words each) that they might want to track or toggle "ON".
        These should be relevant to their known conditions if applicable, or general symptoms if not.
        Examples: "Knee Pain", "Bloating", "Fatigue", "High Uric Acid Feeling", "Dizziness".

        Return ONLY a JSON array of strings.
    `;

    const response = await ai.models.generateContent({
        model: MODEL_CHAT_FLASH,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        }
    });

    if (response.text) {
        return JSON.parse(response.text);
    }
    return [];
};

// --- Knowledge & Proactive Learning ---

export const generateFoodFact = async (dishName: string, user: UserProfile): Promise<FoodFact | null> => {
    const ai = getAi();
    const prompt = `
        You are Mami. The user just ate "${dishName}".
        User Profile:
        - Conditions: ${user.conditions.join(', ')}
        - Goals: ${user.goals.join(', ')}
        
        Write a short, engaging "Did You Know?" fact about a key ingredient in this dish.
        Link it specifically to their health condition if possible (e.g., "Spinach has potassium which helps blood pressure").
        If the food was unhealthy, give a gentle educational tip about moderation.
        
        Keep it under 40 words. Warm tone.
    `;

    const response = await ai.models.generateContent({
        model: MODEL_CHAT_FLASH, // Use fast model
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    topic: { type: Type.STRING, description: "Short title, e.g., 'Spinach & BP'" },
                    content: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['Benefit', 'Warning', 'FunFact'] }
                }
            }
        }
    });

    if (response.text) {
        const data = JSON.parse(response.text);
        return {
            id: Date.now().toString(),
            topic: data.topic,
            content: data.content,
            type: data.type
        };
    }
    return null;
};

// --- Trend Report Generation ---

export const generateTrendReport = async (meals: Meal[], user: UserProfile): Promise<TrendReport | null> => {
  const ai = getAi();
  
  if (meals.length === 0) return null;

  // Summarize meal data for the prompt
  const mealSummary = meals.slice(0, 20).map(m => {
      const analysis = JSON.parse(m.analysis || '{}');
      return `- ${new Date(m.timestamp).toLocaleDateString()}: ${analysis.dishName} (${m.calories}kcal, Score: ${m.healthScore}, Risks: ${m.riskTags?.join(',')})`;
  }).join('\n');

  const prompt = `
    Generate a dietary trend report for this user based on their recent meals:
    ${mealSummary}
    
    User Goals: ${user.goals.join(', ')}
    Conditions: ${user.conditions.join(', ')}

    Output specific sections:
    1. Calorie Trend (Increasing/Decreasing/Stable)
    2. Accumulated Risks (e.g., "Too much sodium over the last week")
    3. Improvement Score (0-100) based on how well they followed health advice.
    4. A warm summary paragraph from "Mami".
    5. A concrete Next Stage Plan (3 bullet points).
    
    Return JSON.
  `;

  const response = await ai.models.generateContent({
      model: MODEL_VISION_PRO,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  period: { type: Type.STRING },
                  calorieTrend: { type: Type.STRING, enum: ["Increasing", "Decreasing", "Stable"] },
                  riskAccumulation: { type: Type.ARRAY, items: { type: Type.STRING } },
                  improvementScore: { type: Type.NUMBER },
                  summary: { type: Type.STRING },
                  nextStagePlan: { type: Type.STRING }
              }
          }
      }
  });

  return response.text ? JSON.parse(response.text) : null;
};

// --- Medical Report Analysis ---

export const analyzeMedicalReport = async (base64Image: string) => {
    const ai = getAi();
    const prompt = `
        You are an expert medical AI assistant helping a user organize their health records.
        Analyze this image of a medical report (blood test, lab result, or checkup summary).
        
        1. Identify the Date of the report.
        2. Identify the Type of report (e.g., "Blood Routine", "Liver Function", "Lipid Panel").
        3. Extract key indicators (Name, Value, Unit) and determine if they are Normal, High, or Low.
        4. Write a short, warm, motherly summary for the user.
        
        Return JSON.
    `;

    const response = await ai.models.generateContent({
        model: MODEL_VISION_PRO,
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                { text: prompt }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    date: { type: Type.STRING },
                    type: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    indicators: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING },
                                value: { type: Type.STRING },
                                unit: { type: Type.STRING },
                                status: { type: Type.STRING, enum: ["Normal", "High", "Low"] }
                            }
                        }
                    }
                }
            }
        }
    });

    return response.text ? JSON.parse(response.text) : null;
}

// --- Chat with Search Grounding & Profile Context ---

export const createMamiChat = (user: UserProfile) => {
    const ai = getAi();
    
    let medicalContext = "";
    if (user.healthReports.length > 0) {
        const latest = user.healthReports[0];
        medicalContext = `Latest Medical Report (${latest.date}): ${latest.summary}. indicators: ${latest.indicators.filter(i => i.status !== 'Normal').map(i => `${i.name} is ${i.status}`).join(', ')}.`;
    }

    const activeSymptoms = user.activeSymptoms.length > 0 ? user.activeSymptoms.join(', ') : "None";

    return ai.chats.create({
        model: MODEL_CHAT_FLASH,
        config: {
            systemInstruction: `You are Mami, a kind, motherly health assistant for ${user.name}. 
            
            USER PROFILE:
            - Conditions: ${user.conditions.join(', ')}
            - Allergies: ${user.allergies.join(', ')}
            - Goals: ${user.goals.join(', ')}
            - CURRENT SYMPTOMS: ${activeSymptoms}
            - Medical Context: ${medicalContext}
            
            INTERACTION STYLE:
            - Warm, encouraging, slightly nagging (lovingly).
            - Prioritize health.
            - If asked about facts, use Google Search.
            
            Refuse to be cold or robotic. You are family.`,
            tools: [{ googleSearch: {} }]
        }
    });
};

// --- Image Editing ---

export const editFoodImage = async (base64Image: string, instruction: string) => {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: MODEL_IMAGE_EDIT,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: instruction }
      ]
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

// --- Image Generation ---

export const generateHealthVisualization = async (prompt: string, size: "1K" | "2K" | "4K" = "1K") => {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: MODEL_IMAGE_GEN,
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { imageSize: size }
    }
  });

   for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

// --- Text to Speech ---

export const speakMessage = async (text: string): Promise<ArrayBuffer | null> => {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: MODEL_TTS,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }, // Warm female voice
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
  return null;
};

// --- Live API Class ---

export class MamiLiveClient {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  public onAudioData: ((data: ArrayBuffer) => void) | null = null;
  public onClose: (() => void) | null = null;

  constructor() {
    this.ai = getAi();
  }

  async connect(systemInstruction: string) {
    this.sessionPromise = this.ai.live.connect({
      model: MODEL_LIVE,
      callbacks: {
        onopen: () => console.log("Mami Live Connected"),
        onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
        onclose: () => {
          console.log("Mami Live Closed");
          if (this.onClose) this.onClose();
        },
        onerror: (err) => console.error("Mami Live Error", err),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } // Gentle voice
        },
        systemInstruction: systemInstruction
      }
    });
    return this.sessionPromise;
  }

  async sendAudioChunk(base64Pcm: string) {
    if (!this.sessionPromise) return;
    const session = await this.sessionPromise;
    session.sendRealtimeInput({
      media: {
        mimeType: 'audio/pcm;rate=16000',
        data: base64Pcm
      }
    });
  }

  private handleMessage(message: LiveServerMessage) {
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.onAudioData) {
      // Decode base64 to array buffer
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      this.onAudioData(bytes.buffer);
    }
  }

  async disconnect() {
    // SDK close logic placeholder
  }
}
