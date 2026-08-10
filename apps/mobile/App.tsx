import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { parseBankCsv, type ParsedBankTransaction } from "./bankCsv";

type Tab = "inicio" | "movimentos" | "recorrentes" | "cofrinhos" | "carteiras";
type EntryKind = "expense" | "income";
type Entry = {
  id: string;
  title: string;
  value: number;
  kind: EntryKind;
  category: string;
  walletId: string;
  createdAt: string;
  importId?: string;
  importSource?: string;
};
type BankImportDraft = ParsedBankTransaction & {
  selected: boolean;
  duplicate: boolean;
};
type Wallet = { id: string; name: string; initial: number; color: string };
type WalletBalance = { wallet: Wallet; balance: number };
type SavingsContribution = {
  id: string;
  value: number;
  createdAt: string;
  walletId?: string;
};
type SavingsPot = {
  id: string;
  type: "savings" | "debt";
  name: string;
  description: string;
  goal: number;
  months: number;
  createdAt: string;
  contributions: SavingsContribution[];
  compoundInterest: boolean;
  monthlyInterestRate: number;
  annualInflationRate: number;
};
type Recurring = {
  id: string;
  title: string;
  value: number;
  day: number;
  category: string;
  active: boolean;
  kind?: EntryKind;
  walletId?: string;
  lastPostedMonth?: string;
  startDate?: string;
  postedMonths?: string[];
  paidMonths?: string[];
};
type AiStatus = "ok" | "attention" | "danger";
type AiAnalysis = {
  status: AiStatus;
  headline: string;
  summary: string;
  highlights: string[];
  actions: string[];
  appSuggestions?: string[];
  analyzedAt: string;
};
type OnboardingData = {
  name: string;
  walletName: string;
  walletBalance: number;
  monthlyIncome: number;
  incomeDay: number;
  financialGoal: string;
};
const LIGHT_COLORS = {
  ink: "#242033",
  muted: "#777286",
  paper: "#F7F5FA",
  white: "#FFFFFF",
  grape: "#7147E8",
  grapeDark: "#532CB8",
  lime: "#C9F45A",
  coral: "#FF7B6B",
  sky: "#C8ECFF",
  line: "#EAE6F0",
};
const DARK_COLORS: typeof LIGHT_COLORS = {
  ink: "#F4F0FA", muted: "#AAA3B8", paper: "#0F0D17", white: "#191624",
  grape: "#9B7BFF", grapeDark: "#C2AEFF", lime: "#C9F45A", coral: "#FF8E80", sky: "#183443", line: "#2B2738",
};
const COLORS = { ...LIGHT_COLORS };
type ThemeMode = "system" | "light" | "dark";
const THEME_STORAGE_KEY = "@nenero/theme";

