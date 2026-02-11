import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserProfile, AppView, Meal, ChatMessage, HealthReport, TrendReport, FoodFact } from './types';
import { analyzeFoodImage, speakMessage, editFoodImage, generateHealthVisualization, MamiLiveClient, createMamiChat, analyzeMedicalReport, generateTrendReport, generateFoodFact, generateSymptomChecklist } from './services/geminiService';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { arrayBufferToBase64, float32ToInt16 } from './services/audioUtils';

// --- Components ---

const Navigation = ({ current, setView }: { current: AppView, setView: (v: AppView) => void }) => (
  <nav className="fixed bottom-0 w-full bg-white border-t border-mami-orange/20 pb-safe pt-2 px-6 flex justify-between items-center z-50 rounded-t-3xl shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
    <NavBtn active={current === AppView.HOME} onClick={() => setView(AppView.HOME)} icon="🏠" label="Home" />
    <NavBtn active={current === AppView.CHAT} onClick={() => setView(AppView.CHAT)} icon="💬" label="Chat" />
    
    <div className="relative -top-6">
        <button 
            onClick={() => setView(AppView.CAMERA)}
            className="w-16 h-16 bg-mami-darkOrange rounded-full shadow-lg flex items-center justify-center text-3xl border-4 border-white transform transition active:scale-95"
        >
            📸
        </button>
    </div>

    <NavBtn active={current === AppView.LIVE} onClick={() => setView(AppView.LIVE)} icon="🎙️" label="Live" />
    <NavBtn active={current === AppView.PROFILE} onClick={() => setView(AppView.PROFILE)} icon="👤" label="Me" />
  </nav>
);

