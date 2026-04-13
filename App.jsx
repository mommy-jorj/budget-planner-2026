import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  CreditCard, 
  HandCoins, 
  Settings, 
  TrendingUp, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  Download, 
  Users, 
  Calendar, 
  DollarSign, 
  PieChart as PieIcon,
  Copy,
  Check,
  Lock,
  Unlock,
  Printer,
  ArrowUpRight,
  ArrowDownLeft,
  BellRing,
  AlertCircle
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot 
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : { apiKey: "" };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Sanitizing appId is critical to prevent "Invalid segment count" errors in Firestore
const appId = (typeof __app_id !== 'undefined' ? __app_id : 'budget-planner-2026').replace(/[^a-zA-Z0-9]/g, '_');

const CATEGORIES = [
  'Housing', 'Utilities', 'Food', 'Transport', 'Healthcare', 
  'Insurance', 'Entertainment', 'Shopping', 'Debt', 'Other'
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const CURRENCIES = [
  { symbol: '$', code: 'USD', name: 'US Dollar' },
  { symbol: '€', code: 'EUR', name: 'Euro' },
  { symbol: '£', code: 'GBP', name: 'British Pound' },
  { symbol: '¥', code: 'JPY', name: 'Japanese Yen' },
  { symbol: '₱', code: 'PHP', name: 'Philippine Peso' }
];

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(true);
  const [sharedBudgetId, setSharedBudgetId] = useState(null); 
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [notifPermission, setNotifPermission] = useState('default');

  // Initialize Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
    }

    return () => unsubscribe();
  }, []);

  // Real-time Data Listener
  useEffect(() => {
    if (!user) return;

    const targetUid = sharedBudgetId || user.uid;
    // Paths must have an even number of segments: artifacts(1)/appId(2)/public(3)/data(4)/budgets(5)/targetUid(6)
    const docPath = sharedBudgetId 
      ? doc(db, 'artifacts', appId, 'public', 'data', 'budgets', targetUid)
      : doc(db, 'artifacts', appId, 'users', targetUid, 'settings', 'mainData');

    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAllData(data.months || {});
        if (data.currency) setCurrency(data.currency);
      } else if (!sharedBudgetId) {
        setAllData({});
      }
      setLoading(false);
    }, (err) => {
      console.error("Firestore Listener Error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, sharedBudgetId]);

  const saveData = async (updatedMonths, updatedCurrency) => {
    if (!user || isReadOnly) return;
    const targetUid = sharedBudgetId || user.uid;
    const docPath = sharedBudgetId 
      ? doc(db, 'artifacts', appId, 'public', 'data', 'budgets', targetUid)
      : doc(db, 'artifacts', appId, 'users', targetUid, 'settings', 'mainData');

    try {
      await setDoc(docPath, {
        months: updatedMonths || allData,
        currency: updatedCurrency || currency,
        lastUpdated: new Date().toISOString(),
        ownerId: targetUid
      }, { merge: true });
    } catch (err) {
      console.error("Save Error:", err);
    }
  };

  const currentMonthData = useMemo(() => {
    return allData[selectedMonth] || {
      income: 0,
      expenses: [],
      recurringBills: [],
      creditCards: [],
      collections: []
    };
  }, [allData, selectedMonth]);

  const updateCurrentMonth = (newData) => {
    if (isReadOnly) return;
    const updated = { ...allData, [selectedMonth]: { ...currentMonthData, ...newData } };
    setAllData(updated);
    saveData(updated);
  };

  const triggerReminders = () => {
    const pending = (currentMonthData.collections || []).filter(c => c.status === 'Pending');
    if (pending.length === 0) return;

    if (Notification.permission === 'granted') {
      pending.forEach(item => {
        const title = item.type === 'Debit' ? 'Payment Due' : 'Collection Reminder';
        const body = `${item.name}: ${currency.symbol}${item.amount}${item.dueDate ? ` (Due: ${item.dueDate})` : ''}`;
        new Notification(title, { body });
      });
    }
  };

  const totals = useMemo(() => {
    const month = currentMonthData;
    const prevMonth = allData[selectedMonth - 1] || null;
    const baseIncome = Number(month.income) || 0;
    const collections = month.collections || [];
    
    const collectedCredit = collections.filter(c => c.status === 'Collected' && (c.type === 'Credit' || !c.type)).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const collectedDebit = collections.filter(c => c.status === 'Collected' && c.type === 'Debit').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const pendingCredit = collections.filter(c => c.status === 'Pending' && (c.type === 'Credit' || !c.type)).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const pendingDebit = collections.filter(c => c.status === 'Pending' && c.type === 'Debit').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    
    const totalIncome = baseIncome + collectedCredit;
    const manualExpenses = (month.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const ccExpenses = (month.creditCards || []).reduce((sum, c) => sum + (Number(c.statementBalance) || 0), 0);
    const recurringExpenses = (month.recurringBills || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    const totalExpenses = manualExpenses + ccExpenses + recurringExpenses + collectedDebit;
    const totalSavings = totalIncome - totalExpenses;

    let prevTotalExpenses = 0;
    if (prevMonth) {
      const pManual = (prevMonth.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const pCc = (prevMonth.creditCards || []).reduce((sum, c) => sum + (Number(c.statementBalance) || 0), 0);
      const pRec = (prevMonth.recurringBills || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const pCollDeb = (prevMonth.collections || []).filter(c => c.status === 'Collected' && c.type === 'Debit').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      prevTotalExpenses = pManual + pCc + pRec + pCollDeb;
    }

    const categoryTotals = {};
    [...(month.expenses || []), ...(month.recurringBills || [])].forEach(e => { 
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.amount); 
    });
    (month.creditCards || []).forEach(c => { 
      categoryTotals['Debt/CC'] = (categoryTotals['Debt/CC'] || 0) + Number(c.statementBalance); 
    });
    if (collectedDebit > 0) categoryTotals['Paid Collections'] = (categoryTotals['Paid Collections'] || 0) + collectedDebit;

    return { totalIncome, totalExpenses, totalSavings, collectedCredit, collectedDebit, pendingCredit, pendingDebit, prevTotalExpenses, categoryTotals };
  }, [currentMonthData, allData, selectedMonth]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 text-indigo-600">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-0 md:pl-64 transition-all duration-300">
      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-slate-200 bg-white p-6 md:block print:hidden">
        <div className="mb-8 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-lg">B</div>
          <h1 className="text-xl font-bold tracking-tight">Fin2026</h1>
        </div>

        <nav className="space-y-1">
          <SidebarItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} Icon={LayoutDashboard} label="Overview" />
          <SidebarItem active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} Icon={Receipt} label="Expenses" />
          <SidebarItem active={activeTab === 'cc'} onClick={() => setActiveTab('cc')} Icon={CreditCard} label="CC Tracker" />
          <SidebarItem active={activeTab === 'collections'} onClick={() => setActiveTab('collections')} Icon={HandCoins} label="Collections" />
          <SidebarItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} Icon={Settings} label="Settings" />
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="rounded-xl bg-slate-50 p-4 border text-[11px] font-semibold text-slate-600">
            <p className="text-[10px] text-slate-400 uppercase mb-1">User ID</p>
            <p className="truncate font-mono">{user?.uid || 'Unknown'}</p>
          </div>
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-md print:hidden">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button onClick={() => setSelectedMonth(m => Math.max(0, m - 1))} className="p-1.5 hover:bg-white rounded-md transition"><ChevronLeft size={18}/></button>
            <h2 className="text-sm font-bold w-28 text-center">{MONTHS[selectedMonth]} 2026</h2>
            <button onClick={() => setSelectedMonth(m => Math.min(11, m + 1))} className="p-1.5 hover:bg-white rounded-md transition"><ChevronRight size={18}/></button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={triggerReminders} className="p-2 text-slate-400 hover:text-indigo-600 transition relative">
            <BellRing size={20}/>
            {(currentMonthData.collections || []).some(c => c.status === 'Pending') && (
              <span className="absolute top-2 right-2 h-2 w-2 bg-rose-500 rounded-full border border-white"></span>
            )}
          </button>
          <button onClick={() => window.print()} className="px-3 py-1.5 bg-white border text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50"><Printer size={14} className="inline mr-1"/> PDF</button>
          <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
          <span className="font-bold text-indigo-600 text-sm">{currency.symbol} {currency.code}</span>
        </div>
      </header>

      {/* Main View Port */}
      <main className="p-6 max-w-6xl mx-auto">
        {activeTab === 'dashboard' && <DashboardView totals={totals} monthData={currentMonthData} currency={currency} updateData={updateCurrentMonth} isReadOnly={isReadOnly} />}
        {activeTab === 'expenses' && <ExpensesView monthData={currentMonthData} currency={currency} updateData={updateCurrentMonth} isReadOnly={isReadOnly} />}
        {activeTab === 'cc' && <CreditCardView monthData={currentMonthData} currency={currency} updateData={updateCurrentMonth} isReadOnly={isReadOnly} />}
        {activeTab === 'collections' && <CollectionsView monthData={currentMonthData} currency={currency} updateData={updateCurrentMonth} isReadOnly={isReadOnly} triggerReminders={triggerReminders} />}
        {activeTab === 'settings' && <SettingsView user={user} currency={currency} setCurrency={setCurrency} sharedBudgetId={sharedBudgetId} setSharedBudgetId={setSharedBudgetId} isReadOnly={isReadOnly} setIsReadOnly={setIsReadOnly} saveData={saveData} notifPermission={notifPermission} setNotifPermission={setNotifPermission} />}
      </main>

      {/* Mobile Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t bg-white md:hidden p-2 gap-1 print:hidden">
        <MobileLink active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} Icon={LayoutDashboard} label="Home" />
        <MobileLink active={activeTab === 'expenses'} onClick={() => setActiveTab('expenses')} Icon={Receipt} label="Bills" />
        <MobileLink active={activeTab === 'cc'} onClick={() => setActiveTab('cc')} Icon={CreditCard} label="Cards" />
        <MobileLink active={activeTab === 'collections'} onClick={() => setActiveTab('collections')} Icon={HandCoins} label="Owed" />
        <MobileLink active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} Icon={Settings} label="Set" />
      </nav>
    </div>
  );
};

// --- View Sub-Components ---

const DashboardView = ({ totals, monthData, currency, updateData, isReadOnly }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Total Income</p>
        <div className="text-3xl font-bold mb-4">{currency.symbol}{totals.totalIncome.toLocaleString()}</div>
        <div className="flex justify-between text-xs pt-2 border-t font-medium">
          <span className="text-slate-500">Base</span>
          <input type="number" disabled={isReadOnly} value={monthData.income || ''} onChange={(e) => updateData({ income: e.target.value })} className="w-20 text-right bg-slate-50 rounded outline-none px-1" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Total Expenses</p>
        <div className="text-3xl font-bold mb-4">{currency.symbol}{totals.totalExpenses.toLocaleString()}</div>
        <div className="flex items-center gap-1 text-[11px] font-bold">
          <TrendingUp size={14} className={totals.totalExpenses > totals.prevTotalExpenses ? 'text-rose-600' : 'text-emerald-600'}/>
          <span className={totals.totalExpenses > totals.prevTotalExpenses ? 'text-rose-600' : 'text-emerald-600'}>
            {currency.symbol}{Math.abs(totals.totalExpenses - totals.prevTotalExpenses).toLocaleString()}
          </span>
          <span className="text-slate-400 font-medium ml-1">vs last mo</span>
        </div>
      </div>
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Savings</p>
        <div className="text-3xl font-bold mb-4">{currency.symbol}{totals.totalSavings.toLocaleString()}</div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, (totals.totalSavings / (totals.totalIncome || 1)) * 100))}%` }}></div>
        </div>
      </div>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <h3 className="font-bold flex items-center gap-2 mb-6 text-sm"><PieIcon size={16}/> Spending Categories</h3>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
          {Object.entries(totals.categoryTotals).map(([cat, val]) => (
            <div key={cat} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2">
              <span className="text-slate-500">{cat}</span>
              <span className="font-bold">{currency.symbol}{val.toLocaleString()}</span>
            </div>
          ))}
          {Object.keys(totals.categoryTotals).length === 0 && <p className="text-xs text-slate-400 italic">No expenses recorded yet.</p>}
        </div>
      </div>
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <h3 className="font-bold mb-4 flex items-center gap-2 text-sm"><BellRing size={16}/> Pending Dues</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-600 uppercase">To Collect</p>
            <p className="text-lg font-bold text-emerald-700">{currency.symbol}{totals.pendingCredit.toLocaleString()}</p>
          </div>
          <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
            <p className="text-[10px] font-bold text-rose-600 uppercase">To Pay</p>
            <p className="text-lg font-bold text-rose-700">{currency.symbol}{totals.pendingDebit.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ExpensesView = ({ monthData, currency, updateData, isReadOnly }) => {
  const [newExp, setNewExp] = useState({ description: '', amount: '', category: CATEGORIES[0] });
  const [newRec, setNewRec] = useState({ description: '', amount: '', category: CATEGORIES[0] });

  const add = (type) => {
    if (isReadOnly) return;
    if (type === 'manual' && newExp.description && newExp.amount) {
      updateData({ expenses: [...(monthData.expenses || []), { ...newExp, id: Date.now() }] });
      setNewExp({ description: '', amount: '', category: CATEGORIES[0] });
    } else if (type === 'recurring' && newRec.description && newRec.amount) {
      updateData({ recurringBills: [...(monthData.recurringBills || []), { ...newRec, id: Date.now() }] });
      setNewRec({ description: '', amount: '', category: CATEGORIES[0] });
    }
  };

  const remove = (id, listKey) => {
    if (isReadOnly) return;
    updateData({ [listKey]: monthData[listKey].filter(item => item.id !== id) });
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-base font-bold text-slate-800 mb-4">Variable Expenses</h3>
        <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
          {!isReadOnly && (
            <div className="p-4 grid grid-cols-12 gap-2 bg-slate-50/50 border-b">
              <input className="col-span-12 md:col-span-5 bg-white border rounded-xl px-4 py-2 text-sm outline-none" placeholder="Description" value={newExp.description} onChange={e => setNewExp({...newExp, description: e.target.value})} />
              <input type="number" className="col-span-6 md:col-span-2 bg-white border rounded-xl px-4 py-2 text-sm outline-none" placeholder="0.00" value={newExp.amount} onChange={e => setNewExp({...newExp, amount: e.target.value})} />
              <select className="col-span-6 md:col-span-3 bg-white border rounded-xl px-4 py-2 text-sm outline-none" value={newExp.category} onChange={e => setNewExp({...newExp, category: e.target.value})}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <button onClick={() => add('manual')} className="col-span-12 md:col-span-2 bg-indigo-600 text-white rounded-xl py-2 font-bold hover:bg-indigo-700">Add</button>
            </div>
          )}
          <div className="divide-y">
            {(monthData.expenses || []).map(exp => (
              <div key={exp.id} className="p-4 grid grid-cols-12 items-center text-sm hover:bg-slate-50 group">
                <span className="col-span-5 font-medium">{exp.description}</span>
                <span className="col-span-3 font-bold text-rose-600">{currency.symbol}{Number(exp.amount).toLocaleString()}</span>
                <span className="col-span-3"><span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold uppercase">{exp.category}</span></span>
                {!isReadOnly && <button onClick={() => remove(exp.id, 'expenses')} className="col-span-1 text-slate-300 hover:text-rose-500 text-right opacity-0 group-hover:opacity-100 transition"><Trash2 size={16}/></button>}
              </div>
            ))}
            {(monthData.expenses || []).length === 0 && <p className="p-8 text-center text-slate-400 italic text-sm">No expenses logged for this month.</p>}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold text-slate-800 mb-4">Fixed Recurring Bills</h3>
        <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
          {!isReadOnly && (
            <div className="p-4 grid grid-cols-12 gap-2 bg-slate-50/50 border-b">
              <input className="col-span-12 md:col-span-5 bg-white border rounded-xl px-4 py-2 text-sm outline-none" placeholder="e.g. Rent, Netflix" value={newRec.description} onChange={e => setNewRec({...newRec, description: e.target.value})} />
              <input type="number" className="col-span-6 md:col-span-2 bg-white border rounded-xl px-4 py-2 text-sm outline-none" placeholder="0.00" value={newRec.amount} onChange={e => setNewRec({...newRec, amount: e.target.value})} />
              <select className="col-span-6 md:col-span-3 bg-white border rounded-xl px-4 py-2 text-sm outline-none" value={newRec.category} onChange={e => setNewRec({...newRec, category: e.target.value})}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <button onClick={() => add('recurring')} className="col-span-12 md:col-span-2 bg-slate-800 text-white rounded-xl py-2 font-bold hover:bg-black">Add</button>
            </div>
          )}
          <div className="divide-y">
            {(monthData.recurringBills || []).map(bill => (
              <div key={bill.id} className="p-4 grid grid-cols-12 items-center text-sm hover:bg-slate-50 group">
                <span className="col-span-5 font-medium">{bill.description}</span>
                <span className="col-span-3 font-bold">{currency.symbol}{Number(bill.amount).toLocaleString()}</span>
                <span className="col-span-3"><span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold uppercase">{bill.category}</span></span>
                {!isReadOnly && <button onClick={() => remove(bill.id, 'recurring')} className="col-span-1 text-slate-300 hover:text-rose-500 text-right opacity-0 group-hover:opacity-100 transition"><Trash2 size={16}/></button>}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const CreditCardView = ({ monthData, currency, updateData, isReadOnly }) => {
  const [newCC, setNewCC] = useState({ cardName: '', dueDate: '', statementBalance: '' });
  const add = () => {
    if (isReadOnly || !newCC.cardName || !newCC.statementBalance) return;
    updateData({ creditCards: [...(monthData.creditCards || []), { ...newCC, id: Date.now() }] });
    setNewCC({ cardName: '', dueDate: '', statementBalance: '' });
  };
  return (
    <div className="space-y-6">
      {!isReadOnly && (
        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 className="font-bold mb-4 text-sm">Sync Card Statement</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input className="bg-slate-50 border rounded-xl px-4 py-2 text-sm outline-none" placeholder="Card Name" value={newCC.cardName} onChange={e => setNewCC({...newCC, cardName: e.target.value})} />
            <input type="date" className="bg-slate-50 border rounded-xl px-4 py-2 text-sm outline-none" value={newCC.dueDate} onChange={e => setNewCC({...newCC, dueDate: e.target.value})} />
            <input type="number" className="bg-slate-50 border rounded-xl px-4 py-2 text-sm outline-none" placeholder="Balance" value={newCC.statementBalance} onChange={e => setNewCC({...newCC, statementBalance: e.target.value})} />
            <button onClick={add} className="bg-slate-900 text-white rounded-xl py-2 font-bold hover:bg-black transition">Sync</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(monthData.creditCards || []).map(cc => (
          <div key={cc.id} className="bg-white p-6 rounded-3xl border relative group shadow-sm transition hover:shadow-md">
            {!isReadOnly && <button onClick={() => updateData({ creditCards: monthData.creditCards.filter(c => c.id !== cc.id) })} className="absolute top-4 right-4 text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition"><Trash2 size={16}/></button>}
            <CreditCard size={24} className="mb-4 text-indigo-600"/>
            <h4 className="font-bold text-slate-800">{cc.cardName}</h4>
            <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-tighter">Due: {cc.dueDate || 'No Date'}</p>
            <p className="text-xl font-black text-slate-900">{currency.symbol}{Number(cc.statementBalance).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const CollectionsView = ({ monthData, currency, updateData, isReadOnly, triggerReminders }) => {
  const [newCol, setNewCol] = useState({ name: '', amount: '', status: 'Pending', type: 'Credit', dueDate: '' });
  const add = () => {
    if (isReadOnly || !newCol.name || !newCol.amount) return;
    updateData({ collections: [...(monthData.collections || []), { ...newCol, id: Date.now() }] });
    setNewCol({ ...newCol, name: '', amount: '', dueDate: '' });
  };
  const toggle = (id) => {
    if (isReadOnly) return;
    const list = (monthData.collections || []).map(c => c.id === id ? { ...c, status: c.status === 'Pending' ? 'Collected' : 'Pending' } : c);
    updateData({ collections: list });
  };
  const isOverdue = (dateStr) => dateStr && new Date(dateStr) < new Date().setHours(0,0,0,0);

  return (
    <div className="space-y-6">
      <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold">Collections & Payables</h3>
          <button onClick={triggerReminders} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition flex items-center gap-2"><BellRing size={16}/> Remind Me</button>
        </div>
        {!isReadOnly && (
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <select className="bg-white/10 border border-white/20 rounded-2xl px-3 py-3 text-xs focus:bg-white focus:text-slate-900 outline-none" value={newCol.type} onChange={e => setNewCol({...newCol, type: e.target.value})}>
              <option value="Credit">Credit (Inflow)</option>
              <option value="Debit">Debit (Outflow)</option>
            </select>
            <input className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-xs outline-none focus:bg-white focus:text-slate-900 placeholder-white/50" placeholder="Party Name" value={newCol.name} onChange={e => setNewCol({...newCol, name: e.target.value})} />
            <input type="number" className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-xs outline-none focus:bg-white focus:text-slate-900 placeholder-white/50" placeholder="Amount" value={newCol.amount} onChange={e => setNewCol({...newCol, amount: e.target.value})} />
            <input type="date" className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-xs outline-none focus:bg-white focus:text-slate-900" value={newCol.dueDate} onChange={e => setNewCol({...newCol, dueDate: e.target.value})} />
            <select className="bg-white/10 border border-white/20 rounded-2xl px-3 py-3 text-xs focus:bg-white focus:text-slate-900 outline-none" value={newCol.status} onChange={e => setNewCol({...newCol, status: e.target.value})}>
              <option value="Pending">Pending</option>
              <option value="Collected">Collected</option>
            </select>
            <button onClick={add} className="bg-white text-indigo-700 rounded-2xl py-3 font-bold hover:bg-indigo-50 transition">Track</button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest">
              <tr><th className="px-8 py-5">Type</th><th className="px-8 py-5">Party</th><th className="px-8 py-5">Due</th><th className="px-8 py-5">Amount</th><th className="px-8 py-5">Status</th>{!isReadOnly && <th className="px-8 py-5 text-right">Del</th>}</tr>
            </thead>
            <tbody className="divide-y text-sm">
              {(monthData.collections || []).map(col => (
                <tr key={col.id} className="hover:bg-slate-50 transition group">
                  <td className={`px-8 py-4 font-bold flex items-center gap-2 ${col.type === 'Debit' ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {col.type === 'Debit' ? <ArrowDownLeft size={14}/> : <ArrowUpRight size={14}/>} {col.type || 'Credit'}
                  </td>
                  <td className="px-8 py-4 font-semibold text-slate-800">{col.name}</td>
                  <td className={`px-8 py-4 ${col.status === 'Pending' && isOverdue(col.dueDate) ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                    {col.dueDate || '-'} {col.status === 'Pending' && isOverdue(col.dueDate) && <AlertCircle size={12} className="inline ml-1"/>}
                  </td>
                  <td className="px-8 py-4 font-black">{currency.symbol}{Number(col.amount).toLocaleString()}</td>
                  <td className="px-8 py-4">
                    <button onClick={() => toggle(col.id)} disabled={isReadOnly} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${col.status === 'Collected' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{col.status}</button>
                  </td>
                  {!isReadOnly && <td className="px-8 py-4 text-right"><button onClick={() => updateData({ collections: monthData.collections.filter(c => c.id !== col.id) })} className="text-slate-200 hover:text-rose-500 transition opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button></td>}
                </tr>
              ))}
              {(monthData.collections || []).length === 0 && <tr><td colSpan="6" className="px-8 py-10 text-center text-slate-400 italic">No collections or payables yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ user, currency, setCurrency, sharedBudgetId, setSharedBudgetId, isReadOnly, setIsReadOnly, saveData, notifPermission, setNotifPermission }) => {
  const [partnerUid, setPartnerUid] = useState('');
  const [copied, setCopied] = useState(false);
  const copy = () => { if (user?.uid) { navigator.clipboard.writeText(user.uid); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const reqNotif = async () => { if ("Notification" in window) setNotifPermission(await Notification.requestPermission()); };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="bg-white p-8 rounded-3xl border shadow-sm">
          <h3 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest">Preferences</h3>
          <div className="grid grid-cols-2 gap-3">
            {CURRENCIES.map(c => (
              <button key={c.code} onClick={() => setCurrency(c)} className={`p-4 rounded-2xl border-2 text-left transition-all ${currency.code === c.code ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-50 text-slate-500 hover:border-slate-200'}`}>
                <p className="text-xl font-black">{c.symbol}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest">{c.name}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white p-8 rounded-3xl border shadow-sm">
          <h3 className="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest">Alerts</h3>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${notifPermission === 'granted' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}><BellRing size={20}/></div>
              <div><p className="text-sm font-bold">Browser Notifications</p><p className="text-[10px] text-slate-500 font-medium">{notifPermission === 'granted' ? 'Allowed' : 'Disabled'}</p></div>
            </div>
            {notifPermission !== 'granted' && <button onClick={reqNotif} className="text-xs font-bold text-indigo-600 hover:underline">Enable</button>}
          </div>
        </div>
      </div>
      <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl">
        <h3 className="text-lg font-bold mb-6 text-indigo-400 flex items-center gap-2"><Users size={20}/> Collaboration</h3>
        <button onClick={() => setIsReadOnly(!isReadOnly)} className={`w-full p-4 rounded-2xl border-2 flex justify-between mb-8 transition-all ${isReadOnly ? 'border-rose-500 bg-rose-500/10 text-rose-500' : 'border-emerald-500 bg-emerald-500/10 text-emerald-500'}`}>
          <div className="flex items-center gap-3">{isReadOnly ? <Lock size={20}/> : <Unlock size={20}/>}<p className="text-sm font-bold">{isReadOnly ? 'Read-Only Active' : 'Editing Active'}</p></div>
          <div className={`w-10 h-6 rounded-full relative ${isReadOnly ? 'bg-rose-600' : 'bg-emerald-600'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isReadOnly ? 'right-1' : 'left-1'}`}></div></div>
        </button>
        <div className="space-y-6">
          <div><p className="text-[10px] font-black text-indigo-400 uppercase mb-2 tracking-widest">My ID for Sharing</p><div className="flex bg-slate-800 p-3 rounded-xl gap-2 items-center"><code className="text-[10px] truncate flex-1 text-slate-300 font-mono">{user?.uid || 'Authenticating...'}</code><button onClick={copy} className="text-indigo-400 hover:text-indigo-300 transition">{copied ? <Check size={16}/> : <Copy size={16}/>}</button></div></div>
          <div className="pt-4 border-t border-slate-800"><p className="text-[10px] font-black text-indigo-400 uppercase mb-2 tracking-widest">Connect to a Budget</p><div className="flex flex-col gap-2"><input className="bg-slate-800 border-none rounded-xl px-4 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Paste ID from partner..." value={partnerUid} onChange={e => setPartnerUid(e.target.value)} /><button onClick={() => { if (partnerUid) { setSharedBudgetId(partnerUid); setIsReadOnly(true); } }} className="bg-indigo-600 text-white rounded-xl py-2 font-bold text-xs hover:bg-indigo-700 transition">Sync Vault</button></div></div>
        </div>
      </div>
    </div>
  );
};

const SidebarItem = ({ active, onClick, Icon, label }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${active ? 'bg-slate-900 text-white shadow-xl scale-[1.02]' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'}`}>
    <div className={active ? 'text-indigo-400' : ''}><Icon size={20}/></div>
    <span className="font-bold text-sm tracking-tight">{label}</span>
  </button>
);

const MobileLink = ({ active, onClick, Icon, label }) => (
  <button onClick={onClick} className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all duration-300 ${active ? 'bg-slate-900 text-white scale-110 shadow-lg' : 'text-slate-400'}`}>
    <Icon size={20}/><span className="text-[9px] font-black uppercase mt-1 tracking-tighter">{label}</span>
  </button>
);

export default App;