const walletPalette = ["#7147E8", "#111111", "#2563EB", "#FF7B6B", "#F97316", "#2DAE8C", "#E0A72B", "#C13C8A", "#64748B"];
const expenseCategories = ["Mercado", "Casa", "Transporte", "Lazer", "Delivery", "Educação", "Saúde", "Assinatura", "Outros"];
const incomeCategories = ["Salário", "Freelance", "Férias", "Bonificações", "13º salário", "Rendimentos", "Reembolso", "Venda", "Outras entradas"];
const categoriesByKind: Record<EntryKind, string[]> = {
  expense: expenseCategories,
  income: incomeCategories,
};
type CategoryVisual = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  background: string;
  border: string;
};
const categoryVisuals: Record<string, CategoryVisual> = {
  Mercado: { icon: "cart-outline", color: "#2F7D5A", background: "#E8F6EF", border: "#C9E8D8" },
  Casa: { icon: "home-heart", color: "#6B4BC3", background: "#F0EBFF", border: "#DDD1F8" },
  Transporte: { icon: "car-outline", color: "#2E7198", background: "#E7F4FB", border: "#C9E5F3" },
  Lazer: { icon: "party-popper", color: "#B65A4F", background: "#FFF0ED", border: "#F5D2CD" },
  Delivery: { icon: "moped", color: "#B66A22", background: "#FFF3E3", border: "#F0D7B7" },
  Educação: { icon: "school-outline", color: "#3E63A8", background: "#EAF0FF", border: "#CBD8F5" },
  Saúde: { icon: "medical-bag", color: "#B94467", background: "#FFEAF1", border: "#F3C8D7" },
  Assinatura: { icon: "calendar-sync", color: "#7C4C9D", background: "#F5EAFB", border: "#E3CCEE" },
  Outros: { icon: "shape-outline", color: "#676270", background: "#F0EEF2", border: "#DEDAE2" },
  Salário: { icon: "cash", color: "#5D7E1D", background: "#EEF8D9", border: "#D6E9AD" },
  Renda: { icon: "cash", color: "#5D7E1D", background: "#EEF8D9", border: "#D6E9AD" },
  Freelance: { icon: "laptop", color: "#5F52B6", background: "#EFEDFF", border: "#D8D3F7" },
  Férias: { icon: "beach", color: "#A96B00", background: "#FFF4D9", border: "#F0DCAD" },
  Bonificações: { icon: "medal-outline", color: "#8B6A05", background: "#FFF7D6", border: "#EBDD9F" },
  Bonificação: { icon: "medal-outline", color: "#8B6A05", background: "#FFF7D6", border: "#EBDD9F" },
  "13º salário": { icon: "gift-outline", color: "#A24879", background: "#FCEAF4", border: "#EECDE0" },
  Rendimentos: { icon: "chart-line", color: "#167B6B", background: "#E4F7F3", border: "#C1E7DF" },
  Investimentos: { icon: "chart-line", color: "#167B6B", background: "#E4F7F3", border: "#C1E7DF" },
  Reembolso: { icon: "cash-refund", color: "#2B709F", background: "#E7F3FC", border: "#C7E0F1" },
  Venda: { icon: "tag-outline", color: "#B45245", background: "#FFF0EC", border: "#F2D0C9" },
  "Outras entradas": { icon: "cash-plus", color: "#59646C", background: "#EDF1F3", border: "#D5DDE1" },
};
const fallbackCategoryVisuals: Record<EntryKind, CategoryVisual> = {
  expense: { icon: "shape-outline", color: "#676270", background: "#F0EEF2", border: "#DEDAE2" },
  income: { icon: "cash-plus", color: "#59646C", background: "#EDF1F3", border: "#D5DDE1" },
};
const getCategoryVisual = (category: string, kind: EntryKind) => categoryVisuals[category] ?? fallbackCategoryVisuals[kind];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: number) => brl.format(value);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const AI_ANALYSIS_STORAGE_KEY = "@nenero/analysis-v2";
const PROFILE_NAME_STORAGE_KEY = "@nenero/profile-name";
const ONBOARDING_STORAGE_KEY = "@nenero/onboarding-completed";
const parseMoneyInput = (value: string) => Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
const formatMoneyInput = (value: string) => {
  if (!value.trim()) return "";
  const parsed = parseMoneyInput(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
};
const parsePercentInput = (value: string) => Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
const getRealMonthlyRate = (pot: Pick<SavingsPot, "compoundInterest" | "monthlyInterestRate" | "annualInflationRate">) => {
  if (!pot.compoundInterest) return 0;
  const nominalMonthly = Math.max(0, pot.monthlyInterestRate) / 100;
  const monthlyInflation = Math.pow(1 + Math.max(0, pot.annualInflationRate) / 100, 1 / 12) - 1;
  return (1 + nominalMonthly) / (1 + monthlyInflation) - 1;
};
const getElapsedMonths = (from: string, to = new Date()) => {
  const start = new Date(from);
  return Math.max(0, (to.getFullYear() - start.getFullYear()) * 12 + to.getMonth() - start.getMonth());
};
const getSavingsPotBalance = (pot: SavingsPot) => {
  if (pot.type === "debt") return pot.contributions.reduce((sum, contribution) => sum + contribution.value, 0);
  const rate = getRealMonthlyRate(pot);
  return pot.contributions.reduce((sum, contribution) => sum + contribution.value * Math.pow(1 + rate, getElapsedMonths(contribution.createdAt)), 0);
};
const getMonthlyTarget = (goal: number, months: number, rate: number, currentBalance = 0) => {
  const missing = Math.max(0, goal - currentBalance * Math.pow(1 + rate, months));
  if (Math.abs(rate) < 0.0000001) return missing / months;
  return Math.max(0, missing * rate / (Math.pow(1 + rate, months) - 1));
};
const normalizeFinanceLabel = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();
const isSalaryLike = (item: Pick<Entry, "kind" | "category" | "title">) => {
  if (item.kind !== "income") return false;
  const category = normalizeFinanceLabel(item.category);
  const title = normalizeFinanceLabel(item.title);
  return category === "renda" || category === "salario" || title.includes("salario");
};
const getDreamsBalance = (pots: SavingsPot[]) => pots.filter((pot) => pot.type !== "debt").reduce((total, pot) => total + getSavingsPotBalance(pot), 0);
const getWalletAvailableBalance = (wallet: Wallet, entries: Entry[], pots: SavingsPot[]) => {
  const movementBalance = entries
    .filter((entry) => entry.walletId === wallet.id)
    .reduce((sum, entry) => sum + (entry.kind === "income" ? entry.value : -entry.value), wallet.initial);
  const reserved = pots.filter((pot) => pot.type !== "debt").reduce(
    (total, pot) => total + pot.contributions
      .filter((contribution) => contribution.walletId === wallet.id)
      .reduce((sum, contribution) => sum + contribution.value, 0),
    0,
  );
  return movementBalance - reserved;
};

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

const initialWallets: Wallet[] = [];
const initialEntries: Entry[] = [];
const initialRecurring: Recurring[] = [];

function AppContent() {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const isDark = themeMode === "dark" || (themeMode === "system" && systemColorScheme === "dark");
  Object.assign(COLORS, isDark ? DARK_COLORS : LIGHT_COLORS);
  styles = createStyles();
  const [tab, setTab] = useState<Tab>("inicio");
  const [wallets, setWallets] = useState(initialWallets);
  const [entries, setEntries] = useState(initialEntries);
  const [recurring, setRecurring] = useState(initialRecurring);
  const [savingsPots, setSavingsPots] = useState<SavingsPot[]>([]);
  const [goal, setGoal] = useState("");
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [ready, setReady] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [modal, setModal] = useState<"entry" | "wallet" | "recurring" | "pot" | "potDeposit" | "lifeCalculator" | "profile" | "bankImport" | "analysis" | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<Recurring | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [selectedPot, setSelectedPot] = useState<SavingsPot | null>(null);
  const reducedMotion = useReducedMotion();
  const appEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      if (saved === "system" || saved === "light" || saved === "dark") setThemeMode(saved);
    });
  }, []);

  const changeTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let dataKey = "@nenero/data";
        let goalKey = "@nenero/goal";
        let analysisKey = AI_ANALYSIS_STORAGE_KEY;
        const keys = await AsyncStorage.getAllKeys();
        const obsoleteAuthKeys = keys.filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"));
        if (obsoleteAuthKeys.length) await AsyncStorage.multiRemove(obsoleteAuthKeys);
        const savedProfileName = await AsyncStorage.getItem(PROFILE_NAME_STORAGE_KEY);
        const onboardingMarker = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        let raw = await AsyncStorage.getItem(dataKey);
        let savedGoal = await AsyncStorage.getItem(goalKey);
        let savedAnalysis = await AsyncStorage.getItem(analysisKey);

        if (!raw) {
          const accountDataKey = keys.find((key) => key.startsWith("@nenero/data:"));
          if (accountDataKey) {
            const accountId = accountDataKey.slice("@nenero/data:".length);
            dataKey = accountDataKey;
            goalKey = `@nenero/goal:${accountId}`;
            analysisKey = `@nenero/analysis-v2:${accountId}`;
            raw = await AsyncStorage.getItem(dataKey);
            savedGoal = savedGoal ?? await AsyncStorage.getItem(goalKey);
            savedAnalysis = savedAnalysis ?? await AsyncStorage.getItem(analysisKey);
          }
        }
        if (!active) return;
        const hasExistingData = Boolean(raw);
        if (raw) {
          const data = JSON.parse(raw);
          const loadedWallets: Wallet[] = data.wallets ?? initialWallets;
          const fallbackWalletId = loadedWallets[0]?.id;
          const loadedSavingsPots: SavingsPot[] = (data.savingsPots ?? []).map((pot: SavingsPot) => ({
            ...pot,
            type: pot.type ?? "savings",
            compoundInterest: pot.compoundInterest ?? false,
            monthlyInterestRate: pot.monthlyInterestRate ?? 0,
            annualInflationRate: pot.annualInflationRate ?? 0,
            contributions: (pot.contributions ?? []).map((contribution) => (
              contribution.walletId || !fallbackWalletId
                ? contribution
                : { ...contribution, walletId: fallbackWalletId }
            )),
          }));
          setWallets(loadedWallets);
          setEntries(data.entries ?? initialEntries);
          setRecurring(data.recurring ?? initialRecurring);
          setSavingsPots(loadedSavingsPots);
        } else {
          setWallets([]);
          setEntries([]);
          setRecurring([]);
          setSavingsPots([]);
        }
        setGoal(savedGoal ?? "");
        setAnalysis(savedAnalysis ? JSON.parse(savedAnalysis) : null);
        setProfileName(savedProfileName?.trim() || "você");
        const completed = onboardingMarker === "true" || hasExistingData;
        setOnboardingCompleted(completed);
        if (completed && onboardingMarker !== "true") {
          await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem("@nenero/data", JSON.stringify({ wallets, entries, recurring, savingsPots }));
  }, [wallets, entries, recurring, savingsPots, ready]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem("@nenero/goal", goal);
    if (analysis) {
      AsyncStorage.setItem(AI_ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
    } else {
      AsyncStorage.removeItem(AI_ANALYSIS_STORAGE_KEY);
    }
  }, [goal, analysis, ready]);

  useEffect(() => {
    if (ready && onboardingCompleted && profileName.trim()) {
      AsyncStorage.setItem(PROFILE_NAME_STORAGE_KEY, profileName.trim());
    }
  }, [profileName, ready, onboardingCompleted]);

  useEffect(() => {
    if (!ready || onboardingCompleted !== true) return;
    appEntrance.stopAnimation();
    if (reducedMotion) {
      appEntrance.setValue(1);
      return;
    }
    appEntrance.setValue(0);
    Animated.timing(appEntrance, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => appEntrance.stopAnimation();
  }, [appEntrance, onboardingCompleted, ready, reducedMotion]);

  useEffect(() => {
    if (!ready) return;
    const today = new Date();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const postings: { recurringId: string; monthKey: string; entry: Entry }[] = [];

    recurring.forEach(item => {
      if (!item.active || item.kind !== "income" || !item.walletId) return;
      const start = item.startDate ? new Date(item.startDate) : today;
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const posted = new Set(item.postedMonths ?? (item.lastPostedMonth ? [item.lastPostedMonth] : []));

      while (cursor <= today) {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const scheduledDate = new Date(year, month, Math.min(item.day, lastDay), 12);
        const entryId = `${item.id}-${monthKey}`;
        const hasEquivalentSalaryEntry = entries.some((entry) => {
          const entryDate = new Date(entry.createdAt);
          return isSalaryLike(entry) &&
            entry.walletId === item.walletId &&
            Math.abs(entry.value - item.value) < 0.005 &&
            entryDate.getFullYear() === year &&
            entryDate.getMonth() === month;
        });
        const missingOnboardingSalary = item.title === "Renda mensal" &&
          posted.has(monthKey) &&
          !entries.some((entry) => entry.id === entryId) &&
          !hasEquivalentSalaryEntry;
        if (scheduledDate <= todayEnd && (!posted.has(monthKey) || missingOnboardingSalary)) {
          postings.push({
            recurringId: item.id,
            monthKey,
            entry: {
              id: entryId,
              title: item.title,
              value: item.value,
              kind: "income",
              category: item.category,
              walletId: item.walletId,
              createdAt: scheduledDate.toISOString(),
            },
          });
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    });

    if (!postings.length) return;
    setEntries(current => {
      const existingIds = new Set(current.map(entry => entry.id));
      return [...postings.map(posting => posting.entry).filter(entry => !existingIds.has(entry.id)), ...current];
    });
    setRecurring(current => current.map(item => {
      const newMonths = postings.filter(posting => posting.recurringId === item.id).map(posting => posting.monthKey);
      if (!newMonths.length) return item;
      return { ...item, postedMonths: [...new Set([...(item.postedMonths ?? []), ...newMonths])] };
    }));
  }, [ready, recurring]);

  const walletBalances = useMemo<WalletBalance[]>(
    () => wallets.map((wallet) => ({
      wallet,
      balance: getWalletAvailableBalance(wallet, entries, savingsPots),
    })),
    [entries, savingsPots, wallets],
  );
  const availableBalance = useMemo(
    () => walletBalances.reduce((sum, item) => sum + item.balance, 0),
    [walletBalances],
  );
  const dreamsBalance = useMemo(() => getDreamsBalance(savingsPots), [savingsPots]);
  const totalBalance = availableBalance + dreamsBalance;

  const recurringTotal = recurring.filter((item) => item.active && item.kind !== "income").reduce((sum, item) => sum + item.value, 0);
  const now = new Date();
  const isCurrentMonth = (date: string) => {
    const value = new Date(date);
    return value.getMonth() === now.getMonth() && value.getFullYear() === now.getFullYear();
  };
  const monthlyIncome = entries.filter(entry => entry.kind === "income" && isCurrentMonth(entry.createdAt)).reduce((sum, entry) => sum + entry.value, 0);
  const monthlyExpenses = entries.filter(entry => entry.kind === "expense" && isCurrentMonth(entry.createdAt)).reduce((sum, entry) => sum + entry.value, 0);
  const sortedEntries = useMemo(() => [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [entries]);

  const runAnalysis = async (openDetails = false) => {
    if (!goal.trim()) { setModal("profile"); return; }
    if (openDetails) setModal("analysis");
    setAnalyzing(true);
    setAnalysisError("");
    const monthEntries = entries.filter(entry => isCurrentMonth(entry.createdAt));
    const byCategory = monthEntries.filter(entry => entry.kind === "expense").reduce<Record<string, number>>((result, entry) => {
      result[entry.category] = (result[entry.category] ?? 0) + entry.value;
      return result;
    }, {});
    const categoryBreakdown = Object.entries(byCategory)
      .sort(([, valueA], [, valueB]) => valueB - valueA)
      .map(([category, value]) => ({
        category,
        value,
        expensesPercent: monthlyExpenses > 0 ? Math.round((value / monthlyExpenses) * 100) : 0,
        incomePercent: monthlyIncome > 0 ? Math.round((value / monthlyIncome) * 100) : null,
      }));
    const topExpenses = monthEntries
      .filter(entry => entry.kind === "expense")
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map(entry => ({ title: entry.title, category: entry.category, value: entry.value }));
    const largestExpense = topExpenses[0];
    const largestExpenseIncomePercent = largestExpense && monthlyIncome > 0
      ? Math.round((largestExpense.value / monthlyIncome) * 100)
      : null;
    const largestExpenseTotalPercent = largestExpense && monthlyExpenses > 0
      ? Math.round((largestExpense.value / monthlyExpenses) * 100)
      : null;
    const spentIncomePercent = monthlyIncome > 0 ? Math.round((monthlyExpenses / monthlyIncome) * 100) : null;
    const fixedIncomePercent = monthlyIncome > 0 ? Math.round((recurringTotal / monthlyIncome) * 100) : null;
    const monthResult = monthlyIncome - monthlyExpenses;
    const savingsRate = monthlyIncome > 0 ? Math.round((monthResult / monthlyIncome) * 100) : null;
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const pendingBills = recurring
      .filter(item => item.active && item.kind !== "income" && !(item.paidMonths ?? []).includes(currentMonthKey))
      .reduce((sum, item) => sum + item.value, 0);
    const projectedResultAfterPending = monthResult - pendingBills;
    const savingsPotSummary = savingsPots.map(pot => {
      const saved = getSavingsPotBalance(pot);
      const sourceWallets = [...new Set(pot.contributions
        .map((contribution) => wallets.find((wallet) => wallet.id === contribution.walletId)?.name)
        .filter((name): name is string => Boolean(name)))];
      return {
        type: pot.type === "debt" ? "dívida" : "economia",
        name: pot.name,
        description: pot.description,
        goal: pot.goal,
        months: pot.months,
        saved,
        remaining: Math.max(0, pot.goal - saved),
        progressPercent: Math.min(100, Math.round((saved / pot.goal) * 100)),
        monthlyTarget: Math.round((pot.goal / pot.months) * 100) / 100,
        sourceWallets,
      };
    });
    const walletSummary = walletBalances.map(({ wallet, balance }) => ({
      name: wallet.name,
      availableBalance: balance,
    }));
    try {
      const useGeminiProxy = Platform.OS === "web" && process.env.NODE_ENV === "production";
      const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!useGeminiProxy && !geminiKey) throw new Error("Adicione a chave do Gemini no arquivo .env.");
      const systemInstruction = `
Você é o Nenero: um amigo brasileiro que entende de finanças, olha os números e
fala a verdade na lata. Sua personalidade precisa aparecer em TODA resposta.
Escreva como conversa de WhatsApp: frases curtas, vocabulário simples, ritmo rápido.
Você é incisivo, espirituoso e útil. Nunca soa como banco, coach ou relatório.

ORDEM DE PRIORIDADE:
1. Precisão dos dados.
2. Qualidade do diagnóstico.
3. Ação prática.
4. Humor.
Nunca sacrifique precisão ou uma conclusão importante para fazer graça.

OBRIGATÓRIO:
- O título já entrega o veredito, sem suspense.
- A primeira frase dá o diagnóstico principal e cita o número que o prova.
- Use UMA tirada bem-humorada ligada aos dados. Uma é suficiente.
- Se houver desperdício ou desvio, dê uma bronca leve no GASTO: "delivery montou
  um puxadinho na sua conta", "essa assinatura está vivendo de aluguel grátis",
  "o lazer veio de limousine". Nunca humilhe ou ataque a pessoa.
- Troque palavras moles por ordens claras: "corte", "pare", "separe", "quite",
  "limite". Diga exatamente quanto ou qual gasto deve mudar.
- Cada destaque interpreta um número; cada ação começa com verbo e resolve o problema.
- Se os números estiverem bons, elogie com humor e mostre o valor que comprova isso.
- Trate como "elefante na sala" qualquer compra individual que represente 30% ou
  mais da renda mensal OU 40% ou mais das saídas do mês. Nesse caso, cite o nome,
  o valor e o percentual no resumo ou primeiro destaque. Não desvie para gastos pequenos.
- Em compras caras de bens materiais (eletrônicos, veículo, luxo ou semelhantes),
  alfinete o tamanho do consumo e o impacto na meta. Questione o timing e a proporção,
  não o gosto da pessoa nem a utilidade do produto.
- Se uma compra superar toda a renda do mês, diga isso explicitamente. Exemplo:
  "O MacBook de R$ 7.000 comeu 200% da sua renda. A maçã veio com fome."
- Diferencie fato, diagnóstico e ação. Não trate saldo acumulado como renda mensal,
  nem conta pendente como saída já realizada.
- Dinheiro movido para "Meus sonhos" continua no patrimônio: é reserva, não gasto.
  Diferencie saldo disponível, valor reservado e patrimônio total. Não conte aportes
  em cofrinhos como saída do mês nem como dinheiro livre para gastar.
- Identifique a causa dominante do resultado. Não monte diagnóstico com despesas
  pequenas quando uma compra ou categoria explica a maior parte das saídas.
- Explique a consequência para o objetivo do usuário. Se os dados não permitirem
  calcular prazo ou valor da meta, diga apenas o impacto comprovável; não invente.
- Baseie percentuais SOMENTE nos percentuais fornecidos abaixo. Não recalcule.

PROIBIDO:
- "continue acompanhando", "mantenha o foco", "considere reduzir", "é importante
  monitorar", "busque equilíbrio", "avalie seus gastos", "reveja seu orçamento",
  "parabéns pelo progresso" ou qualquer conselho genérico;
- repetir os dados sem interpretá-los;
- textos motivacionais, introduções educadas ou linguagem corporativa;
- trocadilho aleatório, piada pronta, excesso de gíria ou mais de duas tiradas;
- inventar valores ou recomendar ativos, crédito, corretoras e produtos financeiros.

REFERÊNCIA DE VOZ:
Ruim: "Considere reduzir os gastos com lazer para alcançar seu objetivo."
Nenero: "Corte R$ 120 do lazer. A diversão veio de camarote, mas sua meta ficou na fila."

Ruim: "Sua situação financeira está saudável. Continue assim."
Nenero: "Sobrou R$ 900. Bonito: sua meta comeu primeiro e o impulso ficou sem sobremesa."

Ruim: "Os gastos fixos representam uma parcela significativa da renda."
Nenero: "R$ 1.800 fixos engolem 60% da renda. Sua conta já acorda de boca aberta."
`;
      const prompt = `
Compare o mês com o objetivo do usuário e dê um diagnóstico sem rodeios.

CLASSIFICAÇÃO:
- ok: números compatíveis com o objetivo, sem risco relevante;
- attention: desvio recuperável, pouca sobra ou pendências relevantes;
- danger: saídas acima das entradas, saldo disponível negativo ou objetivo seriamente comprometido.

O Nenero é um app pessoal de organização financeira com estas funções:
- criar várias carteiras com saldos separados;
- mover dinheiro de uma carteira para um cofrinho sem registrar gasto;
- reunir automaticamente todos os cofrinhos na carteira virtual "Meus sonhos";
- registrar entradas e gastos avulsos com data retroativa e categoria;
- programar salário mensal em uma carteira escolhida;
- cadastrar gastos fixos, escolher a carteira de pagamento e marcar contas como pagas;
- acompanhar entradas, saídas, contas pendentes e gastos por categoria em cada mês;
- definir um objetivo financeiro em texto livre.
- criar cofrinhos com nome, descrição, valor-alvo e prazo em meses;
- acompanhar o progresso e fazer aportes rápidos ou personalizados nos cofrinhos.

Além da análise, sugira de 1 a 3 melhorias que o usuário possa executar usando
essas funções. Exemplos: criar um cofrinho para uma meta, programar parte do salário,
separar um gasto recorrente ou revisar uma
categoria. Não recomende ativos, corretoras, empréstimos ou produtos financeiros.
Só sugira uma ação quando ela fizer sentido para os dados e o objetivo.

Objetivo: ${goal.trim()}
Mês: ${now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
Entradas realizadas: R$ ${monthlyIncome}
Saídas realizadas: R$ ${monthlyExpenses}
Resultado do mês: R$ ${monthResult}
Percentual da renda já gasto: ${spentIncomePercent === null ? "sem renda registrada" : `${spentIncomePercent}%`}
Taxa de sobra do mês: ${savingsRate === null ? "sem renda registrada" : `${savingsRate}%`}
Saldo disponível nas carteiras do dia a dia: R$ ${availableBalance}
Carteira virtual "Meus sonhos", valor reservado: R$ ${dreamsBalance}
Patrimônio total, somando disponível e reservado: R$ ${totalBalance}
Carteiras do dia a dia: ${JSON.stringify(walletSummary)}
Gastos fixos: R$ ${recurringTotal}
Peso dos gastos fixos na renda: ${fixedIncomePercent === null ? "sem renda registrada" : `${fixedIncomePercent}%`}
Contas pendentes, ainda não incluídas nas saídas: R$ ${pendingBills}
Resultado projetado depois das contas pendentes: R$ ${projectedResultAfterPending}
Gastos por categoria, com percentuais calculados pelo app: ${JSON.stringify(categoryBreakdown)}
Maiores gastos individuais: ${JSON.stringify(topExpenses)}
Maior compra do mês: ${largestExpense ? `${largestExpense.title}, R$ ${largestExpense.value}` : "nenhuma"}
Maior compra sobre a renda: ${largestExpenseIncomePercent === null ? "sem renda registrada" : `${largestExpenseIncomePercent}%`}
Maior compra sobre as saídas: ${largestExpenseTotalPercent === null ? "sem gastos registrados" : `${largestExpenseTotalPercent}%`}
Cofrinhos e progresso: ${JSON.stringify(savingsPotSummary)}

FORMATO:
- título-veredito de até 7 palavras, direto e com personalidade;
- resumo de 2 ou 3 frases curtas, contendo pelo menos uma tirada ligada aos números;
- de 1 a 3 destaques objetivos, cada um com no máximo 18 palavras;
- de 1 a 3 ações no imperativo, em ordem de prioridade, cada uma com no máximo 18 palavras;
- de 0 a 3 sugestões de funções do Nenero.

Responda SOMENTE com um objeto JSON válido neste formato:
{
  "status": "ok" | "attention" | "danger",
  "headline": "texto",
  "summary": "texto",
  "highlights": ["texto"],
  "actions": ["texto"],
  "appSuggestions": ["texto"]
}

Antes de responder, confira silenciosamente:
1. Entradas - saídas confere com o resultado informado?
2. Você separou realizado, pendente, projetado e saldo acumulado?
3. O diagnóstico aponta a causa que mais pesa, usando valor e percentual?
4. A consequência está ligada ao objetivo sem inventar prazo ou valor?
5. A primeira ação diz verbo, alvo e valor quando existe base para calculá-lo?
6. O texto poderia ter sido escrito por um banco? Se sim, reescreva sem alterar os dados.
`;
      const response = await fetch(useGeminiProxy ? "/api/gemini" : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
        method: "POST",
        headers: useGeminiProxy
          ? { "Content-Type": "application/json" }
          : { "Content-Type": "application/json", "x-goog-api-key": geminiKey! },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            thinkingConfig: {
              thinkingLevel: "minimal",
            },
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["ok", "attention", "danger"] },
                headline: { type: "string" },
                summary: { type: "string" },
                highlights: { type: "array", items: { type: "string" } },
                actions: { type: "array", items: { type: "string" } },
                appSuggestions: { type: "array", items: { type: "string" } },
              },
              required: ["status", "headline", "summary", "highlights", "actions", "appSuggestions"],
            },
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? "Não foi possível consultar o Nenero IA.");
      const finishReason = result?.candidates?.[0]?.finishReason;
      if (finishReason === "MAX_TOKENS") {
        throw new Error("A análise ficou maior que o esperado. Tente novamente.");
      }
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("A IA não devolveu uma análise.");
      const cleanedText = text.trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleanedText);
      } catch {
        const objectStart = cleanedText.indexOf("{");
        const objectEnd = cleanedText.lastIndexOf("}");
        if (objectStart < 0 || objectEnd <= objectStart) {
          throw new Error("A IA devolveu uma resposta incompleta. Tente novamente.");
        }
        try {
          parsed = JSON.parse(cleanedText.slice(objectStart, objectEnd + 1));
        } catch {
          throw new Error("A IA devolveu uma resposta incompleta. Tente novamente.");
        }
      }
      const validStatuses: AiStatus[] = ["ok", "attention", "danger"];
      if (
        !validStatuses.includes(parsed.status as AiStatus) ||
        typeof parsed.headline !== "string" ||
        typeof parsed.summary !== "string" ||
        !Array.isArray(parsed.highlights) ||
        !Array.isArray(parsed.actions)
      ) {
        throw new Error("A IA respondeu fora do formato esperado. Tente novamente.");
      }
      setAnalysis({
        status: parsed.status as AiStatus,
        headline: parsed.headline,
        summary: parsed.summary,
        highlights: parsed.highlights.filter((item: unknown): item is string => typeof item === "string"),
        actions: parsed.actions.filter((item: unknown): item is string => typeof item === "string"),
        appSuggestions: Array.isArray(parsed.appSuggestions)
          ? parsed.appSuggestions.filter((item: unknown): item is string => typeof item === "string")
          : [],
        analyzedAt: new Date().toISOString(),
      });
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Não foi possível fazer a análise.");
    } finally {
      setAnalyzing(false);
    }
  };

  const addEntry = (entry: Omit<Entry, "id">) => {
    setEntries((current) => [{ ...entry, id: uid() }, ...current]);
    setModal(null);
  };

  const userName = profileName.trim() || "você";
  const userInitials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "NN";

  if (!ready || onboardingCompleted === null) return <AppLoadingScreen />;
  if (!onboardingCompleted) {
    return <OnboardingScreen onComplete={({ name, walletName, walletBalance, monthlyIncome, incomeDay, financialGoal }) => {
      const walletId = uid();
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const recurringIncomeId = uid();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const salaryDate = new Date(now.getFullYear(), now.getMonth(), Math.min(incomeDay, lastDay), 12);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const salaryIsDue = salaryDate <= todayEnd;
      setProfileName(name);
      setWallets([{ id: walletId, name: walletName, initial: walletBalance, color: walletPalette[0]! }]);
      setEntries(salaryIsDue ? [{
        id: `${recurringIncomeId}-${currentMonth}`,
        title: "Renda mensal",
        value: monthlyIncome,
        kind: "income",
        category: "Salário",
        walletId,
        createdAt: salaryDate.toISOString(),
      }] : []);
      setRecurring([{
        id: recurringIncomeId,
        title: "Renda mensal",
        value: monthlyIncome,
        day: incomeDay,
        category: "Salário",
        active: true,
        kind: "income",
        walletId,
        startDate: now.toISOString(),
        postedMonths: salaryIsDue ? [currentMonth] : [],
      }]);
      setSavingsPots([]);
      setGoal(financialGoal);
      setAnalysis(null);
      setOnboardingCompleted(true);
      AsyncStorage.multiSet([
        [PROFILE_NAME_STORAGE_KEY, name],
        [ONBOARDING_STORAGE_KEY, "true"],
      ]);
    }} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Animated.View
        style={[
          styles.app,
          {
            opacity: appEntrance,
            transform: [
              {
                translateY: appEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
              {
                scale: appEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandFace}>◡</Text></View>
            <Text style={styles.brand}>nenero</Text>
          </View>
          <Pressable style={styles.avatar} onPress={() => setModal("profile")} accessibilityLabel="Abrir perfil"><Text style={styles.avatarText}>{userInitials}</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {tab === "inicio" && (
            <Home
              userName={userName}
              balance={totalBalance}
              reservedBalance={dreamsBalance}
              recurringTotal={recurringTotal}
              monthlyIncome={monthlyIncome}
              monthlyExpenses={monthlyExpenses}
              entries={sortedEntries}
              wallets={wallets}
              analysis={analysis}
              analyzing={analyzing}
              hasGoal={Boolean(goal.trim())}
              onAnalyze={() => analysis || analysisError ? setModal("analysis") : runAnalysis(false)}
              onRefresh={() => runAnalysis(false)}
              onAdd={() => { setEditingEntry(null); setModal("entry"); }}
              onEditEntry={(entry) => { setEditingEntry(entry); setModal("entry"); }}
              onSavingsPot={() => setTab("cofrinhos")}
              onLifeCalculator={() => setModal("lifeCalculator")}
            />
          )}
          {tab === "movimentos" && <Movements entries={sortedEntries} wallets={wallets} onAdd={() => { setEditingEntry(null); setModal("entry"); }} onEdit={(entry) => { setEditingEntry(entry); setModal("entry"); }} />}
          {tab === "recorrentes" && (
            <RecurringList
              items={recurring}
              wallets={wallets}
              onAdd={() => { setEditingRecurring(null); setModal("recurring"); }}
              onEdit={(item) => { setEditingRecurring(item); setModal("recurring"); }}
              onToggle={(id) => setRecurring((items) => items.map((item) => item.id === id ? { ...item, active: !item.active } : item))}
              onPay={(item, monthKey) => {
                const walletId = item.walletId ?? wallets[0]?.id;
                if (!walletId || item.paidMonths?.includes(monthKey)) return;
                const [yearText, monthText] = monthKey.split("-");
                const year = Number(yearText);
                const month = Number(monthText);
                const lastDay = new Date(year, month, 0).getDate();
                const paymentDate = new Date(year, month - 1, Math.min(item.day, lastDay), 12);
                setEntries(current => [{
                  id: `${item.id}-payment-${monthKey}`,
                  title: item.title,
                  value: item.value,
                  kind: "expense",
                  category: item.category,
                  walletId,
                  createdAt: paymentDate.toISOString(),
                }, ...current]);
                setRecurring(current => current.map(value => value.id === item.id ? { ...value, paidMonths: [...(value.paidMonths ?? []), monthKey] } : value));
              }}
            />
          )}
          {tab === "cofrinhos" && (
            <SavingsPotList
              pots={savingsPots}
              wallets={wallets}
              onAdd={() => setModal("pot")}
              onDeposit={(pot) => { setSelectedPot(pot); setModal("potDeposit"); }}
            />
          )}
          {tab === "carteiras" && <WalletList
            walletBalances={walletBalances}
            pots={savingsPots}
            dreamsBalance={dreamsBalance}
            onAdd={() => { setEditingWallet(null); setModal("wallet"); }}
            onEdit={(wallet) => { setEditingWallet(wallet); setModal("wallet"); }}
            onOpenDreams={() => setTab("cofrinhos")}
          />}
        </ScrollView>

        <BottomNav tab={tab} setTab={setTab} />
      </Animated.View>

      <EntryModal
        visible={modal === "entry"}
        wallets={wallets}
        item={editingEntry}
        onClose={() => { setModal(null); setEditingEntry(null); }}
        onSave={(entry) => {
          if (editingEntry) {
            setEntries(items => items.map(current => current.id === editingEntry.id ? { ...current, ...entry } : current));
            setModal(null);
          } else {
            addEntry(entry);
          }
          setEditingEntry(null);
        }}
        onDelete={editingEntry ? () => {
          const entry = editingEntry;
          Alert.alert(
            `Excluir “${entry.title}”?`,
            `${entry.kind === "income" ? "A entrada" : "O gasto"} de ${money(entry.value)} será apagado. Essa ação não pode ser desfeita.`,
            [
              { text: "Cancelar", style: "cancel" },
              { text: "Excluir", style: "destructive", onPress: () => { setEntries((items) => items.filter((item) => item.id !== entry.id)); setModal(null); setEditingEntry(null); } },
            ],
          );
        } : undefined}
      />
      <WalletModal
        visible={modal === "wallet"}
        item={editingWallet}
        onClose={() => { setModal(null); setEditingWallet(null); }}
        onSave={(wallet) => {
          if (editingWallet) {
            setWallets((items) => items.map((item) => item.id === editingWallet.id ? { ...item, ...wallet } : item));
          } else {
            setWallets((items) => [...items, { ...wallet, id: uid() }]);
          }
          setModal(null);
          setEditingWallet(null);
        }}
        onDelete={editingWallet ? () => {
          const linkedEntries = entries.filter((entry) => entry.walletId === editingWallet.id).length;
          const linkedRecurring = recurring.filter((item) => item.walletId === editingWallet.id).length;
          const linkedCopy = [
            linkedEntries ? `${linkedEntries} ${linkedEntries === 1 ? "lançamento" : "lançamentos"}` : "",
            linkedRecurring ? `${linkedRecurring} ${linkedRecurring === 1 ? "planejamento" : "planejamentos"}` : "",
          ].filter(Boolean).join(" e ");
          Alert.alert(
            `Excluir “${editingWallet.name}”?`,
            linkedCopy
              ? `A carteira e ${linkedCopy} vinculados serão apagados. Essa ação não pode ser desfeita.`
              : "A carteira será apagada. Essa ação não pode ser desfeita.",
            [
              { text: "Cancelar", style: "cancel" },
              {
                text: linkedCopy ? "Excluir tudo" : "Excluir carteira",
                style: "destructive",
                onPress: () => {
                  setWallets((items) => items.filter((item) => item.id !== editingWallet.id));
                  setEntries((items) => items.filter((item) => item.walletId !== editingWallet.id));
                  setRecurring((items) => items.filter((item) => item.walletId !== editingWallet.id));
                  setModal(null);
                  setEditingWallet(null);
                },
              },
            ],
          );
        } : undefined}
      />
      <RecurringModal
        visible={modal === "recurring"}
        wallets={wallets}
        item={editingRecurring}
        onClose={() => { setModal(null); setEditingRecurring(null); }}
        onSave={(item) => {
          if (editingRecurring) {
            setRecurring(items => items.map(current => current.id === editingRecurring.id ? { ...current, ...item } : current));
          } else {
            setRecurring(items => [...items, { ...item, id: uid(), active: true, startDate: new Date().toISOString(), postedMonths: [] }]);
          }
          setModal(null);
          setEditingRecurring(null);
        }}
      />
      <SavingsPotModal
        visible={modal === "pot"}
        onClose={() => setModal(null)}
        onSave={(pot) => {
          setSavingsPots(items => [...items, { ...pot, id: uid(), createdAt: new Date().toISOString(), contributions: [] }]);
          setAnalysis(null);
          setModal(null);
        }}
      />
      <SavingsPotDepositModal
        visible={modal === "potDeposit"}
        pot={selectedPot}
        walletBalances={walletBalances}
        dreamsBalance={dreamsBalance}
        onClose={() => { setModal(null); setSelectedPot(null); }}
        onSave={(value, walletId) => {
          if (!selectedPot) return;
          const paidPot = selectedPot;
          setSavingsPots(items => items.map(pot => pot.id === selectedPot.id ? {
            ...pot,
            contributions: [...pot.contributions, { id: uid(), value, walletId, createdAt: new Date().toISOString() }],
          } : pot));
          if (paidPot.type === "debt") setEntries(items => [{ id: uid(), title: `Pagamento da dívida: ${paidPot.name}`, value, kind: "expense", category: "Outros", walletId, createdAt: new Date().toISOString() }, ...items]);
          setAnalysis(null);
          setModal(null);
          setSelectedPot(null);
        }}
      />
      <LifeSpentCalculatorModal
        visible={modal === "lifeCalculator"}
        entries={entries}
        recurring={recurring}
        goal={goal}
        savingsPots={savingsPots}
        availableBalance={availableBalance}
        dreamsBalance={dreamsBalance}
        onClose={() => setModal(null)}
      />
      <ProfileModal
        visible={modal === "profile"}
        name={userName}
        goal={goal}
        onClose={() => setModal(null)}
        onSave={(name, value) => { setProfileName(name); setGoal(value); setAnalysis(null); setModal(null); }}
        onImportBank={() => setModal("bankImport")}
        themeMode={themeMode}
        onThemeChange={changeTheme}
      />
      <BankImportModal
        visible={modal === "bankImport"}
        wallets={wallets}
        existingEntries={entries}
        onClose={() => setModal(null)}
        onImport={(importedEntries) => {
          setEntries((current) => [
            ...importedEntries.map((entry) => ({ ...entry, id: uid() })),
            ...current,
          ]);
          setAnalysis(null);
          setModal(null);
          Alert.alert(
            "Extrato importado",
            `${importedEntries.length} ${importedEntries.length === 1 ? "movimentação entrou" : "movimentações entraram"} no Nenero.`,
          );
        }}
      />
      <AnalysisModal visible={modal === "analysis"} analysis={analysis} loading={analyzing} error={analysisError} onRetry={runAnalysis} onClose={() => setModal(null)} />
    </SafeAreaView>
  );
}

function Home({ userName, balance, reservedBalance, recurringTotal, monthlyIncome, monthlyExpenses, entries, wallets, analysis, analyzing, hasGoal, onAnalyze, onRefresh, onAdd, onEditEntry, onSavingsPot, onLifeCalculator }: {
  userName: string;
  balance: number; reservedBalance: number; recurringTotal: number; monthlyIncome: number; monthlyExpenses: number; entries: Entry[]; wallets: Wallet[];
  analysis: AiAnalysis | null; analyzing: boolean; hasGoal: boolean; onAnalyze: () => void; onRefresh: () => void;
  onAdd: () => void; onEditEntry: (entry: Entry) => void; onSavingsPot: () => void; onLifeCalculator: () => void;
}) {
  const darkTheme = COLORS.paper === DARK_COLORS.paper;
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).toUpperCase();
  const balanceGradient: [string, string] = analysis?.status === "danger"
    ? darkTheme ? ["#54243A", "#2C172B"] : ["#7C3453", "#4E244B"]
    : analysis?.status === "attention"
      ? darkTheme ? ["#51327B", "#2D1E58"] : ["#8550C8", "#5B32C8"]
      : darkTheme ? ["#4B2E86", "#27194F"] : ["#7951ED", "#5B32C8"];
  const aiStatusLabel = analysis?.status === "danger"
    ? "PERIGO"
    : analysis?.status === "attention"
      ? "ATENÇÃO"
      : analysis?.status === "ok"
        ? "TUDO SOB CONTROLE"
        : null;
  const aiStatusColor = analysis?.status === "danger"
    ? "#FFD3CC"
    : analysis?.status === "attention"
      ? "#FFE49A"
      : COLORS.lime;
  return (
    <>
      <View style={styles.helloRow}>
        <View><Text style={styles.eyebrow}>{today}</Text><Text style={styles.h1}>Oi, {userName}!</Text></View>
        <View style={styles.moodActions}>
          <Pressable style={[styles.moodPill, analysis?.status === "attention" && styles.moodAttention, analysis?.status === "danger" && styles.moodDanger]} onPress={onAnalyze}>
            <Text style={[styles.moodText, analysis?.status === "attention" && styles.moodAttentionText, analysis?.status === "danger" && styles.moodDangerText]}>{analyzing ? "pensando..." : analysis?.status === "danger" ? "perigo, deu ruim" : analysis?.status === "attention" ? "atenção por aqui" : analysis?.status === "ok" ? "tudo sob controle" : hasGoal ? "analisar meu mês" : "defina seu objetivo"}</Text>
            <MaterialCommunityIcons name="creation" size={15} color={analysis?.status === "danger" ? "#B54337" : analysis?.status === "attention" ? "#9A6810" : "#277493"} />
          </Pressable>
          <Pressable style={[styles.aiRefreshButton, analyzing && styles.buttonDisabled]} onPress={onRefresh} disabled={analyzing} accessibilityLabel="Analisar novamente">
            <Feather name="refresh-cw" size={14} color={COLORS.grape} />
          </Pressable>
        </View>
      </View>

      <LinearGradient colors={balanceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
        <View style={styles.balanceGlow} />
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>Seu dinheiro todo</Text>
          {aiStatusLabel && <View style={[styles.balanceAiBadge, { backgroundColor: aiStatusColor }]}><MaterialCommunityIcons name="creation" size={12} color="#242033" /><Text style={styles.balanceAiBadgeText}>{aiStatusLabel}</Text></View>}
        </View>
        <Text style={styles.balanceValue}>{money(balance)}</Text>
        {analysis ? (
          <View style={styles.balanceAnalysis}>
            <Text style={styles.balanceAnalysisHeadline}>{analysis.headline}</Text>
            <Text style={styles.balanceAnalysisSummary} numberOfLines={2}>{analysis.summary}</Text>
          </View>
        ) : (
          <Text style={styles.balanceCopy}>{balance >= 0 ? "Tá bonito. E o melhor: tá organizado." : "Respira. Vamos ajeitar isso juntos."}</Text>
        )}
        {reservedBalance > 0 && <Pressable style={styles.balanceDreamsPill} onPress={onSavingsPot}>
          <MaterialCommunityIcons name="star-four-points" size={14} color={COLORS.lime} />
          <Text style={styles.balanceDreamsPillText}>{money(reservedBalance)} protegidos em Meus sonhos</Text>
          <Feather name="chevron-right" size={14} color="#FFFFFF" />
        </Pressable>}
        <Pressable style={styles.whiteButton} onPress={onAdd}>
          <Feather name="plus" size={18} color="#532CB8" />
          <Text style={styles.whiteButtonText}>Novo lançamento</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, styles.metricIncomeCard]}>
          <View style={[styles.iconBubble, { backgroundColor: "#799B22" }]}><Feather name="arrow-down-left" size={17} color="white" /></View>
          <Text style={[styles.metricLabel, styles.metricIncomeLabel]}>Entrou este mês</Text>
          <Text style={[styles.metricValue, styles.metricIncomeValue]}>{money(monthlyIncome)}</Text>
        </View>
        <View style={[styles.metricCard, styles.metricExpenseCard]}>
          <View style={[styles.iconBubble, { backgroundColor: COLORS.coral }]}><Feather name="arrow-up-right" size={17} color="white" /></View>
          <Text style={[styles.metricLabel, styles.metricExpenseLabel]}>Saiu este mês</Text>
          <Text style={[styles.metricValue, styles.metricExpenseValue]}>{money(monthlyExpenses)}</Text>
        </View>
      </View>
      <View style={styles.commitmentCard}>
        <View style={[styles.iconBubble, { backgroundColor: "#87A928", marginBottom: 0 }]}><Feather name="repeat" size={16} color="white" /></View>
        <View style={styles.flex}><Text style={styles.metricLabel}>Já comprometido em gastos fixos</Text><Text style={styles.commitmentHint}>Contas ativas deste mês</Text></View>
        <Text style={styles.metricValue}>{money(recurringTotal)}</Text>
      </View>

      <Pressable style={({ pressed }) => [styles.lifeFeatureCard, pressed && styles.pressed]} onPress={onLifeCalculator}>
        <View style={styles.lifeFeatureIcon}><Feather name="clock" size={22} color={COLORS.grape} /></View>
        <View style={styles.flex}><Text style={styles.lifeFeatureEyebrow}>CALCULADORA DE VIDA GASTA</Text><Text style={styles.lifeFeatureTitle}>Quanto trabalho custa essa compra?</Text></View>
        <Feather name="chevron-right" size={20} color={COLORS.grape} />
      </Pressable>

      <SectionTitle title="Últimos rolês do dinheiro" action="Ver todos" />
      <View style={styles.listCard}>
        {entries.slice(0, 4).map((entry, index) => <EntryRow key={entry.id} entry={entry} wallet={wallets.find(wallet => wallet.id === entry.walletId)} last={index === Math.min(entries.length, 4) - 1} onEdit={() => onEditEntry(entry)} />)}
      </View>

      <View style={styles.tipCard}>
        <View style={styles.tipMascot}><Text style={styles.tipFace}>•ᴗ•</Text></View>
        <View style={styles.tipCopy}><Text style={styles.tipTitle}>Papo do Nenero</Text><Text style={styles.tipText}>Seus gastos fixos ocupam {Math.min(100, Math.round((recurringTotal / Math.max(balance, 1)) * 100))}% do saldo. O resto pode respirar.</Text></View>
      </View>
    </>
  );
}

function Movements({ entries, wallets, onAdd, onEdit }: { entries: Entry[]; wallets: Wallet[]; onAdd: () => void; onEdit: (entry: Entry) => void }) {
  const [kindFilter, setKindFilter] = useState<"all" | EntryKind>("all");
  const [walletFilter, setWalletFilter] = useState("all");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const isCurrentMonthSelected = selectedMonth.getTime() === currentMonth.getTime();
  const monthLabel = selectedMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthEntries = entries.filter(entry => {
    const date = new Date(entry.createdAt);
    return date.getFullYear() === selectedMonth.getFullYear() && date.getMonth() === selectedMonth.getMonth();
  });
  const filteredEntries = monthEntries.filter(entry =>
    (kindFilter === "all" || entry.kind === kindFilter) &&
    (walletFilter === "all" || entry.walletId === walletFilter)
  );
  const hasFilters = kindFilter !== "all" || walletFilter !== "all";

  return (
    <>
      <PageHeader eyebrow="TUDO NUM SÓ LUGAR" title="Movimentos" button="Lançar" onPress={onAdd} />
      <View style={styles.monthPicker}>
        <Pressable style={styles.monthArrow} onPress={() => setSelectedMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} accessibilityLabel="Mês anterior"><Feather name="chevron-left" size={20} color={COLORS.grape} /></Pressable>
        <View style={styles.monthCenter}><Text style={styles.monthCaption}>MOVIMENTOS DE</Text><Text style={styles.monthLabel}>{monthLabel}</Text></View>
        <Pressable
          style={[styles.monthArrow, isCurrentMonthSelected && styles.buttonDisabled]}
          onPress={() => setSelectedMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          disabled={isCurrentMonthSelected}
          accessibilityLabel="Próximo mês"
        ><Feather name="chevron-right" size={20} color={COLORS.grape} /></Pressable>
      </View>
      <View style={styles.summaryStrip}>
        <Text style={styles.summaryText}>{filteredEntries.length} {filteredEntries.length === 1 ? "lançamento encontrado" : "lançamentos encontrados"}</Text>
        <Pressable
          style={[styles.filterToggle, filtersVisible && styles.filterToggleActive]}
          onPress={() => setFiltersVisible((visible) => !visible)}
          accessibilityRole="button"
          accessibilityLabel={filtersVisible ? "Ocultar filtros" : "Mostrar filtros"}
          accessibilityState={{ expanded: filtersVisible }}
        >
          <Feather name="sliders" size={18} color={filtersVisible ? COLORS.white : COLORS.grape} />
          {hasFilters && <View style={styles.filterActiveDot} />}
        </Pressable>
      </View>

      {filtersVisible && <View style={styles.filtersPanel}>
        <View style={styles.filtersPanelHeader}>
          <Text style={styles.filtersPanelTitle}>FILTRAR MOVIMENTOS</Text>
          {hasFilters && <Pressable style={styles.clearFilter} onPress={() => { setKindFilter("all"); setWalletFilter("all"); }}>
            <Feather name="x" size={14} color={COLORS.grape} />
            <Text style={styles.clearFilterText}>Limpar</Text>
          </Pressable>
          }
        </View>
        <Text style={styles.filterLabel}>TIPO</Text>
        <View style={styles.filterRow}>
          {([["all", "Todos"], ["expense", "Gastos"], ["income", "Entradas"]] as const).map(([value, label]) => (
            <Pressable key={value} style={[styles.filterChip, kindFilter === value && styles.filterChipActive]} onPress={() => setKindFilter(value)}>
              <Text style={[styles.filterChipText, kindFilter === value && styles.filterChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.filterLabel}>CARTEIRA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <Pressable style={[styles.filterChip, walletFilter === "all" && styles.filterChipActive]} onPress={() => setWalletFilter("all")}>
            <Text style={[styles.filterChipText, walletFilter === "all" && styles.filterChipTextActive]}>Todas</Text>
          </Pressable>
          {wallets.map(wallet => (
            <Pressable key={wallet.id} style={[styles.filterChip, walletFilter === wallet.id && styles.filterChipActive]} onPress={() => setWalletFilter(wallet.id)}>
              <View style={[styles.filterDot, { backgroundColor: wallet.color }]} />
              <Text style={[styles.filterChipText, walletFilter === wallet.id && styles.filterChipTextActive]}>{wallet.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>}

      {filteredEntries.length > 0 ? (
        <View style={styles.listCard}>
          {filteredEntries.map((entry, i) => <EntryRow key={entry.id} entry={entry} wallet={wallets.find(wallet => wallet.id === entry.walletId)} last={i === filteredEntries.length - 1} onEdit={() => onEdit(entry)} />)}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><Feather name="search" size={22} color={COLORS.grape} /></View>
          <Text style={styles.emptyTitle}>Nada por aqui</Text>
          <Text style={styles.emptyText}>Tente outra combinação ou limpe os filtros.</Text>
        </View>
      )}
    </>
  );
}

function RecurringList({ items, wallets, onAdd, onEdit, onToggle, onPay }: { items: Recurring[]; wallets: Wallet[]; onAdd: () => void; onEdit: (item: Recurring) => void; onToggle: (id: string) => void; onPay: (item: Recurring, monthKey: string) => void }) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const fixedExpenses = items.filter(item => item.active && item.kind !== "income").reduce((sum, item) => sum + item.value, 0);
  const plannedIncome = items.filter(item => item.active && item.kind === "income").reduce((sum, item) => sum + item.value, 0);
  const monthKey = `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = selectedMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const changeMonth = (amount: number) => setSelectedMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  const incomes = items.filter(item => item.kind === "income");
  const bills = items.filter(item => item.kind !== "income");
  return (
    <>
      <PageHeader eyebrow="SEM SURPRESA NO FIM DO MÊS" title="Planejados" button="Adicionar" onPress={onAdd} />
      <View style={styles.recurringHero}>
        <Text style={styles.recurringHeroLabel}>ENTRA TODO MÊS</Text>
        <Text style={styles.recurringHeroValue}>{money(plannedIncome)}</Text>
        <Text style={styles.recurringHeroCopy}>Gastos fixos: {money(fixedExpenses)} · O Nenero cuida das datas.</Text>
      </View>

      <View style={styles.monthPicker}>
        <Pressable style={styles.monthArrow} onPress={() => changeMonth(-1)} accessibilityLabel="Mês anterior"><Feather name="chevron-left" size={20} color={COLORS.grape} /></Pressable>
        <View style={styles.monthCenter}><Text style={styles.monthCaption}>CONTROLE DO MÊS</Text><Text style={styles.monthLabel}>{monthLabel}</Text></View>
        <Pressable style={styles.monthArrow} onPress={() => changeMonth(1)} accessibilityLabel="Próximo mês"><Feather name="chevron-right" size={20} color={COLORS.grape} /></Pressable>
      </View>
      <SectionTitle title="Entradas do mês" />
      {incomes.length ? incomes.map(item => (
        <View key={item.id} style={[styles.recurringRow, !item.active && styles.disabledRow]}>
          <View style={[styles.dateBadge, styles.incomeDateBadge]}><Text style={styles.dateSmall}>DIA</Text><Text style={styles.dateBig}>{item.day}</Text></View>
          <View style={styles.flex}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{wallets.find(wallet => wallet.id === item.walletId)?.name ?? "Carteira"} · {item.active ? "Programado" : "Pausado"}</Text></View>
          <Text style={[styles.rowValue, styles.income]}>+ {money(item.value)}</Text>
          <Pressable style={styles.editRecurringButton} onPress={() => onEdit(item)} accessibilityLabel={`Editar ${item.title}`}><Feather name="edit-2" size={15} color={COLORS.grape} /></Pressable>
          <Pressable style={styles.toggleRecurringButton} onPress={() => onToggle(item.id)} accessibilityLabel={item.active ? "Pausar" : "Ativar"}><Feather name={item.active ? "pause" : "play"} size={14} color={COLORS.muted} /></Pressable>
        </View>
      )) : <Text style={styles.emptySectionText}>Nenhuma entrada mensal programada.</Text>}

      <SectionTitle title="Contas do mês" />
      {bills.length ? bills.map(item => {
        const paid = item.paidMonths?.includes(monthKey) ?? false;
        return (
          <View key={item.id} style={[styles.billCard, !item.active && styles.disabledRow]}>
            <View style={styles.billMain}>
              <View style={styles.dateBadge}><Text style={styles.dateSmall}>DIA</Text><Text style={styles.dateBig}>{item.day}</Text></View>
              <View style={styles.flex}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{item.category} · {wallets.find(wallet => wallet.id === item.walletId)?.name ?? wallets[0]?.name ?? "Carteira"}</Text></View>
              <View style={paid ? styles.paidBadge : styles.pendingBadge}><Text style={paid ? styles.paidBadgeText : styles.pendingBadgeText}>{paid ? "Paga" : "Pendente"}</Text></View>
              <Pressable style={styles.editRecurringButton} onPress={() => onEdit(item)} accessibilityLabel={`Editar ${item.title}`}><Feather name="edit-2" size={15} color={COLORS.grape} /></Pressable>
            </View>
            <View style={styles.billFooter}>
              <Text style={styles.billValue}>{money(item.value)}</Text>
              <View style={styles.billActions}>
                <Pressable style={styles.pauseButton} onPress={() => onToggle(item.id)}><Feather name={item.active ? "pause" : "play"} size={13} color={COLORS.grape} /><Text style={styles.pauseButtonText}>{item.active ? "Pausar" : "Ativar"}</Text></Pressable>
                {!paid && item.active && <Pressable style={styles.payButton} onPress={() => onPay(item, monthKey)}><Feather name="check" size={14} color="white" /><Text style={styles.payButtonText}>Pagar conta</Text></Pressable>}
              </View>
            </View>
          </View>
        );
      }) : <Text style={styles.emptySectionText}>Nenhuma conta fixa cadastrada.</Text>}
    </>
  );
}

function WalletList({ walletBalances, pots, dreamsBalance, onAdd, onEdit, onOpenDreams }: {
  walletBalances: WalletBalance[];
  pots: SavingsPot[];
  dreamsBalance: number;
  onAdd: () => void;
  onEdit: (wallet: Wallet) => void;
  onOpenDreams: () => void;
}) {
  const savingsGoals = pots.filter((pot) => pot.type !== "debt");
  return (
    <>
      <PageHeader eyebrow="CADA REAL NO SEU CANTO" title="Carteiras" button="Criar" onPress={onAdd} />
      {walletBalances.map(({ wallet, balance }) => (
        <Pressable
          key={wallet.id}
          style={({ pressed }) => [styles.walletCard, { backgroundColor: wallet.color }, pressed && styles.pressed]}
          onPress={() => onEdit(wallet)}
          accessibilityRole="button"
          accessibilityLabel={`Editar carteira ${wallet.name}`}
        >
          <View style={styles.walletTop}><Feather name="credit-card" size={22} color="white" /><View style={styles.walletEditIcon}><Feather name="edit-2" size={15} color="white" /></View></View>
          <Text style={styles.walletName}>{wallet.name}</Text>
          <Text style={styles.walletBalance}>{money(balance)}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.dashedButton} onPress={onAdd}><Feather name="plus" size={20} color={COLORS.grape} /><Text style={styles.dashedText}>Criar outra carteira</Text></Pressable>
      {savingsGoals.length > 0 && <>
        <View style={styles.dreamsSectionHeader}>
          <Text style={styles.dreamsSectionEyebrow}>DINHEIRO COM DESTINO</Text>
          <View style={styles.dreamsSectionLine} />
        </View>
        <Pressable
          style={({ pressed }) => [styles.dreamWalletPressable, pressed && styles.pressed]}
          onPress={onOpenDreams}
          accessibilityRole="button"
          accessibilityLabel={`Abrir carteira Meus sonhos, saldo ${money(dreamsBalance)}`}
        >
          <LinearGradient colors={["#2B214D", "#6540C8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dreamWalletCard}>
            <View style={styles.dreamWalletGlow} />
            <View style={styles.dreamWalletTop}>
              <View style={styles.dreamWalletIcon}><MaterialCommunityIcons name="star-four-points" size={22} color={COLORS.ink} /></View>
              <View style={styles.dreamWalletAutoBadge}><Text style={styles.dreamWalletAutoText}>CARTEIRA AUTOMÁTICA</Text></View>
            </View>
            <Text style={styles.dreamWalletLabel}>Meus sonhos</Text>
            <Text style={styles.dreamWalletBalance}>{money(dreamsBalance)}</Text>
            <Text style={styles.dreamWalletCopy}>{savingsGoals.length} {savingsGoals.length === 1 ? "meta guardando um plano" : "metas guardando seus planos"}. Esse dinheiro continua seu, só saiu da rota do impulso.</Text>
            <View style={styles.dreamWalletPotList}>
              {savingsGoals.slice(0, 3).map((pot) => {
                const saved = getSavingsPotBalance(pot);
                return <View key={pot.id} style={styles.dreamWalletPot}>
                  <View style={styles.dreamWalletPotDot} />
                  <Text style={styles.dreamWalletPotName} numberOfLines={1}>{pot.name}</Text>
                  <Text style={styles.dreamWalletPotValue}>{money(saved)}</Text>
                </View>;
              })}
              {savingsGoals.length > 3 && <Text style={styles.dreamWalletMore}>+ {savingsGoals.length - 3} {savingsGoals.length - 3 === 1 ? "outro sonho" : "outros sonhos"}</Text>}
            </View>
            <View style={styles.dreamWalletOpen}>
              <Text style={styles.dreamWalletOpenText}>Ver minhas metas</Text>
              <Feather name="arrow-up-right" size={16} color={COLORS.lime} />
            </View>
          </LinearGradient>
        </Pressable>
      </>}
    </>
  );
}

function SavingsPotList({ pots, wallets, onAdd, onDeposit }: { pots: SavingsPot[]; wallets: Wallet[]; onAdd: () => void; onDeposit: (pot: SavingsPot) => void }) {
  return (
    <>
      <PageHeader eyebrow="PLANOS QUE SAEM DO PAPEL" title="Metas" button="Criar" onPress={onAdd} />
      {pots.length ? pots.map(pot => {
        const saved = getSavingsPotBalance(pot);
        const progress = Math.min(100, Math.round((saved / pot.goal) * 100));
        const remaining = Math.max(0, pot.goal - saved);
        const deadline = new Date(new Date(pot.createdAt).getFullYear(), new Date(pot.createdAt).getMonth() + pot.months, 1);
        const realMonthlyRate = getRealMonthlyRate(pot);
        const remainingMonths = Math.max(1, pot.months - getElapsedMonths(pot.createdAt));
        const monthlyTarget = getMonthlyTarget(pot.goal, remainingMonths, realMonthlyRate, saved);
        const sourceWalletNames = [...new Set(pot.contributions
          .map((contribution) => wallets.find((wallet) => wallet.id === contribution.walletId)?.name)
          .filter((name): name is string => Boolean(name)))];
        return (
          <View key={pot.id} style={styles.potCard}>
            <View style={styles.potTop}>
              <View style={styles.potIcon}><MaterialCommunityIcons name={pot.type === "debt" ? "receipt-text-outline" : "piggy-bank-outline"} size={25} color={COLORS.grape} /></View>
              <View style={styles.flex}><Text style={styles.potName}>{pot.name}</Text><Text style={styles.potDescription}>{pot.description || "Um objetivo com lugar marcado."}</Text></View>
              <Text style={styles.potPercent}>{progress}%</Text>
            </View>
            <View style={styles.potProgressTrack}><View style={[styles.potProgressFill, { width: `${progress}%` }]} /></View>
            <View style={styles.potValues}>
              <View><Text style={styles.potValueLabel}>{pot.type === "debt" ? "JÁ PAGOU" : "JÁ GUARDOU"}</Text><Text style={styles.potSaved}>{money(saved)}</Text></View>
              <View style={styles.potGoalBlock}><Text style={styles.potValueLabel}>{pot.type === "debt" ? "DÍVIDA TOTAL" : "META"}</Text><Text style={styles.potGoal}>{money(pot.goal)}</Text></View>
            </View>
            <Text style={styles.potPlan}>{money(monthlyTarget)}/mês · até {deadline.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</Text>
            {pot.compoundInterest && <View style={styles.potYieldBadge}><Feather name="trending-up" size={13} color="#167B6B" /><Text style={styles.potYieldText}>{(realMonthlyRate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}% ao mês, já descontada a inflação</Text></View>}
            {!!sourceWalletNames.length && <View style={styles.potSourceLine}>
              <Feather name="corner-down-right" size={13} color={COLORS.muted} />
              <Text style={styles.potSourceText} numberOfLines={1}>{pot.type === "debt" ? "Pago por " : "Veio de "}{sourceWalletNames.join(", ")}</Text>
            </View>}
            {remaining > 0 ? (
              <Pressable style={styles.potDepositButton} onPress={() => onDeposit(pot)}><Feather name={pot.type === "debt" ? "credit-card" : "plus"} size={17} color="white" /><Text style={styles.potDepositButtonText}>{pot.type === "debt" ? "Registrar pagamento" : "Colocar dinheiro"}</Text></Pressable>
            ) : (
              <View style={styles.potComplete}><Feather name="check-circle" size={17} color="#66851D" /><Text style={styles.potCompleteText}>{pot.type === "debt" ? "Dívida quitada. Que alívio!" : "Meta batida. Esse porquinho está forte!"}</Text></View>
            )}
          </View>
        );
      }) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><MaterialCommunityIcons name="piggy-bank-outline" size={25} color={COLORS.grape} /></View>
          <Text style={styles.emptyTitle}>Sua primeira meta</Text>
          <Text style={styles.emptyText}>Junte para um sonho ou acompanhe a quitação de uma dívida.</Text>
          <Pressable style={styles.emptyPotButton} onPress={onAdd}><Text style={styles.emptyPotButtonText}>Criar meta</Text></Pressable>
        </View>
      )}
    </>
  );
}

function PageHeader({ eyebrow, title, button, onPress }: { eyebrow: string; title: string; button: string; onPress: () => void }) {
  return <View style={styles.pageHeader}><View><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.h1}>{title}</Text></View><Pressable style={styles.smallButton} onPress={onPress}><Feather name="plus" size={16} color="white" /><Text style={styles.smallButtonText}>{button}</Text></Pressable></View>;
}

function EntryRow({ entry, wallet, last, onEdit }: { entry: Entry; wallet?: Wallet; last: boolean; onEdit?: () => void }) {
  const visual = getCategoryVisual(entry.category, entry.kind);
  return (
    <View style={[styles.entryRow, !last && styles.entryBorder]}>
      <View style={[styles.entryIcon, { backgroundColor: visual.background, borderColor: visual.border }]}>
        <MaterialCommunityIcons name={visual.icon} size={20} color={visual.color} />
      </View>
      <View style={styles.entryContent}>
        <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">{entry.title}</Text>
        <Text style={styles.entryDateText}>{new Date(entry.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</Text>
        {wallet && <View style={styles.entryWallet}><View style={[styles.entryWalletDot, { backgroundColor: wallet.color }]} /><Text style={styles.entryWalletText} numberOfLines={1} ellipsizeMode="tail">{wallet.name}</Text></View>}
      </View>
      <Text style={[styles.rowValue, entry.kind === "income" && styles.income]} numberOfLines={1}>{entry.kind === "income" ? "+" : "−"} {money(entry.value)}</Text>
      {onEdit && <Pressable style={styles.editEntryButton} onPress={onEdit} accessibilityLabel={`Editar ${entry.title}`}><Feather name="edit-2" size={14} color={COLORS.grape} /></Pressable>}
    </View>
  );
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return <View style={styles.sectionTitle}><Text style={styles.sectionTitleText}>{title}</Text>{action && <Text style={styles.sectionAction}>{action}</Text>}</View>;
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "inicio", label: "Início", icon: "home" }, { key: "movimentos", label: "Movimentos", icon: "list" },
    { key: "recorrentes", label: "Planejados", icon: "repeat" }, { key: "cofrinhos", label: "Metas", icon: "target" },
    { key: "carteiras", label: "Carteiras", icon: "credit-card" },
  ];
  return <View style={styles.nav}>{tabs.map((item) => <Pressable key={item.key} style={styles.navItem} onPress={() => setTab(item.key)}><Feather name={item.icon} size={21} color={tab === item.key ? COLORS.grape : "#AAA4B3"} /><Text style={[styles.navLabel, tab === item.key && styles.navActive]}>{item.label}</Text>{tab === item.key && <View style={styles.navDot} />}</Pressable>)}</View>;
}

function Sheet({ visible, title, subtitle, onClose, children }: { visible: boolean; title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} style={styles.modalWrap}><Pressable style={styles.backdrop} onPress={onClose} /><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View style={styles.flex}><Text style={styles.sheetTitle}>{title}</Text><Text style={styles.sheetSubtitle}>{subtitle}</Text></View><Pressable style={styles.close} onPress={onClose}><Feather name="x" size={19} color={COLORS.ink} /></Pressable></View><ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} showsVerticalScrollIndicator={false}>{children}</ScrollView></View></KeyboardAvoidingView></Modal>;
}

function Field({ label, value, onChange, placeholder, keyboardType, secureTextEntry, money: isMoney }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: "decimal-pad" | "number-pad" | "email-address";
  secureTextEntry?: boolean;
  money?: boolean;
}) {
  const [moneySelection, setMoneySelection] = useState({ start: 0, end: 0 });
  const [editingCents, setEditingCents] = useState(false);

  const changeMoney = (text: string) => {
    if (!text) {
      setEditingCents(false);
      setMoneySelection({ start: 0, end: 0 });
      onChange("");
      return;
    }

    const commaCount = (text.match(/,/g) ?? []).length;
    const currentComma = value.indexOf(",");
    if (commaCount > 1 && currentComma >= 0) {
      setEditingCents(true);
      setMoneySelection({ start: currentComma + 1, end: currentComma + 1 });
      return;
    }

    const formatted = formatMoneyInput(text);
    const commaIndex = formatted.indexOf(",");
    if (editingCents && commaIndex >= 0) {
      const deleting = text.length < value.length;
      const nextPosition = Math.max(
        commaIndex + 1,
        Math.min(commaIndex + 3, moneySelection.start + (deleting ? -1 : 1)),
      );
      setMoneySelection({ start: nextPosition, end: nextPosition });
    } else {
      const nextPosition = commaIndex >= 0 ? commaIndex : formatted.length;
      setMoneySelection({ start: nextPosition, end: nextPosition });
    }
    onChange(formatted);
  };

  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput
    style={styles.input}
    value={value}
    onChangeText={isMoney ? changeMoney : onChange}
    onFocus={() => {
      if (!isMoney) return;
      const commaIndex = value.indexOf(",");
      const position = commaIndex >= 0 ? commaIndex : value.length;
      setEditingCents(false);
      setMoneySelection({ start: position, end: position });
    }}
    onSelectionChange={isMoney ? (event) => {
      const selection = event.nativeEvent.selection;
      const commaIndex = value.indexOf(",");
      setEditingCents(commaIndex >= 0 && selection.start > commaIndex);
      setMoneySelection(selection);
    } : undefined}
    selection={isMoney ? moneySelection : undefined}
    placeholder={placeholder}
    placeholderTextColor="#B4AFBB"
    keyboardType={keyboardType}
    secureTextEntry={secureTextEntry}
    autoCapitalize={keyboardType === "email-address" ? "none" : undefined}
    autoCorrect={keyboardType === "email-address" ? false : undefined}
  /></View>;
}

function CategoryChip({ category, kind, selected, onPress }: {
  category: string;
  kind: EntryKind;
  selected: boolean;
  onPress: () => void;
}) {
  const visual = getCategoryVisual(category, kind);
  return <Pressable
    style={[
      styles.chip,
      { borderColor: visual.border },
      selected && { backgroundColor: visual.color, borderColor: visual.color },
    ]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    accessibilityLabel={`Categoria ${category}`}
  >
    <MaterialCommunityIcons name={visual.icon} size={15} color={selected ? COLORS.white : visual.color} />
    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{category}</Text>
  </Pressable>;
}

function EntryModal({ visible, wallets, item, onClose, onSave, onDelete }: { visible: boolean; wallets: Wallet[]; item: Entry | null; onClose: () => void; onSave: (entry: Omit<Entry, "id">) => void; onDelete?: () => void }) {
  const today = new Date();
  const [kind, setKind] = useState<EntryKind>("expense"); const [title, setTitle] = useState(""); const [value, setValue] = useState(""); const [category, setCategory] = useState(expenseCategories[0]!); const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [referenceMonth, setReferenceMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [referenceDay, setReferenceDay] = useState(String(today.getDate()));
  const activeCategories = categoriesByKind[kind];
  const parsedDay = Number(referenceDay);
  const maxDay = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth() + 1, 0).getDate();
  const referenceDate = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth(), parsedDay, 12);
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  const validDate = Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= maxDay && referenceDate <= todayEnd;
  const referenceMonthLabel = referenceMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const changeReferenceMonth = (amount: number) => setReferenceMonth(current => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  useEffect(() => {
    if (!visible) return;
    const itemDate = item ? new Date(item.createdAt) : today;
    const itemKind = item?.kind ?? "expense";
    const itemCategories = categoriesByKind[itemKind];
    setKind(itemKind);
    setTitle(item?.title ?? "");
    setValue(item ? formatMoneyInput(String(item.value).replace(".", ",")) : "");
    setCategory(item?.category && itemCategories.includes(item.category) ? item.category : itemCategories[0]!);
    setWalletId(item?.walletId ?? wallets[0]?.id ?? "");
    setReferenceMonth(new Date(itemDate.getFullYear(), itemDate.getMonth(), 1));
    setReferenceDay(String(itemDate.getDate()));
  }, [visible, item, wallets]);
  const changeKind = (nextKind: EntryKind) => {
    setKind(nextKind);
    setCategory((current) => categoriesByKind[nextKind].includes(current) ? current : categoriesByKind[nextKind][0]!);
  };
  const save = () => { const parsed = parseMoneyInput(value); if (title.trim() && parsed > 0 && walletId && validDate) { onSave({ title: title.trim(), value: parsed, kind, category, walletId, createdAt: referenceDate.toISOString() }); } };
  return <Sheet visible={visible} title={item ? "Editar movimentação" : "Novo lançamento"} subtitle={item ? "Corrija os dados sem criar outro lançamento." : "Conta pra gente por onde o dinheiro passeou."} onClose={onClose}>
    <View style={styles.segment}><Pressable style={[styles.segmentItem, kind === "expense" && styles.segmentActive]} onPress={() => changeKind("expense")}><Text style={[styles.segmentText, kind === "expense" && styles.segmentActiveText]}>Gasto</Text></Pressable><Pressable style={[styles.segmentItem, kind === "income" && styles.segmentActive]} onPress={() => changeKind("income")}><Text style={[styles.segmentText, kind === "income" && styles.segmentActiveText]}>Entrada</Text></Pressable></View>
    <Field label={kind === "income" ? "De onde veio?" : "O que foi?"} value={title} onChange={setTitle} placeholder={kind === "income" ? "Ex.: pagamento de projeto" : "Ex.: almoço, mercado..."} />
    <Field label="Quanto?" value={value} onChange={setValue} placeholder="R$ 0,00" keyboardType="decimal-pad" money />
    <Text style={styles.fieldLabel}>Data de referência</Text>
    <View style={styles.referenceDateRow}>
      <View style={styles.dayField}><Text style={styles.miniFieldLabel}>DIA</Text><TextInput style={styles.dayInput} value={referenceDay} onChangeText={setReferenceDay} keyboardType="number-pad" maxLength={2} /></View>
      <View style={styles.referenceMonthPicker}>
        <Pressable style={styles.referenceArrow} onPress={() => changeReferenceMonth(-1)}><Feather name="chevron-left" size={18} color={COLORS.grape} /></Pressable>
        <Text style={styles.referenceMonthText}>{referenceMonthLabel}</Text>
        <Pressable style={styles.referenceArrow} onPress={() => changeReferenceMonth(1)}><Feather name="chevron-right" size={18} color={COLORS.grape} /></Pressable>
      </View>
    </View>
    {!validDate && <Text style={styles.dateError}>{parsedDay > maxDay ? `Esse mês tem apenas ${maxDay} dias.` : referenceDate > todayEnd ? "Lançamentos futuros devem ser criados em Planejados." : "Informe um dia válido."}</Text>}
    <Text style={styles.fieldLabel}>{kind === "income" ? "Tipo de entrada" : "Categoria"}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{activeCategories.map(c => <CategoryChip key={c} category={c} kind={kind} selected={category === c} onPress={() => setCategory(c)} />)}</ScrollView>
    <Text style={styles.fieldLabel}>Carteira</Text><View style={styles.walletOptions}>{wallets.map(w => <Pressable key={w.id} style={[styles.walletOption, walletId === w.id && styles.walletOptionActive]} onPress={() => setWalletId(w.id)}><View style={[styles.colorDot, { backgroundColor: w.color }]} /><Text style={styles.walletOptionText}>{w.name}</Text>{walletId === w.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View>
    <PrimaryButton label={item ? "Salvar alterações" : "Salvar lançamento"} onPress={save} disabled={!title.trim() || !value || !validDate || !walletId} />
    {item && onDelete && <Pressable style={styles.deleteEntryButton} onPress={onDelete}><Feather name="trash-2" size={17} color="#B54337" /><Text style={styles.deleteEntryButtonText}>Excluir {item.kind === "income" ? "entrada" : "gasto"}</Text></Pressable>}
  </Sheet>;
}

function WalletModal({ visible, item, onClose, onSave, onDelete }: {
  visible: boolean;
  item: Wallet | null;
  onClose: () => void;
  onSave: (wallet: Omit<Wallet, "id">) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(""); const [initial, setInitial] = useState(""); const [color, setColor] = useState(walletPalette[0]!);
  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? "");
    setInitial("");
    setColor(item?.color ?? walletPalette[0]!);
  }, [visible, item]);
  const save = () => {
    const initialBalance = item?.initial ?? (parseMoneyInput(initial) || 0);
    if (name.trim()) onSave({ name: name.trim(), initial: initialBalance, color });
  };
  return <Sheet
    visible={visible}
    title={item ? "Editar carteira" : "Nova carteira"}
    subtitle={item ? "Ajuste o nome e a cor sem mexer na história do saldo." : "Um cantinho novo pro seu dinheiro."}
    onClose={onClose}
  >
    <Field label="Nome da carteira" value={name} onChange={setName} placeholder="Ex.: Conta do dia a dia" />
    {!item && <Field label="Saldo inicial" value={initial} onChange={setInitial} placeholder="R$ 0,00" keyboardType="decimal-pad" money />}
    <Text style={styles.fieldLabel}>Cor da carteira</Text>
    <View style={styles.walletColorPalette}>{walletPalette.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: color === option }} accessibilityLabel={option === "#111111" ? "Cor preta" : `Cor ${option}`} style={[styles.walletColorOption, { backgroundColor: option }, color === option && styles.walletColorOptionActive]} onPress={() => setColor(option)}>{color === option && <Feather name="check" size={18} color="#FFFFFF" />}</Pressable>)}</View>
    <PrimaryButton label={item ? "Salvar alterações" : "Criar carteira"} onPress={save} disabled={!name.trim()} />
    {item && onDelete && <Pressable style={styles.deleteWalletButton} onPress={onDelete}>
      <Feather name="trash-2" size={16} color="#B54337" />
      <Text style={styles.deleteWalletButtonText}>Excluir carteira</Text>
    </Pressable>}
  </Sheet>;
}

function RecurringModal({ visible, wallets, item, onClose, onSave }: { visible: boolean; wallets: Wallet[]; item: Recurring | null; onClose: () => void; onSave: (item: Omit<Recurring, "id" | "active">) => void }) {
  const [kind, setKind] = useState<EntryKind>("expense"); const [title, setTitle] = useState(""); const [value, setValue] = useState(""); const [day, setDay] = useState(""); const [category, setCategory] = useState("Casa"); const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const activeCategories = categoriesByKind[kind];
  useEffect(() => {
    if (!visible) return;
    const itemKind = item?.kind ?? "expense";
    const itemCategories = categoriesByKind[itemKind];
    setKind(itemKind);
    setTitle(item?.title ?? "");
    setValue(item ? formatMoneyInput(String(item.value).replace(".", ",")) : "");
    setDay(item ? String(item.day) : "");
    setCategory(item?.category && itemCategories.includes(item.category) ? item.category : itemCategories[0]!);
    setWalletId(item?.walletId ?? wallets[0]?.id ?? "");
  }, [visible, item, wallets]);
  const changeKind = (nextKind: EntryKind) => {
    setKind(nextKind);
    setCategory((current) => categoriesByKind[nextKind].includes(current) ? current : categoriesByKind[nextKind][0]!);
  };
  const save = () => {
    const parsed = parseMoneyInput(value); const parsedDay = Number(day);
    if (title.trim() && parsed > 0 && parsedDay >= 1 && parsedDay <= 31 && walletId) {
      onSave({ title: title.trim(), value: parsed, day: parsedDay, category, kind, walletId });
      setTitle(""); setValue(""); setDay("");
    }
  };
  return <Sheet visible={visible} title={item ? "Editar planejamento" : "Planejar o mês"} subtitle={item ? "Ajuste os próximos meses sem perder o histórico." : "Entradas e gastos no dia certo, sem depender da memória."} onClose={onClose}>
    <View style={styles.segment}>
      <Pressable style={[styles.segmentItem, kind === "expense" && styles.segmentActive]} onPress={() => changeKind("expense")}><Text style={[styles.segmentText, kind === "expense" && styles.segmentActiveText]}>Gasto fixo</Text></Pressable>
      <Pressable style={[styles.segmentItem, kind === "income" && styles.segmentActive]} onPress={() => changeKind("income")}><Text style={[styles.segmentText, kind === "income" && styles.segmentActiveText]}>Salário / entrada</Text></Pressable>
    </View>
    <Field label={kind === "income" ? "Qual entrada?" : "Qual gasto?"} value={title} onChange={setTitle} placeholder={kind === "income" ? "Ex.: salário" : "Ex.: aluguel, internet..."} />
    <Field label="Valor" value={value} onChange={setValue} placeholder="R$ 0,00" keyboardType="decimal-pad" money />
    <Field label={kind === "income" ? "Depositar em qual dia?" : "Vence em qual dia?"} value={day} onChange={setDay} placeholder="Ex.: 10" keyboardType="number-pad" />
    <Text style={styles.fieldLabel}>{kind === "income" ? "Tipo de entrada" : "Categoria"}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{activeCategories.map(c => <CategoryChip key={c} category={c} kind={kind} selected={category === c} onPress={() => setCategory(c)} />)}</ScrollView>
      <Text style={styles.fieldLabel}>{kind === "income" ? "Carteira que recebe" : "Carteira usada no pagamento"}</Text>
      <View style={styles.walletOptions}>{wallets.map(wallet => <Pressable key={wallet.id} style={[styles.walletOption, walletId === wallet.id && styles.walletOptionActive]} onPress={() => setWalletId(wallet.id)}><View style={[styles.colorDot, { backgroundColor: wallet.color }]} /><Text style={styles.walletOptionText}>{wallet.name}</Text>{walletId === wallet.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View>
      {kind === "income" && <View style={styles.autoPostNote}><Feather name="zap" size={16} color="#66851D" /><Text style={styles.autoPostText}>O valor será contabilizado na data programada, mesmo que o Nenero fique fechado naquele dia.</Text></View>}
    <PrimaryButton label={item ? "Salvar alterações" : kind === "income" ? "Programar entrada" : "Salvar gasto fixo"} onPress={save} disabled={!title.trim() || !value || !day || !walletId} />
  </Sheet>;
}

function SavingsPotModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (pot: Pick<SavingsPot, "type" | "name" | "description" | "goal" | "months" | "compoundInterest" | "monthlyInterestRate" | "annualInflationRate">) => void }) {
  const [type, setType] = useState<SavingsPot["type"]>("savings");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [months, setMonths] = useState("9");
  const [compoundInterest, setCompoundInterest] = useState(false);
  const [monthlyInterestRate, setMonthlyInterestRate] = useState("");
  const [annualInflationRate, setAnnualInflationRate] = useState("");
  useEffect(() => {
    if (visible) { setType("savings"); setName(""); setDescription(""); setGoalValue(""); setMonths("9"); setCompoundInterest(false); setMonthlyInterestRate(""); setAnnualInflationRate(""); }
  }, [visible]);
  const goal = parseMoneyInput(goalValue);
  const parsedMonths = Number(months);
  const nominalRate = parsePercentInput(monthlyInterestRate);
  const inflationRate = annualInflationRate.trim() ? parsePercentInput(annualInflationRate) : 0;
  const interestConfigValid = !compoundInterest || (Number.isFinite(nominalRate) && nominalRate > 0 && nominalRate <= 100 && Number.isFinite(inflationRate) && inflationRate >= 0 && inflationRate <= 100);
  const realMonthlyRate = getRealMonthlyRate({ compoundInterest, monthlyInterestRate: nominalRate || 0, annualInflationRate: inflationRate || 0 });
  const monthlyTarget = goal > 0 && parsedMonths > 0 ? getMonthlyTarget(goal, parsedMonths, realMonthlyRate) : 0;
  const valid = Boolean(name.trim()) && goal > 0 && parsedMonths >= 1 && parsedMonths <= 120 && interestConfigValid;
  return <Sheet visible={visible} title="Nova meta" subtitle="Escolha se você quer juntar dinheiro ou quitar uma dívida." onClose={onClose}>
    <View style={styles.segment}><Pressable style={[styles.segmentItem, type === "savings" && styles.segmentActive]} onPress={() => setType("savings")}><Text style={[styles.segmentText, type === "savings" && styles.segmentActiveText]}>Juntar dinheiro</Text></Pressable><Pressable style={[styles.segmentItem, type === "debt" && styles.segmentActive]} onPress={() => { setType("debt"); setCompoundInterest(false); }}><Text style={[styles.segmentText, type === "debt" && styles.segmentActiveText]}>Quitar dívida</Text></Pressable></View>
    <Field label={type === "debt" ? "Nome da dívida" : "Nome da meta"} value={name} onChange={setName} placeholder={type === "debt" ? "Ex.: Cartão, empréstimo..." : "Ex.: Viagem, notebook, reserva..."} />
    <Text style={styles.fieldLabel}>Descrição</Text>
    <TextInput
      style={styles.potDescriptionInput}
      value={description}
      onChangeText={setDescription}
      placeholder="Por que essa meta importa?"
      placeholderTextColor="#B4AFBB"
      multiline
      maxLength={180}
      textAlignVertical="top"
    />
    <Field label={type === "debt" ? "Valor total da dívida" : "Quanto quer juntar?"} value={goalValue} onChange={setGoalValue} placeholder="R$ 1.800,00" keyboardType="decimal-pad" money />
    <Field label="Em quantos meses?" value={months} onChange={setMonths} placeholder="Ex.: 9" keyboardType="number-pad" />
    {type === "savings" && <View style={styles.interestToggleCard}><View style={styles.interestToggleCopy}><Text style={styles.interestToggleTitle}>Esta meta rende juros compostos?</Text><Text style={styles.interestToggleHint}>Ative para considerar o rendimento na projeção da meta.</Text></View><Switch value={compoundInterest} onValueChange={setCompoundInterest} trackColor={{ false: "#D8D2DE", true: "#B9A8EC" }} thumbColor={compoundInterest ? COLORS.grape : "#FFFFFF"} /></View>}
    {compoundInterest && <View style={styles.interestFields}>
      <Field label="Rendimento ao mês (%)" value={monthlyInterestRate} onChange={setMonthlyInterestRate} placeholder="Ex.: 0,8" keyboardType="decimal-pad" />
      <Field label="Inflação ao ano (%) · opcional" value={annualInflationRate} onChange={setAnnualInflationRate} placeholder="Ex.: 4,5" keyboardType="decimal-pad" />
      {interestConfigValid && nominalRate > 0 && <View style={styles.realRateCard}><Feather name="shield" size={16} color="#167B6B" /><View style={styles.flex}><Text style={styles.realRateLabel}>RENDIMENTO REAL ESTIMADO</Text><Text style={styles.realRateValue}>{(realMonthlyRate * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}% ao mês</Text><Text style={styles.realRateHint}>Rendimento nominal menos o efeito composto da inflação anual.</Text></View></View>}
    </View>}
    {goal > 0 && parsedMonths > 0 && <View style={styles.potPreview}><Feather name={compoundInterest ? "trending-up" : "calendar"} size={17} color={COLORS.grape} /><Text style={styles.potPreviewText}>Para chegar lá: {money(monthlyTarget)} por mês{compoundInterest ? ", considerando o rendimento real." : "."}</Text></View>}
    <PrimaryButton label={type === "debt" ? "Criar meta de dívida" : "Criar meta"} onPress={() => valid && onSave({ type, name: name.trim(), description: description.trim(), goal, months: parsedMonths, compoundInterest: type === "savings" && compoundInterest, monthlyInterestRate: type === "savings" && compoundInterest ? nominalRate : 0, annualInflationRate: type === "savings" && compoundInterest ? inflationRate : 0 })} disabled={!valid} />
  </Sheet>;
}

function SavingsPotDepositModal({ visible, pot, walletBalances, dreamsBalance, onClose, onSave }: {
  visible: boolean;
  pot: SavingsPot | null;
  walletBalances: WalletBalance[];
  dreamsBalance: number;
  onClose: () => void;
  onSave: (value: number, walletId: string) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [walletId, setWalletId] = useState("");
  useEffect(() => {
    if (!visible) return;
    setCustomValue("");
    setSelectedValue(null);
    setWalletId(walletBalances.find((item) => item.balance > 0)?.wallet.id ?? walletBalances[0]?.wallet.id ?? "");
  }, [visible, pot, walletBalances]);
  const custom = parseMoneyInput(customValue);
  const value = selectedValue ?? custom;
  const saved = pot ? getSavingsPotBalance(pot) : 0;
  const remaining = Math.max(0, (pot?.goal ?? 0) - saved);
  const selectedWallet = walletBalances.find((item) => item.wallet.id === walletId);
  const insufficientBalance = Boolean(selectedWallet && value > selectedWallet.balance);
  const isDebt = pot?.type === "debt";
  const exceedsGoal = value > remaining && remaining > 0;
  const canSave = Boolean(walletId && value > 0 && selectedWallet && !insufficientBalance && !exceedsGoal);
  return <Sheet visible={visible} title={isDebt ? `Pagar ${pot?.name ?? "dívida"}` : `Guardar em ${pot?.name ?? "meta"}`} subtitle={`Faltam ${money(remaining)}. Agora escolha de onde esse dinheiro vai sair.`} onClose={onClose}>
    <View style={styles.potTransferNote}>
      <View style={styles.potTransferNoteIcon}><MaterialCommunityIcons name="swap-horizontal" size={19} color={COLORS.grape} /></View>
      <Text style={styles.potTransferNoteText}>{isDebt ? "Este pagamento será registrado como uma saída na carteira escolhida e aparecerá nas movimentações com o destino da dívida." : "É uma transferência entre seus bolsos: diminui na carteira escolhida e aparece em “Meus sonhos”. Seu dinheiro total não muda."}</Text>
    </View>
    <Text style={styles.fieldLabel}>Tirar de qual carteira?</Text>
    <View style={styles.potWalletOptions}>
      {walletBalances.map(({ wallet, balance }) => {
        const selected = wallet.id === walletId;
        const unavailable = balance <= 0;
        return <Pressable
          key={wallet.id}
          style={[styles.potWalletOption, selected && styles.potWalletOptionActive, unavailable && styles.potWalletOptionUnavailable]}
          onPress={() => setWalletId(wallet.id)}
          disabled={unavailable}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected, disabled: unavailable }}
        >
          <View style={[styles.potWalletColor, { backgroundColor: wallet.color }]}><Feather name="credit-card" size={14} color="#FFFFFF" /></View>
          <View style={styles.flex}>
            <Text style={styles.potWalletName}>{wallet.name}</Text>
            <Text style={styles.potWalletBalance}>{unavailable ? "Sem saldo disponível" : `${money(balance)} disponíveis`}</Text>
          </View>
          {selected && <View style={styles.potWalletCheck}><Feather name="check" size={14} color="#FFFFFF" /></View>}
        </Pressable>;
      })}
      {!walletBalances.length && <View style={styles.potNoWallet}><Feather name="alert-circle" size={17} color="#B54337" /><Text style={styles.potNoWalletText}>Crie uma carteira antes de {isDebt ? "pagar a dívida" : "guardar dinheiro na meta"}.</Text></View>}
    </View>
    <Text style={styles.fieldLabel}>Escolha um valor rápido</Text>
    <View style={styles.quickDepositRow}>
      {[100, 150, 200].map(amount => <Pressable key={amount} style={[styles.quickDeposit, selectedValue === amount && styles.quickDepositActive]} onPress={() => { setSelectedValue(amount); setCustomValue(""); }}><Text style={[styles.quickDepositText, selectedValue === amount && styles.quickDepositTextActive]}>{money(amount)}</Text></Pressable>)}
    </View>
    <Field label="Outro valor" value={customValue} onChange={(text) => { setCustomValue(text); setSelectedValue(null); }} placeholder="R$ 0,00" keyboardType="decimal-pad" money />
    {exceedsGoal && <Text style={styles.potOverGoal}>{isDebt ? `O pagamento ultrapassa o saldo da dívida em ${money(value - remaining)}.` : `Esse aporte passa a meta em ${money(value - remaining)}.`}</Text>}
    {insufficientBalance && selectedWallet && <View style={styles.potInsufficient}><Feather name="alert-triangle" size={15} color="#B54337" /><Text style={styles.potInsufficientText}>Faltam {money(value - selectedWallet.balance)} na carteira {selectedWallet.wallet.name} para fazer essa transferência.</Text></View>}
    {canSave && selectedWallet && <View style={styles.potTransferPreview}>
      <Text style={styles.potTransferPreviewLabel}>{isDebt ? "DEPOIS DO PAGAMENTO" : "DEPOIS DA TRANSFERÊNCIA"}</Text>
      <Text style={styles.potTransferPreviewText}>{selectedWallet.wallet.name} fica com {money(selectedWallet.balance - value)} · {isDebt ? `restam ${money(remaining - value)} da dívida` : `Meus sonhos vai para ${money(dreamsBalance + value)}`}</Text>
    </View>}
    <PrimaryButton label={isDebt ? `Pagar ${value > 0 ? money(value) : "um valor"}` : `Mover ${value > 0 ? money(value) : "dinheiro"} para o sonho`} onPress={() => canSave && onSave(value, walletId)} disabled={!canSave} />
  </Sheet>;
}

type PurchaseVerdict = {
  status: "worth_it" | "think_twice" | "not_worth_it";
  headline: string;
  explanation: string;
};

function LifeSpentCalculatorModal({ visible, entries, recurring, goal, savingsPots, availableBalance, dreamsBalance, onClose }: {
  visible: boolean;
  entries: Entry[];
  recurring: Recurring[];
  goal: string;
  savingsPots: SavingsPot[];
  availableBalance: number;
  dreamsBalance: number;
  onClose: () => void;
}) {
  const [product, setProduct] = useState("");
  const [priceText, setPriceText] = useState("");
  const [monthlyHoursText, setMonthlyHoursText] = useState("176");
  const [calculatedHours, setCalculatedHours] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<PurchaseVerdict | null>(null);
  const [consultingAi, setConsultingAi] = useState(false);
  const [calculatorError, setCalculatorError] = useState("");
  const now = new Date();
  const monthEntries = entries.filter(entry => {
    const date = new Date(entry.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const realizedSalary = monthEntries.filter(isSalaryLike).reduce((sum, entry) => sum + entry.value, 0);
  const plannedSalary = recurring
    .filter((item) => item.active && isSalaryLike({
      kind: item.kind ?? "expense",
      category: item.category,
      title: item.title,
    }))
    .reduce((sum, item) => sum + item.value, 0);
  const usingPlannedSalary = realizedSalary <= 0 && plannedSalary > 0;
  const monthlySalary = realizedSalary > 0 ? realizedSalary : plannedSalary;
  const monthlyExpenses = monthEntries.filter(entry => entry.kind === "expense").reduce((sum, entry) => sum + entry.value, 0);
  const price = parseMoneyInput(priceText);
  const monthlyHours = Number(monthlyHoursText);
  const hourlyIncome = monthlyHours > 0 ? monthlySalary / monthlyHours : 0;

  useEffect(() => {
    if (!visible) return;
    setProduct("");
    setPriceText("");
    setMonthlyHoursText("176");
    setCalculatedHours(null);
    setVerdict(null);
    setCalculatorError("");
  }, [visible]);

  const formatWorkTime = (hours: number) => {
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutos`;
    const fullDays = Math.floor(hours / 8);
    const remainingHours = Math.round(hours % 8);
    if (!fullDays) return `${Math.round(hours * 10) / 10} horas`;
    if (!remainingHours) return `${fullDays} ${fullDays === 1 ? "dia" : "dias"} de trabalho`;
    return `${fullDays} ${fullDays === 1 ? "dia" : "dias"} e ${remainingHours} horas`;
  };

  const calculate = async () => {
    if (monthlySalary <= 0 || price <= 0 || monthlyHours <= 0) return;
    const hours = price / hourlyIncome;
    setCalculatedHours(hours);
    setVerdict(null);
    setCalculatorError("");
    setConsultingAi(true);
    try {
      const useGeminiProxy = Platform.OS === "web" && process.env.NODE_ENV === "production";
      const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (!useGeminiProxy && !geminiKey) throw new Error("Adicione a chave do Gemini para receber a opinião da IA.");
      const pots = savingsPots.map(pot => ({
        name: pot.name,
        goal: pot.goal,
        saved: getSavingsPotBalance(pot),
      }));
      const response = await fetch(useGeminiProxy ? "/api/gemini" : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
        method: "POST",
        headers: useGeminiProxy
          ? { "Content-Type": "application/json" }
          : { "Content-Type": "application/json", "x-goog-api-key": geminiKey! },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `
Avalie se esta compra faz sentido no contexto financeiro informado.
Produto: ${product.trim() || "produto sem nome"}
Preço: R$ ${price}
${usingPlannedSalary ? "Renda mensal planejada" : "Salário realizado no mês"}: R$ ${monthlySalary}
Despesas realizadas no mês: R$ ${monthlyExpenses}
Horas mensais trabalhadas: ${monthlyHours}
Custo em tempo de trabalho, já calculado pelo app: ${Math.round(hours * 10) / 10} horas
Objetivo financeiro: ${goal.trim() || "não informado"}
Saldo disponível nas carteiras: R$ ${availableBalance}
Carteira "Meus sonhos", dinheiro reservado: R$ ${dreamsBalance}
Cofrinhos: ${JSON.stringify(pots)}

Seja preciso, direto e use no máximo uma alfinetada leve. Não decida apenas pelo
preço: considere o peso na renda, as despesas, as metas e o tempo de trabalho.
Dinheiro em "Meus sonhos" faz parte do patrimônio, mas está reservado para metas;
não trate esse valor como gasto nem como saldo livre para esta compra.
Não invente necessidade, parcelamento, juros ou utilidade do produto.
`}]}],
          systemInstruction: { parts: [{ text: "Você é o Nenero, consultor financeiro pessoal brasileiro. Priorize precisão e contexto antes do humor." }] },
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingLevel: "minimal" },
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["worth_it", "think_twice", "not_worth_it"] },
                headline: { type: "string" },
                explanation: { type: "string" },
              },
              required: ["status", "headline", "explanation"],
            },
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? "Não foi possível consultar o Nenero.");
      if (result?.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("A opinião ficou incompleta. Tente novamente.");
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("A IA não devolveu uma opinião.");
      setVerdict(JSON.parse(text));
    } catch (error) {
      setCalculatorError(error instanceof Error ? error.message : "Não foi possível consultar a IA.");
    } finally {
      setConsultingAi(false);
    }
  };

  const verdictColor = verdict?.status === "not_worth_it" ? COLORS.coral : verdict?.status === "think_twice" ? "#D69A20" : "#789B22";
  return <Sheet visible={visible} title="Calculadora de vida gasta" subtitle="Converta preço em tempo de trabalho antes de passar o cartão." onClose={onClose}>
    <View style={styles.lifeSalaryCard}>
      <Text style={styles.lifeSalaryLabel}>{usingPlannedSalary ? "RENDA MENSAL PLANEJADA" : "SALÁRIO IDENTIFICADO NESTE MÊS"}</Text>
      <Text style={styles.lifeSalaryValue}>{money(monthlySalary)}</Text>
      <Text style={styles.lifeSalaryHint}>{monthlySalary > 0
        ? `${usingPlannedSalary ? "O pagamento ainda não caiu, mas pela renda informada sua hora vale" : "Sua hora vale"} aproximadamente ${money(hourlyIncome)}.`
        : "Cadastre uma entrada como Salário ou Renda para calcular."}</Text>
    </View>
    <Field label="O que você quer comprar?" value={product} onChange={setProduct} placeholder="Ex.: celular, tênis, viagem..." />
    <Field label="Preço do produto" value={priceText} onChange={(text) => { setPriceText(text); setCalculatedHours(null); setVerdict(null); }} placeholder="R$ 0,00" keyboardType="decimal-pad" money />
    <Field label="Horas trabalhadas por mês" value={monthlyHoursText} onChange={(text) => { setMonthlyHoursText(text); setCalculatedHours(null); setVerdict(null); }} placeholder="176" keyboardType="number-pad" />
    <Text style={styles.lifeHoursHint}>Usamos 176 horas como padrão: 8 horas por dia, 22 dias no mês. Você pode ajustar.</Text>
    <PrimaryButton label="Calcular vida gasta" onPress={calculate} disabled={monthlySalary <= 0 || price <= 0 || monthlyHours <= 0 || consultingAi} />
    {calculatedHours !== null && <View style={styles.lifeResultCard}>
      <Text style={styles.lifeResultEyebrow}>ESSA COMPRA CUSTA</Text>
      <Text style={styles.lifeResultValue}>{formatWorkTime(calculatedHours)}</Text>
      <Text style={styles.lifeResultCopy}>Isso equivale a {Math.round((price / monthlySalary) * 100)}% do seu salário deste mês.</Text>
    </View>}
    {consultingAi && <View style={styles.lifeAiLoading}><ActivityIndicator color={COLORS.grape} /><Text style={styles.lifeAiLoadingText}>O Nenero está julgando a compra, não você...</Text></View>}
    {calculatorError ? <Text style={styles.lifeAiError}>{calculatorError}</Text> : null}
    {verdict && <View style={[styles.lifeVerdict, { borderColor: verdictColor }]}>
      <View style={[styles.lifeVerdictBadge, { backgroundColor: `${verdictColor}20` }]}><Text style={[styles.lifeVerdictBadgeText, { color: verdictColor }]}>{verdict.status === "worth_it" ? "FAZ SENTIDO" : verdict.status === "think_twice" ? "PENSE DUAS VEZES" : "NÃO VALE AGORA"}</Text></View>
      <Text style={styles.lifeVerdictTitle}>{verdict.headline}</Text>
      <Text style={styles.lifeVerdictText}>{verdict.explanation}</Text>
    </View>}
  </Sheet>;
}

function OnboardingScreen({ onComplete }: { onComplete: (data: OnboardingData) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [walletName, setWalletName] = useState("");
  const [walletBalance, setWalletBalance] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [incomeDay, setIncomeDay] = useState("5");
  const [financialGoal, setFinancialGoal] = useState("");
  const reducedMotion = useReducedMotion();
  const stepEntrance = useRef(new Animated.Value(0)).current;
  const steps = [
    { eyebrow: "SEM CRACHÁ, PROMETEMOS", title: "Como te chamamos sem gritar “ei, você”?", copy: "Seu nome deixa os resumos mais pessoais. E evita que o Nenero invente um apelido duvidoso.", icon: "user" as const },
    { eyebrow: "A CASINHA DO DINHEIRO", title: "Onde seus reais tiram uma soneca?", copy: "Crie sua carteira principal. Vale conta corrente, dinheiro, conta digital — só não vale “debaixo do colchão”.", icon: "credit-card" as const },
    { eyebrow: "ANTES DOS BOLETOS PERCEBEREM", title: "Quanto entra por mês?", copy: "Vamos programar sua renda para ela aparecer no planejamento antes que os boletos sintam o cheiro.", icon: "trending-up" as const },
    { eyebrow: "UM PLANO CONTRA O IMPULSO", title: "Qual sonho vai mandar nas decisões?", copy: "Quando cada real tem um destino, fica mais difícil ele fugir misteriosamente no delivery.", icon: "target" as const },
  ];
  const current = steps[step]!;
  const parsedIncome = parseMoneyInput(monthlyIncome);
  const parsedBalance = parseMoneyInput(walletBalance) || 0;
  const parsedIncomeDay = Number(incomeDay);
  const valid = step === 0
    ? name.trim().length >= 2
    : step === 1
      ? walletName.trim().length >= 2
      : step === 2
        ? Number.isFinite(parsedIncome) && parsedIncome > 0 && Number.isInteger(parsedIncomeDay) && parsedIncomeDay >= 1 && parsedIncomeDay <= 31
        : financialGoal.trim().length >= 10;
  const next = () => {
    if (!valid) return;
    if (step < steps.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    onComplete({
      name: name.trim(),
      walletName: walletName.trim(),
      walletBalance: parsedBalance,
      monthlyIncome: parsedIncome,
      incomeDay: parsedIncomeDay,
      financialGoal: financialGoal.trim(),
    });
  };

  useEffect(() => {
    stepEntrance.stopAnimation();
    if (reducedMotion) {
      stepEntrance.setValue(1);
      return;
    }
    stepEntrance.setValue(0);
    Animated.timing(stepEntrance, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    return () => stepEntrance.stopAnimation();
  }, [reducedMotion, step, stepEntrance]);

  return <SafeAreaView style={styles.onboardingSafe}>
    <StatusBar style={COLORS.paper === DARK_COLORS.paper ? "light" : "dark"} />
    <KeyboardAvoidingView style={styles.onboardingKeyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.onboardingTop}>
        <View style={styles.onboardingBrand}><View style={styles.brandMark}><Text style={styles.brandFace}>◡</Text></View><Text style={styles.brand}>nenero</Text></View>
        <Text style={styles.onboardingCount}>{step + 1}/{steps.length} · sem prova no final</Text>
      </View>
      <View style={styles.onboardingTrack}>
        {steps.map((_, index) => <View key={index} style={[styles.onboardingTrackPart, index <= step && styles.onboardingTrackPartActive]} />)}
      </View>
      <ScrollView
        contentContainerStyle={styles.onboardingContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.onboardingAnimatedContent,
            {
              opacity: stepEntrance,
              transform: [
                {
                  translateX: stepEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
                {
                  scale: stepEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.99, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.onboardingIcon}><Feather name={current.icon} size={29} color={COLORS.grape} /></View>
          <Text style={styles.onboardingEyebrow}>{current.eyebrow}</Text>
          <Text style={styles.onboardingTitle}>{current.title}</Text>
          <Text style={styles.onboardingCopy}>{current.copy}</Text>

          <View style={styles.onboardingForm}>
          {step === 0 && <Field label="Seu nome" value={name} onChange={setName} placeholder="Ex.: Willian" />}
          {step === 1 && <>
            <Field label="Nome da carteira" value={walletName} onChange={setWalletName} placeholder="Ex.: Conta principal" />
            <Field label="Saldo atual (opcional)" value={walletBalance} onChange={setWalletBalance} placeholder="R$ 0,00" keyboardType="decimal-pad" money />
          </>}
          {step === 2 && <>
            <Field label="Renda líquida mensal" value={monthlyIncome} onChange={setMonthlyIncome} placeholder="R$ 3.500,00" keyboardType="decimal-pad" money />
            <Field label="Dia em que costuma receber" value={incomeDay} onChange={setIncomeDay} placeholder="Ex.: 5" keyboardType="number-pad" />
            {parsedIncome > 0 && parsedIncomeDay >= 1 && parsedIncomeDay <= 31 && <View style={styles.onboardingPreview}><Feather name="repeat" size={16} color="#66851D" /><Text style={styles.onboardingPreviewText}>Pode avisar os boletos: {money(parsedIncome)} serão programados todo dia {parsedIncomeDay} na carteira {walletName || "principal"}.</Text></View>}
          </>}
          {step === 3 && <>
            <Text style={styles.fieldLabel}>Meu objetivo financeiro</Text>
            <TextInput
              style={styles.onboardingGoalInput}
              value={financialGoal}
              onChangeText={setFinancialGoal}
              placeholder="Ex.: Quero montar uma reserva de emergência e parar de fingir que delivery é item básico."
              placeholderTextColor="#A9A3B2"
              multiline
              maxLength={600}
              textAlignVertical="top"
            />
            <View style={styles.onboardingReady}>
              <View style={styles.onboardingReadyFace}><Text style={styles.onboardingReadyFaceText}>◡</Text></View>
              <Text style={styles.onboardingReadyText}>Carteira, renda e objetivo vão entrar prontos. A parte de ficar milionário continua com você.</Text>
            </View>
          </>}
          </View>
        </Animated.View>
      </ScrollView>
      <View style={styles.onboardingFooter}>
        {step > 0
          ? <Pressable style={styles.onboardingBack} onPress={() => setStep((value) => value - 1)}><Feather name="arrow-left" size={18} color={COLORS.grape} /><Text style={styles.onboardingBackText}>Voltar</Text></Pressable>
          : <View style={styles.onboardingBackPlaceholder} />}
        <Pressable style={[styles.onboardingNext, !valid && styles.buttonDisabled]} onPress={next} disabled={!valid}>
          <Text style={styles.onboardingNextText}>{step === steps.length - 1 ? "Bora organizar isso" : "Continuar"}</Text>
          <Feather name={step === steps.length - 1 ? "check" : "arrow-right"} size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function BankImportModal({ visible, wallets, existingEntries, onClose, onImport }: {
  visible: boolean;
  wallets: Wallet[];
  existingEntries: Entry[];
  onClose: () => void;
  onImport: (entries: Omit<Entry, "id">[]) => void;
}) {
  const [drafts, setDrafts] = useState<BankImportDraft[]>([]);
  const [fileInfo, setFileInfo] = useState<{
    fileName: string;
    bankName: string;
    accountLabel?: string;
    ignoredRows: number;
  } | null>(null);
  const [walletId, setWalletId] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setDrafts([]);
    setFileInfo(null);
    setWalletId(wallets[0]?.id ?? "");
    setExpandedId(null);
    setReading(false);
    setError("");
  }, [visible]);

  const selectFile = async () => {
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "application/vnd.ms-excel", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (asset.size && asset.size > 8 * 1024 * 1024) {
        throw new Error("Esse CSV passou de 8 MB. Exporte um período menor e tente novamente.");
      }
      setReading(true);
      const content = asset.file ? await asset.file.text() : await new ExpoFile(asset.uri).text();
      const statement = parseBankCsv(content, asset.name);
      const importedIds = new Set(existingEntries.map((entry) => entry.importId).filter(Boolean));
      setDrafts(statement.transactions.map((transaction) => {
        const duplicate = importedIds.has(transaction.importId);
        return {
          ...transaction,
          duplicate,
          selected: !duplicate && !transaction.transferLike,
        };
      }));
      setFileInfo({
        fileName: asset.name,
        bankName: statement.bankName,
        accountLabel: statement.accountLabel,
        ignoredRows: statement.ignoredRows,
      });
      setExpandedId(null);
      setWalletId((current) => current || wallets[0]?.id || "");
    } catch (fileError) {
      setDrafts([]);
      setFileInfo(null);
      setError(fileError instanceof Error ? fileError.message : "Não consegui ler esse arquivo.");
    } finally {
      setReading(false);
    }
  };

  const updateDraft = (importId: string, changes: Partial<BankImportDraft>) => {
    setDrafts((current) => current.map((draft) => draft.importId === importId ? { ...draft, ...changes } : draft));
  };
  const changeDraftKind = (draft: BankImportDraft, kind: EntryKind) => {
    const nextCategories = categoriesByKind[kind];
    updateDraft(draft.importId, {
      kind,
      category: nextCategories.includes(draft.category) ? draft.category : nextCategories[0]!,
    });
  };
  const selectedDrafts = drafts.filter((draft) => draft.selected && !draft.duplicate);
  const selectedIncome = selectedDrafts
    .filter((draft) => draft.kind === "income")
    .reduce((sum, draft) => sum + draft.value, 0);
  const selectedExpenses = selectedDrafts
    .filter((draft) => draft.kind === "expense")
    .reduce((sum, draft) => sum + draft.value, 0);
  const reviewCount = drafts.filter((draft) => draft.transferLike && !draft.duplicate).length;
  const duplicateCount = drafts.filter((draft) => draft.duplicate).length;
  const invalidSelected = selectedDrafts.some((draft) => !draft.title.trim());
  const importSelected = () => {
    if (!walletId || !selectedDrafts.length || invalidSelected || !fileInfo) return;
    onImport(selectedDrafts.map((draft) => ({
      title: draft.title.trim(),
      value: draft.value,
      kind: draft.kind,
      category: draft.category,
      walletId,
      createdAt: draft.createdAt,
      importId: draft.importId,
      importSource: fileInfo.bankName,
    })));
  };

  return <Sheet
    visible={visible}
    title="Importar extrato"
    subtitle="O banco entrega as linhas. Você dá a palavra final."
    onClose={onClose}
  >
    {!fileInfo ? <>
      <View style={styles.bankImportHero}>
        <View style={styles.bankImportHeroIcon}><MaterialCommunityIcons name="file-table-outline" size={30} color={COLORS.grape} /></View>
        <Text style={styles.bankImportHeroTitle}>Traga o CSV, sem trazer a bagunça</Text>
        <Text style={styles.bankImportHeroText}>O Nenero identifica entradas e gastos, sugere categorias e separa possíveis transferências para sua revisão.</Text>
        <Pressable style={[styles.bankFileButton, reading && styles.buttonDisabled]} onPress={selectFile} disabled={reading}>
          {reading ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="upload" size={18} color="#FFFFFF" />}
          <Text style={styles.bankFileButtonText}>{reading ? "Lendo o extrato..." : "Escolher arquivo CSV"}</Text>
        </Pressable>
      </View>
      <View style={styles.bankImportSafety}>
        <Feather name="check-circle" size={17} color="#66851D" />
        <Text style={styles.bankImportSafetyText}>Nada entra automaticamente. Você pode desmarcar, renomear e categorizar cada movimentação antes de importar.</Text>
      </View>
      {error ? <View style={styles.bankImportError}><Feather name="alert-circle" size={17} color="#B54337" /><Text style={styles.bankImportErrorText}>{error}</Text></View> : null}
    </> : <>
      <View style={styles.bankFileSummary}>
        <View style={styles.bankFileSummaryIcon}><MaterialCommunityIcons name="bank-outline" size={22} color={COLORS.grape} /></View>
        <View style={styles.flex}>
          <Text style={styles.bankFileBank}>{fileInfo.bankName}</Text>
          <Text style={styles.bankFileName} numberOfLines={1}>{fileInfo.fileName}</Text>
          {fileInfo.accountLabel && <Text style={styles.bankFileAccount}>Conta final {fileInfo.accountLabel.slice(-4)}</Text>}
        </View>
        <Pressable style={styles.bankFileChange} onPress={selectFile}><Text style={styles.bankFileChangeText}>Trocar</Text></Pressable>
      </View>

      <Text style={styles.fieldLabel}>Em qual carteira esse extrato entra?</Text>
      <View style={styles.walletOptions}>
        {wallets.map((wallet) => <Pressable
          key={wallet.id}
          style={[styles.walletOption, walletId === wallet.id && styles.walletOptionActive]}
          onPress={() => setWalletId(wallet.id)}
        >
          <View style={[styles.colorDot, { backgroundColor: wallet.color }]} />
          <Text style={styles.walletOptionText}>{wallet.name}</Text>
          {walletId === wallet.id && <Feather name="check" size={17} color={COLORS.grape} />}
        </Pressable>)}
        {!wallets.length && <View style={styles.bankImportError}><Feather name="alert-circle" size={17} color="#B54337" /><Text style={styles.bankImportErrorText}>Crie uma carteira antes de importar o extrato.</Text></View>}
      </View>

      <View style={styles.bankImportTotals}>
        <View style={styles.bankImportTotalBlock}><Text style={styles.bankImportTotalLabel}>SELECIONADAS</Text><Text style={styles.bankImportTotalValue}>{selectedDrafts.length}</Text></View>
        <View style={styles.bankImportTotalDivider} />
        <View style={styles.bankImportTotalBlock}><Text style={styles.bankImportTotalLabel}>ENTRADAS</Text><Text style={[styles.bankImportTotalMoney, styles.income]}>+ {money(selectedIncome)}</Text></View>
        <View style={styles.bankImportTotalBlock}><Text style={styles.bankImportTotalLabel}>GASTOS</Text><Text style={styles.bankImportTotalMoney}>− {money(selectedExpenses)}</Text></View>
      </View>

      {(reviewCount > 0 || duplicateCount > 0 || fileInfo.ignoredRows > 0) && <View style={styles.bankReviewNotice}>
        <MaterialCommunityIcons name="text-box-search-outline" size={19} color="#9A6810" />
        <Text style={styles.bankReviewNoticeText}>
          {[
            reviewCount ? `${reviewCount} ${reviewCount === 1 ? "possível transferência ficou" : "possíveis transferências ficaram"} desmarcada${reviewCount === 1 ? "" : "s"}` : "",
            duplicateCount ? `${duplicateCount} ${duplicateCount === 1 ? "linha já importada" : "linhas já importadas"}` : "",
            fileInfo.ignoredRows ? `${fileInfo.ignoredRows} ${fileInfo.ignoredRows === 1 ? "linha inválida ignorada" : "linhas inválidas ignoradas"}` : "",
          ].filter(Boolean).join(" · ")}.
        </Text>
      </View>}

      <View style={styles.bankReviewHeader}>
        <View><Text style={styles.bankReviewEyebrow}>CONFERÊNCIA</Text><Text style={styles.bankReviewTitle}>O que entra no Nenero?</Text></View>
        <View style={styles.bankReviewActions}>
          <Pressable onPress={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: !draft.duplicate && !draft.transferLike })))}><Text style={styles.bankReviewActionText}>Recomendados</Text></Pressable>
          <Pressable onPress={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: false })))}><Text style={styles.bankReviewActionText}>Limpar</Text></Pressable>
        </View>
      </View>

      <View style={styles.bankDraftList}>
        {drafts.map((draft) => {
          const visual = getCategoryVisual(draft.category, draft.kind);
          const expanded = expandedId === draft.importId;
          return <View key={draft.importId} style={[styles.bankDraftCard, !draft.selected && styles.bankDraftCardMuted, draft.duplicate && styles.bankDraftCardDuplicate]}>
            <View style={styles.bankDraftTop}>
              <Pressable
                style={[styles.bankDraftCheck, draft.selected && styles.bankDraftCheckActive]}
                onPress={() => !draft.duplicate && updateDraft(draft.importId, { selected: !draft.selected })}
                disabled={draft.duplicate}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: draft.selected, disabled: draft.duplicate }}
                accessibilityLabel={`Importar ${draft.title}`}
              >
                {draft.selected && <Feather name="check" size={14} color="#FFFFFF" />}
              </Pressable>
              <View style={styles.flex}>
                <Text style={styles.bankDraftTitle} numberOfLines={1}>{draft.title}</Text>
                <Text style={styles.bankDraftOriginal} numberOfLines={2}>{draft.originalDescription}</Text>
              </View>
              <View style={styles.bankDraftValueBlock}>
                <Text style={[styles.bankDraftValue, draft.kind === "income" && styles.income]}>{draft.kind === "income" ? "+" : "−"} {money(draft.value)}</Text>
                <Text style={styles.bankDraftDate}>{new Date(draft.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</Text>
              </View>
            </View>
            <View style={styles.bankDraftMeta}>
              <View style={[styles.bankDraftCategory, { backgroundColor: visual.background }]}>
                <MaterialCommunityIcons name={visual.icon} size={13} color={visual.color} />
                <Text style={[styles.bankDraftCategoryText, { color: visual.color }]}>{draft.category}</Text>
              </View>
              {draft.transferLike && <View style={styles.bankDraftReviewBadge}><Text style={styles.bankDraftReviewText}>REVISAR</Text></View>}
              {draft.duplicate && <View style={styles.bankDraftDuplicateBadge}><Text style={styles.bankDraftDuplicateText}>JÁ IMPORTADA</Text></View>}
              <Pressable style={styles.bankDraftEdit} onPress={() => setExpandedId(expanded ? null : draft.importId)}>
                <Feather name={expanded ? "chevron-up" : "edit-2"} size={14} color={COLORS.grape} />
                <Text style={styles.bankDraftEditText}>{expanded ? "Fechar" : "Editar"}</Text>
              </Pressable>
            </View>
            {draft.reviewReason && <Text style={styles.bankDraftReason}>{draft.reviewReason}. Marque somente se quiser contabilizar.</Text>}
            {expanded && <View style={styles.bankDraftEditor}>
              <Text style={styles.fieldLabel}>Nome no Nenero</Text>
              <TextInput
                style={styles.input}
                value={draft.title}
                onChangeText={(title) => updateDraft(draft.importId, { title })}
                placeholder="Nome da movimentação"
                placeholderTextColor="#B4AFBB"
              />
              <Text style={styles.fieldLabel}>Tipo</Text>
              <View style={styles.segment}>
                <Pressable style={[styles.segmentItem, draft.kind === "expense" && styles.segmentActive]} onPress={() => changeDraftKind(draft, "expense")}><Text style={[styles.segmentText, draft.kind === "expense" && styles.segmentActiveText]}>Gasto</Text></Pressable>
                <Pressable style={[styles.segmentItem, draft.kind === "income" && styles.segmentActive]} onPress={() => changeDraftKind(draft, "income")}><Text style={[styles.segmentText, draft.kind === "income" && styles.segmentActiveText]}>Entrada</Text></Pressable>
              </View>
              <Text style={styles.fieldLabel}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {categoriesByKind[draft.kind].map((category) => <CategoryChip
                  key={category}
                  category={category}
                  kind={draft.kind}
                  selected={draft.category === category}
                  onPress={() => updateDraft(draft.importId, { category })}
                />)}
              </ScrollView>
            </View>}
          </View>;
        })}
      </View>

      {invalidSelected && <Text style={styles.bankImportValidation}>Toda movimentação selecionada precisa ter um nome.</Text>}
      <PrimaryButton
        label={`Importar ${selectedDrafts.length} ${selectedDrafts.length === 1 ? "movimentação" : "movimentações"}`}
        onPress={importSelected}
        disabled={!walletId || !selectedDrafts.length || invalidSelected}
      />
    </>}
  </Sheet>;
}

