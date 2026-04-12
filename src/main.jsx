import React, { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, Receipt, Plus, Trash2, ChevronLeft, ChevronRight, 
  TrendingUp, Wallet, PiggyBank, PieChart as PieChartIcon, RefreshCw, 
  ArrowUpRight, ArrowDownRight, CheckCircle, Cloud, CreditCard, 
  Calendar, Check, Link as LinkIcon, Globe, HandCoins, Coins, 
  ArrowRightLeft, Clock, ShieldCheck, AlertCircle, Sparkles, 
  Bot, BrainCircuit, Lightbulb, Download 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

/**
 * --- CONFIGURATION LOGIC ---
 * Optimized for external hosting (Vite/GitHub/Vercel).
 * It uses the 'getEnv' helper to safely access your VITE_ environment variables.
 */
const getEnv = (key) => {
  try {
    // Check for Vite environment variables
    return import.meta.env[key] || "";
  } catch (e) {
    return "";
  }
};

// Internal preview check for this dashboard
const isInternalPreview = typeof __firebase_config !== 'undefined';

const firebaseConfig = isInternalPreview 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: getEnv('VITE_FIREBASE_API_KEY'),
      authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
      projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
      storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
      appId: getEnv('VITE_FIREBASE_APP_ID')
    };

const appId = isInternalPreview ? (__app_id || 'budget-2026') : (getEnv('VITE_APP_ID') || 'budget-2026');
const geminiKey = isInternalPreview ? "" : getEnv('VITE_GEMINI_API_KEY');

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CATEGORIES = ["Housing", "Transport", "Food", "Utilities", "Insurance", "Healthcare", "Entertainment", "Shopping", "Debt/Credit", "Others"];
const COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#6366F1", "#1E293B", "#94A3B8"];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // State structure for all 12 months
  const [budgetData, setBudgetData] = useState(() => {
    const data = { recurring: [], currency: '$' };
    MONTHS.forEach((_, i) => {
      data[i] = { incomeItems: [], expenses: [], creditCards: [], collections: [] };
    });
    return data;
  });

  // Authentication Logic
  useEffect(() => {
    const initAuth = async () => {
      if (isInternalPreview && typeof __initial_auth_token !== 'undefined') {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Firestore Real-time Sync
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'budget');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setBudgetData(prev => ({ ...prev, ...snap.data() }));
      }
    });
  }, [user]);

  const saveData = async (dataToSave) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'budget');
      await setDoc(docRef, dataToSave);
    } catch (e) {
      console.error("Cloud save failed:", e);
    } finally {
      setTimeout(() => setIsSaving(false), 800);
    }
  };

  // Calculations for current month view
  const totals = useMemo(() => {
    const data = budgetData[currentMonthIndex] || { incomeItems: [], expenses: [], creditCards: [], collections: [] };
    const income = (data.incomeItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expenses = (data.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const ccDebt = (data.creditCards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const collectedIncome = (data.collections || []).reduce((s, c) => c.isCollected ? s + (Number(c.amount) || 0) : s, 0);
    const pendingIn = (data.collections || []).reduce((s, c) => c.isCollected ? s : s + (Number(c.amount) || 0), 0);
    
    const catTotals = (data.expenses || []).reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + (Number(e.amount) || 0);
      return acc;
    }, {});
    catTotals["Debt/Credit"] = (catTotals["Debt/Credit"] || 0) + ccDebt;

    const totalIncome = income + collectedIncome;
    const totalOut = expenses + ccDebt;

    return { totalIncome, totalExpenses: totalOut, remaining: totalIncome - totalOut, catTotals, pendingIn };
  }, [budgetData, currentMonthIndex]);

  // AI Integration
  const askAi = async () => {
    if (!geminiKey && !isInternalPreview) return setAiResponse("API Key not found in Environment Variables.");
    setIsAiLoading(true);
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Income: ${totals.totalIncome}, Expenses: ${totals.totalExpenses}. Breakdown: ${JSON.stringify(totals.catTotals)}. Suggest 3 budget improvements.` }] }],
          systemInstruction: { parts: [{ text: "You are an expert financial advisor. Provide short, punchy, actionable advice." }] }
        })
      });
      const result = await resp.json();
      setAiResponse(result.candidates?.[0]?.content?.parts?.[0]?.text || "No response from AI.");
    } catch (e) {
      setAiResponse("AI service error.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(budgetData, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `budget_2026_backup.json`);
    dl.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-blue-600 w-6 h-6" />
          <h1 className="text-xl font-black tracking-tight italic">Budget<span className="text-blue-600">2026</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={handleExport} className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 hover:text-slate-900 transition-colors">
            <Download className="w-3 h-3" /> Export
          </button>
          <div className="flex items-center bg-slate-100 rounded-xl p-1 shadow-inner">
            <button onClick={() => setCurrentMonthIndex(p => p === 0 ? 11 : p - 1)} className="p-1 hover:bg-white rounded-lg transition-all"><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-3 font-bold text-[10px] uppercase w-24 text-center tracking-widest">{MONTHS[currentMonthIndex]}</span>
            <button onClick={() => setCurrentMonthIndex(p => p === 11 ? 0 : p + 1)} className="p-1 hover:bg-white rounded-lg transition-all"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className={`p-2 rounded-full ${isSaving ? 'bg-amber-100' : 'bg-emerald-100'}`}>
            <Cloud className={`w-4 h-4 ${isSaving ? 'text-amber-600 animate-pulse' : 'text-emerald-600'}`} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Income</p>
            <p className="text-3xl font-black text-emerald-600">{budgetData.currency}{totals.totalIncome.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Spent</p>
            <p className="text-3xl font-black text-rose-600">{budgetData.currency}{totals.totalExpenses.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Flow</p>
            <p className={`text-3xl font-black ${totals.remaining < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
              {budgetData.currency}{totals.remaining.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black tracking-tight">✨ AI Financial Advisor</h3>
            <button onClick={askAi} disabled={isAiLoading} className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 active:scale-95">
              {isAiLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-400" />} Analyze Budget
            </button>
          </div>
          {aiResponse ? (
            <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl text-sm leading-relaxed text-slate-700 animate-in fade-in duration-500 whitespace-pre-wrap">
              {aiResponse}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-300 text-xs italic font-medium">
              Click the button above to get personalized AI spending tips for {MONTHS[currentMonthIndex]}.
            </div>
          )}
        </div>

        <nav className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          {['overview', 'income', 'expenses', 'cards', 'collections'].map(t => (
            <button 
              key={t} 
              onClick={() => setActiveTab(t)}
              className={`px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${activeTab === t ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              {t}
            </button>
          ))}
        </nav>
        
        {activeTab !== 'overview' && (
          <div className="bg-white p-16 rounded-[40px] border border-slate-200 shadow-sm text-center space-y-4">
            <div className="p-4 bg-slate-50 w-fit mx-auto rounded-full"><Bot className="w-8 h-8 text-slate-300" /></div>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
              Add your {activeTab} entries here once deployed.
            </p>
            <p className="text-slate-300 text-[10px] max-w-xs mx-auto">
              This panel is optimized for your private host. Sync your GitHub repo to see your data live.
            </p>
          </div>
        )}
      </main>
      
      <footer className="py-20 text-center opacity-30 select-none">
        <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400">Secure Personal Ledger — v2.6.4</p>
      </footer>
    </div>
  );
}