import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { 
  TrendingUp, ChevronLeft, ChevronRight, RefreshCw, Cloud, 
  Sparkles, Bot, Download, Plus, Trash2, Wallet, Receipt, 
  CreditCard, HandCoins, Check, CheckCircle, AlertCircle, 
  ShieldCheck, BrainCircuit, Lightbulb
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

/**
 * --- CONFIGURATION & FIREBASE SETUP ---
 */
const getEnv = (key) => {
  try {
    return import.meta.env[key] || "";
  } catch (e) {
    return "";
  }
};

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CATEGORIES = ["Housing", "Transport", "Food", "Utilities", "Insurance", "Healthcare", "Entertainment", "Shopping", "Debt/Credit", "Others"];

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
  const [user, setUser] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [budgetData, setBudgetData] = useState(() => {
    const data = { recurring: [], currency: '$' };
    MONTHS.forEach((_, i) => {
      data[i] = { incomeItems: [], expenses: [], creditCards: [], collections: [] };
    });
    return data;
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (isInternalPreview && typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'budget');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) setBudgetData(prev => ({ ...prev, ...snap.data() }));
    }, (err) => console.error("Sync error:", err));
  }, [user, appId]);

  const saveData = async (dataToSave) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'budget'), dataToSave);
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setTimeout(() => setIsSaving(false), 800);
    }
  };

  const currentData = budgetData[currentMonthIndex] || { incomeItems: [], expenses: [], creditCards: [], collections: [] };

  const totals = useMemo(() => {
    const income = (currentData.incomeItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expenses = (currentData.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const ccDebt = (currentData.creditCards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0);
    const collected = (currentData.collections || []).reduce((s, c) => c.isCollected ? s + (Number(c.amount) || 0) : s, 0);

    const totalIncome = income + collected;
    const totalOut = expenses + ccDebt;

    return { totalIncome, totalExpenses: totalOut, remaining: totalIncome - totalOut };
  }, [budgetData, currentMonthIndex]);

  // Logic for adding items
  const addItem = (type) => {
    const newItem = type === 'incomeItems' ? { id: Date.now(), source: '', amount: 0 } :
                   type === 'expenses' ? { id: Date.now(), description: '', amount: 0, category: 'Food' } :
                   type === 'creditCards' ? { id: Date.now(), name: '', balance: 0, minPay: 0, isPaid: false } :
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

  const askAi = async () => {
    if (!geminiKey && !isInternalPreview) return setAiResponse("Configure Gemini API key in environment variables.");
    setIsAiLoading(true);
    try {
      const prompt = `Analyze budget for ${MONTHS[currentMonthIndex]}. Income: ${totals.totalIncome}, Expenses: ${totals.totalExpenses}. Suggestions?`;
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: "You are an expert financial advisor. Be brief." }] }
        })
      });
      const res = await resp.json();
      setAiResponse(res.candidates[0].content.parts[0].text);
    } catch (e) {
      setAiResponse("AI Coach is currently offline.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4">
      <header className="max-w-5xl mx-auto flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-blue-600 w-6 h-6" />
          <h1 className="text-xl font-black italic tracking-tight">Budget<span className="text-blue-600">2026</span></h1>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
          <button onClick={() => setCurrentMonthIndex(p => p === 0 ? 11 : p - 1)} className="p-1"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-[10px] font-black uppercase tracking-widest w-24 text-center">{MONTHS[currentMonthIndex]}</span>
          <button onClick={() => setCurrentMonthIndex(p => p === 11 ? 0 : p + 1)} className="p-1"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Income</p>
            <p className="text-3xl font-black text-emerald-600">{budgetData.currency}{totals.totalIncome.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Expenses</p>
            <p className="text-3xl font-black text-rose-600">{budgetData.currency}{totals.totalExpenses.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Flow</p>
            <p className={`text-3xl font-black ${totals.remaining < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
              {budgetData.currency}{totals.remaining.toLocaleString()}
            </p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto no-scrollbar py-2">
          {['overview', 'income', 'expenses', 'cards', 'collections'].map(t => (
            <button 
              key={t} 
              onClick={() => setActiveTab(t)}
              className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all whitespace-nowrap ${activeTab === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg tracking-tight uppercase">AI Financial Coach</h3>
                <button onClick={askAi} disabled={isAiLoading} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 disabled:opacity-50">
                  {isAiLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-400" />} Analyze
                </button>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-sm leading-relaxed min-h-[100px] flex items-center justify-center text-center">
                 {aiResponse || "Click analyze to get spending tips."}
              </div>
            </div>
          )}

          {activeTab === 'income' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-lg uppercase tracking-widest text-slate-400">Income Sources</h3>
                <button onClick={() => addItem('incomeItems')} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              {(currentData.incomeItems || []).map(item => (
                <div key={item.id} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <input className="flex-1 bg-transparent border-none outline-none font-bold text-sm" placeholder="Source..." value={item.source} onChange={(e) => updateItem('incomeItems', item.id, 'source', e.target.value)} />
                  <input className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-black" type="number" value={item.amount} onChange={(e) => updateItem('incomeItems', item.id, 'amount', e.target.value)} />
                  <button onClick={() => removeItem('incomeItems', item.id)} className="text-rose-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-lg uppercase tracking-widest text-slate-400">Expense Logs</h3>
                <button onClick={() => addItem('expenses')} className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              {(currentData.expenses || []).map(item => (
                <div key={item.id} className="flex gap-3 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <select className="text-[10px] font-black uppercase bg-white border border-slate-200 rounded-lg p-1" value={item.category} onChange={(e) => updateItem('expenses', item.id, 'category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input className="flex-1 bg-transparent border-none outline-none font-bold text-sm" placeholder="Description..." value={item.description} onChange={(e) => updateItem('expenses', item.id, 'description', e.target.value)} />
                  <input className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-black" type="number" value={item.amount} onChange={(e) => updateItem('expenses', item.id, 'amount', e.target.value)} />
                  <button onClick={() => removeItem('expenses', item.id)} className="text-rose-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'cards' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-lg uppercase tracking-widest text-slate-400">Credit Cards</h3>
                <button onClick={() => addItem('creditCards')} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              {(currentData.creditCards || []).map(item => (
                <div key={item.id} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <input className="flex-1 bg-transparent border-none outline-none font-bold text-sm" placeholder="Card Name..." value={item.name} onChange={(e) => updateItem('creditCards', item.id, 'name', e.target.value)} />
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Balance</span>
                    <input className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-black" type="number" value={item.balance} onChange={(e) => updateItem('creditCards', item.id, 'balance', e.target.value)} />
                  </div>
                  <button onClick={() => removeItem('creditCards', item.id)} className="text-rose-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'collections' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-lg uppercase tracking-widest text-slate-400">Receivables</h3>
                <button onClick={() => addItem('collections')} className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              {(currentData.collections || []).map(item => (
                <div key={item.id} className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <button onClick={() => updateItem('collections', item.id, 'isCollected', !item.isCollected)} className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${item.isCollected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200'}`}>
                    {item.isCollected && <Check className="w-4 h-4" />}
                  </button>
                  <input className="flex-1 bg-transparent border-none outline-none font-bold text-sm" placeholder="Debtor..." value={item.debtor} onChange={(e) => updateItem('collections', item.id, 'debtor', e.target.value)} />
                  <input className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-black" type="number" value={item.amount} onChange={(e) => updateItem('collections', item.id, 'amount', e.target.value)} />
                  <button onClick={() => removeItem('collections', item.id)} className="text-rose-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-5xl mx-auto mt-12 py-8 text-center opacity-40">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm">
          <Cloud className="w-3 h-3 text-emerald-500" />
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cloud Data Sync Active — v2.6.9</span>
        </div>
      </footer>
    </div>
  );
}

// Ensure the root element is matched to index.html
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);