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
const CATEGORIES = ["Housing", "Transport", "Food", "Utilities", "Insurance", "Healthcare", "Entertainment", "Shopping", "Debt/Credit", "Others"];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
  const [user, setUser] = useState(null);
  const [aiResponse, setAiResponse] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const saveData = async (dataToSave) => {
    if (!user || !hasConfig) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'budget'), dataToSave);
    } catch (e) { console.error(e); }
    finally { setTimeout(() => setIsSaving(false), 800); }
  };

  if (!hasConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white p-10 rounded-[40px] border border-slate-200 shadow-xl text-center">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-6" />
          <h2 className="text-xl font-black mb-2">Configuration Required</h2>
          <p className="text-sm text-slate-500 mb-6">Please add your VITE_FIREBASE_API_KEY to Vercel Environment Variables.</p>
        </div>
      </div>
    );
  }

  const currentData = budgetData[currentMonthIndex] || { incomeItems: [], expenses: [], creditCards: [], collections: [] };

  const totals = useMemo(() => {
    const income = (currentData.incomeItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expenses = (currentData.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const ccDebt = (currentData.creditCards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const inTotal = income + (currentData.collections || []).reduce((s, c) => c.isCollected ? s + (Number(c.amount) || 0) : s, 0);
    return { inTotal, outTotal: expenses + ccDebt, rem: inTotal - (expenses + ccDebt) };
  }, [budgetData, currentMonthIndex]);

  const addItem = (type) => {
    const newItem = type === 'incomeItems' ? { id: Date.now(), source: '', amount: 0 } :
                   type === 'expenses' ? { id: Date.now(), description: '', amount: 0, category: 'Food' } :
                   type === 'creditCards' ? { id: Date.now(), name: '', balance: 0 } :
                   { id: Date.now(), debtor: '', amount: 0, isCollected: false };
    const newData = { ...budgetData, [currentMonthIndex]: { ...currentData, [type]: [...(currentData[type] || []), newItem] } };
    setBudgetData(newData);
    saveData(newData);
  };

  const updateItem = (type, id, field, value) => {
    const newList = (currentData[type] || []).map(item => item.id === id ? { ...item, [field]: value } : item);
    const newData = { ...budgetData, [currentMonthIndex]: { ...currentData, [type]: newList } };
    setBudgetData(newData);
    saveData(newData);
  };

  const removeItem = (type, id) => {
    const newList = (currentData[type] || []).filter(item => item.id !== id);
    const newData = { ...budgetData, [currentMonthIndex]: { ...currentData, [type]: newList } };
    setBudgetData(newData);
    saveData(newData);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-4">
      <header className="max-w-5xl mx-auto flex items-center justify-between p-6 bg-white/80 backdrop-blur-md rounded-[32px] border border-slate-200 shadow-sm sticky top-4 z-50">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-blue-600 w-6 h-6" />
          <h1 className="text-xl font-black italic tracking-tighter">Budget<span className="text-blue-600">2026</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-2xl p-1">
            <button onClick={() => setCurrentMonthIndex(p => p === 0 ? 11 : p - 1)} className="p-1.5 hover:bg-white rounded-xl transition-all"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-[10px] font-black uppercase tracking-widest w-24 text-center">{MONTHS[currentMonthIndex]}</span>
            <button onClick={() => setCurrentMonthIndex(p => p === 11 ? 0 : p + 1)} className="p-1.5 hover:bg-white rounded-xl transition-all"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className={`p-2.5 rounded-2xl border ${isSaving ? 'bg-amber-50 border-amber-100 text-amber-500' : 'bg-emerald-50 border-emerald-100 text-emerald-500'}`}>
            <Cloud className={`w-4 h-4 ${isSaving ? 'animate-pulse' : ''}`} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto mt-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Income</p>
            <p className="text-3xl font-black text-emerald-600 tracking-tight">{budgetData.currency}{totals.inTotal.toLocaleString()}</p>
          </div>
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Expenses</p>
            <p className="text-3xl font-black text-rose-600 tracking-tight">{budgetData.currency}{totals.outTotal.toLocaleString()}</p>
          </div>
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Flow</p>
            <p className={`text-3xl font-black tracking-tight ${totals.rem < 0 ? 'text-rose-600' : 'text-blue-600'}`}>{budgetData.currency}{totals.rem.toLocaleString()}</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {['overview', 'income', 'expenses', 'cards', 'collections'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all whitespace-nowrap ${activeTab === t ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white text-slate-500 border-slate-200'}`}>{t}</button>
          ))}
        </nav>

        <div className="bg-white p-8 rounded-[48px] border border-slate-200 shadow-sm min-h-[400px]">
          {activeTab === 'overview' && (
            <div className="text-center py-20 space-y-4">
              <Bot className="w-12 h-12 text-slate-200 mx-auto" />
              <h3 className="text-lg font-black tracking-tight">Financial Overview</h3>
              <p className="text-slate-400 text-xs max-w-sm mx-auto">Toggle tabs to log your income and expenses for {MONTHS[currentMonthIndex]}. AI insights will appear here once analyzed.</p>
            </div>
          )}

          {activeTab === 'income' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-xl tracking-tight">Monthly Income</h3>
                <button onClick={() => addItem('incomeItems')} className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-all"><Plus className="w-5 h-5" /></button>
              </div>
              {currentData.incomeItems.map(item => (
                <div key={item.id} className="flex gap-4 items-center bg-slate-50 p-4 rounded-3xl border border-transparent hover:border-slate-200 transition-all">
                  <input className="flex-1 bg-transparent border-none outline-none font-bold text-sm" placeholder="Source name..." value={item.source} onChange={(e) => updateItem('incomeItems', item.id, 'source', e.target.value)} />
                  <input className="w-28 bg-white border border-slate-200 rounded-2xl px-4 py-2 text-sm font-black text-emerald-600" type="number" value={item.amount} onChange={(e) => updateItem('incomeItems', item.id, 'amount', e.target.value)} />
                  <button onClick={() => removeItem('incomeItems', item.id)} className="p-2 text-rose-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-xl tracking-tight">Spending Log</h3>
                <button onClick={() => addItem('expenses')} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-all"><Plus className="w-5 h-5" /></button>
              </div>
              {currentData.expenses.map(item => (
                <div key={item.id} className="flex gap-4 items-center bg-slate-50 p-4 rounded-3xl border border-transparent hover:border-slate-200 transition-all">
                  <select className="text-[10px] font-black uppercase bg-white border border-slate-200 rounded-xl p-2" value={item.category} onChange={(e) => updateItem('expenses', item.id, 'category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input className="flex-1 bg-transparent border-none outline-none font-bold text-sm" placeholder="Description..." value={item.description} onChange={(e) => updateItem('expenses', item.id, 'description', e.target.value)} />
                  <input className="w-28 bg-white border border-slate-200 rounded-2xl px-4 py-2 text-sm font-black text-rose-600" type="number" value={item.amount} onChange={(e) => updateItem('expenses', item.id, 'amount', e.target.value)} />
                  <button onClick={() => removeItem('expenses', item.id)} className="p-2 text-rose-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
          
          {/* Credit Card and Collection screens would follow similar patterns */}
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