const NavBtn = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center ${active ? 'text-mami-darkOrange' : 'text-gray-400'}`}>
    <span className="text-xl mb-1">{icon}</span>
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

// --- Widget Components ---

const DailyCheckIn = ({ user, onUseCard, onMealSlotClick }: { user: UserProfile, onUseCard: (meal: 'breakfast' | 'lunch' | 'dinner') => void, onMealSlotClick: (meal: 'breakfast' | 'lunch' | 'dinner') => void }) => {
    const { streakDays, makeupCards, todayLog } = user.checkInStats;
    const meals = ['breakfast', 'lunch', 'dinner'] as const;
    const icons = { breakfast: '🍳', lunch: '🍱', dinner: '🥗' };
    const labels = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-mami-orange/10 mb-4">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🔥</span>
                    <div>
                        <p className="text-xs text-gray-400 font-bold uppercase">Streak</p>
                        <p className="font-display text-xl text-mami-darkOrange">{streakDays} Days</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 bg-mami-cream px-3 py-1 rounded-full border border-mami-orange/20">
                    <span className="text-sm">🎟️</span>
                    <span className="text-xs font-bold text-mami-brown">Cards: {makeupCards}</span>
                </div>
            </div>

            <div className="flex justify-between gap-2">
                {meals.map(meal => {
                    const isDone = todayLog[meal];
                    const isMissed = !isDone && shouldBeDone(meal); 
                    
                    return (
                        <div 
                            key={meal} 
                            onClick={() => onMealSlotClick(meal)}
                            className={`flex-1 flex flex-col items-center p-3 rounded-xl border-2 transition-all cursor-pointer active:scale-95 ${
                            isDone 
                            ? 'bg-mami-green/20 border-mami-green text-mami-darkGreen' 
                            : isMissed 
                                ? 'bg-gray-50 border-gray-200 text-gray-400' 
                                : 'bg-white border-dashed border-gray-300 text-gray-300 hover:bg-gray-50'
                        }`}>
                            <span className="text-2xl mb-1">{isDone ? '✅' : icons[meal]}</span>
                            <span className="text-[10px] font-bold uppercase">{labels[meal]}</span>
                            
                            {isMissed && !isDone && makeupCards > 0 && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onUseCard(meal); }}
                                    className="mt-2 text-[10px] bg-mami-orange text-white px-2 py-1 rounded-full w-full font-bold shadow-sm active:scale-95"
                                >
                                    Use Card
                                </button>
                            )}
                            {!isDone && !isMissed && (
                                <span className="text-[9px] text-mami-orange mt-1">Tap to log</span>
                            )}
                            {isDone && (
                                <span className="text-[9px] text-mami-darkGreen mt-1 font-bold">View</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const WaterTracker = ({ user, onAddWater }: { user: UserProfile, onAddWater: () => void }) => {
    return (
        <div className="bg-blue-50/50 rounded-2xl p-4 shadow-sm border border-blue-100 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-2xl">
                    💧
                </div>
                <div>
                    <h3 className="font-bold text-blue-800">Hydration</h3>
                    <p className="text-xs text-blue-500">Goal: 8 cups</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className="font-display text-3xl text-blue-600">{user.waterIntake}</span>
                <button 
                    onClick={onAddWater}
                    className="w-10 h-10 bg-blue-500 text-white rounded-full text-xl shadow-lg active:scale-90 transition"
                >
                    +
                </button>
            </div>
        </div>
    )
}

const FoodKnowledgeCard = ({ fact, onDismiss }: { fact: FoodFact, onDismiss: () => void }) => {
    return (
        <div className="bg-yellow-50 rounded-2xl p-4 border border-yellow-200 shadow-sm mb-6 relative animate-slide-up">
            <button 
                onClick={onDismiss}
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center"
            >
                ✕
            </button>
            <div className="flex gap-3">
                <div className="text-3xl">💡</div>
                <div>
                    <p className="text-xs font-bold text-yellow-700 uppercase mb-1">Mami's Kitchen Wisdom</p>
                    <h4 className="font-bold text-mami-brown mb-1">{fact.topic}</h4>
                    <p className="text-sm text-gray-700 leading-snug">{fact.content}</p>
                </div>
            </div>
        </div>
    );
};

const shouldBeDone = (meal: string) => {
    const hour = new Date().getHours();
    if (meal === 'breakfast') return hour >= 11;
    if (meal === 'lunch') return hour >= 15;
    if (meal === 'dinner') return hour >= 22;
    return false;
};

// --- Modals ---

const MealAnalysisModal = ({ meal, onClose }: { meal: Meal, onClose: () => void }) => {
    if (!meal) return null;
    const analysis = JSON.parse(meal.analysis || '{}');
    const isRisky = (meal.riskTags && meal.riskTags.length > 0) || (meal.healthScore || 10) < 6;
    const isAllergic = !!meal.allergenDetected;

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className={`bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-slide-up ${isAllergic ? 'border-4 border-red-500' : ''}`}>
                <div className={`p-6 ${isAllergic ? 'bg-red-500 text-white' : isRisky ? 'bg-red-50' : 'bg-mami-green/20'} flex gap-4 items-center`}>
                    <div className="w-16 h-16 bg-white rounded-full border-2 border-white shadow-md overflow-hidden shrink-0">
                         <img src={`https://picsum.photos/seed/mami/100`} alt="Mami" />
                    </div>
                    <div>
                        <h3 className={`font-display text-xl ${isAllergic ? 'text-white' : 'text-mami-brown'}`}>
                            {isAllergic ? '🛑 STOP! DANGER!' : 'Mami Says...'}
                        </h3>
                        <p className={`text-xs font-bold uppercase tracking-wider ${isAllergic ? 'text-red-100' : 'text-gray-500'}`}>
                            {isAllergic ? 'Allergen Detected' : isRisky ? '⚠️ Health Alert' : '✅ Good Choice!'}
                        </p>
                    </div>
                </div>
                
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-mami-brown mb-2">{analysis.dishName}</h2>
                    <p className="text-xs text-gray-400 mb-4">{new Date(meal.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {meal.mealType}</p>
                    
                    {/* Allergy Alert */}
                    {isAllergic && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4 rounded-r-lg">
                            <p className="font-bold text-red-700 text-sm">Contains {meal.allergenDetected}!</p>
                            <p className="text-xs text-red-600 mt-1">Substitute: {meal.substitutes}</p>
                        </div>
                    )}

                    {/* Risk Tags */}
                    {meal.riskTags && meal.riskTags.length > 0 && !isAllergic && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {meal.riskTags.map((tag: string) => (
                                <span key={tag} className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold border border-red-200">
                                    ⚠️ {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="bg-mami-cream p-4 rounded-xl text-mami-brown text-sm leading-relaxed mb-6 border border-mami-orange/20">
                        "{meal.advice}"
                    </div>

                    <div className="flex justify-between items-center text-sm text-gray-500 mb-6">
                        <div>Score: <span className="font-bold text-mami-darkOrange">{meal.healthScore}/10</span></div>
                        <div>Cal: <span className="font-bold text-mami-darkOrange">{meal.calories}</span></div>
                    </div>

                    <button 
                        onClick={onClose}
                        className={`w-full py-4 text-white rounded-xl font-bold text-lg shadow-lg active:scale-95 transition ${isAllergic ? 'bg-red-600' : 'bg-mami-darkOrange'}`}
                    >
                        {isAllergic ? 'I Will Not Eat This' : 'Got it, Thanks Mami!'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ReportModal = ({ report, onClose }: { report: TrendReport, onClose: () => void }) => {
    return (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white overflow-hidden">
            <div className="p-6 bg-mami-cream border-b flex justify-between items-center">
                <h2 className="font-display text-2xl text-mami-brown">Mami's Monthly Report</h2>
                <button onClick={onClose} className="text-2xl">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-4 ${report.improvementScore > 70 ? 'border-green-500 text-green-600' : 'border-orange-500 text-orange-600'}`}>
                        {report.improvementScore}
                    </div>
                    <div>
                        <p className="text-sm text-gray-400 font-bold uppercase">Health Score</p>
                        <p className="text-sm text-gray-600">Based on your recent meal choices.</p>
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg mb-2">Trend Analysis</h3>
                    <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                         <div className="flex justify-between">
                            <span className="text-gray-500">Calorie Trend</span>
                            <span className="font-bold text-mami-darkOrange">{report.calorieTrend}</span>
                         </div>
                         <div>
                            <span className="text-gray-500 block mb-1">Accumulated Risks</span>
                            <div className="flex flex-wrap gap-2">
                                {report.riskAccumulation.map(r => (
                                    <span key={r} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md">{r}</span>
                                ))}
                            </div>
                         </div>
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg mb-2">Mami's Summary</h3>
                    <div className="bg-mami-green/20 p-4 rounded-xl text-sm leading-relaxed text-mami-darkGreen italic">
                        "{report.summary}"
                    </div>
                </div>

                <div>
                    <h3 className="font-bold text-lg mb-2">Next Stage Plan</h3>
                    <div className="bg-white border border-mami-orange/30 p-4 rounded-xl shadow-sm">
                        <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: report.nextStagePlan.replace(/\n/g, '<br/>') }} />
                    </div>
                </div>
            </div>
        </div>
    )
}

// --- Views ---

const HomeView = ({ user, meals, onUseCard, onAddWater, onDismissFact, onMealSlotClick, onMealCardClick }: { user: UserProfile, meals: Meal[], onUseCard: any, onAddWater: any, onDismissFact: any, onMealSlotClick: any, onMealCardClick: any }) => {
    return (
        <div className="p-6 pb-24 space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-display text-mami-darkOrange">Hi, {user.name}!</h1>
                    <p className="text-sm text-gray-500">
                        {user.activeSymptoms.length > 0 
                            ? <span className="text-red-500 font-bold">⚠️ Managing Symptoms</span> 
                            : "Mami is watching over your health."}
                    </p>
                </div>
                <div className="w-12 h-12 bg-mami-orange rounded-full flex items-center justify-center overflow-hidden border-2 border-mami-darkOrange">
                    <img src={`https://picsum.photos/seed/mami/100`} alt="Mami" className="opacity-90" />
                </div>
            </header>

            {/* Knowledge Card Section */}
            {user.activeFoodFact && (
                <FoodKnowledgeCard fact={user.activeFoodFact} onDismiss={onDismissFact} />
            )}

            <DailyCheckIn user={user} onUseCard={onUseCard} onMealSlotClick={onMealSlotClick} />
            <WaterTracker user={user} onAddWater={onAddWater} />

            {/* Recent Meals */}
            <div>
                <h2 className="font-bold text-xl mb-4 text-mami-brown">Today's Meals</h2>
                {meals.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
                        <p className="text-gray-400">No meals logged yet.<br/>Tap the camera to start!</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {meals.map(meal => (
                            <div key={meal.id} onClick={() => onMealCardClick(meal)} className="bg-white p-3 rounded-2xl shadow-sm flex gap-4 relative overflow-hidden active:scale-95 transition cursor-pointer">
                                <img src={meal.imageUrl} className="w-20 h-20 object-cover rounded-xl bg-gray-100 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-mami-brown truncate pr-2">{JSON.parse(meal.analysis || '{}').dishName || 'Unknown Dish'}</h4>
                                        <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${meal.healthScore && meal.healthScore > 7 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {meal.healthScore}/10
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                                        {new Date(meal.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {meal.mealType}
                                    </p>
                                    
                                    <div className="flex flex-wrap gap-1 mt-1 mb-1">
                                        {meal.allergenDetected && <span className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white rounded-md font-bold">⛔ ALLERGY</span>}
                                        {meal.isTakeout && <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-md border border-orange-200">🥡 Takeout</span>}
                                        {meal.riskTags?.slice(0, 2).map(tag => (
                                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded-md border border-red-100">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>

                                    <p className="text-xs text-gray-500 line-clamp-1">{meal.advice}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const CameraView = ({ onAnalyze, isAnalyzing, user, targetMealType }: { onAnalyze: (img: string) => void, isAnalyzing: boolean, user: UserProfile, targetMealType: string | null }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [editPrompt, setEditPrompt] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleEdit = async () => {
        if(!preview || !editPrompt) return;
        setIsEditing(true);
        try {
            const base64 = preview.split(',')[1];
            const newImage = await editFoodImage(base64, editPrompt);
            if (newImage) setPreview(newImage);
        } catch (e) {
            console.error(e);
            alert("Mami couldn't edit that. Try again?");
        } finally {
            setIsEditing(false);
            setEditMode(false);
        }
    }

    if (isAnalyzing) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-mami-cream px-6 text-center">
                 <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center animate-bounce shadow-xl mb-6">
                    <span className="text-6xl">🤔</span>
                 </div>
                 <h2 className="text-2xl font-display text-mami-darkOrange mb-2">Mami is thinking...</h2>
                 <p className="text-gray-500">Checking for Allergens ({user.allergies.join(',') || 'None'}), Purines, and Risks...</p>
                 <div className="mt-4 flex gap-2 justify-center">
                    <span className="w-2 h-2 bg-mami-orange rounded-full animate-ping"></span>
                    <span className="w-2 h-2 bg-mami-orange rounded-full animate-ping delay-100"></span>
                    <span className="w-2 h-2 bg-mami-orange rounded-full animate-ping delay-200"></span>
                 </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col p-6">
            <h2 className="text-2xl font-display text-mami-brown mb-2">Log a Meal</h2>
            {targetMealType && (
                <div className="bg-mami-orange/20 text-mami-darkOrange px-4 py-2 rounded-lg font-bold text-center mb-4 border border-mami-orange/30">
                    Checking in for: {targetMealType}
                </div>
            )}
            
            <div 
                className="flex-1 bg-white rounded-3xl border-2 border-dashed border-mami-orange flex flex-col items-center justify-center overflow-hidden relative cursor-pointer shadow-sm"
                onClick={() => !preview && fileInputRef.current?.click()}
            >
                {preview ? (
                    <img src={preview} className="w-full h-full object-contain" />
                ) : (
                    <div className="text-center p-6">
                        <span className="text-4xl block mb-2">📸</span>
                        <p className="text-mami-brown font-bold">Tap to take a photo</p>
                        <p className="text-xs text-gray-400 mt-2">Mami will check for {user.conditions.join(', ')} risks</p>
                    </div>
                )}
                
                {preview && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setPreview(null); }}
                        className="absolute top-4 right-4 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center"
                    >
                        ✕
                    </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            {preview && (
                <div className="mt-6 flex flex-col gap-3">
                    {editMode ? (
                        <div className="bg-white p-4 rounded-xl shadow-lg">
                            <input 
                                type="text" 
                                className="w-full border-b border-gray-200 p-2 mb-2 outline-none"
                                placeholder="e.g., Remove the soda can..."
                                value={editPrompt}
                                onChange={e => setEditPrompt(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setEditMode(false)} className="flex-1 py-2 text-gray-500">Cancel</button>
                                <button 
                                    onClick={handleEdit} 
                                    disabled={isEditing}
                                    className="flex-1 py-2 bg-mami-darkOrange text-white rounded-lg font-bold"
                                >
                                    {isEditing ? 'Editing...' : 'Apply Magic'}
                                </button>
                            </div>
                        </div>
                    ) : (
                         <button 
                            onClick={() => setEditMode(true)}
                            className="text-xs text-center text-mami-darkOrange font-bold underline mb-2"
                        >
                            ✨ Edit Photo (Magic Eraser/Filter)
                        </button>
                    )}

                    <button 
                        onClick={() => onAnalyze(preview)}
                        className="w-full py-4 bg-mami-darkOrange text-white rounded-2xl font-bold text-lg shadow-lg shadow-mami-orange/40 active:scale-95 transition"
                    >
                        Check with Mami
                    </button>
                </div>
            )}
        </div>
    );
};

const ProfileView = ({ user, setUser, onUploadReport, onGenerateReport }: { user: UserProfile, setUser: (u: UserProfile) => void, onUploadReport: (img: string) => void, onGenerateReport: () => void }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [analyzingReport, setAnalyzingReport] = useState(false);
    const [newAllergy, setNewAllergy] = useState('');
    const [newGoal, setNewGoal] = useState('');
    const [symptomDescription, setSymptomDescription] = useState('');
    const [isGeneratingSymptoms, setIsGeneratingSymptoms] = useState(false);

    const toggleSymptom = (symptom: string) => {
        if (user.activeSymptoms.includes(symptom)) {
            setUser({ ...user, activeSymptoms: user.activeSymptoms.filter(s => s !== symptom) });
        } else {
            setUser({ ...user, activeSymptoms: [...user.activeSymptoms, symptom] });
        }
    };

    const handleGenerateSymptoms = async () => {
        if (!symptomDescription) return;
        setIsGeneratingSymptoms(true);
        try {
            const list = await generateSymptomChecklist(symptomDescription, user);
            // Merge with existing tracked symptoms
            const unique = Array.from(new Set([...user.trackedSymptoms, ...list]));
            setUser({ ...user, trackedSymptoms: unique });
            setSymptomDescription('');
        } catch(e) {
            console.error(e);
        } finally {
            setIsGeneratingSymptoms(false);
        }
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
             const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                setAnalyzingReport(true);
                try {
                    await onUploadReport(base64);
                } finally {
                    setAnalyzingReport(false);
                }
            };
            reader.readAsDataURL(file);
        }
    }

    const addAllergy = () => {
        if(newAllergy && !user.allergies.includes(newAllergy)) {
            setUser({...user, allergies: [...user.allergies, newAllergy]});
            setNewAllergy('');
        }
    }

    const addGoal = () => {
        if(newGoal && !user.goals.includes(newGoal)) {
            setUser({...user, goals: [...user.goals, newGoal]});
            setNewGoal('');
        }
    }

    return (
        <div className="p-6 pb-24 space-y-6">
            <h1 className="text-2xl font-display mb-4">My Health Profile</h1>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-2xl">👤</div>
                    <div>
                        <h2 className="font-bold text-lg">{user.name}</h2>
                        <button 
                            onClick={onGenerateReport}
                            className="text-[10px] bg-mami-darkOrange text-white px-2 py-1 rounded-full mt-1 font-bold shadow-sm active:scale-95"
                        >
                            ✨ Generate Monthly Report
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Allergies (Mami Checks these)</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {user.allergies.map(c => (
                                <span key={c} className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm font-bold flex items-center gap-1">
                                    {c}
                                    <button onClick={() => setUser({...user, allergies: user.allergies.filter(a => a !== c)})} className="text-xs opacity-70">✕</button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input 
                                value={newAllergy}
                                onChange={e => setNewAllergy(e.target.value)}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 text-sm outline-none focus:border-mami-orange"
                                placeholder="Add allergen..."
                            />
                            <button onClick={addAllergy} className="bg-mami-orange text-white px-3 py-1 rounded-lg text-sm font-bold">+</button>
                        </div>
                    </div>
                    
                    <div className="border-t pt-4">
                         <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Goals</p>
                         <div className="flex flex-wrap gap-2 mb-2">
                            {user.goals.map(c => (
                                <span key={c} className="px-3 py-1 bg-green-50 text-green-600 rounded-lg text-sm font-bold border border-green-100 flex items-center gap-1">
                                    {c}
                                    <button onClick={() => setUser({...user, goals: user.goals.filter(a => a !== c)})} className="text-xs opacity-70">✕</button>
                                </span>
                            ))}
                        </div>
                         <div className="flex gap-2">
                            <input 
                                value={newGoal}
                                onChange={e => setNewGoal(e.target.value)}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1 text-sm outline-none focus:border-mami-orange"
                                placeholder="Add goal (e.g. Lose 2kg)..."
                            />
                            <button onClick={addGoal} className="bg-mami-orange text-white px-3 py-1 rounded-lg text-sm font-bold">+</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
                <h3 className="font-display text-xl text-mami-darkOrange mb-2">⚠️ How do you feel today?</h3>
                <p className="text-sm text-gray-500 mb-4">Describe your symptoms to generate a checklist.</p>
                
                <div className="flex gap-2 mb-4">
                    <input 
                        value={symptomDescription}
                        onChange={e => setSymptomDescription(e.target.value)}
                        className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-mami-orange"
                        placeholder="e.g. My big toe hurts and I feel feverish..."
                    />
                    <button 
                        onClick={handleGenerateSymptoms}
                        disabled={isGeneratingSymptoms || !symptomDescription}
                        className="bg-mami-darkOrange text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md"
                    >
                        {isGeneratingSymptoms ? '...' : 'Analyze'}
                    </button>
                </div>

                <div className="space-y-2">
                    {user.trackedSymptoms.length === 0 && (
                        <p className="text-center text-xs text-gray-400 italic py-2">No symptoms tracked yet. Describe above!</p>
                    )}
                    {user.trackedSymptoms.map(symptom => (
                        <button 
                            key={symptom}
                            onClick={() => toggleSymptom(symptom)}
                            className={`w-full p-4 rounded-xl flex items-center justify-between transition-all ${
                                user.activeSymptoms.includes(symptom)
                                ? 'bg-red-500 text-white shadow-lg shadow-red-300' 
                                : 'bg-white text-gray-600 shadow-sm'
                            }`}
                        >
                            <span className="font-bold">{symptom}</span>
                            <span>{user.activeSymptoms.includes(symptom) ? 'ON' : 'OFF'}</span>
                        </button>
                    ))}
                </div>
            </div>
            
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4">Mami's Archive</h3>
                <div 
                    onClick={() => !analyzingReport && fileRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 cursor-pointer active:bg-gray-50 transition"
                >
                    {analyzingReport ? <div className="animate-pulse">Reading Report...</div> : <>Tap to upload medical report</>}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </div>
                
                {user.healthReports.length > 0 && (
                    <div className="mt-4 space-y-3">
                        {user.healthReports.map(report => (
                            <div key={report.id} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-mami-brown">{report.type}</h4>
                                    <span className="text-xs text-gray-500">{report.date}</span>
                                </div>
                                <p className="text-xs text-gray-600 italic">"{report.summary}"</p>
                            </div>
                        ))}
                    </div>
                )}
             </div>
        </div>
    );
};

const ChatView = ({ user }: { user: UserProfile }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const chatSessionRef = useRef<Chat | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatSessionRef.current = createMamiChat(user);
        setMessages([{
            id: 'init', role: 'model', timestamp: Date.now(), 
            text: `Hello darling! Mami is here. ${user.activeSymptoms.length > 0 ? "I see you aren't feeling well, I'll be extra careful with you." : "Did you eat well today?"}`
        }]);
    }, [user.activeSymptoms, user.healthReports, user.allergies]); 

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !chatSessionRef.current) return;
        
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            if (input.toLowerCase().includes("generate") || input.toLowerCase().includes("show me")) {
                 const imgData = await generateHealthVisualization(input, "1K");
                 if (imgData) {
                    const modelMsg: ChatMessage = { 
                        id: (Date.now() + 1).toString(), 
                        role: 'model', 
                        text: `Here is a visualization for you: <br/><img src="${imgData}" class="rounded-xl mt-2 w-full"/>`, 
                        timestamp: Date.now() 
                    };
                    setMessages(prev => [...prev, modelMsg]);
                    setLoading(false);
                    return;
                 }
            }

            const result = await chatSessionRef.current.sendMessage({ message: userMsg.text });
            
            let groundingText = "";
            const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (groundingChunks) {
                groundingText = "<br/><br/><small>Sources:</small><ul class='list-disc pl-4 text-xs text-gray-500'>";
                groundingChunks.forEach((c: any) => {
                    if (c.web?.uri) {
                        groundingText += `<li><a href="${c.web.uri}" target="_blank" class="text-blue-400 underline">${c.web.title || 'Source'}</a></li>`;
                    }
                });
                groundingText += "</ul>";
            }

            const modelMsg: ChatMessage = { 
                id: (Date.now() + 1).toString(), 
                role: 'model', 
                text: (result.text || "I'm sorry, I couldn't understand that.") + groundingText, 
                timestamp: Date.now() 
            };
            setMessages(prev => [...prev, modelMsg]);

            if (result.text && result.text.length < 100) {
                 const audioBuffer = await speakMessage(result.text);
                 if (audioBuffer) {
                     const ctx = new AudioContext();
                     const source = ctx.createBufferSource();
                     ctx.decodeAudioData(audioBuffer, (buffer) => {
                        source.buffer = buffer;
                        source.connect(ctx.destination);
                        source.start(0);
                     });
                 }
            }

        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Oh dear, I had a little trouble thinking. Try again?", timestamp: Date.now() }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white pb-24">
            <header className="p-4 border-b flex items-center gap-3 bg-mami-cream">
                <div className="w-10 h-10 bg-mami-orange rounded-full overflow-hidden border border-mami-darkOrange">
                    <img src={`https://picsum.photos/seed/mami/100`} alt="Mami" />
                </div>
                <div>
                    <h2 className="font-bold text-mami-brown">Mami Chat</h2>
                    <p className="text-[10px] text-green-600 flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        Thinking Mode Active
                    </p>
                </div>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map(m => (
                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div 
                            className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                                m.role === 'user' 
                                ? 'bg-mami-darkOrange text-white rounded-tr-none' 
                                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'
                            }`}
                            dangerouslySetInnerHTML={{ __html: m.text }}
                        />
                    </div>
                ))}
                {loading && <div className="text-xs text-gray-400 text-center animate-pulse">Mami is typing...</div>}
                <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t bg-white flex gap-2">
                <input 
                    className="flex-1 bg-gray-100 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-mami-orange"
                    placeholder="Ask Mami about recipes..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} disabled={loading} className="w-12 h-12 bg-mami-darkOrange text-white rounded-full flex items-center justify-center shadow-lg">
                    ➤
                </button>
            </div>
        </div>
    );
}

const LiveView = () => {
    const [connected, setConnected] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const clientRef = useRef<MamiLiveClient | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    
    useEffect(() => {
        return () => {
            if (clientRef.current) clientRef.current.disconnect();
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    const toggleConnection = async () => {
        if (connected) {
            clientRef.current?.disconnect();
            setConnected(false);
            return;
        }

        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContext({ sampleRate: 24000 }); 
            const inputCtx = new AudioContext({ sampleRate: 16000 }); 

            clientRef.current = new MamiLiveClient();
            
            clientRef.current.onAudioData = (arrayBuffer) => {
                if (!audioContextRef.current) return;
                setIsSpeaking(true);
                
                audioContextRef.current.decodeAudioData(arrayBuffer, (audioBuffer) => {
                    const source = audioContextRef.current!.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(audioContextRef.current!.destination);
                    
                    const now = audioContextRef.current!.currentTime;
                    const startTime = Math.max(nextStartTimeRef.current, now);
                    source.start(startTime);
                    nextStartTimeRef.current = startTime + audioBuffer.duration;

                    source.onended = () => {
                        if (audioContextRef.current && audioContextRef.current.currentTime >= nextStartTimeRef.current) {
                            setIsSpeaking(false);
                        }
                    };
                });
            };

            await clientRef.current.connect("You are Mami. A super kind, funny, motherly AI companion. Chat casually.");
            setConnected(true);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
                if (!connected && !clientRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = float32ToInt16(inputData);
                const base64 = arrayBufferToBase64(pcm16.buffer);
                clientRef.current?.sendAudioChunk(base64);
            };

            source.connect(processor);
            processor.connect(inputCtx.destination); 

        } catch (e) {
            console.error("Live Error", e);
            alert("Could not connect to Mami Live. Check permissions.");
            setConnected(false);
        }
    };

    return (
        <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-mami-cream to-mami-orange/20 relative overflow-hidden">
            <div className={`absolute w-[500px] h-[500px] bg-mami-orange/30 rounded-full blur-3xl transition-all duration-1000 ${isSpeaking ? 'scale-125 opacity-80' : 'scale-100 opacity-40'}`}></div>

            <div className="z-10 flex flex-col items-center">
                <div className={`w-40 h-40 rounded-full border-4 border-white shadow-2xl overflow-hidden mb-8 transition-transform duration-500 ${isSpeaking ? 'scale-110' : ''}`}>
                     <img src={`https://picsum.photos/seed/mami/300`} className="w-full h-full object-cover" />
                </div>
                
                <h2 className="text-3xl font-display text-mami-brown mb-2">
                    {connected ? (isSpeaking ? "Mami is talking..." : "Mami is listening...") : "Call Mami"}
                </h2>
                
                <p className="text-gray-500 mb-12 max-w-[200px] text-center">
                    {connected ? "Have a natural conversation. Ask about your diet." : "Tap the mic to start a real-time voice chat."}
                </p>

                <button 
                    onClick={toggleConnection}
                    className={`w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${connected ? 'bg-red-500 text-white animate-pulse' : 'bg-mami-darkGreen text-white'}`}
                >
                    <span className="text-3xl">{connected ? '📞' : '🎙️'}</span>
                </button>
            </div>
        </div>
    );
};

// --- Main App ---

export default function App() {
  const [view, setView] = useState<AppView>(AppView.HOME);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedMeal, setAnalyzedMeal] = useState<Meal | null>(null); 
  const [report, setReport] = useState<TrendReport | null>(null);
  const [targetMealType, setTargetMealType] = useState<string | null>(null); // State to track targeted meal logging
  
  const [user, setUser] = useState<UserProfile>({
    name: 'Sweetie',
    conditions: ['Gout', 'High Blood Pressure'],
    allergies: ['Peanuts', 'Shellfish'],
    goals: ['Weight Loss'],
    activeSymptoms: [],
    trackedSymptoms: ['Gout Pain', 'Headache'], // Initial tracked symptoms
    waterIntake: 3,
    healthReports: [],
    activeFoodFact: null, // Initialize
    checkInStats: {
        streakDays: 3,
        makeupCards: 2,
        lastLogDate: new Date().toISOString().split('T')[0],
        todayLog: { breakfast: false, lunch: false, dinner: false }
    }
  });

  const handleAnalyzeFood = async (base64Image: string) => {
    setIsAnalyzing(true);
    try {
        const cleanBase64 = base64Image.split(',')[1];
        // Pass targetMealType to analysis service
        const analysis = await analyzeFoodImage(cleanBase64, user, targetMealType || undefined);
        
        const newMeal: Meal = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            imageUrl: base64Image,
            analysis: JSON.stringify(analysis),
            calories: analysis?.calories || 0,
            healthScore: analysis?.healthScore || 5,
            advice: analysis?.advice || "Please be careful with this.",
            ingredients: analysis?.ingredients || [],
            riskTags: analysis?.riskTags || [],
            isTakeout: analysis?.isTakeout || false,
            // Prioritize forced meal type if analysis fails to categorize, or use analysis result
            mealType: (targetMealType as any) || analysis?.mealType || 'Snack', 
            allergenDetected: analysis?.allergenDetected,
            substitutes: analysis?.substitutes
        };

        setMeals(prev => [newMeal, ...prev]);
        setAnalyzedMeal(newMeal); 
        
        const mealType = newMeal.mealType?.toLowerCase() as 'breakfast' | 'lunch' | 'dinner';
        if (mealType && ['breakfast', 'lunch', 'dinner'].includes(mealType)) {
             setUser(prev => ({
                 ...prev,
                 checkInStats: {
                     ...prev.checkInStats,
                     todayLog: { ...prev.checkInStats.todayLog, [mealType]: true }
                 }
             }));
        }

        // Trigger Proactive Knowledge (Async)
        if (analysis?.dishName) {
            generateFoodFact(analysis.dishName, user).then(fact => {
                if (fact) {
                    setUser(prev => ({ ...prev, activeFoodFact: fact }));
                }
            });
        }
        
        // Clear target state after logging
        setTargetMealType(null); 
        if (view === AppView.CAMERA) setView(AppView.HOME); // Auto return to home

    } catch (e) {
        console.error(e);
        alert("Mami couldn't see the food clearly. Please try again.");
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleManualLog = (mealType: 'breakfast' | 'lunch' | 'dinner') => {
      // Deprecated in favor of photo flow, but kept as fallback if needed logic changes
      console.log("Manual log triggered for", mealType);
  };

  const handleMealSlotClick = (mealType: 'breakfast' | 'lunch' | 'dinner') => {
      if (user.checkInStats.todayLog[mealType]) {
          // If already done, find the most recent meal of this type and show it
          const existingMeal = meals.find(m => m.mealType?.toLowerCase() === mealType);
          if (existingMeal) {
              setAnalyzedMeal(existingMeal);
          }
      } else {
          // If not done, target this meal type and open camera
          setTargetMealType(mealType.charAt(0).toUpperCase() + mealType.slice(1));
          setView(AppView.CAMERA);
      }
  };

  const handleAddWater = () => {
    const newVal = user.waterIntake + 1;
    setUser({...user, waterIntake: newVal});
    if (newVal === 8) {
        alert("💧 Mami says: Wow! You reached 8 cups today! Your kidneys are dancing! Keep it up!");
    }
  };

  const handleUploadReport = async (base64Image: string) => {
      try {
           const cleanBase64 = base64Image.split(',')[1];
           const report = await analyzeMedicalReport(cleanBase64);
           
           if (report) {
               const newReport: HealthReport = {
                   id: Date.now().toString(),
                   date: report.date || new Date().toISOString().split('T')[0],
                   type: report.type || 'Medical Report',
                   indicators: report.indicators || [],
                   summary: report.summary || 'Analyzed'
               };
               setUser(prev => ({
                   ...prev,
                   healthReports: [newReport, ...prev.healthReports]
               }));
           }
      } catch (e) {
          console.error(e);
          alert("Couldn't read the report.");
      }
  };

  const handleGenerateReport = async () => {
      if(meals.length === 0) {
          alert("Log some meals first, darling!");
          return;
      }
      const r = await generateTrendReport(meals, user);
      if(r) setReport(r);
  }

  const handleUseMakeupCard = (meal: 'breakfast' | 'lunch' | 'dinner') => {
      if (user.checkInStats.makeupCards > 0) {
          setUser(prev => ({
              ...prev,
              checkInStats: {
                  ...prev.checkInStats,
                  makeupCards: prev.checkInStats.makeupCards - 1,
                  todayLog: { ...prev.checkInStats.todayLog, [meal]: true }
              }
          }));
      }
  };

  return (
    <div className="h-screen w-screen bg-mami-cream font-sans text-mami-brown overflow-hidden flex flex-col">
      <div className={`flex-1 relative ${view === AppView.CHAT || view === AppView.LIVE ? 'overflow-hidden' : 'overflow-y-auto no-scrollbar'}`}>
        {view === AppView.HOME && (
            <HomeView 
                user={user} 
                meals={meals} 
                onUseCard={handleUseMakeupCard} 
                onAddWater={handleAddWater}
                onDismissFact={() => setUser({...user, activeFoodFact: null})}
                onMealSlotClick={handleMealSlotClick}
                onMealCardClick={setAnalyzedMeal}
            />
        )}
        {view === AppView.CAMERA && <CameraView onAnalyze={handleAnalyzeFood} isAnalyzing={isAnalyzing} user={user} targetMealType={targetMealType} />}
        {view === AppView.CHAT && <ChatView user={user} />}
        {view === AppView.LIVE && <LiveView />}
        {view === AppView.PROFILE && <ProfileView user={user} setUser={setUser} onUploadReport={handleUploadReport} onGenerateReport={handleGenerateReport} />}
      </div>
      
      {analyzedMeal && (
          <MealAnalysisModal 
            meal={analyzedMeal} 
            onClose={() => {
                setAnalyzedMeal(null);
            }} 
          />
      )}

      {report && <ReportModal report={report} onClose={() => setReport(null)} />}

      <Navigation current={view} setView={setView} />
    </div>
  );
}