function ProfileModal({ visible, name, goal, onClose, onSave, onImportBank, themeMode, onThemeChange }: {
  visible: boolean;
  name: string;
  goal: string;
  onClose: () => void;
  onSave: (name: string, goal: string) => void;
  onImportBank: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftGoal, setDraftGoal] = useState(goal);
  useEffect(() => {
    if (visible) {
      setDraftName(name);
      setDraftGoal(goal);
    }
  }, [visible, name, goal]);
  return <Sheet visible={visible} title="Seu perfil" subtitle="Mantenha seu plano com a sua cara." onClose={onClose}>
    <Text style={styles.fieldLabel}>Aparência</Text>
    <View style={styles.themeSelector}>{(["system", "light", "dark"] as ThemeMode[]).map((mode) => <Pressable key={mode} style={[styles.themeOption, themeMode === mode && styles.themeOptionActive]} onPress={() => onThemeChange(mode)}><Feather name={mode === "system" ? "smartphone" : mode === "light" ? "sun" : "moon"} size={15} color={themeMode === mode ? "#FFFFFF" : COLORS.muted} /><Text style={[styles.themeOptionText, themeMode === mode && styles.themeOptionTextActive]}>{mode === "system" ? "Sistema" : mode === "light" ? "Claro" : "Escuro"}</Text></Pressable>)}</View>
    <Field label="Como quer ser chamado?" value={draftName} onChange={setDraftName} placeholder="Seu nome" />
    <Text style={styles.fieldLabel}>Meu objetivo financeiro</Text>
    <TextInput
      style={styles.goalInput}
      value={draftGoal}
      onChangeText={setDraftGoal}
      multiline
      maxLength={600}
      placeholder="Ex.: Quero guardar R$ 800 por mês para montar minha reserva de emergência e reduzir os gastos com delivery."
      placeholderTextColor="#A9A3B2"
      textAlignVertical="top"
    />
    <Text style={styles.goalHint}>Escreva como se estivesse conversando com alguém. A IA usará esse objetivo para avaliar o mês.</Text>
    <PrimaryButton label="Salvar perfil" onPress={() => onSave(draftName.trim(), draftGoal.trim())} disabled={!draftName.trim() || !draftGoal.trim()} />
    <View style={styles.profileDataSection}>
      <Text style={styles.profileDataEyebrow}>TRAZER SEUS DADOS</Text>
      <Pressable style={({ pressed }) => [styles.profileImportButton, pressed && styles.pressed]} onPress={onImportBank}>
        <View style={styles.profileImportIcon}><MaterialCommunityIcons name="file-table-outline" size={22} color={COLORS.grape} /></View>
        <View style={styles.flex}>
          <Text style={styles.profileImportTitle}>Importar extrato bancário</Text>
          <Text style={styles.profileImportText}>Escolha um CSV, revise cada linha e decida o que realmente entra.</Text>
        </View>
        <Feather name="chevron-right" size={20} color={COLORS.grape} />
      </Pressable>
    </View>
  </Sheet>;
}

