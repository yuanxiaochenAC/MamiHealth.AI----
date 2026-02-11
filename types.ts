export interface UserProfile {
  name: string;
  conditions: string[]; // e.g., 'Gout', 'Diabetes'
  allergies: string[];
  goals: string[]; // e.g., 'Weight Loss'
  
  // Dynamic Health Status
  activeSymptoms: string[]; // Currently toggled "ON" (e.g., ['Joint Pain'])
  trackedSymptoms: string[]; // The list of options available to toggle (e.g., ['Joint Pain', 'Fatigue', 'High Blood Sugar'])
  
  waterIntake: number; // Cups logged today
  
  healthReports: HealthReport[];
  activeFoodFact?: FoodFact | null; // The current "Did you know?" tip
  checkInStats: {
    streakDays: number;
    makeupCards: number;
    lastLogDate: string; // YYYY-MM-DD
    todayLog: {
      breakfast: boolean;
      lunch: boolean;
      dinner: boolean;
    };
  };
}

export interface FoodFact {
  id: string;
  topic: string; // e.g., "Choy Sum & Potassium"
  content: string; // The tip text
  type: 'Benefit' | 'Warning' | 'FunFact';
}

export interface HealthIndicator {
  name: string;
  value: string;
  unit: string;
  status: 'Normal' | 'High' | 'Low';
}

export interface HealthReport {
  id: string;
  date: string;
  type: string; // e.g., "Blood Test"
  indicators: HealthIndicator[];
  summary: string; // Mami's warm interpretation
}

export interface Meal {
  id: string;
  timestamp: number;
  imageUrl: string;
  analysis?: string;
  calories?: number;
  healthScore?: number; // 1-10
  advice?: string;
  ingredients?: string[];
  riskTags?: string[]; // e.g., 'High Purine', 'High Sugar'
  isTakeout?: boolean;
  mealType?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  allergenDetected?: string; // Name of allergen found
  substitutes?: string; // Suggestion if allergen found
}

export interface TrendReport {
  period: string;
  calorieTrend: 'Increasing' | 'Decreasing' | 'Stable';
  riskAccumulation: string[]; // List of accumulated risks
  improvementScore: number; // 1-100
  summary: string;
  nextStagePlan: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isAudio?: boolean; // If it came from Live API
}

export enum AppView {
  HOME = 'HOME',
  CAMERA = 'CAMERA',
  CHAT = 'CHAT',
  LIVE = 'LIVE',
  PROFILE = 'PROFILE'
}

export interface AudioConfig {
    sampleRate: number;
    numChannels: number;
}
