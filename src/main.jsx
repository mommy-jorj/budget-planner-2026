import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  TrendingUp, ChevronLeft, ChevronRight, RefreshCw, Cloud, 
  Sparkles, Bot, Plus, Trash2, Wallet, Receipt, CreditCard, 
  HandCoins, Check, Volume2, BrainCircuit, Lightbulb, Zap, AlertTriangle
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIG & FIREBASE ---
const getEnv = (key) => { try { return import.meta.env[key] || ""; } catch (e) { return ""; } };
const isInternalPreview = typeof __firebase_config !== 'undefined';

const firebaseConfig = isInternalPreview ? JSON.parse(__firebase_config) : {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

// SAFETY CHECK: Ensure Firebase has an API Key before starting
const hasConfig = isInternalPreview || (firebaseConfig.apiKey && firebaseConfig.apiKey.length > 5);

let auth, db, appId;

if (hasConfig) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  const rawId = isInternalPreview ? (__app_id || 'budget-2026') : (getEnv('VITE_APP_ID') || 'budget-2026');
  appId = rawId.replace(/\//g, '_'); 
}

const geminiKey = isInternalPreview ? "" : getEnv('VITE_GEMINI_API_KEY');
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
  const [user, setUser] = useState(null);
  const [aiResponse, setAiResponse] = useState("");
  const [budgetData, setBudgetData] = useState(() => {
    const data = { recurring: [], currency: '$' };
    MONTHS.forEach((_, i) => { data[i] = { incomeItems: [], expenses: [], creditCards: [], collections: [] }; });
    return data;
  });

  useEffect(() => {
    if (!hasConfig) return;
    const initAuth = async () => {
      if (isInternalPreview && typeof __initial_auth_token !== 'undefined') {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else { await signInAnonymously(auth); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !hasConfig) return;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'budget');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) setBudgetData(prev => ({ ...prev, ...snap.data() }));
    });
  }, [user]);

  // RENDER ERROR STATE IF CONFIG IS MISSING
  if (!hasConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">Configuration Required</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            The application is running, but your Firebase API Keys are missing. Please add them to your Environment Variables in Vercel.
          </p>
          <div className="bg-slate-50 p-4 rounded-2xl text-[10px] font-mono text-left overflow-x-auto text-slate-400">
            Check: VITE_FIREBASE_API_KEY
          </div>
        </div>
      </div>
    );
  }

  const totals = useMemo(() => {
    const data = budgetData[currentMonthIndex] || { incomeItems: [], expenses: [], creditCards: [], collections: [] };
    const income = (data.incomeItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expenses = (data.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const ccDebt = (data.creditCards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const inTotal = income + (data.collections || []).reduce((s, c) => c.isCollected ? s + (Number(c.amount) || 0) : s, 0);
    return { inTotal, outTotal: expenses + ccDebt, rem: inTotal - (expenses + ccDebt) };
  }, [budgetData, currentMonthIndex]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4">
      <header className="max-w-5xl mx-auto flex items-center justify-between mb-8 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2"><TrendingUp className="text-blue-600" /><h1 className="font-black italic">Budget<span className="text-blue-600">2026</span></h1></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentMonthIndex(p => p === 0 ? 11 : p - 1)} className="p-1"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-[10px] font-black uppercase tracking-widest w-24 text-center">{MONTHS[currentMonthIndex]}</span>
          <button onClick={() => setCurrentMonthIndex(p => p === 11 ? 0 : p + 1)} className="p-1"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-[32px] border border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Income</p>
            <p className="text-3xl font-black text-emerald-600">{budgetData.currency}{totals.inTotal.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Spent</p>
            <p className="text-3xl font-black text-rose-600">{budgetData.currency}{totals.outTotal.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net</p>
            <p className={`text-3xl font-black ${totals.rem < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
              {budgetData.currency}{totals.rem.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="bg-white p-12 rounded-[40px] border border-slate-200 text-center text-slate-300">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-[10px] font-black uppercase tracking-widest">Section: {activeTab}</p>
          <p className="italic text-xs mt-2">App is connected. Toggle categories to begin entry.</p>
        </div>
      </main>
    </div>
  );
}

// React Mounting Point
const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}