function AppLoadingScreen() {
  const reducedMotion = useReducedMotion();
  const logoEntrance = useRef(new Animated.Value(0)).current;
  const copyEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    logoEntrance.stopAnimation();
    copyEntrance.stopAnimation();
    if (reducedMotion) {
      logoEntrance.setValue(1);
      copyEntrance.setValue(1);
      return;
    }
    logoEntrance.setValue(0);
    copyEntrance.setValue(0);
    Animated.sequence([
      Animated.spring(logoEntrance, {
        toValue: 1,
        tension: 92,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(copyEntrance, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    return () => {
      logoEntrance.stopAnimation();
      copyEntrance.stopAnimation();
    };
  }, [copyEntrance, logoEntrance, reducedMotion]);

  return <SafeAreaView style={styles.authSafe}>
    <StatusBar style={COLORS.paper === DARK_COLORS.paper ? "light" : "dark"} />
    <View style={styles.loadingScreen}>
      <Animated.View
        style={{
          opacity: logoEntrance,
          transform: [
            {
              translateY: logoEntrance.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
            {
              scale: logoEntrance.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
              }),
            },
          ],
        }}
      >
        <View style={styles.authBrandMark}><Text style={styles.authBrandFace}>◡</Text></View>
      </Animated.View>
      <Animated.View
        style={[
          styles.loadingCopy,
          {
            opacity: copyEntrance,
            transform: [
              {
                translateY: copyEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}
      >
        <ActivityIndicator color={COLORS.grape} />
        <Text style={styles.loadingText}>Abrindo seu Nenero...</Text>
      </Animated.View>
    </View>
  </SafeAreaView>;
}

function AnalysisModal({ visible, analysis, loading, error, onRetry, onClose }: { visible: boolean; analysis: AiAnalysis | null; loading: boolean; error: string; onRetry: () => void; onClose: () => void }) {
  const statusColor = analysis?.status === "danger" ? COLORS.coral : analysis?.status === "attention" ? "#D69A20" : "#789B22";
  return <Sheet visible={visible} title="Papo reto do Nenero" subtitle="Uma leitura do seu mês com base no seu objetivo." onClose={onClose}>
    {loading ? <View style={styles.analysisLoading}><ActivityIndicator size="large" color={COLORS.grape} /><Text style={styles.analysisLoadingTitle}>Fazendo as contas sem julgar...</Text><Text style={styles.analysisLoadingText}>O Nenero está comparando entradas, gastos, contas e seu objetivo.</Text></View> : error ? <View style={styles.analysisError}><Feather name="wifi-off" size={24} color={COLORS.coral} /><Text style={styles.analysisErrorTitle}>A conversa não rolou</Text><Text style={styles.analysisErrorText}>{error}</Text><PrimaryButton label="Tentar novamente" onPress={onRetry} /></View> : analysis ? <>
      <View style={[styles.analysisStatus, { backgroundColor: `${statusColor}18` }]}><View style={[styles.analysisStatusDot, { backgroundColor: statusColor }]} /><View style={styles.flex}><Text style={[styles.analysisStatusLabel, { color: statusColor }]}>{analysis.status === "ok" ? "TUDO SOB CONTROLE" : analysis.status === "attention" ? "ATENÇÃO" : "PERIGO"}</Text><Text style={styles.analysisHeadline}>{analysis.headline}</Text></View></View>
      <Text style={styles.analysisSummary}>{analysis.summary}</Text>
      <Text style={styles.analysisSectionTitle}>O que chamou atenção</Text>
      {analysis.highlights.map((item, index) => <View key={`h-${index}`} style={styles.analysisItem}><View style={styles.analysisBullet}><Text style={styles.analysisBulletText}>{index + 1}</Text></View><Text style={styles.analysisItemText}>{item}</Text></View>)}
      <Text style={styles.analysisSectionTitle}>Próximos passos</Text>
      {analysis.actions.map((item, index) => <View key={`a-${index}`} style={styles.analysisItem}><Feather name="arrow-right" size={16} color={COLORS.grape} /><Text style={styles.analysisItemText}>{item}</Text></View>)}
      {!!analysis.appSuggestions?.length && <>
        <Text style={styles.analysisSectionTitle}>Dá pra fazer no Nenero</Text>
        {analysis.appSuggestions.map((item, index) => <View key={`s-${index}`} style={styles.appSuggestion}><View style={styles.suggestionIcon}><Feather name="tool" size={14} color={COLORS.grape} /></View><Text style={styles.analysisItemText}>{item}</Text></View>)}
      </>}
      <Pressable style={styles.refreshAnalysis} onPress={onRetry}><Feather name="refresh-cw" size={15} color={COLORS.grape} /><Text style={styles.refreshAnalysisText}>Analisar novamente</Text></Pressable>
    </> : null}
  </Sheet>;
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable style={[styles.primaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}><Text style={styles.primaryButtonText}>{label}</Text><Feather name="arrow-right" size={18} color="white" /></Pressable>;
}

const DARK_LITERAL_COLORS: Record<string, string> = {
  "#F0EBFF": "#29223B", "#F5F1FF": "#272136", "#F3EFFF": "#28213A", "#EEE8FF": "#29223B",
  "#F8F5FF": "#211C2E", "#F7F4FF": "#211C2E", "#F6F2FF": "#241E33", "#F3EEFF": "#28213A",
  "#F2ECFF": "#29223B", "#EDE6FF": "#2B2340", "#EDE9F2": "#2B2738", "#E9E3FA": "#322846",
  "#D9CDF8": "#493A68", "#DED3FF": "#493A68", "#DED2FA": "#493A68", "#D8CCF6": "#493A68",
  "#DFD5FA": "#493A68", "#BFAFF0": "#67528F", "#B9A8EC": "#67528F", "#B9A6EE": "#67528F",
  "#EAF8D0": "#233019", "#F0F9D9": "#26351A", "#58721B": "#C9F45A", "#66851D": "#B9E45A",
  "#65861E": "#B9E45A", "#789B22": "#C9F45A", "#4E6715": "#B9E45A", "#71804A": "#B5C98B",
  "#FFF0ED": "#321E21", "#FFF7F5": "#2A1B20", "#FFE0DC": "#442326", "#FFB5AB": "#693238",
  "#F0BEB8": "#71383A", "#B54337": "#FF9B8F", "#C95043": "#FF9B8F",
  "#FFF0CA": "#332916", "#D69A20": "#F3C765", "#9A6810": "#E6B957", "#815A10": "#E6B957", "#8A641B": "#E6B957",
  "#E4F7F3": "#17342F", "#F2FBF8": "#142B27", "#CBE9E1": "#315B53", "#167B6B": "#62D7C3",
  "#125F54": "#83E3D2", "#467970": "#9BCFC6", "#36758C": "#79C9E8", "#277493": "#83CBE4", "#4D7481": "#9CC7D4",
  "#E6E2EA": "#393442", "#E6DFEE": "#393244", "#E3DCF0": "#3D354B", "#DED8E8": "#3A3445",
  "#DED7EA": "#3A3445", "#DCD4E7": "#3A3448", "#D3CEDA": "#4A4455", "#CFC4E6": "#4B405D",
  "#C9C3D0": "#5B5465", "#AFA8BD": "#BDB6C8", "#AAA4B3": "#AAA3B8", "#575162": "#C7C1D2",
  "#494256": "#C7C1D2", "#45402E": "#D3CDA9", "#3D3A2C": "#D3CDA9", "#D7D1E0": "#D7D1E0",
};
const applyLiteralTheme = <T,>(value: T): T => {
  if (typeof value === "string") return (DARK_LITERAL_COLORS[value.toUpperCase()] ?? value) as T;
  if (Array.isArray(value)) return value.map(applyLiteralTheme) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, applyLiteralTheme(item)])) as T;
  return value;
};
const createStyleDefinition = () => ({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  onboardingSafe: { flex: 1, backgroundColor: "#F6F2FF" },
  onboardingKeyboard: { flex: 1 },
  onboardingTop: { height: 64, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  onboardingBrand: { flexDirection: "row", alignItems: "center", gap: 9 },
  onboardingCount: { color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  onboardingTrack: { flexDirection: "row", gap: 7, paddingHorizontal: 22 },
  onboardingTrackPart: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "#DED7EA" },
  onboardingTrackPartActive: { backgroundColor: COLORS.grape },
  onboardingContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 42, paddingBottom: 24, maxWidth: 540, width: "100%", alignSelf: "center" },
  onboardingAnimatedContent: { width: "100%" },
  onboardingIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: COLORS.white, borderWidth: 1, borderColor: "#DFD5FA", alignItems: "center", justifyContent: "center", shadowColor: COLORS.grapeDark, shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4, transform: [{ rotate: "-4deg" }] },
  onboardingEyebrow: { color: COLORS.grape, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginTop: 28 },
  onboardingTitle: { color: COLORS.ink, fontSize: 34, lineHeight: 39, fontWeight: "900", letterSpacing: -1.4, marginTop: 7, maxWidth: 400 },
  onboardingCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 11, maxWidth: 430 },
  onboardingForm: { marginTop: 32 },
  onboardingGoalInput: { minHeight: 150, backgroundColor: COLORS.white, borderWidth: 1, borderColor: "#DCD4E7", borderRadius: 20, padding: 16, color: COLORS.ink, fontSize: 14, lineHeight: 21 },
  onboardingPreview: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#EAF8D0", borderRadius: 15, padding: 13, marginTop: 2 },
  onboardingPreviewText: { flex: 1, color: "#58721B", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  onboardingReady: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.lime, borderRadius: 18, padding: 14, marginTop: 16 },
  onboardingReadyFace: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.ink, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  onboardingReadyFaceText: { color: COLORS.lime, fontSize: 24, fontWeight: "900", marginTop: -6 },
  onboardingReadyText: { flex: 1, color: "#3D3A2C", fontSize: 10, lineHeight: 15, fontWeight: "800" },
  onboardingFooter: { minHeight: 82, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: "#E6DFEE", backgroundColor: "rgba(246,242,255,0.97)", flexDirection: "row", alignItems: "center", gap: 12 },
  onboardingBack: { height: 52, minWidth: 90, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  onboardingBackText: { color: COLORS.grape, fontSize: 12, fontWeight: "900" },
  onboardingBackPlaceholder: { width: 90 },
  onboardingNext: { flex: 1, height: 54, borderRadius: 17, backgroundColor: COLORS.grape, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, shadowColor: COLORS.grapeDark, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 5 },
  onboardingNextText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  authSafe: { flex: 1, backgroundColor: "#F3EEFF" },
  authBrandMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: COLORS.grape, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  authBrandFace: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", marginTop: -7 },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  loadingCopy: { alignItems: "center", gap: 10 },
  loadingText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  app: { flex: 1, backgroundColor: COLORS.paper, maxWidth: 620, width: "100%", alignSelf: "center" },
  topbar: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.grape, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  brandFace: { color: "white", fontSize: 22, fontWeight: "900", marginTop: -5 },
  brand: { color: COLORS.ink, fontSize: 22, fontWeight: "900", letterSpacing: -1.2 },
  avatar: { width: 35, height: 35, borderRadius: 14, backgroundColor: COLORS.lime, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.ink, fontWeight: "900", fontSize: 12 },
  content: { padding: 20, paddingTop: 12, paddingBottom: 120 },
  helloRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  eyebrow: { color: COLORS.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 5 },
  h1: { color: COLORS.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -1.2 },
  moodPill: { maxWidth: 145, minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: COLORS.sky, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 20, marginBottom: 3 },
  moodText: { flexShrink: 1, fontSize: 10, lineHeight: 13, fontWeight: "800", color: "#277493", textAlign: "center" },
  moodActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiRefreshButton: { width: 34, height: 34, borderRadius: 13, backgroundColor: "#EEE8FF", borderWidth: 1, borderColor: "#D9CDF8", alignItems: "center", justifyContent: "center", marginBottom: 3 },
  moodAttention: { backgroundColor: "#FFF0CA" },
  moodAttentionText: { color: "#9A6810" },
  moodDanger: { backgroundColor: "#FFE0DC" },
  moodDangerText: { color: "#B54337" },
  balanceCard: { minHeight: 245, borderRadius: 28, padding: 24, overflow: "hidden", shadowColor: COLORS.grapeDark, shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 9 },
  balanceGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(201,244,90,0.15)", top: -85, right: -45 },
  balanceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  balanceLabel: { color: "rgba(255,255,255,0.78)", fontSize: 13, fontWeight: "700" },
  balanceAiBadge: { minHeight: 25, borderRadius: 13, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  balanceAiBadgeText: { color: "#242033", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  balanceValue: { color: "white", fontSize: 39, fontWeight: "900", letterSpacing: -1.8, marginTop: 7 },
  balanceCopy: { color: "rgba(255,255,255,0.86)", fontSize: 13, marginTop: 7, marginBottom: 23 },
  balanceAnalysis: { marginTop: 7, marginBottom: 18 },
  balanceAnalysisHeadline: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  balanceAnalysisSummary: { color: "rgba(255,255,255,0.78)", fontSize: 11, lineHeight: 16, marginTop: 4 },
  balanceDreamsPill: { alignSelf: "flex-start", minHeight: 32, maxWidth: "100%", borderRadius: 16, paddingHorizontal: 11, marginTop: -8, marginBottom: 16, backgroundColor: "rgba(28,22,43,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", flexDirection: "row", alignItems: "center", gap: 7 },
  balanceDreamsPillText: { flexShrink: 1, color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  whiteButton: { alignSelf: "flex-start", backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 },
  whiteButtonText: { color: "#532CB8", fontWeight: "800", fontSize: 13 },
  metricsRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  metricCard: { flex: 1, padding: 16, borderRadius: 20 },
  metricIncomeCard: { backgroundColor: COLORS.paper === DARK_COLORS.paper ? "#17251A" : "#EAF8D0", borderWidth: 1, borderColor: COLORS.paper === DARK_COLORS.paper ? "#35502E" : "#D6E9AD" },
  metricExpenseCard: { backgroundColor: COLORS.paper === DARK_COLORS.paper ? "#2B1A1E" : "#FFF0ED", borderWidth: 1, borderColor: COLORS.paper === DARK_COLORS.paper ? "#563038" : "#F5D2CD" },
  metricIncomeLabel: { color: COLORS.paper === DARK_COLORS.paper ? "#AFC49B" : "#58721B" },
  metricExpenseLabel: { color: COLORS.paper === DARK_COLORS.paper ? "#D6AAA5" : "#B65A4F" },
  metricIncomeValue: { color: COLORS.paper === DARK_COLORS.paper ? "#F4F0FA" : "#242033" },
  metricExpenseValue: { color: COLORS.paper === DARK_COLORS.paper ? "#F4F0FA" : "#242033" },
  iconBubble: { width: 30, height: 30, borderRadius: 11, justifyContent: "center", alignItems: "center", marginBottom: 13 },
  metricLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  metricValue: { color: COLORS.ink, fontSize: 17, fontWeight: "900", marginTop: 4, letterSpacing: -0.5 },
  commitmentCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F0F9D9", borderRadius: 18, padding: 14, marginTop: 12 },
  commitmentHint: { color: "#71804A", fontSize: 9, marginTop: 3 },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 12 },
  sectionTitleText: { color: COLORS.ink, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  sectionAction: { color: COLORS.grape, fontSize: 12, fontWeight: "800" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  lifeFeatureCard: { minHeight: 76, backgroundColor: "#EEE8FF", borderRadius: 19, padding: 14, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#D9CDF8" },
  lifeFeatureIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  lifeFeatureEyebrow: { color: COLORS.grape, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  lifeFeatureTitle: { color: COLORS.ink, fontSize: 13, lineHeight: 17, fontWeight: "900", marginTop: 3 },
  listCard: { backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 15, borderWidth: 1, borderColor: COLORS.line },
  entryRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12 },
  entryBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  entryIcon: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  flex: { flex: 1 },
  entryContent: { flex: 1, minWidth: 0 },
  rowTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  rowMeta: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  entryDateText: { color: COLORS.muted, fontSize: 9, fontWeight: "700", textTransform: "lowercase", marginTop: 5 },
  entryWallet: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  entryWalletDot: { width: 6, height: 6, borderRadius: 3 },
  entryWalletText: { color: COLORS.muted, fontSize: 9, fontWeight: "700", flexShrink: 1 },
  rowValue: { color: COLORS.ink, fontSize: 12, fontWeight: "900", flexShrink: 0, textAlign: "right" },
  editEntryButton: { width: 32, height: 32, borderRadius: 11, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center" },
  income: { color: "#65861E" },
  tipCard: { flexDirection: "row", gap: 13, backgroundColor: COLORS.lime, borderRadius: 20, padding: 16, marginTop: 18, alignItems: "center" },
  tipMascot: { width: 48, height: 48, borderRadius: 17, backgroundColor: COLORS.ink, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  tipFace: { color: COLORS.lime, fontSize: 14, fontWeight: "900" },
  tipCopy: { flex: 1 },
  tipTitle: { color: COLORS.ink, fontWeight: "900", fontSize: 13 },
  tipText: { color: "#45402E", fontSize: 11, lineHeight: 16, marginTop: 3 },
  nav: { position: "absolute", left: 12, right: 12, bottom: 10, height: 72, backgroundColor: COLORS.white, flexDirection: "row", borderRadius: 24, borderWidth: 1, borderColor: COLORS.line, shadowColor: COLORS.ink, shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  navLabel: { color: "#AAA4B3", fontSize: 9, fontWeight: "700" },
  navActive: { color: COLORS.grape, fontWeight: "900" },
  navDot: { position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.grape },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22 },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.grape, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13 },
  smallButtonText: { color: "white", fontSize: 11, fontWeight: "800" },
  summaryStrip: { height: 50, backgroundColor: "#F0EBFF", borderRadius: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  summaryText: { color: COLORS.grapeDark, fontSize: 12, fontWeight: "800" },
  filterToggle: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D8CCF6", backgroundColor: COLORS.white },
  filterToggleActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  filterActiveDot: { position: "absolute", top: 5, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.lime, borderWidth: 1, borderColor: COLORS.white },
  filtersPanel: { backgroundColor: "#F8F5FF", borderWidth: 1, borderColor: "#E3DCF0", borderRadius: 18, padding: 14, marginBottom: 16 },
  filtersPanelHeader: { minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  filtersPanelTitle: { color: COLORS.ink, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  clearFilter: { flexDirection: "row", alignItems: "center", gap: 3 },
  clearFilterText: { color: COLORS.grape, fontSize: 11, fontWeight: "900" },
  filterLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 7 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  filterScroll: { gap: 8, paddingBottom: 18 },
  filterChip: { minHeight: 37, paddingHorizontal: 13, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", gap: 7 },
  filterChipActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  filterChipText: { color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  filterChipTextActive: { color: "#FFFFFF" },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  emptyState: { backgroundColor: COLORS.white, borderRadius: 20, padding: 28, alignItems: "center", borderWidth: 1, borderColor: COLORS.line },
  emptyIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  emptyText: { color: COLORS.muted, fontSize: 11, marginTop: 5 },
  recurringHero: { backgroundColor: COLORS.sky, borderRadius: 23, padding: 20, marginBottom: 16 },
  recurringHeroLabel: { color: "#36758C", fontSize: 11, fontWeight: "800" },
  recurringHeroValue: { color: COLORS.ink, fontSize: 29, fontWeight: "900", letterSpacing: -1, marginVertical: 5 },
  recurringHeroCopy: { color: "#4D7481", fontSize: 11 },
  monthPicker: { height: 66, backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 9, marginBottom: 4 },
  monthArrow: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center" },
  monthCenter: { alignItems: "center" },
  monthCaption: { color: COLORS.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  monthLabel: { color: COLORS.ink, fontSize: 15, fontWeight: "900", textTransform: "capitalize", marginTop: 3 },
  recurringRow: { backgroundColor: COLORS.white, borderRadius: 18, marginBottom: 10, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: COLORS.line },
  editRecurringButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center" },
  toggleRecurringButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  emptySectionText: { color: COLORS.muted, fontSize: 11, backgroundColor: COLORS.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.line },
  billCard: { backgroundColor: COLORS.white, borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: COLORS.line, overflow: "hidden" },
  billMain: { padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  billFooter: { borderTopWidth: 1, borderTopColor: COLORS.line, minHeight: 52, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  billActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  billValue: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  paidBadge: { backgroundColor: "#EAF8D0", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  pendingBadge: { backgroundColor: "#FFF0ED", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  paidBadgeText: { color: "#66851D", fontSize: 9, fontWeight: "900" },
  pendingBadgeText: { color: "#C95043", fontSize: 9, fontWeight: "900" },
  payButton: { backgroundColor: COLORS.grape, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  payButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  pauseButton: { backgroundColor: "#F0EBFF", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  pauseButtonText: { color: COLORS.grape, fontSize: 10, fontWeight: "900" },
  disabledRow: { opacity: 0.48 },
  dateBadge: { width: 45, height: 48, borderRadius: 13, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center" },
  incomeDateBadge: { backgroundColor: "#EAF8D0" },
  dateSmall: { color: COLORS.grape, fontSize: 8, fontWeight: "900" },
  dateBig: { color: COLORS.grapeDark, fontSize: 18, fontWeight: "900" },
  walletColorPalette: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  walletColorOption: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "transparent" },
  walletColorOptionActive: { borderColor: COLORS.ink, shadowColor: COLORS.ink, shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  walletCard: { minHeight: 162, borderRadius: 25, padding: 20, marginBottom: 14, shadowColor: COLORS.ink, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  walletTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  walletEditIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  walletName: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700", marginTop: 29 },
  walletBalance: { color: "white", fontSize: 26, fontWeight: "900", marginTop: 4, letterSpacing: -0.8 },
  deleteWalletButton: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: "#F0BEB8", backgroundColor: "#FFF7F5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  deleteWalletButtonText: { color: "#B54337", fontSize: 11, fontWeight: "900" },
  deleteEntryButton: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: "#F0BEB8", backgroundColor: "#FFF7F5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  deleteEntryButtonText: { color: "#B54337", fontSize: 11, fontWeight: "900" },
  dashedButton: { height: 58, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#B9A8EC", borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  dashedText: { color: COLORS.grape, fontSize: 12, fontWeight: "800" },
  dreamsSectionHeader: { marginTop: 30, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  dreamsSectionEyebrow: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.3 },
  dreamsSectionLine: { flex: 1, height: 1, backgroundColor: "#DED8E8" },
  dreamWalletPressable: { borderRadius: 27, shadowColor: "#33245E", shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  dreamWalletCard: { borderRadius: 27, padding: 20, overflow: "hidden" },
  dreamWalletGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(201,244,90,0.12)", right: -75, top: -85 },
  dreamWalletTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dreamWalletIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: COLORS.lime, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  dreamWalletAutoBadge: { minHeight: 25, borderRadius: 13, paddingHorizontal: 9, backgroundColor: "rgba(255,255,255,0.13)", borderWidth: 1, borderColor: "rgba(255,255,255,0.17)", alignItems: "center", justifyContent: "center" },
  dreamWalletAutoText: { color: "#E8DFFF", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  dreamWalletLabel: { color: "#DCD1F7", fontSize: 12, fontWeight: "800", marginTop: 20 },
  dreamWalletBalance: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", letterSpacing: -1, marginTop: 3 },
  dreamWalletCopy: { color: "#DCD3EF", fontSize: 10, lineHeight: 15, marginTop: 6, maxWidth: 390 },
  dreamWalletPotList: { marginTop: 17, gap: 7 },
  dreamWalletPot: { minHeight: 30, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.09)", flexDirection: "row", alignItems: "center", gap: 7 },
  dreamWalletPotDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.lime },
  dreamWalletPotName: { flex: 1, color: "#F2ECFF", fontSize: 9, fontWeight: "800" },
  dreamWalletPotValue: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  dreamWalletMore: { color: "#CFC4E6", fontSize: 8, fontWeight: "800", marginLeft: 10 },
  dreamWalletOpen: { minHeight: 36, marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.13)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dreamWalletOpenText: { color: COLORS.lime, fontSize: 10, fontWeight: "900" },
  potCard: { backgroundColor: COLORS.white, borderRadius: 23, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: COLORS.line },
  potTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  potIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center" },
  potName: { color: COLORS.ink, fontSize: 16, fontWeight: "900" },
  potDescription: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  potPercent: { color: COLORS.grape, fontSize: 16, fontWeight: "900" },
  potProgressTrack: { height: 10, backgroundColor: "#EDE9F2", borderRadius: 5, overflow: "hidden", marginTop: 18 },
  potProgressFill: { height: "100%", backgroundColor: COLORS.lime, borderRadius: 5 },
  potValues: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  potValueLabel: { color: COLORS.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  potSaved: { color: COLORS.ink, fontSize: 20, fontWeight: "900", marginTop: 3 },
  potGoalBlock: { alignItems: "flex-end" },
  potGoal: { color: COLORS.muted, fontSize: 15, fontWeight: "800", marginTop: 5 },
  potPlan: { color: COLORS.muted, fontSize: 10, marginTop: 8 },
  potYieldBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#E4F7F3", borderRadius: 11, paddingHorizontal: 9, paddingVertical: 7, marginTop: 9 },
  potYieldText: { color: "#167B6B", fontSize: 9, fontWeight: "800" },
  potSourceLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  potSourceText: { flex: 1, color: COLORS.muted, fontSize: 9, fontWeight: "700" },
  potDepositButton: { height: 45, backgroundColor: COLORS.grape, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  potDepositButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  potComplete: { minHeight: 45, backgroundColor: "#EAF8D0", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  potCompleteText: { color: "#66851D", fontSize: 11, fontWeight: "900" },
  emptyPotButton: { backgroundColor: COLORS.grape, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 11, marginTop: 16 },
  emptyPotButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,22,43,0.45)" },
  sheet: { maxHeight: "91%", backgroundColor: COLORS.paper, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingBottom: 28 },
  sheetContent: { paddingBottom: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D3CEDA", alignSelf: "center", marginTop: 10, marginBottom: 18 },
  sheetHeader: { flexDirection: "row", gap: 14, alignItems: "flex-start", marginBottom: 20 },
  sheetTitle: { color: COLORS.ink, fontSize: 24, fontWeight: "900", letterSpacing: -0.8 },
  sheetSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  close: { width: 35, height: 35, borderRadius: 12, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.line },
  field: { marginBottom: 16 },
  fieldLabel: { color: COLORS.ink, fontSize: 11, fontWeight: "800", marginBottom: 7 },
  input: { height: 52, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, paddingHorizontal: 15, color: COLORS.ink, fontSize: 14, fontWeight: "600" },
  potDescriptionInput: { minHeight: 88, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, padding: 14, color: COLORS.ink, fontSize: 13, lineHeight: 18, marginBottom: 16 },
  potPreview: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#F0EBFF", borderRadius: 14, padding: 13, marginBottom: 16 },
  potPreviewText: { color: COLORS.grapeDark, fontSize: 11, fontWeight: "800" },
  interestToggleCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 17, padding: 14, marginBottom: 16 },
  interestToggleCopy: { flex: 1 },
  interestToggleTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  interestToggleHint: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  interestFields: { backgroundColor: "#F2FBF8", borderWidth: 1, borderColor: "#CBE9E1", borderRadius: 18, padding: 14, marginBottom: 16 },
  realRateCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#E4F7F3", borderRadius: 14, padding: 12 },
  realRateLabel: { color: "#167B6B", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  realRateValue: { color: "#125F54", fontSize: 17, fontWeight: "900", marginTop: 3 },
  realRateHint: { color: "#467970", fontSize: 8, lineHeight: 12, marginTop: 2 },
  potTransferNote: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#F0EBFF", borderRadius: 16, padding: 13, marginBottom: 18 },
  potTransferNoteIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  potTransferNoteText: { flex: 1, color: COLORS.grapeDark, fontSize: 9, lineHeight: 14, fontWeight: "700" },
  potWalletOptions: { gap: 8, marginBottom: 20 },
  potWalletOption: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  potWalletOptionActive: { borderColor: COLORS.grape, backgroundColor: "#F7F4FF" },
  potWalletOptionUnavailable: { opacity: 0.45 },
  potWalletColor: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  potWalletName: { color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  potWalletBalance: { color: COLORS.muted, fontSize: 9, marginTop: 3 },
  potWalletCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.grape, alignItems: "center", justifyContent: "center" },
  potNoWallet: { minHeight: 50, borderRadius: 14, padding: 12, backgroundColor: "#FFF0ED", flexDirection: "row", alignItems: "center", gap: 9 },
  potNoWalletText: { flex: 1, color: "#B54337", fontSize: 10, lineHeight: 14, fontWeight: "700" },
  quickDepositRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  quickDeposit: { flex: 1, height: 48, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" },
  quickDepositActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  quickDepositText: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  quickDepositTextActive: { color: "#FFFFFF" },
  potOverGoal: { color: "#66851D", backgroundColor: "#EAF8D0", fontSize: 10, lineHeight: 15, fontWeight: "700", borderRadius: 12, padding: 11, marginBottom: 14 },
  potInsufficient: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 13, padding: 12, backgroundColor: "#FFF0ED", marginBottom: 14 },
  potInsufficientText: { flex: 1, color: "#B54337", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  potTransferPreview: { borderRadius: 14, padding: 13, backgroundColor: "#EAF8D0", marginBottom: 14 },
  potTransferPreviewLabel: { color: "#66851D", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  potTransferPreviewText: { color: "#4E6715", fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 4 },
  lifeSalaryCard: { backgroundColor: COLORS.sky, borderRadius: 19, padding: 17, marginBottom: 18 },
  lifeSalaryLabel: { color: "#36758C", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  lifeSalaryValue: { color: COLORS.ink, fontSize: 25, fontWeight: "900", marginTop: 5 },
  lifeSalaryHint: { color: "#4D7481", fontSize: 10, lineHeight: 14, marginTop: 4 },
  lifeHoursHint: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: -8, marginBottom: 15 },
  lifeResultCard: { backgroundColor: COLORS.ink, borderRadius: 20, padding: 18, marginTop: 16 },
  lifeResultEyebrow: { color: COLORS.lime, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  lifeResultValue: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", marginTop: 5 },
  lifeResultCopy: { color: "#D7D1E0", fontSize: 10, lineHeight: 15, marginTop: 5 },
  lifeAiLoading: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F0EBFF", borderRadius: 15, padding: 14, marginTop: 12 },
  lifeAiLoadingText: { flex: 1, color: COLORS.grapeDark, fontSize: 10, fontWeight: "700" },
  lifeAiError: { color: "#C95043", backgroundColor: "#FFF0ED", borderRadius: 13, padding: 12, fontSize: 10, lineHeight: 15, marginTop: 12 },
  lifeVerdict: { backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1.5, padding: 16, marginTop: 12 },
  lifeVerdictBadge: { alignSelf: "flex-start", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  lifeVerdictBadgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  lifeVerdictTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900", marginTop: 11 },
  lifeVerdictText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  referenceDateRow: { flexDirection: "row", gap: 9, marginBottom: 8 },
  dayField: { width: 66, height: 58, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  miniFieldLabel: { color: COLORS.muted, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  dayInput: { color: COLORS.ink, fontSize: 18, fontWeight: "900", textAlign: "center", width: "100%", padding: 0, marginTop: 2 },
  referenceMonthPicker: { flex: 1, height: 58, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 7 },
  referenceArrow: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center" },
  referenceMonthText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "900", textTransform: "capitalize", textAlign: "center" },
  dateError: { color: "#C95043", fontSize: 10, fontWeight: "700", marginBottom: 13 },
  segment: { backgroundColor: "#EDE9F2", borderRadius: 15, padding: 4, flexDirection: "row", marginBottom: 18 },
  segmentItem: { flex: 1, height: 41, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  segmentActive: { backgroundColor: COLORS.white },
  segmentText: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  segmentActiveText: { color: COLORS.grape },
  chips: { gap: 8, paddingBottom: 18 },
  chip: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 },
  chipText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  chipTextActive: { color: "#FFFFFF", fontWeight: "900" },
  walletOptions: { gap: 8, marginBottom: 5 },
  walletOption: { minHeight: 48, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 10 },
  walletOptionActive: { borderColor: "#B9A6EE", backgroundColor: "#F3EFFF" },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  walletOptionText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  autoPostNote: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#F0F9D9", borderRadius: 14, padding: 12, marginTop: 10 },
  autoPostText: { flex: 1, color: "#58721B", fontSize: 10, lineHeight: 14, fontWeight: "700" },
  profileDataSection: { marginTop: 26, paddingTop: 22, borderTopWidth: 1, borderTopColor: COLORS.line },
  profileDataEyebrow: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 9 },
  profileImportButton: { minHeight: 72, borderRadius: 18, borderWidth: 1, borderColor: "#D9CDF8", backgroundColor: "#F5F1FF", padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  profileImportIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  profileImportTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  profileImportText: { color: COLORS.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  bankImportHero: { borderRadius: 24, backgroundColor: "#F0EBFF", padding: 22, alignItems: "center", borderWidth: 1, borderColor: "#DED2FA" },
  bankImportHeroIcon: { width: 62, height: 62, borderRadius: 21, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  bankImportHeroTitle: { color: COLORS.ink, fontSize: 20, lineHeight: 24, fontWeight: "900", letterSpacing: -0.5, textAlign: "center", marginTop: 17 },
  bankImportHeroText: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 7, maxWidth: 330 },
  bankFileButton: { minHeight: 50, alignSelf: "stretch", borderRadius: 15, backgroundColor: COLORS.grape, marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  bankFileButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  bankImportSafety: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 15, backgroundColor: "#EAF8D0", padding: 13, marginTop: 13 },
  bankImportSafetyText: { flex: 1, color: "#58721B", fontSize: 9, lineHeight: 14, fontWeight: "700" },
  bankImportError: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 15, backgroundColor: "#FFF0ED", padding: 13, marginTop: 12 },
  bankImportErrorText: { flex: 1, color: "#B54337", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  bankFileSummary: { minHeight: 72, borderRadius: 18, borderWidth: 1, borderColor: "#D9CDF8", backgroundColor: "#F5F1FF", padding: 13, marginBottom: 19, flexDirection: "row", alignItems: "center", gap: 11 },
  bankFileSummaryIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  bankFileBank: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  bankFileName: { color: COLORS.muted, fontSize: 9, marginTop: 3, maxWidth: 230 },
  bankFileAccount: { color: COLORS.grape, fontSize: 8, fontWeight: "800", marginTop: 3 },
  bankFileChange: { minHeight: 32, borderRadius: 12, paddingHorizontal: 10, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  bankFileChangeText: { color: COLORS.grape, fontSize: 9, fontWeight: "900" },
  bankImportTotals: { minHeight: 78, borderRadius: 18, backgroundColor: COLORS.ink, paddingHorizontal: 14, marginTop: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  bankImportTotalBlock: { flex: 1 },
  bankImportTotalLabel: { color: "#AFA8BD", fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  bankImportTotalValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 3 },
  bankImportTotalDivider: { width: 1, height: 38, backgroundColor: "#494256" },
  bankImportTotalMoney: { color: "#FFB5AB", fontSize: 10, fontWeight: "900", marginTop: 5 },
  bankReviewNotice: { borderRadius: 15, backgroundColor: "#FFF0CA", padding: 13, marginTop: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  bankReviewNoticeText: { flex: 1, color: "#815A10", fontSize: 9, lineHeight: 14, fontWeight: "700" },
  bankReviewHeader: { marginTop: 25, marginBottom: 11, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  bankReviewEyebrow: { color: COLORS.grape, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  bankReviewTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "900", marginTop: 3 },
  bankReviewActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  bankReviewActionText: { color: COLORS.grape, fontSize: 9, fontWeight: "900" },
  bankDraftList: { gap: 9, marginBottom: 18 },
  bankDraftCard: { borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, padding: 13 },
  bankDraftCardMuted: { backgroundColor: "#F5F3F7" },
  bankDraftCardDuplicate: { opacity: 0.62 },
  bankDraftTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bankDraftCheck: { width: 27, height: 27, borderRadius: 9, borderWidth: 1.5, borderColor: "#C9C3D0", backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  bankDraftCheckActive: { borderColor: COLORS.grape, backgroundColor: COLORS.grape },
  bankDraftTitle: { color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  bankDraftOriginal: { color: COLORS.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  bankDraftValueBlock: { alignItems: "flex-end", maxWidth: 98 },
  bankDraftValue: { color: COLORS.ink, fontSize: 10, fontWeight: "900" },
  bankDraftDate: { color: COLORS.muted, fontSize: 8, fontWeight: "700", textTransform: "lowercase", marginTop: 4 },
  bankDraftMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 11 },
  bankDraftCategory: { minHeight: 25, borderRadius: 11, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  bankDraftCategoryText: { fontSize: 8, fontWeight: "900" },
  bankDraftReviewBadge: { minHeight: 25, borderRadius: 11, paddingHorizontal: 8, backgroundColor: "#FFF0CA", alignItems: "center", justifyContent: "center" },
  bankDraftReviewText: { color: "#9A6810", fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  bankDraftDuplicateBadge: { minHeight: 25, borderRadius: 11, paddingHorizontal: 8, backgroundColor: "#E6E2EA", alignItems: "center", justifyContent: "center" },
  bankDraftDuplicateText: { color: COLORS.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.4 },
  bankDraftEdit: { minHeight: 25, marginLeft: "auto", paddingHorizontal: 8, borderRadius: 10, backgroundColor: "#F0EBFF", flexDirection: "row", alignItems: "center", gap: 4 },
  bankDraftEditText: { color: COLORS.grape, fontSize: 8, fontWeight: "900" },
  bankDraftReason: { color: "#8A641B", fontSize: 8, lineHeight: 12, fontWeight: "700", marginTop: 9 },
  bankDraftEditor: { borderTopWidth: 1, borderTopColor: COLORS.line, marginTop: 13, paddingTop: 14 },
  bankImportValidation: { color: "#B54337", fontSize: 10, fontWeight: "700", marginBottom: 12 },
  goalInput: { minHeight: 130, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, padding: 14, color: COLORS.ink, fontSize: 13, lineHeight: 19 },
  goalHint: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  themeSelector: { flexDirection: "row", gap: 8, marginBottom: 18 },
  themeOption: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  themeOptionActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  themeOptionText: { color: COLORS.muted, fontSize: 10, fontWeight: "800" },
  themeOptionTextActive: { color: "#FFFFFF" },
  analysisLoading: { paddingVertical: 50, alignItems: "center" },
  analysisLoadingTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "900", marginTop: 18 },
  analysisLoadingText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 7, maxWidth: 270 },
  analysisError: { paddingVertical: 30, alignItems: "center" },
  analysisErrorTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "900", marginTop: 13 },
  analysisErrorText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 6 },
  analysisStatus: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 18, padding: 16 },
  analysisStatusDot: { width: 12, height: 12, borderRadius: 6 },
  analysisStatusLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  analysisHeadline: { color: COLORS.ink, fontSize: 15, fontWeight: "900", marginTop: 3 },
  analysisSummary: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginVertical: 18 },
  analysisSectionTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "900", marginTop: 8, marginBottom: 10 },
  analysisItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  analysisBullet: { width: 21, height: 21, borderRadius: 8, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center" },
  analysisBulletText: { color: COLORS.grape, fontSize: 9, fontWeight: "900" },
  analysisItemText: { flex: 1, color: "#575162", fontSize: 11, lineHeight: 16 },
  appSuggestion: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#F3EFFF", borderRadius: 14, padding: 12, marginBottom: 9 },
  suggestionIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  refreshAnalysis: { height: 48, borderRadius: 15, borderWidth: 1, borderColor: "#BFAFF0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  refreshAnalysisText: { color: COLORS.grape, fontSize: 11, fontWeight: "900" },
  primaryButton: { height: 54, marginTop: 20, backgroundColor: COLORS.grape, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  primaryButtonText: { color: "white", fontSize: 13, fontWeight: "900" },
  buttonDisabled: { opacity: 0.38 },
});
const createStyles = () => {
  const definition = createStyleDefinition();
  return StyleSheet.create((COLORS.paper === DARK_COLORS.paper ? applyLiteralTheme(definition) : definition) as any);
};
let styles = createStyles();

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}
