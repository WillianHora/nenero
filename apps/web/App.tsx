import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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
import { parseInterInvoicePdf } from "./cardInvoicePdf";
import { supabase, supabaseConfigured } from "./lib/supabase";

type Tab = "inicio" | "movimentos" | "recorrentes" | "cofrinhos" | "carteiras" | "ferramentas";
type EntryKind = "expense" | "income";
type Entry = {
  id: string;
  title: string;
  value: number;
  kind: EntryKind;
  category: string;
  walletId: string;
  createdAt: string;
  cardId?: string;
  invoiceDueDate?: string;
  invoicePaymentKey?: string;
  importId?: string;
  importSource?: string;
};
type BankImportDraft = ParsedBankTransaction & { selected: boolean; duplicate: boolean };
type Wallet = { id: string; name: string; initial: number; color: string };
type WalletBalance = { wallet: Wallet; balance: number };
type CreditCard = {
  id: string;
  name: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
  paymentWalletId: string;
  paidInvoiceKeys: string[];
};
type FinancialSettings = { salaryDay: number; projectedMonthlyIncome: number; primaryIncomeId?: string };
type CardInvoice = {
  key: string;
  cardId: string;
  dueDate: string;
  total: number;
  entries: Entry[];
  paid: boolean;
};
type SavingsPot = {
  id: string;
  type: "savings" | "debt";
  name: string;
  description: string;
  goal: number;
  months: number;
  createdAt: string;
  contributions: { id: string; value: number; createdAt: string; walletId?: string }[];
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
type FinancialDataPayload = {
  wallets: Wallet[];
  entries: Entry[];
  recurring: Recurring[];
  savingsPots: SavingsPot[];
  creditCards?: CreditCard[];
  financialSettings?: FinancialSettings;
  goal: string;
  analysis: AiAnalysis | null;
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
  ink: "#242033", muted: "#777286", textTertiary: "#9A94A8",
  paper: "#F7F5FA", surface: "#FFFFFF", surfaceElevated: "#FFFFFF", surfaceMuted: "#F0EEF5",
  line: "#EAE6F0", lineStrong: "#DCD5E8", mark: "#242033",
  grape: "#7147E8", grapeDark: "#532CB8", lime: "#C9F45A", coral: "#FF7B6B", sky: "#C8ECFF",
  placeholder: "#A9A3B2",
  success: "#5D8A22", successSurface: "#EAF8D0", successBorder: "#D6E9AD",
  warning: "#9A6810", warningSurface: "#FFF0CA", warningBorder: "#EED9A3",
  danger: "#B54337", dangerSurface: "#FFF0ED", dangerBorder: "#F1C9C3",
  info: "#277493", infoSurface: "#E7F4FB", infoBorder: "#C9E5F3",
  accentSurface: "#F0EBFF", accentBorder: "#D9CDF8",
  teal: "#167B6B", tealSurface: "#E4F7F3", tealBorder: "#CBE9E1",
};
const DARK_COLORS: typeof LIGHT_COLORS = {
  ink: "#F4F0FA", muted: "#AAA3B8", textTertiary: "#7A7390",
  paper: "#0F0D17", surface: "#1B1826", surfaceElevated: "#221E30", surfaceMuted: "#241F33",
  line: "#2B2738", lineStrong: "#3A3450", mark: "#242033",
  grape: "#9B7BFF", grapeDark: "#C2AEFF", lime: "#C9F45A", coral: "#FF8E80", sky: "#183443",
  placeholder: "#726C82",
  success: "#8FD35A", successSurface: "#1E2E16", successBorder: "#35502E",
  warning: "#E8B24A", warningSurface: "#332916", warningBorder: "#4A3A1E",
  danger: "#FF9B8F", dangerSurface: "#321E21", dangerBorder: "#563038",
  info: "#7FCBE8", infoSurface: "#17303A", infoBorder: "#2C4A54",
  accentSurface: "#29223B", accentBorder: "#493A68",
  teal: "#62D7C3", tealSurface: "#17342F", tealBorder: "#315B53",
};
const COLORS = { ...LIGHT_COLORS };
let IS_DARK = false;
const withAlpha = (hex: string, alpha: number) => {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
type ThemeMode = "system" | "light" | "dark";
const THEME_STORAGE_KEY = "@nenero/theme";

const walletPalette = ["#7147E8", "#111111", "#2563EB", "#FF7B6B", "#F97316", "#2DAE8C", "#E0A72B", "#C13C8A", "#64748B"];
const expenseCategories = ["Mercado", "Casa", "Transporte", "Lazer", "Delivery", "Educação", "Saúde", "Assinatura", "Outros"];
const incomeCategories = ["Salário", "Freelance", "Férias", "Bonificações", "13º salário", "Rendimentos", "Reembolso", "Venda", "Outras entradas"];
const categoriesByKind: Record<EntryKind, string[]> = { expense: expenseCategories, income: incomeCategories };
type CategoryVisual = { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; background: string; border: string };
type CategoryHue = { icon: keyof typeof MaterialCommunityIcons.glyphMap; light: string; dark: string };
const categoryHues: Record<string, CategoryHue> = {
  Mercado: { icon: "cart-outline", light: "#2F7D5A", dark: "#5FCB93" },
  Casa: { icon: "home-heart", light: "#6B4BC3", dark: "#B39CFF" },
  Transporte: { icon: "car-outline", light: "#2E7198", dark: "#6FC1E8" },
  Lazer: { icon: "party-popper", light: "#B65A4F", dark: "#FF9B85" },
  Delivery: { icon: "moped", light: "#B66A22", dark: "#F0A855" },
  Educação: { icon: "school-outline", light: "#3E63A8", dark: "#8AAEEA" },
  Saúde: { icon: "medical-bag", light: "#B94467", dark: "#FF8FB0" },
  Assinatura: { icon: "calendar-sync", light: "#7C4C9D", dark: "#CC9AE8" },
  Outros: { icon: "shape-outline", light: "#676270", dark: "#ADA8BA" },
  Salário: { icon: "cash", light: "#5D7E1D", dark: "#B9D96A" },
  Renda: { icon: "cash", light: "#5D7E1D", dark: "#B9D96A" },
  Freelance: { icon: "laptop", light: "#5F52B6", dark: "#ABA0F0" },
  Férias: { icon: "beach", light: "#A96B00", dark: "#F0B23E" },
  Bonificações: { icon: "medal-outline", light: "#8B6A05", dark: "#E8C158" },
  Bonificação: { icon: "medal-outline", light: "#8B6A05", dark: "#E8C158" },
  "13º salário": { icon: "gift-outline", light: "#A24879", dark: "#F090C4" },
  Rendimentos: { icon: "chart-line", light: "#167B6B", dark: "#5FD9C0" },
  Investimentos: { icon: "chart-line", light: "#167B6B", dark: "#5FD9C0" },
  Reembolso: { icon: "cash-refund", light: "#2B709F", dark: "#6FBEEA" },
  Venda: { icon: "tag-outline", light: "#B45245", dark: "#FF9683" },
  "Outras entradas": { icon: "cash-plus", light: "#59646C", dark: "#A6B0B8" },
};
const fallbackCategoryHue: Record<EntryKind, string> = { expense: "Outros", income: "Outras entradas" };
const getCategoryVisual = (category: string, kind: EntryKind): CategoryVisual => {
  const hue = categoryHues[category] ?? categoryHues[fallbackCategoryHue[kind]]!;
  const color = IS_DARK ? hue.dark : hue.light;
  return { icon: hue.icon, color, background: withAlpha(color, IS_DARK ? 0.16 : 0.1), border: withAlpha(color, IS_DARK ? 0.34 : 0.22) };
};
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: number) => brl.format(value);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const parseMoneyInput = (value: string) => Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
const formatMoneyInput = (value: string) => {
  if (!value.trim()) return "";
  const parsed = parseMoneyInput(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
};
const formatMoneyDigitsInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  if (!digits || Number(digits) === 0) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
const getSavingsContributionBalance = (pot: SavingsPot, contribution: SavingsPot["contributions"][number]) => (
  contribution.value * Math.pow(1 + getRealMonthlyRate(pot), getElapsedMonths(contribution.createdAt))
);
const getDreamsBalance = (pots: SavingsPot[]) => pots.filter((pot) => pot.type !== "debt").reduce((total, pot) => total + getSavingsPotBalance(pot), 0);
const getWalletAvailableBalance = (wallet: Wallet, entries: Entry[], pots: SavingsPot[]) => {
  const movementBalance = entries.filter((entry) => entry.walletId === wallet.id && !entry.cardId).reduce((sum, entry) => sum + (entry.kind === "income" ? entry.value : -entry.value), wallet.initial);
  const reserved = pots.filter((pot) => pot.type !== "debt").reduce((total, pot) => total + pot.contributions.filter((contribution) => contribution.walletId === wallet.id).reduce((sum, contribution) => sum + contribution.value, 0), 0);
  return movementBalance - reserved;
};
const clampDay = (year: number, month: number, day: number) => Math.min(day, new Date(year, month + 1, 0).getDate());
const dateAtNoon = (year: number, month: number, day: number) => new Date(year, month, clampDay(year, month, day), 12);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const invoiceKey = (cardId: string, dueDate: string | Date) => `${cardId}:${monthKey(typeof dueDate === "string" ? new Date(dueDate) : dueDate)}`;
const getInvoiceDueDate = (card: CreditCard, purchaseDate: string | Date) => {
  const purchase = typeof purchaseDate === "string" ? new Date(purchaseDate) : purchaseDate;
  // O dia de fechamento já pertence ao próximo ciclo da fatura.
  const closingMonthOffset = purchase.getDate() >= card.closingDay ? 1 : 0;
  const closingMonth = new Date(purchase.getFullYear(), purchase.getMonth() + closingMonthOffset, 1);
  const dueMonthOffset = card.dueDay <= card.closingDay ? 1 : 0;
  return dateAtNoon(closingMonth.getFullYear(), closingMonth.getMonth() + dueMonthOffset, card.dueDay);
};
const getEntryInvoiceDueDate = (entry: Entry, card: CreditCard) => {
  // Em faturas importadas, o usuário escolhe explicitamente o mês de vencimento.
  // Nos lançamentos manuais, a competência sempre acompanha a data da compra e o ciclo atual do cartão.
  if (entry.importSource && entry.invoiceDueDate) return new Date(entry.invoiceDueDate);
  return getInvoiceDueDate(card, entry.createdAt);
};
const getNextSalaryCycle = (settings: FinancialSettings, today = new Date()) => {
  const thisMonthSalary = dateAtNoon(today.getFullYear(), today.getMonth(), settings.salaryDay);
  const start = today < thisMonthSalary ? thisMonthSalary : dateAtNoon(today.getFullYear(), today.getMonth() + 1, settings.salaryDay);
  const next = dateAtNoon(start.getFullYear(), start.getMonth() + 1, settings.salaryDay);
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1, 23, 59, 59, 999);
  return { start, end };
};
const getCardInvoices = (cards: CreditCard[], entries: Entry[]): CardInvoice[] => {
  const groups = new Map<string, CardInvoice>();
  entries.filter((entry) => entry.kind === "expense" && entry.cardId).forEach((entry) => {
    const card = cards.find((item) => item.id === entry.cardId);
    if (!card) return;
    const effectiveDueDate = getEntryInvoiceDueDate(entry, card);
    const dueDate = effectiveDueDate.toISOString();
    const key = invoiceKey(card.id, effectiveDueDate);
    const current = groups.get(key) ?? { key, cardId: card.id, dueDate, total: 0, entries: [], paid: card.paidInvoiceKeys.includes(key) };
    current.total += entry.value;
    current.entries.push(entry);
    groups.set(key, current);
  });
  return [...groups.values()].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
};
const getMonthlyTarget = (goal: number, months: number, rate: number, currentBalance = 0) => {
  const missing = Math.max(0, goal - currentBalance * Math.pow(1 + rate, months));
  if (Math.abs(rate) < 0.0000001) return missing / months;
  return Math.max(0, missing * rate / (Math.pow(1 + rate, months) - 1));
};
const AI_ANALYSIS_STORAGE_KEY = "@nenero/analysis-v2";

const initialWallets: Wallet[] = [];
const initialEntries: Entry[] = [];
const initialRecurring: Recurring[] = [];

function AppContent() {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const isDark = themeMode === "dark" || (themeMode === "system" && systemColorScheme === "dark");
  IS_DARK = isDark;
  Object.assign(COLORS, isDark ? DARK_COLORS : LIGHT_COLORS);
  styles = createStyles();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [tab, setTab] = useState<Tab>("inicio");
  const [wallets, setWallets] = useState(initialWallets);
  const [entries, setEntries] = useState(initialEntries);
  const [recurring, setRecurring] = useState(initialRecurring);
  const [savingsPots, setSavingsPots] = useState<SavingsPot[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [financialSettings, setFinancialSettings] = useState<FinancialSettings>({ salaryDay: 5, projectedMonthlyIncome: 0 });
  const [goal, setGoal] = useState("");
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [ready, setReady] = useState(false);
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [modal, setModal] = useState<"entry" | "wallet" | "card" | "financialSettings" | "recurring" | "pot" | "potDeposit" | "potDelete" | "lifeCalculator" | "profile" | "bankImport" | "analysis" | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<Recurring | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [selectedPot, setSelectedPot] = useState<SavingsPot | null>(null);

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
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !session) {
      setReady(false);
      setCloudUserId(null);
      return;
    }
    const userId = session.user.id;
    (async () => {
      try {
        const dataKey = `@nenero/data:${userId}`;
        const goalKey = `@nenero/goal:${userId}`;
        const analysisKey = `@nenero/analysis-v2:${userId}`;
        let raw = await AsyncStorage.getItem(dataKey);
        let savedGoal = await AsyncStorage.getItem(goalKey);
        let savedAnalysis = await AsyncStorage.getItem(analysisKey);
        const legacyMigrated = await AsyncStorage.getItem("@nenero/legacy-migrated");
        if (!raw && !legacyMigrated) {
          raw = await AsyncStorage.getItem("@nenero/data");
          savedGoal = savedGoal ?? await AsyncStorage.getItem("@nenero/goal");
          savedAnalysis = savedAnalysis ?? await AsyncStorage.getItem(AI_ANALYSIS_STORAGE_KEY);
          await AsyncStorage.setItem("@nenero/legacy-migrated", userId);
        }
        if (raw) {
          const data = JSON.parse(raw);
          const loadedWallets: Wallet[] = data.wallets ?? initialWallets;
          const fallbackWalletId = loadedWallets[0]?.id;
          setWallets(loadedWallets);
          setEntries(data.entries ?? initialEntries);
          setRecurring(data.recurring ?? initialRecurring);
          setSavingsPots((data.savingsPots ?? []).map((pot: SavingsPot) => ({ ...pot, type: pot.type ?? "savings", compoundInterest: pot.compoundInterest ?? false, monthlyInterestRate: pot.monthlyInterestRate ?? 0, annualInflationRate: pot.annualInflationRate ?? 0, contributions: (pot.contributions ?? []).map((contribution) => contribution.walletId || !fallbackWalletId ? contribution : { ...contribution, walletId: fallbackWalletId }) })));
          setCreditCards((data.creditCards ?? []).map((card: CreditCard) => ({ ...card, paidInvoiceKeys: card.paidInvoiceKeys ?? [] })));
          const plannedSalary = (data.recurring ?? []).find((item: Recurring) => item.kind === "income" && item.active);
          setFinancialSettings(data.financialSettings ?? { salaryDay: plannedSalary?.day ?? 5, projectedMonthlyIncome: plannedSalary?.value ?? 0 });
        } else {
          setWallets([]);
          setEntries([]);
          setRecurring([]);
          setSavingsPots([]);
          setCreditCards([]);
          setFinancialSettings({ salaryDay: 5, projectedMonthlyIncome: 0 });
        }
        setGoal(savedGoal ?? "");
        setAnalysis(savedAnalysis ? JSON.parse(savedAnalysis) : null);
      } finally {
        setReady(true);
      }
    })();
  }, [authReady, session?.user.id]);

  useEffect(() => {
    if (ready && session) AsyncStorage.setItem(`@nenero/data:${session.user.id}`, JSON.stringify({ wallets, entries, recurring, savingsPots, creditCards, financialSettings }));
  }, [wallets, entries, recurring, savingsPots, creditCards, financialSettings, ready, session?.user.id]);

  useEffect(() => {
    if (!ready || !session) return;
    const analysisKey = `@nenero/analysis-v2:${session.user.id}`;
    AsyncStorage.setItem(`@nenero/goal:${session.user.id}`, goal);
    if (analysis) {
      AsyncStorage.setItem(analysisKey, JSON.stringify(analysis));
    } else {
      AsyncStorage.removeItem(analysisKey);
    }
  }, [goal, analysis, ready, session?.user.id]);

  useEffect(() => {
    if (!ready || !session || !supabase) return;
    let active = true;
    setCloudError("");
    setCloudUserId(null);
    (async () => {
      const { data, error } = await supabase
        .from("user_financial_data")
        .select("payload")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setCloudError(`Não foi possível carregar seus dados: ${error.message}`);
        return;
      }
      if (data?.payload) {
        const payload = data.payload as FinancialDataPayload;
        const loadedWallets = payload.wallets ?? [];
        const fallbackWalletId = loadedWallets[0]?.id;
        setWallets(loadedWallets);
        setEntries(payload.entries ?? []);
        setRecurring(payload.recurring ?? []);
        setSavingsPots((payload.savingsPots ?? []).map((pot) => ({ ...pot, type: pot.type ?? "savings", compoundInterest: pot.compoundInterest ?? false, monthlyInterestRate: pot.monthlyInterestRate ?? 0, annualInflationRate: pot.annualInflationRate ?? 0, contributions: (pot.contributions ?? []).map((contribution) => contribution.walletId || !fallbackWalletId ? contribution : { ...contribution, walletId: fallbackWalletId }) })));
        setCreditCards((payload.creditCards ?? []).map((card) => ({ ...card, paidInvoiceKeys: card.paidInvoiceKeys ?? [] })));
        const plannedSalary = (payload.recurring ?? []).find((item) => item.kind === "income" && item.active);
        setFinancialSettings(payload.financialSettings ?? { salaryDay: plannedSalary?.day ?? 5, projectedMonthlyIncome: plannedSalary?.value ?? 0 });
        setGoal(payload.goal ?? "");
        setAnalysis(payload.analysis ?? null);
      } else {
        const payload: FinancialDataPayload = { wallets, entries, recurring, savingsPots, creditCards, financialSettings, goal, analysis };
        const { error: insertError } = await supabase.from("user_financial_data").upsert({
          user_id: session.user.id,
          payload,
          schema_version: 2,
          updated_at: new Date().toISOString(),
        });
        if (insertError) {
          setCloudError(`Não foi possível criar seu espaço: ${insertError.message}`);
          return;
        }
      }
      setCloudUserId(session.user.id);
    })();
    return () => { active = false; };
  }, [ready, session?.user.id]);

  useEffect(() => {
    if (!ready || !session || !supabase || cloudUserId !== session.user.id) return;
    const client = supabase;
    const payload: FinancialDataPayload = { wallets, entries, recurring, savingsPots, creditCards, financialSettings, goal, analysis };
    const timer = setTimeout(async () => {
      const { error } = await client.from("user_financial_data").upsert({
        user_id: session.user.id,
        payload,
        schema_version: 2,
        updated_at: new Date().toISOString(),
      });
      setCloudError(error ? `Falha ao sincronizar: ${error.message}` : "");
    }, 700);
    return () => clearTimeout(timer);
  }, [wallets, entries, recurring, savingsPots, creditCards, financialSettings, goal, analysis, ready, session?.user.id, cloudUserId]);

  useEffect(() => {
    if (!ready) return;
    const today = new Date();
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
        if (scheduledDate <= today && !posted.has(monthKey)) {
          postings.push({
            recurringId: item.id,
            monthKey,
            entry: {
              id: `${item.id}-${monthKey}`,
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

  const walletBalances = useMemo(() => wallets.map((wallet) => ({ wallet, balance: getWalletAvailableBalance(wallet, entries, savingsPots) })), [wallets, entries, savingsPots]);
  const availableBalance = useMemo(() => walletBalances.reduce((sum, item) => sum + item.balance, 0), [walletBalances]);
  const dreamsBalance = useMemo(() => getDreamsBalance(savingsPots), [savingsPots]);
  const totalBalance = availableBalance + dreamsBalance;

  const recurringTotal = recurring.filter((item) => item.active && item.kind !== "income").reduce((sum, item) => sum + item.value, 0);
  const now = new Date();
  const isCurrentMonth = (date: string) => {
    const value = new Date(date);
    return value.getMonth() === now.getMonth() && value.getFullYear() === now.getFullYear();
  };
  const monthlyIncome = entries.filter(entry => entry.kind === "income" && isCurrentMonth(entry.createdAt)).reduce((sum, entry) => sum + entry.value, 0);
  const monthlyExpenses = entries.filter(entry => entry.kind === "expense" && !entry.invoicePaymentKey && isCurrentMonth(entry.createdAt)).reduce((sum, entry) => sum + entry.value, 0);
  const sortedEntries = useMemo(() => [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [entries]);
  const cardInvoices = useMemo(() => getCardInvoices(creditCards, entries), [creditCards, entries]);
  const activePlannedIncomes = useMemo(() => recurring.filter((item) => item.active && item.kind === "income"), [recurring]);
  const primaryPlannedIncome = useMemo(() => activePlannedIncomes.find((item) => item.id === financialSettings.primaryIncomeId)
    ?? activePlannedIncomes.find((item) => item.category === "Salário")
    ?? activePlannedIncomes[0], [activePlannedIncomes, financialSettings.primaryIncomeId]);
  const projectedPlannedIncome = useMemo(() => activePlannedIncomes.reduce((sum, item) => sum + item.value, 0), [activePlannedIncomes]);
  const projectionSettings = useMemo<FinancialSettings>(() => ({
    salaryDay: primaryPlannedIncome?.day ?? 5,
    projectedMonthlyIncome: projectedPlannedIncome,
    primaryIncomeId: primaryPlannedIncome?.id,
  }), [primaryPlannedIncome?.day, primaryPlannedIncome?.id, projectedPlannedIncome]);
  const salaryCycle = useMemo(() => getNextSalaryCycle(projectionSettings), [projectionSettings]);
  const cycleInvoices = cardInvoices.filter((invoice) => {
    const dueDate = new Date(invoice.dueDate);
    return !invoice.paid && dueDate >= salaryCycle.start && dueDate <= salaryCycle.end;
  });
  const cycleInvoiceTotal = cycleInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const cycleCashBills = recurring.filter((item) => item.active && item.kind !== "income").reduce((sum, item) => {
    const cursor = new Date(salaryCycle.start.getFullYear(), salaryCycle.start.getMonth(), 1);
    const finalMonth = new Date(salaryCycle.end.getFullYear(), salaryCycle.end.getMonth(), 1);
    let occurrences = 0;
    while (cursor <= finalMonth) {
      const dueDate = dateAtNoon(cursor.getFullYear(), cursor.getMonth(), item.day);
      const key = monthKey(dueDate);
      if (dueDate >= salaryCycle.start && dueDate <= salaryCycle.end && !(item.paidMonths ?? []).includes(key)) occurrences += 1;
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return sum + item.value * occurrences;
  }, 0);
  const freeToSpend = projectionSettings.projectedMonthlyIncome - cycleInvoiceTotal - cycleCashBills;

  const runAnalysis = async (openDetails = false) => {
    if (!goal.trim()) { setModal("profile"); return; }
    if (openDetails) setModal("analysis");
    setAnalyzing(true);
    setAnalysisError("");
    const monthEntries = entries.filter(entry => isCurrentMonth(entry.createdAt));
    const byCategory = monthEntries.filter(entry => entry.kind === "expense" && !entry.invoicePaymentKey).reduce<Record<string, number>>((result, entry) => {
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
      .filter(entry => entry.kind === "expense" && !entry.invoicePaymentKey)
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
      return {
        type: pot.type === "debt" ? "dívida" : "economia",
        name: pot.name,
        description: pot.description,
        goal: pot.goal,
        months: pot.months,
        saved,
        remaining: Math.max(0, pot.goal - saved),
        progressPercent: Math.min(100, Math.round((saved / pot.goal) * 100)),
        monthlyTarget: Math.round(getMonthlyTarget(pot.goal, pot.months, getRealMonthlyRate(pot)) * 100) / 100,
      };
    });
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
- danger: saídas acima das entradas, saldo negativo ou objetivo seriamente comprometido.

O Nenero é um app pessoal de organização financeira com estas funções:
- criar várias carteiras com saldos separados;
- criar uma carteira específica para reserva, viagem ou investimentos;
- registrar entradas e gastos avulsos com data retroativa e categoria;
- programar salário mensal em uma carteira escolhida;
- cadastrar gastos fixos, escolher a carteira de pagamento e marcar contas como pagas;
- acompanhar entradas, saídas, contas pendentes e gastos por categoria em cada mês;
- definir um objetivo financeiro em texto livre.
- criar cofrinhos com nome, descrição, valor-alvo e prazo em meses;
- acompanhar o progresso e fazer aportes rápidos ou personalizados nos cofrinhos.

Além da análise, sugira de 1 a 3 melhorias que o usuário possa executar usando
essas funções. Exemplos: criar uma carteira separada para investimentos ou
reserva, programar parte do salário, separar um gasto recorrente ou revisar uma
categoria. Não recomende ativos, corretoras, empréstimos ou produtos financeiros.
Só sugira uma ação quando ela fizer sentido para os dados e o objetivo.

Objetivo: ${goal.trim()}
Mês: ${now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
Entradas realizadas: R$ ${monthlyIncome}
Saídas realizadas: R$ ${monthlyExpenses}
Resultado do mês: R$ ${monthResult}
Percentual da renda já gasto: ${spentIncomePercent === null ? "sem renda registrada" : `${spentIncomePercent}%`}
Taxa de sobra do mês: ${savingsRate === null ? "sem renda registrada" : `${savingsRate}%`}
Saldo atual: R$ ${totalBalance}
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

  const userEmail = session?.user.email ?? "";
  const metadataName = session?.user.user_metadata?.name
    || session?.user.user_metadata?.display_name
    || session?.user.user_metadata?.full_name;
  const hasProfileName = typeof metadataName === "string" && Boolean(metadataName.trim());
  const userName = hasProfileName
    ? metadataName.trim().slice(0, 40)
    : "você";
  const userInitials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "NN";

  const signOut = async () => {
    if (!supabase) return;
    setModal(null);
    await supabase.auth.signOut();
    setWallets([]);
    setEntries([]);
    setRecurring([]);
    setSavingsPots([]);
    setCreditCards([]);
    setFinancialSettings({ salaryDay: 5, projectedMonthlyIncome: 0 });
    setGoal("");
    setAnalysis(null);
    setCloudError("");
    setCloudUserId(null);
  };

  const updateProfileName = async (name: string) => {
    if (!supabase || !session) throw new Error("Sessão indisponível.");
    const normalizedName = name.trim().slice(0, 40);
    if (!normalizedName) throw new Error("Digite um nome para continuar.");
    const { error } = await supabase.auth.updateUser({
      data: {
        ...session.user.user_metadata,
        name: normalizedName,
        full_name: normalizedName,
        display_name: normalizedName,
      },
    });
    if (error) throw error;
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    if (!supabase || !session || !session.user.email) throw new Error("Sessão indisponível.");
    const { error } = await supabase.auth.updateUser({
      email: session.user.email,
      current_password: currentPassword,
      password: newPassword,
    });
    if (error) {
      if (/current password|invalid credentials|password is incorrect/i.test(error.message)) {
        throw new Error("A senha atual está incorreta.");
      }
      if (/same password|different from the old password/i.test(error.message)) {
        throw new Error("A nova senha precisa ser diferente da atual.");
      }
      throw error;
    }
  };

  if (!supabaseConfigured) return <SupabaseSetupScreen />;
  if (!authReady || (session && !ready)) return <AppLoadingScreen />;
  if (!session) return <AuthScreen />;
  if (!hasProfileName) return <OnboardingScreen onComplete={async ({ name, walletName, walletBalance, monthlyIncome, incomeDay, financialGoal }) => {
    await updateProfileName(name);
    const walletId = uid();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const recurringIncomeId = uid();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const salaryDate = new Date(now.getFullYear(), now.getMonth(), Math.min(incomeDay, lastDay), 12);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const salaryIsDue = salaryDate <= todayEnd;
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
    setCreditCards([]);
    setFinancialSettings({ salaryDay: incomeDay, projectedMonthlyIncome: monthlyIncome, primaryIncomeId: recurringIncomeId });
    setGoal(financialGoal);
    setAnalysis(null);
  }} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View style={styles.app}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandFace}>◡</Text></View>
            <Text style={styles.brand}>nenero</Text>
          </View>
          <Pressable style={styles.avatar} onPress={() => setModal("profile")} accessibilityLabel="Abrir perfil"><Text style={styles.avatarText}>{userInitials}</Text></Pressable>
        </View>

        {cloudError ? <View style={styles.cloudError}><Feather name="cloud-off" size={14} color={COLORS.danger} /><Text style={styles.cloudErrorText}>{cloudError}</Text></View> : null}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {tab === "inicio" && (
            <Home
              userName={userName}
              balance={availableBalance}
              savedAmount={dreamsBalance}
              recurringTotal={recurringTotal}
              monthlyIncome={monthlyIncome}
              monthlyExpenses={monthlyExpenses}
              financialSettings={projectionSettings}
              salaryCycle={salaryCycle}
              cycleInvoices={cycleInvoices}
              cycleCashBills={cycleCashBills}
              freeToSpend={freeToSpend}
              creditCards={creditCards}
              entries={sortedEntries}
              wallets={wallets}
              analysis={analysis}
              analyzing={analyzing}
              hasGoal={Boolean(goal.trim())}
              onAnalyze={() => analysis || analysisError ? setModal("analysis") : runAnalysis(false)}
              onAdd={() => { setEditingEntry(null); setModal("entry"); }}
              onEditEntry={(entry) => { setEditingEntry(entry); setModal("entry"); }}
              onConfigureCycle={() => setModal("financialSettings")}
            />
          )}
          {tab === "movimentos" && <Movements entries={sortedEntries} wallets={wallets} cards={creditCards} onAdd={() => { setEditingEntry(null); setModal("entry"); }} onEdit={(entry) => { setEditingEntry(entry); setModal("entry"); }} />}
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
              onDelete={(pot) => { setSelectedPot(pot); setModal("potDelete"); }}
            />
          )}
          {tab === "carteiras" && <WalletList walletBalances={walletBalances} pots={savingsPots} dreamsBalance={dreamsBalance} cards={creditCards} invoices={cardInvoices} onAdd={() => { setEditingWallet(null); setModal("wallet"); }} onEdit={(wallet) => { setEditingWallet(wallet); setModal("wallet"); }} onAddCard={() => { setEditingCard(null); setModal("card"); }} onEditCard={(card) => { setEditingCard(card); setModal("card"); }} onPayInvoice={(invoice) => {
            const card = creditCards.find((item) => item.id === invoice.cardId);
            const walletId = card?.paymentWalletId || wallets[0]?.id;
            if (!card || !walletId || invoice.paid) return;
            setEntries((items) => [{ id: uid(), title: `Pagamento da fatura ${card.name}`, value: invoice.total, kind: "expense", category: "Outros", walletId, createdAt: new Date().toISOString(), invoicePaymentKey: invoice.key }, ...items]);
            setCreditCards((items) => items.map((item) => item.id === card.id ? { ...item, paidInvoiceKeys: [...new Set([...item.paidInvoiceKeys, invoice.key])] } : item));
          }} onReopenInvoice={(invoice) => {
            setEntries((items) => items.filter((entry) => entry.invoicePaymentKey !== invoice.key));
            setCreditCards((items) => items.map((item) => item.id === invoice.cardId ? { ...item, paidInvoiceKeys: item.paidInvoiceKeys.filter((key) => key !== invoice.key) } : item));
          }} onOpenDreams={() => setTab("cofrinhos")} />}
          {tab === "ferramentas" && <Tools onLifeCalculator={() => setModal("lifeCalculator")} />}
        </ScrollView>

        <BottomNav tab={tab} setTab={setTab} />
      </View>

      <EntryModal
        visible={modal === "entry"}
        wallets={wallets}
        cards={creditCards}
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
          const confirmed = globalThis.confirm(`Excluir “${entry.title}”?\n\n${entry.kind === "income" ? "A entrada" : "O gasto"} de ${money(entry.value)} será apagado. Essa ação não pode ser desfeita.`);
          if (!confirmed) return;
          setEntries((items) => items.filter((item) => item.id !== entry.id));
          setModal(null);
          setEditingEntry(null);
        } : undefined}
      />
      <WalletModal
        visible={modal === "wallet"}
        item={editingWallet}
        onClose={() => { setModal(null); setEditingWallet(null); }}
        onSave={(wallet) => {
          if (editingWallet) setWallets((items) => items.map((item) => item.id === editingWallet.id ? { ...item, ...wallet } : item));
          else setWallets((items) => [...items, { ...wallet, id: uid() }]);
          setModal(null);
          setEditingWallet(null);
        }}
        onDelete={editingWallet ? () => {
          const linkedEntries = entries.filter((entry) => entry.walletId === editingWallet.id).length;
          const linkedRecurring = recurring.filter((item) => item.walletId === editingWallet.id).length;
          const linkedCards = creditCards.filter((card) => card.paymentWalletId === editingWallet.id).length;
          if (linkedCards) {
            globalThis.alert(`Esta carteira paga ${linkedCards} ${linkedCards === 1 ? "cartão" : "cartões"}. Escolha outra conta para a fatura antes de excluí-la.`);
            return;
          }
          const linkedCopy = [linkedEntries ? `${linkedEntries} lançamento${linkedEntries === 1 ? "" : "s"}` : "", linkedRecurring ? `${linkedRecurring} planejamento${linkedRecurring === 1 ? "" : "s"}` : ""].filter(Boolean).join(" e ");
          const confirmed = globalThis.confirm(`Excluir “${editingWallet.name}”?\n\n${linkedCopy ? `A carteira e ${linkedCopy} vinculados serão apagados.` : "A carteira será apagada."} Essa ação não pode ser desfeita.`);
          if (!confirmed) return;
          setWallets((items) => items.filter((item) => item.id !== editingWallet.id));
          setEntries((items) => items.filter((item) => item.walletId !== editingWallet.id));
          setRecurring((items) => items.filter((item) => item.walletId !== editingWallet.id));
          setModal(null);
          setEditingWallet(null);
        } : undefined}
      />
      <CreditCardModal
        visible={modal === "card"}
        wallets={wallets}
        item={editingCard}
        onClose={() => { setModal(null); setEditingCard(null); }}
        onSave={(card) => {
          if (editingCard) setCreditCards((items) => items.map((item) => item.id === editingCard.id ? { ...item, ...card } : item));
          else setCreditCards((items) => [...items, { ...card, id: uid(), paidInvoiceKeys: [] }]);
          setModal(null);
          setEditingCard(null);
        }}
        onDelete={editingCard ? () => {
          const linked = entries.filter((entry) => entry.cardId === editingCard.id).length;
          if (linked) {
            globalThis.alert(`Este cartão tem ${linked} compra${linked === 1 ? "" : "s"} vinculada${linked === 1 ? "" : "s"}. Exclua ou mova essas compras antes.`);
            return;
          }
          setCreditCards((items) => items.filter((item) => item.id !== editingCard.id));
          setModal(null);
          setEditingCard(null);
        } : undefined}
      />
      <FinancialSettingsModal
        visible={modal === "financialSettings"}
        incomes={activePlannedIncomes}
        selectedIncomeId={primaryPlannedIncome?.id}
        onClose={() => setModal(null)}
        onOpenPlanned={() => { setModal(null); setTab("recorrentes"); }}
        onSave={(primaryIncomeId) => {
          const primaryIncome = activePlannedIncomes.find((item) => item.id === primaryIncomeId);
          if (!primaryIncome) return;
          setFinancialSettings({ salaryDay: primaryIncome.day, projectedMonthlyIncome: projectedPlannedIncome, primaryIncomeId });
          setModal(null);
        }}
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
        onDelete={editingRecurring ? () => {
          const item = editingRecurring;
          const confirmed = globalThis.confirm(`Excluir “${item.title}”?\n\n${item.kind === "income" ? "A entrada planejada" : "O gasto fixo"} será removido dos próximos meses. As movimentações já registradas serão preservadas.`);
          if (!confirmed) return;
          setRecurring((items) => items.filter((current) => current.id !== item.id));
          setModal(null);
          setEditingRecurring(null);
        } : undefined}
      />
      <SavingsPotModal
        visible={modal === "pot"}
        onClose={() => setModal(null)}
        onSave={(pot) => {
          setSavingsPots(items => [...items, { ...pot, id: uid(), createdAt: new Date().toISOString(), contributions: [] }]);
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
          setModal(null);
          setSelectedPot(null);
        }}
      />
      <SavingsPotDeleteModal
        visible={modal === "potDelete"}
        pot={selectedPot}
        wallets={wallets}
        onClose={() => { setModal(null); setSelectedPot(null); }}
        onDelete={(mode) => {
          if (!selectedPot) return;
          const pot = selectedPot;
          if (pot.type === "debt") {
            setSavingsPots((items) => items.filter((item) => item.id !== pot.id));
            setAnalysis(null);
            setModal(null);
            setSelectedPot(null);
            return;
          }
          const now = new Date().toISOString();
          const amountsByWallet = pot.contributions.reduce<Record<string, { principal: number; current: number }>>((totals, contribution) => {
            if (!contribution.walletId || !wallets.some((wallet) => wallet.id === contribution.walletId)) return totals;
            const current = totals[contribution.walletId] ?? { principal: 0, current: 0 };
            current.principal += contribution.value;
            current.current += getSavingsContributionBalance(pot, contribution);
            totals[contribution.walletId] = current;
            return totals;
          }, {});
          const adjustmentEntries = Object.entries(amountsByWallet).reduce<Entry[]>((items, [walletId, amounts]) => {
            if (mode === "discard") {
              if (amounts.principal > 0) items.push({ id: uid(), title: `Valor descartado do cofrinho ${pot.name}`, value: amounts.principal, kind: "expense", category: "Outros", walletId, createdAt: now });
              return items;
            }
            const yieldValue = Math.max(0, amounts.current - amounts.principal);
            if (yieldValue >= 0.01) items.push({ id: uid(), title: `Rendimento do cofrinho ${pot.name}`, value: yieldValue, kind: "income", category: "Rendimentos", walletId, createdAt: now });
            return items;
          }, []);
          if (adjustmentEntries.length) setEntries((items) => [...adjustmentEntries, ...items]);
          setSavingsPots((items) => items.filter((item) => item.id !== pot.id));
          setAnalysis(null);
          setModal(null);
          setSelectedPot(null);
        }}
      />
      <LifeSpentCalculatorModal
        visible={modal === "lifeCalculator"}
        entries={entries}
        goal={goal}
        savingsPots={savingsPots}
        onClose={() => setModal(null)}
      />
      <ProfileModal
        visible={modal === "profile"}
        goal={goal}
        userName={userName}
        userEmail={userEmail}
        userInitials={userInitials}
        onClose={() => setModal(null)}
        onNameSave={updateProfileName}
        onPasswordChange={updatePassword}
        onImportBank={() => setModal("bankImport")}
        onSave={(value) => { setGoal(value); setAnalysis(null); setModal(null); }}
        onSignOut={signOut}
        themeMode={themeMode}
        onThemeChange={changeTheme}
      />
      <BankImportModal
        visible={modal === "bankImport"}
        wallets={wallets}
        cards={creditCards}
        existingEntries={entries}
        onClose={() => setModal(null)}
        onImport={(importedEntries) => {
          setEntries((current) => [...importedEntries.map((entry) => ({ ...entry, id: uid() })), ...current]);
          setAnalysis(null);
          setModal(null);
        }}
      />
      <AnalysisModal visible={modal === "analysis"} analysis={analysis} loading={analyzing} error={analysisError} onRetry={runAnalysis} onClose={() => setModal(null)} />
    </SafeAreaView>
  );
}

function Home({ userName, balance, savedAmount, recurringTotal, monthlyIncome, monthlyExpenses, financialSettings, salaryCycle, cycleInvoices, cycleCashBills, freeToSpend, creditCards, entries, wallets, analysis, analyzing, hasGoal, onAnalyze, onAdd, onEditEntry, onConfigureCycle }: {
  userName: string;
  balance: number; savedAmount: number; recurringTotal: number; monthlyIncome: number; monthlyExpenses: number; entries: Entry[]; wallets: Wallet[];
  financialSettings: FinancialSettings; salaryCycle: { start: Date; end: Date }; cycleInvoices: CardInvoice[]; cycleCashBills: number; freeToSpend: number; creditCards: CreditCard[];
  analysis: AiAnalysis | null; analyzing: boolean; hasGoal: boolean; onAnalyze: () => void;
  onAdd: () => void; onEditEntry: (entry: Entry) => void; onConfigureCycle: () => void;
}) {
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).toUpperCase();
  const balanceGradient: [string, string] = analysis?.status === "danger"
    ? IS_DARK ? ["#54243A", "#2C172B"] : ["#7C3453", "#4E244B"]
    : analysis?.status === "attention"
      ? IS_DARK ? ["#51327B", "#2D1E58"] : ["#8550C8", "#5B32C8"]
      : IS_DARK ? ["#4B2E86", "#27194F"] : ["#7951ED", "#5B32C8"];
  const [activeHeroCard, setActiveHeroCard] = useState<0 | 1>(0);
  const activeHeroCardRef = useRef<0 | 1>(0);
  const heroPan = useRef(new Animated.ValueXY()).current;
  const heroAnimating = useRef(false);
  const reduceMotion = useRef(false);
  const cycleInvoiceTotal = cycleInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const revealProgress = heroPan.x.interpolate({ inputRange: [-180, 0, 180], outputRange: [1, 0, 1], extrapolate: "clamp" });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { reduceMotion.current = enabled; });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => { reduceMotion.current = enabled; });
    return () => subscription.remove();
  }, []);

  function changeHeroCard(direction: number, target?: 0 | 1) {
    if (heroAnimating.current || target === activeHeroCardRef.current) return;
    const nextCard = target ?? (activeHeroCardRef.current === 0 ? 1 : 0);
    if (reduceMotion.current) {
      heroPan.setValue({ x: 0, y: 0 });
      activeHeroCardRef.current = nextCard;
      setActiveHeroCard(nextCard);
      return;
    }
    heroAnimating.current = true;
    Animated.timing(heroPan, { toValue: { x: direction * 520, y: 0 }, duration: 220, useNativeDriver: true }).start(() => {
      activeHeroCardRef.current = nextCard;
      setActiveHeroCard(nextCard);
      heroPan.setValue({ x: direction * -52, y: 0 });
      Animated.spring(heroPan, { toValue: { x: 0, y: 0 }, friction: 8, tension: 82, useNativeDriver: true }).start(() => { heroAnimating.current = false; });
    });
  }

  const heroPanResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => heroPan.setValue({ x: gesture.dx, y: 0 }),
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) > 62 || Math.abs(gesture.vx) > 0.45) changeHeroCard(gesture.dx >= 0 ? 1 : -1);
      else Animated.spring(heroPan, { toValue: { x: 0, y: 0 }, friction: 8, tension: 90, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(heroPan, { toValue: { x: 0, y: 0 }, friction: 8, tension: 90, useNativeDriver: true }).start(),
  })).current;

  const balanceHeroCard = <LinearGradient colors={balanceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
    <View style={styles.balanceGlow} />
    <View style={styles.balanceHeader}><Text style={styles.balanceLabel}>Saldo nas carteiras</Text></View>
    <Text style={styles.balanceValue}>{money(balance)}</Text>
    <View style={styles.savedTotalLine}><MaterialCommunityIcons name="piggy-bank-outline" size={16} color={COLORS.lime} /><Text style={styles.savedTotalLabel}>Poupado:</Text><Text style={styles.savedTotalValue}>{money(savedAmount)}</Text></View>
    <Text style={styles.balanceCopy}>{balance >= 0 ? "Tá bonito. E o melhor: tá organizado." : "Respira. Vamos ajeitar isso juntos."}</Text>
    <Pressable style={styles.whiteButton} onPress={onAdd}><Feather name="plus" size={18} color="#532CB8" /><Text style={styles.whiteButtonText}>Novo lançamento</Text></Pressable>
  </LinearGradient>;

  const cycleHeroCard = <LinearGradient colors={IS_DARK ? ["#392758", "#171126"] : ["#463075", "#24173F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.salaryCycleCard}>
    <View style={styles.salaryCycleGlow} />
    <View style={styles.salaryCycleGlowSmall} />
    <View style={styles.salaryCycleHeader}>
      <View style={styles.salaryCycleIdentity}><View style={styles.salaryCycleIcon}><MaterialCommunityIcons name="credit-card-outline" size={19} color={COLORS.lime} /></View><View style={styles.salaryCycleHeaderCopy}><Text style={styles.salaryCycleEyebrow}>FATURAS DO PRÓXIMO SALÁRIO</Text><Text style={styles.salaryCycleDate}>{salaryCycle.start.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })} → {salaryCycle.end.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</Text></View></View>
      <Pressable style={styles.salaryCycleSettings} onPress={onConfigureCycle} accessibilityLabel="Configurar ciclo do salário"><Feather name="settings" size={16} color={COLORS.lime} /></Pressable>
    </View>
    <Text style={styles.salaryCycleLabel}>Livre para gastar</Text>
    <Text style={[styles.salaryCycleValue, freeToSpend < 0 && styles.salaryCycleValueDanger]}>{money(freeToSpend)}</Text>
    {financialSettings.projectedMonthlyIncome > 0 ? <>
      <View style={styles.salaryCycleTrack}><View style={[styles.salaryCycleTrackFill, { width: `${Math.min(100, Math.max(0, (Math.max(0, freeToSpend) / financialSettings.projectedMonthlyIncome) * 100))}%` }]} /></View>
      <View style={styles.salaryCycleBreakdown}>
        <View style={styles.salaryCycleLine}><Text style={styles.salaryCycleLineLabel}>Entradas planejadas</Text><Text style={styles.salaryCycleIncome}>+ {money(financialSettings.projectedMonthlyIncome)}</Text></View>
        <View style={styles.salaryCycleLine}><Text style={styles.salaryCycleLineLabel}>{cycleInvoices.length === 1 ? "Próxima fatura" : `${cycleInvoices.length} próximas faturas`}</Text><Text style={styles.salaryCycleExpense}>− {money(cycleInvoiceTotal)}</Text></View>
        <View style={styles.salaryCycleLine}><Text style={styles.salaryCycleLineLabel}>Contas em dinheiro</Text><Text style={styles.salaryCycleExpense}>− {money(cycleCashBills)}</Text></View>
      </View>
    </> : <Pressable style={styles.salaryCycleEmpty} onPress={onConfigureCycle}><Text style={styles.salaryCycleEmptyText}>Cadastre uma entrada mensal em Planejados para ativar a projeção.</Text><Feather name="arrow-right" size={15} color={COLORS.lime} /></Pressable>}
  </LinearGradient>;
  return (
    <>
      <View style={styles.helloRow}>
        <View style={styles.flex}><Text style={styles.eyebrow}>{today}</Text><Text style={styles.h1} numberOfLines={2}>Oi, {userName}!</Text></View>
      </View>

      <View style={styles.heroDeck} accessibilityLabel="Resumo financeiro em dois cartões">
        <Animated.View pointerEvents="none" style={[styles.heroDeckCard, styles.heroDeckBack, { opacity: revealProgress.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }), transform: [{ translateY: revealProgress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: revealProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }, { rotate: "1.2deg" }] }]}>
          {activeHeroCard === 0 ? cycleHeroCard : balanceHeroCard}
        </Animated.View>
        <Animated.View {...heroPanResponder.panHandlers} style={[styles.heroDeckCard, styles.heroDeckFront, { transform: [{ translateX: heroPan.x }, { rotate: heroPan.x.interpolate({ inputRange: [-260, 0, 260], outputRange: ["-7deg", "0deg", "7deg"], extrapolate: "clamp" }) }] }]}>
          {activeHeroCard === 0 ? balanceHeroCard : cycleHeroCard}
        </Animated.View>
      </View>
      <View style={styles.heroDeckNavigation}>
        <View style={styles.heroDeckDots}>{([0, 1] as const).map((index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={index === 0 ? "Mostrar saldo" : "Mostrar próximo ciclo do salário"} accessibilityState={{ selected: activeHeroCard === index }} style={[styles.heroDeckDotButton, activeHeroCard === index && styles.heroDeckDotButtonActive]} onPress={() => changeHeroCard(index > activeHeroCard ? -1 : 1, index)} />)}</View>
        <View style={styles.heroDeckHint}><Feather name="move" size={12} color={COLORS.muted} /><Text style={styles.heroDeckHintText}>{activeHeroCard === 0 ? "Deslize para ver as faturas" : "Deslize para voltar ao saldo"}</Text></View>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, styles.metricIncomeCard]}>
          <View style={[styles.iconBubble, { backgroundColor: "#799B22" }]}><Feather name="arrow-down-left" size={17} color="white" /></View>
          <Text style={[styles.metricLabel, styles.metricIncomeLabel]}>Entrou este mês</Text>
          <Text style={[styles.metricValue, styles.metricIncomeValue]}>{money(monthlyIncome)}</Text>
        </View>
        <View style={[styles.metricCard, styles.metricExpenseCard]}>
          <View style={[styles.iconBubble, { backgroundColor: COLORS.coral }]}><Feather name="arrow-up-right" size={17} color="white" /></View>
          <Text style={[styles.metricLabel, styles.metricExpenseLabel]}>Gastou este mês</Text>
          <Text style={[styles.metricValue, styles.metricExpenseValue]}>{money(monthlyExpenses)}</Text>
        </View>
      </View>
      <View style={styles.commitmentCard}>
        <View style={[styles.iconBubble, { backgroundColor: "#87A928", marginBottom: 0 }]}><Feather name="repeat" size={16} color="white" /></View>
        <View style={styles.flex}><Text style={styles.metricLabel}>Já comprometido em gastos fixos</Text><Text style={styles.commitmentHint}>Contas ativas deste mês</Text></View>
        <Text style={styles.metricValue}>{money(recurringTotal)}</Text>
      </View>
      <AiInsightCard analysis={analysis} analyzing={analyzing} hasGoal={hasGoal} onPress={onAnalyze} />

      <SectionTitle title="Últimos rolês do dinheiro" action="Ver todos" />
      <View style={styles.listCard}>
        {entries.slice(0, 4).map((entry, index) => <EntryRow key={entry.id} entry={entry} wallet={wallets.find(wallet => wallet.id === entry.walletId)} card={creditCards.find(card => card.id === entry.cardId)} last={index === Math.min(entries.length, 4) - 1} onEdit={entry.invoicePaymentKey ? undefined : () => onEditEntry(entry)} />)}
      </View>

      <View style={styles.tipCard}>
        <View style={styles.tipMascot}><Text style={styles.tipFace}>•ᴗ•</Text></View>
        <View style={styles.tipCopy}><Text style={styles.tipTitle}>Papo do Nenero</Text><Text style={styles.tipText}>Seus gastos fixos ocupam {Math.min(100, Math.round((recurringTotal / Math.max(balance, 1)) * 100))}% do saldo. O resto pode respirar.</Text></View>
      </View>
    </>
  );
}

function AiInsightCard({ analysis, analyzing, hasGoal, onPress }: { analysis: AiAnalysis | null; analyzing: boolean; hasGoal: boolean; onPress: () => void }) {
  const tone = analysis?.status ?? "idle";
  const statusLabel = analysis?.status === "danger" ? "PRECISA DE ATENÇÃO" : analysis?.status === "attention" ? "FIQUE DE OLHO" : analysis?.status === "ok" ? "MÊS NO EIXO" : "LEITURA DO MÊS";
  const title = analyzing ? "Lendo seus movimentos..." : analysis?.headline ?? (hasGoal ? "O que seus números estão dizendo?" : "Primeiro, conte onde quer chegar");
  const copy = analysis?.summary ?? (hasGoal ? "O Nenero cruza entradas, gastos fixos e seu objetivo para mostrar o que merece atenção." : "Defina um objetivo financeiro no perfil para receber uma análise conectada aos seus planos.");
  return <Pressable style={({ pressed }) => [styles.aiInsightCard, tone === "attention" && styles.aiInsightAttention, tone === "danger" && styles.aiInsightDanger, pressed && styles.pressed]} onPress={onPress} disabled={analyzing} accessibilityRole="button" accessibilityLabel={analysis ? "Abrir análise do mês" : "Analisar mês com inteligência artificial"}>
    <View style={styles.aiInsightHeader}><View style={[styles.aiInsightIcon, tone === "attention" && styles.aiInsightIconAttention, tone === "danger" && styles.aiInsightIconDanger]}>{analyzing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <MaterialCommunityIcons name="creation" size={21} color="#FFFFFF" />}</View><Text style={styles.aiInsightEyebrow}>{statusLabel}</Text><View style={styles.aiInsightAction}><Text style={styles.aiInsightActionText}>{analysis ? "Abrir" : hasGoal ? "Analisar" : "Configurar"}</Text><Feather name="arrow-up-right" size={14} color={COLORS.grape} /></View></View>
    <Text style={styles.aiInsightTitle}>{title}</Text>
    <Text style={styles.aiInsightText} numberOfLines={3}>{copy}</Text>
  </Pressable>;
}

function Tools({ onLifeCalculator }: { onLifeCalculator: () => void }) {
  return <>
    <PageHeader eyebrow="DECISÕES COM MAIS CONTEXTO" title="Ferramentas" button="" onPress={() => {}} hideButton />
    <Text style={styles.toolsIntro}>Calculadoras para transformar preço, tempo e metas em escolhas mais claras.</Text>
    <Pressable style={({ pressed }) => [styles.toolFeaturedCard, pressed && styles.pressed]} onPress={onLifeCalculator}>
      <View style={styles.toolFeaturedTop}><View style={styles.toolFeaturedIcon}><Feather name="clock" size={25} color="#FFFFFF" /></View><View style={styles.toolAvailableBadge}><Text style={styles.toolAvailableText}>DISPONÍVEL</Text></View></View>
      <Text style={styles.toolFeaturedEyebrow}>CALCULADORA DE VIDA GASTA</Text>
      <Text style={styles.toolFeaturedTitle}>Quanto trabalho custa essa compra?</Text>
      <Text style={styles.toolFeaturedText}>Converta o preço em horas e dias da sua vida profissional antes de decidir.</Text>
      <View style={styles.toolOpenLine}><Text style={styles.toolOpenText}>Abrir calculadora</Text><Feather name="arrow-right" size={17} color={COLORS.lime} /></View>
    </Pressable>
    <Text style={styles.toolsComingTitle}>Em preparação</Text>
    <View style={styles.toolsComingGrid}>
      <View style={styles.toolComingCard}><View style={styles.toolComingIcon}><MaterialCommunityIcons name="target" size={21} color={COLORS.grape} /></View><Text style={styles.toolComingName}>Plano de metas</Text><Text style={styles.toolComingText}>Descubra quanto guardar por mês.</Text><Text style={styles.toolComingBadge}>EM BREVE</Text></View>
      <View style={styles.toolComingCard}><View style={styles.toolComingIcon}><MaterialCommunityIcons name="scale-balance" size={21} color={COLORS.grape} /></View><Text style={styles.toolComingName}>Comprar ou esperar</Text><Text style={styles.toolComingText}>Compare impacto e prioridade.</Text><Text style={styles.toolComingBadge}>EM BREVE</Text></View>
    </View>
  </>;
}

function Movements({ entries, wallets, cards, onAdd, onEdit }: { entries: Entry[]; wallets: Wallet[]; cards: CreditCard[]; onAdd: () => void; onEdit: (entry: Entry) => void }) {
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
    (walletFilter === "all" || entry.walletId === walletFilter || entry.cardId === walletFilter)
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
          <Feather name="sliders" size={18} color={filtersVisible ? "#FFFFFF" : COLORS.grape} />
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
          {cards.map(card => (
            <Pressable key={card.id} style={[styles.filterChip, walletFilter === card.id && styles.filterChipActive]} onPress={() => setWalletFilter(card.id)}>
              <View style={[styles.filterDot, { backgroundColor: card.color }]} />
              <Text style={[styles.filterChipText, walletFilter === card.id && styles.filterChipTextActive]}>{card.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>}

      {filteredEntries.length > 0 ? (
        <View style={styles.listCard}>
          {filteredEntries.map((entry, i) => <EntryRow key={entry.id} entry={entry} wallet={wallets.find(wallet => wallet.id === entry.walletId)} card={cards.find(card => card.id === entry.cardId)} last={i === filteredEntries.length - 1} onEdit={entry.invoicePaymentKey ? undefined : () => onEdit(entry)} />)}
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

function WalletList({ walletBalances, pots, dreamsBalance, cards, invoices, onAdd, onEdit, onAddCard, onEditCard, onPayInvoice, onReopenInvoice, onOpenDreams }: { walletBalances: WalletBalance[]; pots: SavingsPot[]; dreamsBalance: number; cards: CreditCard[]; invoices: CardInvoice[]; onAdd: () => void; onEdit: (wallet: Wallet) => void; onAddCard: () => void; onEditCard: (card: CreditCard) => void; onPayInvoice: (invoice: CardInvoice) => void; onReopenInvoice: (invoice: CardInvoice) => void; onOpenDreams: () => void }) {
  const savingsGoals = pots.filter((pot) => pot.type !== "debt");
  return (
    <>
      <PageHeader eyebrow="CADA REAL NO SEU CANTO" title="Carteiras" button="Criar" onPress={onAdd} />
      {walletBalances.map(({ wallet, balance }) => (
        <Pressable key={wallet.id} style={[styles.walletCard, { backgroundColor: wallet.color }]} onPress={() => onEdit(wallet)} accessibilityLabel={`Editar carteira ${wallet.name}`}>
          <View style={styles.walletTop}><Feather name="credit-card" size={22} color="white" /><View style={styles.walletEditBadge}><Feather name="edit-2" size={14} color="white" /></View></View>
          <Text style={styles.walletName}>{wallet.name}</Text>
          <Text style={styles.walletBalance}>{money(balance)}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.dashedButton} onPress={onAdd}><Feather name="plus" size={20} color={COLORS.grape} /><Text style={styles.dashedText}>Criar outra carteira</Text></Pressable>
      <SectionTitle title="Cartões de crédito" />
      {cards.map((card) => {
        const cardInvoices = invoices.filter((invoice) => invoice.cardId === card.id);
        const openTotal = cardInvoices.filter((invoice) => !invoice.paid).reduce((sum, invoice) => sum + invoice.total, 0);
        const availableLimit = card.limit - openTotal;
        return <View key={card.id} style={styles.creditCardBlock}>
          <Pressable style={[styles.creditCardFace, { backgroundColor: card.color }]} onPress={() => onEditCard(card)} accessibilityLabel={`Editar cartão ${card.name}`}>
            <View style={styles.walletTop}><MaterialCommunityIcons name="contactless-payment-circle-outline" size={24} color="#FFFFFF" /><View style={styles.walletEditBadge}><Feather name="edit-2" size={14} color="#FFFFFF" /></View></View>
            <Text style={styles.walletName}>{card.name}</Text>
            <Text style={styles.creditCardAvailable}>{money(availableLimit)} disponíveis</Text>
            <Text style={styles.creditCardMeta}>Fecha dia {card.closingDay} · vence dia {card.dueDay} · limite {money(card.limit)}</Text>
          </Pressable>
          {cardInvoices.length ? <View style={styles.invoiceList}>{cardInvoices.map((invoice) => <View key={invoice.key} style={styles.invoiceRow}>
            <View style={styles.invoiceDateBadge}><Text style={styles.invoiceDateDay}>{new Date(invoice.dueDate).getDate()}</Text><Text style={styles.invoiceDateMonth}>{new Date(invoice.dueDate).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</Text></View>
            <View style={styles.flex}><Text style={styles.invoiceTitle}>Fatura de {new Date(invoice.dueDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</Text><Text style={styles.invoiceMeta}>{invoice.entries.length} {invoice.entries.length === 1 ? "compra" : "compras"} · {invoice.paid ? "paga" : "em aberto"}</Text></View>
            <Text style={styles.invoiceValue}>{money(invoice.total)}</Text>
            <Pressable style={[styles.invoicePayButton, invoice.paid && styles.invoiceReopenButton]} onPress={() => invoice.paid ? onReopenInvoice(invoice) : onPayInvoice(invoice)}><Feather name={invoice.paid ? "rotate-ccw" : "check"} size={13} color={invoice.paid ? COLORS.grape : "#FFFFFF"} /><Text style={[styles.invoicePayButtonText, invoice.paid && styles.invoiceReopenButtonText]}>{invoice.paid ? "Desfazer" : "Pagar"}</Text></Pressable>
          </View>)}</View> : <Text style={styles.emptySectionText}>Nenhuma compra lançada neste cartão.</Text>}
        </View>;
      })}
      <Pressable style={styles.dashedButton} onPress={onAddCard}><Feather name="plus" size={20} color={COLORS.grape} /><Text style={styles.dashedText}>Adicionar cartão de crédito</Text></Pressable>
      {savingsGoals.length > 0 && <Pressable style={styles.dreamWalletPressable} onPress={onOpenDreams}>
        <LinearGradient colors={["#2B214D", "#6540C8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dreamWalletCard}>
          <View style={styles.dreamWalletTop}><View style={styles.dreamWalletIcon}><MaterialCommunityIcons name="star-four-points" size={22} color={COLORS.mark} /></View><View style={styles.dreamWalletAutoBadge}><Text style={styles.dreamWalletAutoText}>CARTEIRA AUTOMÁTICA</Text></View></View>
          <Text style={styles.dreamWalletLabel}>Meus sonhos</Text><Text style={styles.dreamWalletBalance}>{money(dreamsBalance)}</Text>
          <Text style={styles.dreamWalletCopy}>{savingsGoals.length} {savingsGoals.length === 1 ? "meta guardando um plano" : "metas guardando seus planos"}. Esse dinheiro continua seu, só saiu da rota do impulso.</Text>
          <View style={styles.dreamWalletOpen}><Text style={styles.dreamWalletOpenText}>Ver minhas metas</Text><Feather name="arrow-up-right" size={16} color={COLORS.lime} /></View>
        </LinearGradient>
      </Pressable>}
    </>
  );
}

function SavingsPotList({ pots, wallets, onAdd, onDeposit, onDelete }: { pots: SavingsPot[]; wallets: Wallet[]; onAdd: () => void; onDeposit: (pot: SavingsPot) => void; onDelete: (pot: SavingsPot) => void }) {
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
        const sourceWalletNames = [...new Set(pot.contributions.map((contribution) => wallets.find((wallet) => wallet.id === contribution.walletId)?.name).filter((name): name is string => Boolean(name)))];
        return (
          <View key={pot.id} style={styles.potCard}>
            <View style={styles.potTop}>
              <View style={styles.potIcon}><MaterialCommunityIcons name={pot.type === "debt" ? "receipt-text-outline" : "piggy-bank-outline"} size={25} color={COLORS.grape} /></View>
              <View style={styles.flex}><Text style={styles.potName}>{pot.name}</Text><Text style={styles.potDescription}>{pot.description || "Um objetivo com lugar marcado."}</Text></View>
              <View style={styles.potTopActions}><Text style={styles.potPercent}>{progress}%</Text><Pressable accessibilityLabel={`Apagar cofrinho ${pot.name}`} style={styles.potDeleteIcon} onPress={() => onDelete(pot)}><Feather name="trash-2" size={15} color={COLORS.danger} /></Pressable></View>
            </View>
            <View style={styles.potProgressTrack}><View style={[styles.potProgressFill, { width: `${progress}%` }]} /></View>
            <View style={styles.potValues}>
              <View><Text style={styles.potValueLabel}>{pot.type === "debt" ? "JÁ PAGOU" : "JÁ GUARDOU"}</Text><Text style={styles.potSaved}>{money(saved)}</Text></View>
              <View style={styles.potGoalBlock}><Text style={styles.potValueLabel}>{pot.type === "debt" ? "DÍVIDA TOTAL" : "META"}</Text><Text style={styles.potGoal}>{money(pot.goal)}</Text></View>
            </View>
            <Text style={styles.potPlan}>{money(monthlyTarget)}/mês · até {deadline.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</Text>
            {pot.compoundInterest && <View style={styles.potYieldBadge}><Feather name="trending-up" size={13} color={COLORS.teal} /><Text style={styles.potYieldText}>{(realMonthlyRate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}% ao mês, já descontada a inflação</Text></View>}
            {!!sourceWalletNames.length && <View style={styles.potSourceLine}><Feather name="corner-down-right" size={13} color={COLORS.muted} /><Text style={styles.potSourceText} numberOfLines={1}>{pot.type === "debt" ? "Pago por " : "Veio de "}{sourceWalletNames.join(", ")}</Text></View>}
            {remaining > 0 ? (
              <Pressable style={styles.potDepositButton} onPress={() => onDeposit(pot)}><Feather name={pot.type === "debt" ? "credit-card" : "plus"} size={17} color="white" /><Text style={styles.potDepositButtonText}>{pot.type === "debt" ? "Registrar pagamento" : "Colocar dinheiro"}</Text></Pressable>
            ) : (
              <View style={styles.potComplete}><Feather name="check-circle" size={17} color={COLORS.success} /><Text style={styles.potCompleteText}>{pot.type === "debt" ? "Dívida quitada. Que alívio!" : "Meta batida. Esse porquinho está forte!"}</Text></View>
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

function PageHeader({ eyebrow, title, button, onPress, hideButton = false }: { eyebrow: string; title: string; button: string; onPress: () => void; hideButton?: boolean }) {
  return <View style={styles.pageHeader}><View><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.h1}>{title}</Text></View>{!hideButton && <Pressable style={styles.smallButton} onPress={onPress}><Feather name="plus" size={16} color="white" /><Text style={styles.smallButtonText}>{button}</Text></Pressable>}</View>;
}

function EntryRow({ entry, wallet, card, last, onEdit }: { entry: Entry; wallet?: Wallet; card?: CreditCard; last: boolean; onEdit?: () => void }) {
  const visual = getCategoryVisual(entry.category, entry.kind);
  const effectiveInvoiceDueDate = card ? getEntryInvoiceDueDate(entry, card) : undefined;
  const invoiceLabel = card && effectiveInvoiceDueDate
    ? `${card.name} · fatura ${effectiveInvoiceDueDate.toLocaleDateString("pt-BR", { month: "short" })}`
    : undefined;
  return (
    <View style={[styles.entryRow, !last && styles.entryBorder]}>
      <View style={[styles.entryIcon, { backgroundColor: visual.background, borderColor: visual.border }]}><MaterialCommunityIcons name={visual.icon} size={20} color={visual.color} /></View>
      <View style={styles.entryContent}>
        <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">{entry.title}</Text>
        <Text style={styles.entryDateText}>{new Date(entry.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</Text>
        {!card && wallet && <View style={styles.entryWallet}><View style={[styles.entryWalletDot, { backgroundColor: wallet.color }]} /><Text style={styles.entryWalletText} numberOfLines={1} ellipsizeMode="tail">{wallet.name}</Text></View>}
      </View>
      <View style={styles.entryAmountBlock}>
        <Text style={[styles.rowValue, entry.kind === "income" && styles.income]} numberOfLines={1}>{entry.kind === "income" ? "+" : "−"} {money(entry.value)}</Text>
        {invoiceLabel && <Text style={styles.entryInvoiceText} numberOfLines={1} ellipsizeMode="tail">{invoiceLabel}</Text>}
      </View>
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
    { key: "carteiras", label: "Carteiras", icon: "credit-card" }, { key: "ferramentas", label: "Ferramentas", icon: "tool" },
  ];
  return <View style={styles.nav}>{tabs.map((item) => <Pressable key={item.key} style={styles.navItem} onPress={() => setTab(item.key)}><Feather name={item.icon} size={21} color={tab === item.key ? COLORS.grape : COLORS.muted} /><Text style={[styles.navLabel, tab === item.key && styles.navActive]}>{item.label}</Text>{tab === item.key && <View style={styles.navDot} />}</Pressable>)}</View>;
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

  const changeMoney = (text: string) => {
    const formatted = formatMoneyDigitsInput(text);
    const nextPosition = formatted.length;
    setMoneySelection({ start: nextPosition, end: nextPosition });
    onChange(formatted);
  };

  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput
    style={styles.input}
    value={value}
    onChangeText={isMoney ? changeMoney : onChange}
    onFocus={() => {
      if (!isMoney) return;
      const position = value.length;
      setMoneySelection({ start: position, end: position });
    }}
    onSelectionChange={isMoney ? (event) => {
      const selection = event.nativeEvent.selection;
      const position = value.length;
      if (selection.start !== position || selection.end !== position) setMoneySelection({ start: position, end: position });
    } : undefined}
    selection={isMoney ? moneySelection : undefined}
    placeholder={placeholder}
    placeholderTextColor={COLORS.placeholder}
    keyboardType={keyboardType}
    secureTextEntry={secureTextEntry}
    autoCapitalize={keyboardType === "email-address" ? "none" : undefined}
    autoCorrect={keyboardType === "email-address" ? false : undefined}
  /></View>;
}

function CategoryChip({ category, kind, selected, onPress }: { category: string; kind: EntryKind; selected: boolean; onPress: () => void }) {
  const visual = getCategoryVisual(category, kind);
  return <Pressable style={[styles.chip, { borderColor: visual.border }, selected && { backgroundColor: visual.color, borderColor: visual.color }]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Categoria ${category}`}><MaterialCommunityIcons name={visual.icon} size={15} color={selected ? "#FFFFFF" : visual.color} /><Text style={[styles.chipText, selected && styles.chipTextActive]}>{category}</Text></Pressable>;
}

function EntryModal({ visible, wallets, cards, item, onClose, onSave, onDelete }: { visible: boolean; wallets: Wallet[]; cards: CreditCard[]; item: Entry | null; onClose: () => void; onSave: (entry: Omit<Entry, "id">) => void; onDelete?: () => void }) {
  const today = new Date();
  const [kind, setKind] = useState<EntryKind>("expense"); const [title, setTitle] = useState(""); const [value, setValue] = useState(""); const [category, setCategory] = useState(expenseCategories[0]!); const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [paymentSource, setPaymentSource] = useState<"wallet" | "card">("wallet");
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [referenceMonth, setReferenceMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [referenceDay, setReferenceDay] = useState(String(today.getDate()));
  const activeCategories = categoriesByKind[kind];
  const parsedDay = Number(referenceDay);
  const maxDay = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth() + 1, 0).getDate();
  const referenceDate = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth(), parsedDay, 12);
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  const validDate = Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= maxDay && referenceDate <= todayEnd;
  const referenceMonthLabel = referenceMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const isCurrentReferenceMonth = referenceMonth.getFullYear() === today.getFullYear() && referenceMonth.getMonth() === today.getMonth();
  const changeReferenceMonth = (amount: number) => {
    const next = new Date(referenceMonth.getFullYear(), referenceMonth.getMonth() + amount, 1);
    const nextIsFuture = next.getFullYear() > today.getFullYear() || (next.getFullYear() === today.getFullYear() && next.getMonth() > today.getMonth());
    if (nextIsFuture) return;
    const nextMaxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const allowedMaxDay = next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth()
      ? Math.min(nextMaxDay, today.getDate())
      : nextMaxDay;
    setReferenceDay((currentDay) => String(Math.min(Math.max(Number(currentDay) || 1, 1), allowedMaxDay)));
    setReferenceMonth(next);
  };
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
    setPaymentSource(item?.cardId ? "card" : "wallet");
    setCardId(item?.cardId ?? cards[0]?.id ?? "");
    setReferenceMonth(new Date(itemDate.getFullYear(), itemDate.getMonth(), 1));
    setReferenceDay(String(itemDate.getDate()));
  }, [visible, item, wallets, cards]);
  const changeKind = (nextKind: EntryKind) => { setKind(nextKind); if (nextKind === "income") setPaymentSource("wallet"); setCategory((current) => categoriesByKind[nextKind].includes(current) ? current : categoriesByKind[nextKind][0]!); };
  const selectedCard = cards.find((card) => card.id === cardId);
  const validPaymentSource = kind === "income" || paymentSource === "wallet" ? Boolean(walletId) : Boolean(selectedCard);
  const save = () => {
    const parsed = parseMoneyInput(value);
    if (!title.trim() || parsed <= 0 || !validPaymentSource || !validDate) return;
    const isCardPurchase = kind === "expense" && paymentSource === "card" && selectedCard;
    const dueDate = isCardPurchase ? getInvoiceDueDate(selectedCard, referenceDate).toISOString() : undefined;
    onSave({ title: title.trim(), value: parsed, kind, category, walletId: isCardPurchase ? selectedCard.paymentWalletId : walletId, createdAt: referenceDate.toISOString(), cardId: isCardPurchase ? selectedCard.id : undefined, invoiceDueDate: dueDate, invoicePaymentKey: item?.invoicePaymentKey });
  };
  return <Sheet visible={visible} title={item ? "Editar movimentação" : "Novo lançamento"} subtitle={item ? "Corrija os dados sem criar outro lançamento." : "Conta pra gente por onde o dinheiro passeou."} onClose={onClose}>
    <View style={styles.segment}><Pressable style={[styles.segmentItem, kind === "expense" && styles.segmentActive]} onPress={() => changeKind("expense")}><Text style={[styles.segmentText, kind === "expense" && styles.segmentActiveText]}>Gasto</Text></Pressable><Pressable style={[styles.segmentItem, kind === "income" && styles.segmentActive]} onPress={() => changeKind("income")}><Text style={[styles.segmentText, kind === "income" && styles.segmentActiveText]}>Entrada</Text></Pressable></View>
    <Field label={kind === "income" ? "De onde veio?" : "O que foi?"} value={title} onChange={setTitle} placeholder={kind === "income" ? "Ex.: pagamento de projeto" : "Ex.: almoço, mercado..."} />
    <Field label="Quanto?" value={value} onChange={setValue} placeholder="R$ 0,00" keyboardType="decimal-pad" money />
    <Text style={styles.fieldLabel}>Data de referência</Text>
    <View style={styles.referenceDateRow}>
      <View style={styles.dayField}><Text style={styles.miniFieldLabel}>DIA</Text><TextInput style={styles.dayInput} value={referenceDay} onChangeText={setReferenceDay} keyboardType="number-pad" maxLength={2} /></View>
      <View style={styles.referenceMonthPicker}>
        <Pressable style={styles.referenceArrow} onPress={() => changeReferenceMonth(-1)} accessibilityLabel="Mês anterior"><Feather name="chevron-left" size={18} color={COLORS.grape} /></Pressable>
        <Text style={styles.referenceMonthText}>{referenceMonthLabel}</Text>
        <Pressable style={[styles.referenceArrow, isCurrentReferenceMonth && styles.buttonDisabled]} onPress={() => changeReferenceMonth(1)} disabled={isCurrentReferenceMonth} accessibilityLabel="Próximo mês"><Feather name="chevron-right" size={18} color={COLORS.grape} /></Pressable>
      </View>
    </View>
    {!validDate && <Text style={styles.dateError}>{parsedDay > maxDay ? `Esse mês tem apenas ${maxDay} dias.` : referenceDate > todayEnd ? "Lançamentos futuros devem ser criados em Planejados." : "Informe um dia válido."}</Text>}
    <Text style={styles.fieldLabel}>{kind === "income" ? "Tipo de entrada" : "Categoria"}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{activeCategories.map(c => <CategoryChip key={c} category={c} kind={kind} selected={category === c} onPress={() => setCategory(c)} />)}</ScrollView>
    {kind === "expense" && <><Text style={styles.fieldLabel}>Como pagou?</Text><View style={styles.segment}><Pressable style={[styles.segmentItem, paymentSource === "wallet" && styles.segmentActive]} onPress={() => setPaymentSource("wallet")}><Text style={[styles.segmentText, paymentSource === "wallet" && styles.segmentActiveText]}>Dinheiro / débito</Text></Pressable><Pressable style={[styles.segmentItem, paymentSource === "card" && styles.segmentActive]} onPress={() => setPaymentSource("card")}><Text style={[styles.segmentText, paymentSource === "card" && styles.segmentActiveText]}>Cartão de crédito</Text></Pressable></View></>}
    {(kind === "income" || paymentSource === "wallet") ? <><Text style={styles.fieldLabel}>Carteira</Text><View style={styles.walletOptions}>{wallets.map(w => <Pressable key={w.id} style={[styles.walletOption, walletId === w.id && styles.walletOptionActive]} onPress={() => setWalletId(w.id)}><View style={[styles.colorDot, { backgroundColor: w.color }]} /><Text style={styles.walletOptionText}>{w.name}</Text>{walletId === w.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View></> : <><Text style={styles.fieldLabel}>Cartão</Text><View style={styles.walletOptions}>{cards.map(card => <Pressable key={card.id} style={[styles.walletOption, cardId === card.id && styles.walletOptionActive]} onPress={() => setCardId(card.id)}><View style={[styles.colorDot, { backgroundColor: card.color }]} /><View style={styles.flex}><Text style={styles.walletOptionText}>{card.name}</Text><Text style={styles.cardOptionMeta}>Fecha dia {card.closingDay} · vence dia {card.dueDay}</Text></View>{cardId === card.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View>{!cards.length && <Text style={styles.dateError}>Crie um cartão em Carteiras antes de lançar uma compra no crédito.</Text>}{selectedCard && <View style={styles.invoicePreview}><Feather name="calendar" size={15} color={COLORS.grape} /><Text style={styles.invoicePreviewText}>Esta compra entra na fatura de {getInvoiceDueDate(selectedCard, referenceDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}.</Text></View>}</>}
    <PrimaryButton label={item ? "Salvar alterações" : "Salvar lançamento"} onPress={save} disabled={!title.trim() || !value || !validDate || !validPaymentSource} />
    {item && onDelete && <Pressable style={styles.deleteEntryButton} onPress={onDelete}><Feather name="trash-2" size={17} color={COLORS.danger} /><Text style={styles.deleteEntryButtonText}>Excluir {item.kind === "income" ? "entrada" : "gasto"}</Text></Pressable>}
  </Sheet>;
}

function WalletModal({ visible, item, onClose, onSave, onDelete }: { visible: boolean; item: Wallet | null; onClose: () => void; onSave: (wallet: Omit<Wallet, "id">) => void; onDelete?: () => void }) {
  const [name, setName] = useState(""); const [initial, setInitial] = useState(""); const [color, setColor] = useState(walletPalette[0]!);
  useEffect(() => { if (visible) { setName(item?.name ?? ""); setInitial(""); setColor(item?.color ?? walletPalette[0]!); } }, [visible, item]);
  const save = () => { const parsed = item?.initial ?? (parseMoneyInput(initial) || 0); if (name.trim()) onSave({ name: name.trim(), initial: parsed, color }); };
  return <Sheet visible={visible} title={item ? "Editar carteira" : "Nova carteira"} subtitle={item ? "Ajuste o nome e a cor sem mexer na história do saldo." : "Um cantinho novo pro seu dinheiro."} onClose={onClose}>
    <Field label="Nome da carteira" value={name} onChange={setName} placeholder="Ex.: Conta do dia a dia" />
    {!item && <Field label="Saldo inicial" value={initial} onChange={setInitial} placeholder="R$ 0,00" keyboardType="decimal-pad" money />}
    <Text style={styles.fieldLabel}>Cor da carteira</Text>
    <View style={styles.walletColorPalette}>{walletPalette.map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: color === option }} accessibilityLabel={option === "#111111" ? "Cor preta" : `Cor ${option}`} style={[styles.walletColorOption, { backgroundColor: option }, color === option && styles.walletColorOptionActive]} onPress={() => setColor(option)}>{color === option && <Feather name="check" size={18} color="#FFFFFF" />}</Pressable>)}</View>
    <PrimaryButton label={item ? "Salvar alterações" : "Criar carteira"} onPress={save} disabled={!name.trim()} />
    {item && onDelete && <Pressable style={styles.deleteWalletButton} onPress={onDelete}><Feather name="trash-2" size={16} color={COLORS.danger} /><Text style={styles.deleteWalletButtonText}>Excluir carteira</Text></Pressable>}
  </Sheet>;
}

function CreditCardModal({ visible, wallets, item, onClose, onSave, onDelete }: { visible: boolean; wallets: Wallet[]; item: CreditCard | null; onClose: () => void; onSave: (card: Omit<CreditCard, "id" | "paidInvoiceKeys">) => void; onDelete?: () => void }) {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [color, setColor] = useState(walletPalette[2]!);
  const [paymentWalletId, setPaymentWalletId] = useState(wallets[0]?.id ?? "");
  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? "");
    setLimit(item ? formatMoneyInput(String(item.limit).replace(".", ",")) : "");
    setClosingDay(item ? String(item.closingDay) : "");
    setDueDay(item ? String(item.dueDay) : "");
    setColor(item?.color ?? walletPalette[2]!);
    setPaymentWalletId(item?.paymentWalletId ?? wallets[0]?.id ?? "");
  }, [visible, item, wallets]);
  const parsedLimit = parseMoneyInput(limit);
  const parsedClosingDay = Number(closingDay);
  const parsedDueDay = Number(dueDay);
  const valid = name.trim() && parsedLimit > 0 && parsedClosingDay >= 1 && parsedClosingDay <= 31 && parsedDueDay >= 1 && parsedDueDay <= 31 && paymentWalletId;
  return <Sheet visible={visible} title={item ? "Editar cartão" : "Novo cartão de crédito"} subtitle="Fechamento e vencimento dizem qual salário pagará cada compra." onClose={onClose}>
    <Field label="Nome do cartão" value={name} onChange={setName} placeholder="Ex.: Nubank" />
    <Field label="Limite" value={limit} onChange={setLimit} placeholder="R$ 5.000,00" keyboardType="decimal-pad" money />
    <View style={styles.cardDayFields}><View style={styles.flex}><Field label="Dia de fechamento" value={closingDay} onChange={setClosingDay} placeholder="Ex.: 20" keyboardType="number-pad" /></View><View style={styles.flex}><Field label="Dia de vencimento" value={dueDay} onChange={setDueDay} placeholder="Ex.: 27" keyboardType="number-pad" /></View></View>
    <Text style={styles.fieldLabel}>Conta usada para pagar a fatura</Text>
    <View style={styles.walletOptions}>{wallets.map((wallet) => <Pressable key={wallet.id} style={[styles.walletOption, paymentWalletId === wallet.id && styles.walletOptionActive]} onPress={() => setPaymentWalletId(wallet.id)}><View style={[styles.colorDot, { backgroundColor: wallet.color }]} /><Text style={styles.walletOptionText}>{wallet.name}</Text>{paymentWalletId === wallet.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View>
    {!wallets.length && <Text style={styles.dateError}>Crie uma carteira para indicar de onde a fatura será paga.</Text>}
    <Text style={styles.fieldLabel}>Cor do cartão</Text>
    <View style={styles.walletColorPalette}>{walletPalette.map((option) => <Pressable key={option} style={[styles.walletColorOption, { backgroundColor: option }, color === option && styles.walletColorOptionActive]} onPress={() => setColor(option)}>{color === option && <Feather name="check" size={18} color="#FFFFFF" />}</Pressable>)}</View>
    <PrimaryButton label={item ? "Salvar alterações" : "Criar cartão"} onPress={() => valid && onSave({ name: name.trim(), limit: parsedLimit, closingDay: parsedClosingDay, dueDay: parsedDueDay, color, paymentWalletId })} disabled={!valid} />
    {item && onDelete && <Pressable style={styles.deleteWalletButton} onPress={onDelete}><Feather name="trash-2" size={16} color={COLORS.danger} /><Text style={styles.deleteWalletButtonText}>Excluir cartão</Text></Pressable>}
  </Sheet>;
}

function FinancialSettingsModal({ visible, incomes, selectedIncomeId, onClose, onOpenPlanned, onSave }: { visible: boolean; incomes: Recurring[]; selectedIncomeId?: string; onClose: () => void; onOpenPlanned: () => void; onSave: (primaryIncomeId: string) => void }) {
  const [primaryIncomeId, setPrimaryIncomeId] = useState("");
  useEffect(() => {
    if (!visible) return;
    setPrimaryIncomeId(selectedIncomeId ?? incomes[0]?.id ?? "");
  }, [visible, selectedIncomeId, incomes]);
  const totalIncome = incomes.reduce((sum, item) => sum + item.value, 0);
  return <Sheet visible={visible} title="Ciclo das entradas" subtitle="Os valores vêm automaticamente da tela Planejados." onClose={onClose}>
    <View style={styles.cycleExplain}><MaterialCommunityIcons name="calendar-outline" size={24} color={COLORS.grape} /><Text style={styles.cycleExplainText}>Todas as entradas mensais ativas entram na projeção. A entrada principal abaixo define quando um ciclo termina e o próximo começa.</Text></View>
    {incomes.length ? <>
      <View style={styles.cycleIncomeSummary}><Text style={styles.cycleIncomeSummaryLabel}>Total mensal planejado</Text><Text style={styles.cycleIncomeSummaryValue}>{money(totalIncome)}</Text></View>
      <Text style={styles.fieldLabel}>Entrada principal do ciclo</Text>
      <View style={styles.walletOptions}>{incomes.map((income) => <Pressable key={income.id} accessibilityRole="radio" accessibilityState={{ checked: primaryIncomeId === income.id }} style={[styles.walletOption, primaryIncomeId === income.id && styles.walletOptionActive]} onPress={() => setPrimaryIncomeId(income.id)}><View style={styles.cycleIncomeDay}><Text style={styles.cycleIncomeDayNumber}>{income.day}</Text><Text style={styles.cycleIncomeDayLabel}>DIA</Text></View><View style={styles.flex}><Text style={styles.walletOptionText}>{income.title}</Text><Text style={styles.cycleIncomeValue}>{money(income.value)} por mês</Text></View>{primaryIncomeId === income.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View>
      <PrimaryButton label="Salvar ciclo" onPress={() => primaryIncomeId && onSave(primaryIncomeId)} disabled={!primaryIncomeId} />
    </> : <>
      <View style={styles.cycleEmptyState}><View style={styles.cycleEmptyIcon}><Feather name="calendar" size={22} color={COLORS.grape} /></View><Text style={styles.cycleEmptyTitle}>Nenhuma entrada planejada</Text><Text style={styles.cycleEmptyCopy}>Cadastre seu salário ou outra renda mensal. Depois disso, a projeção será calculada sem você precisar digitar o valor novamente.</Text></View>
      <PrimaryButton label="Ir para Planejados" onPress={onOpenPlanned} />
    </>}
  </Sheet>;
}

function RecurringModal({ visible, wallets, item, onClose, onSave, onDelete }: { visible: boolean; wallets: Wallet[]; item: Recurring | null; onClose: () => void; onSave: (item: Omit<Recurring, "id" | "active">) => void; onDelete?: () => void }) {
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
  const changeKind = (nextKind: EntryKind) => { setKind(nextKind); setCategory((current) => categoriesByKind[nextKind].includes(current) ? current : categoriesByKind[nextKind][0]!); };
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
      {kind === "income" && <View style={styles.autoPostNote}><Feather name="zap" size={16} color={COLORS.success} /><Text style={styles.autoPostText}>O valor será contabilizado na data programada, mesmo que o Nenero fique fechado naquele dia.</Text></View>}
    <PrimaryButton label={item ? "Salvar alterações" : kind === "income" ? "Programar entrada" : "Salvar gasto fixo"} onPress={save} disabled={!title.trim() || !value || !day || !walletId} />
    {item && onDelete && <Pressable style={styles.deleteEntryButton} onPress={onDelete}><Feather name="trash-2" size={17} color={COLORS.danger} /><Text style={styles.deleteEntryButtonText}>Excluir {item.kind === "income" ? "entrada planejada" : "gasto fixo"}</Text></Pressable>}
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
      placeholderTextColor={COLORS.placeholder}
      multiline
      maxLength={180}
      textAlignVertical="top"
    />
    <Field label={type === "debt" ? "Valor total da dívida" : "Quanto quer juntar?"} value={goalValue} onChange={setGoalValue} placeholder="R$ 1.800,00" keyboardType="decimal-pad" money />
    <Field label="Em quantos meses?" value={months} onChange={setMonths} placeholder="Ex.: 9" keyboardType="number-pad" />
    {type === "savings" && <View style={styles.interestToggleCard}><View style={styles.interestToggleCopy}><Text style={styles.interestToggleTitle}>Esta meta rende juros compostos?</Text><Text style={styles.interestToggleHint}>Ative para considerar o rendimento na projeção da meta.</Text></View><Switch value={compoundInterest} onValueChange={setCompoundInterest} trackColor={{ false: COLORS.line, true: COLORS.accentBorder }} thumbColor={compoundInterest ? COLORS.grape : "#FFFFFF"} /></View>}
    {compoundInterest && <View style={styles.interestFields}>
      <Field label="Rendimento ao mês (%)" value={monthlyInterestRate} onChange={setMonthlyInterestRate} placeholder="Ex.: 0,8" keyboardType="decimal-pad" />
      <Field label="Inflação ao ano (%) · opcional" value={annualInflationRate} onChange={setAnnualInflationRate} placeholder="Ex.: 4,5" keyboardType="decimal-pad" />
      {interestConfigValid && nominalRate > 0 && <View style={styles.realRateCard}><Feather name="shield" size={16} color={COLORS.teal} /><View style={{ flex: 1 }}><Text style={styles.realRateLabel}>RENDIMENTO REAL ESTIMADO</Text><Text style={styles.realRateValue}>{(realMonthlyRate * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}% ao mês</Text><Text style={styles.realRateHint}>Rendimento nominal menos o efeito composto da inflação anual.</Text></View></View>}
    </View>}
    {goal > 0 && parsedMonths > 0 && <View style={styles.potPreview}><Feather name={compoundInterest ? "trending-up" : "calendar"} size={17} color={COLORS.grape} /><Text style={styles.potPreviewText}>Para chegar lá: {money(monthlyTarget)} por mês{compoundInterest ? ", considerando o rendimento real." : "."}</Text></View>}
    <PrimaryButton label={type === "debt" ? "Criar meta de dívida" : "Criar meta"} onPress={() => valid && onSave({ type, name: name.trim(), description: description.trim(), goal, months: parsedMonths, compoundInterest: type === "savings" && compoundInterest, monthlyInterestRate: type === "savings" && compoundInterest ? nominalRate : 0, annualInflationRate: type === "savings" && compoundInterest ? inflationRate : 0 })} disabled={!valid} />
  </Sheet>;
}

function SavingsPotDepositModal({ visible, pot, walletBalances, dreamsBalance, onClose, onSave }: { visible: boolean; pot: SavingsPot | null; walletBalances: WalletBalance[]; dreamsBalance: number; onClose: () => void; onSave: (value: number, walletId: string) => void }) {
  const [customValue, setCustomValue] = useState("");
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [walletId, setWalletId] = useState("");
  useEffect(() => {
    if (visible) { setCustomValue(""); setSelectedValue(null); setWalletId(walletBalances.find((item) => item.balance > 0)?.wallet.id ?? walletBalances[0]?.wallet.id ?? ""); }
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
    <View style={styles.potTransferNote}><MaterialCommunityIcons name={isDebt ? "receipt" : "swap-horizontal"} size={19} color={COLORS.grape} /><Text style={styles.potTransferNoteText}>{isDebt ? "Este pagamento será registrado como uma saída na carteira escolhida e aparecerá nas movimentações com o destino da dívida." : "É uma transferência entre seus bolsos: diminui na carteira escolhida e aparece em “Meus sonhos”. Seu dinheiro total não muda."}</Text></View>
    <Text style={styles.fieldLabel}>Tirar de qual carteira?</Text>
    <View style={styles.potWalletOptions}>{walletBalances.map(({ wallet, balance }) => {
      const selected = wallet.id === walletId; const unavailable = balance <= 0;
      return <Pressable key={wallet.id} style={[styles.potWalletOption, selected && styles.potWalletOptionActive, unavailable && styles.potWalletOptionUnavailable]} onPress={() => setWalletId(wallet.id)} disabled={unavailable}><View style={[styles.potWalletColor, { backgroundColor: wallet.color }]}><Feather name="credit-card" size={14} color="#FFFFFF" /></View><View style={styles.flex}><Text style={styles.potWalletName}>{wallet.name}</Text><Text style={styles.potWalletBalance}>{unavailable ? "Sem saldo disponível" : `${money(balance)} disponíveis`}</Text></View>{selected && <View style={styles.potWalletCheck}><Feather name="check" size={14} color="#FFFFFF" /></View>}</Pressable>;
    })}</View>
    <Text style={styles.fieldLabel}>Escolha um valor rápido</Text>
    <View style={styles.quickDepositRow}>
      {[100, 150, 200].map(amount => <Pressable key={amount} style={[styles.quickDeposit, selectedValue === amount && styles.quickDepositActive]} onPress={() => { setSelectedValue(amount); setCustomValue(""); }}><Text style={[styles.quickDepositText, selectedValue === amount && styles.quickDepositTextActive]}>{money(amount)}</Text></Pressable>)}
    </View>
    <Field label="Outro valor" value={customValue} onChange={(text) => { setCustomValue(text); setSelectedValue(null); }} placeholder="R$ 0,00" keyboardType="decimal-pad" money />
    {exceedsGoal && <Text style={styles.potOverGoal}>{isDebt ? `O pagamento ultrapassa o saldo da dívida em ${money(value - remaining)}.` : `Esse aporte passa a meta em ${money(value - remaining)}.`}</Text>}
    {insufficientBalance && selectedWallet && <Text style={styles.potInsufficientText}>Faltam {money(value - selectedWallet.balance)} na carteira {selectedWallet.wallet.name}.</Text>}
    {canSave && selectedWallet && <View style={styles.potTransferPreview}><Text style={styles.potTransferPreviewLabel}>{isDebt ? "DEPOIS DO PAGAMENTO" : "DEPOIS DA TRANSFERÊNCIA"}</Text><Text style={styles.potTransferPreviewText}>{selectedWallet.wallet.name} fica com {money(selectedWallet.balance - value)} · {isDebt ? `restam ${money(remaining - value)} da dívida` : `Meus sonhos vai para ${money(dreamsBalance + value)}`}</Text></View>}
    <PrimaryButton label={isDebt ? `Pagar ${value > 0 ? money(value) : "um valor"}` : `Mover ${value > 0 ? money(value) : "dinheiro"} para o sonho`} onPress={() => canSave && onSave(value, walletId)} disabled={!canSave} />
  </Sheet>;
}

function SavingsPotDeleteModal({ visible, pot, wallets, onClose, onDelete }: { visible: boolean; pot: SavingsPot | null; wallets: Wallet[]; onClose: () => void; onDelete: (mode: "return" | "discard") => void }) {
  const principal = pot?.contributions.reduce((sum, contribution) => sum + contribution.value, 0) ?? 0;
  const saved = pot ? getSavingsPotBalance(pot) : 0;
  const sourceWallets = pot ? [...new Set(pot.contributions.map((contribution) => wallets.find((wallet) => wallet.id === contribution.walletId)?.name).filter((name): name is string => Boolean(name)))] : [];
  const walletCopy = sourceWallets.length ? sourceWallets.join(", ") : "as carteiras de origem";
  if (pot?.type === "debt") return <Sheet visible={visible} title={`Apagar dívida ${pot.name}?`} subtitle="Os pagamentos já lançados continuarão nas movimentações." onClose={onClose}>
    <View style={styles.potDeleteSummary}>
      <View style={styles.potDeleteSummaryIcon}><MaterialCommunityIcons name="receipt-text-outline" size={24} color={COLORS.grape} /></View>
      <View style={styles.flex}><Text style={styles.potDeleteSummaryLabel}>TOTAL JÁ PAGO</Text><Text style={styles.potDeleteSummaryValue}>{money(saved)}</Text><Text style={styles.potDeleteSummaryText}>{pot.contributions.length} pagamento{pot.contributions.length === 1 ? "" : "s"} registrado{pot.contributions.length === 1 ? "" : "s"}</Text></View>
    </View>
    <Pressable style={styles.potDeleteEmptyButton} onPress={() => onDelete("discard")}><Feather name="trash-2" size={16} color="#FFFFFF" /><Text style={styles.potDeleteEmptyButtonText}>Apagar meta de dívida</Text></Pressable>
    <Text style={styles.potDeleteWarning}>A meta será apagada, mas seu histórico financeiro será preservado.</Text>
  </Sheet>;
  return <Sheet visible={visible} title={`Apagar ${pot?.name ?? "cofrinho"}?`} subtitle="Escolha o que acontece com o dinheiro antes de excluir." onClose={onClose}>
    <View style={styles.potDeleteSummary}>
      <View style={styles.potDeleteSummaryIcon}><MaterialCommunityIcons name="piggy-bank-outline" size={24} color={COLORS.grape} /></View>
      <View style={styles.flex}><Text style={styles.potDeleteSummaryLabel}>VALOR DO COFRINHO</Text><Text style={styles.potDeleteSummaryValue}>{money(saved)}</Text><Text style={styles.potDeleteSummaryText}>{pot?.contributions.length ?? 0} aporte{(pot?.contributions.length ?? 0) === 1 ? "" : "s"} registrado{(pot?.contributions.length ?? 0) === 1 ? "" : "s"}</Text></View>
    </View>
    {principal > 0 ? <>
      <Pressable style={styles.potDeleteReturnButton} onPress={() => onDelete("return")}>
        <View style={styles.potDeleteChoiceIcon}><MaterialCommunityIcons name="swap-horizontal" size={21} color={COLORS.grape} /></View>
        <View style={styles.flex}><Text style={styles.potDeleteReturnTitle}>Devolver e apagar</Text><Text style={styles.potDeleteChoiceText}>Os aportes voltam para {walletCopy}{saved - principal >= 0.01 ? ", incluindo o rendimento calculado" : ""}.</Text></View>
        <Feather name="chevron-right" size={19} color={COLORS.grape} />
      </Pressable>
      <Pressable style={styles.potDeleteDiscardButton} onPress={() => onDelete("discard")}>
        <View style={styles.potDeleteDiscardIcon}><Feather name="trash-2" size={19} color={COLORS.danger} /></View>
        <View style={styles.flex}><Text style={styles.potDeleteDiscardTitle}>Apagar sem devolver</Text><Text style={styles.potDeleteChoiceText}>O histórico do cofrinho some e os valores não voltam ao saldo disponível.</Text></View>
      </Pressable>
    </> : <Pressable style={styles.potDeleteEmptyButton} onPress={() => onDelete("discard")}><Feather name="trash-2" size={16} color="#FFFFFF" /><Text style={styles.potDeleteEmptyButtonText}>Apagar cofrinho vazio</Text></Pressable>}
    <Text style={styles.potDeleteWarning}>Essa ação não pode ser desfeita.</Text>
  </Sheet>;
}

type PurchaseVerdict = {
  status: "worth_it" | "think_twice" | "not_worth_it";
  headline: string;
  explanation: string;
};

function LifeSpentCalculatorModal({ visible, entries, goal, savingsPots, onClose }: {
  visible: boolean;
  entries: Entry[];
  goal: string;
  savingsPots: SavingsPot[];
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
  const isSalary = (entry: Entry) => entry.kind === "income" && (
    entry.category.toLocaleLowerCase("pt-BR") === "renda" ||
    entry.category.toLocaleLowerCase("pt-BR") === "salário" ||
    entry.title.toLocaleLowerCase("pt-BR").includes("salário") ||
    entry.title.toLocaleLowerCase("pt-BR").includes("salario")
  );
  const monthlySalary = monthEntries.filter(isSalary).reduce((sum, entry) => sum + entry.value, 0);
  const monthlyExpenses = monthEntries.filter(entry => entry.kind === "expense" && !entry.invoicePaymentKey).reduce((sum, entry) => sum + entry.value, 0);
  const price = Number(priceText.replace(",", "."));
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
Salário realizado no mês: R$ ${monthlySalary}
Despesas realizadas no mês: R$ ${monthlyExpenses}
Horas mensais trabalhadas: ${monthlyHours}
Custo em tempo de trabalho, já calculado pelo app: ${Math.round(hours * 10) / 10} horas
Objetivo financeiro: ${goal.trim() || "não informado"}
Cofrinhos: ${JSON.stringify(pots)}

Seja preciso, direto e use no máximo uma alfinetada leve. Não decida apenas pelo
preço: considere o peso na renda, as despesas, as metas e o tempo de trabalho.
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

  const verdictColor = verdict?.status === "not_worth_it" ? COLORS.coral : verdict?.status === "think_twice" ? COLORS.warning : COLORS.success;
  return <Sheet visible={visible} title="Calculadora de vida gasta" subtitle="Converta preço em tempo de trabalho antes de passar o cartão." onClose={onClose}>
    <View style={styles.lifeSalaryCard}>
      <Text style={styles.lifeSalaryLabel}>SALÁRIO IDENTIFICADO NESTE MÊS</Text>
      <Text style={styles.lifeSalaryValue}>{money(monthlySalary)}</Text>
      <Text style={styles.lifeSalaryHint}>{monthlySalary > 0 ? `Sua hora vale aproximadamente ${money(hourlyIncome)}.` : "Cadastre uma entrada como Salário ou Renda para calcular."}</Text>
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

function BankImportModal({ visible, wallets, cards, existingEntries, onClose, onImport }: {
  visible: boolean;
  wallets: Wallet[];
  cards: CreditCard[];
  existingEntries: Entry[];
  onClose: () => void;
  onImport: (entries: Omit<Entry, "id">[]) => void;
}) {
  const [drafts, setDrafts] = useState<BankImportDraft[]>([]);
  const [fileInfo, setFileInfo] = useState<{ fileName: string; bankName: string; ignoredRows: number; validationMessage?: string } | null>(null);
  const [walletId, setWalletId] = useState("");
  const [cardId, setCardId] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setDrafts([]);
    setFileInfo(null);
    setWalletId(wallets[0]?.id ?? "");
    setCardId(cards[0]?.id ?? "");
    setInvoiceMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setReading(false);
    setError("");
    setExpandedId(null);
  }, [visible, wallets, cards]);
  const loadFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) throw new Error("Esse arquivo passou de 8 MB. Exporte um período menor e tente novamente.");
    const isPdf = file.type === "application/pdf" || file.name.toLocaleLowerCase().endsWith(".pdf");
    const statement = isPdf
      ? await parseInterInvoicePdf(await file.arrayBuffer(), file.name)
      : parseBankCsv(await file.text(), file.name);
    const importedIds = new Set(existingEntries.map((entry) => entry.importId).filter(Boolean));
    setDrafts(statement.transactions.map((transaction) => {
      const duplicate = importedIds.has(transaction.importId);
      return { ...transaction, duplicate, selected: !duplicate && !transaction.transferLike };
    }));
    setFileInfo({ fileName: file.name, bankName: statement.bankName, ignoredRows: statement.ignoredRows, validationMessage: statement.validationMessage });
  };
  const selectFile = () => {
    setError("");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.pdf,text/csv,text/plain,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setReading(true);
      try { await loadFile(file); } catch (fileError) {
        setDrafts([]);
        setFileInfo(null);
        setError(fileError instanceof Error ? fileError.message : "Não consegui ler esse arquivo.");
      } finally { setReading(false); }
    };
    input.click();
  };
  const updateDraft = (importId: string, changes: Partial<BankImportDraft>) => setDrafts((current) => current.map((draft) => draft.importId === importId ? { ...draft, ...changes } : draft));
  const changeDraftKind = (draft: BankImportDraft, kind: EntryKind) => {
    const nextCategories = categoriesByKind[kind];
    updateDraft(draft.importId, { kind, category: nextCategories.includes(draft.category) ? draft.category : nextCategories[0]! });
  };
  const selected = drafts.filter((draft) => draft.selected && !draft.duplicate);
  const income = selected.filter((draft) => draft.kind === "income").reduce((sum, draft) => sum + draft.value, 0);
  const expenses = selected.filter((draft) => draft.kind === "expense").reduce((sum, draft) => sum + draft.value, 0);
  const invalid = selected.some((draft) => !draft.title.trim());
  const invoiceImport = fileInfo?.bankName.includes("Fatura") ?? false;
  const selectedCard = cards.find((card) => card.id === cardId);
  const submit = () => {
    if (!fileInfo || !selected.length || invalid || (invoiceImport ? !selectedCard : !walletId)) return;
    const dueDate = selectedCard ? dateAtNoon(invoiceMonth.getFullYear(), invoiceMonth.getMonth(), selectedCard.dueDay).toISOString() : undefined;
    onImport(selected.map((draft) => ({ title: draft.title.trim(), value: draft.value, kind: draft.kind, category: draft.category, walletId: invoiceImport && selectedCard ? selectedCard.paymentWalletId : walletId, createdAt: draft.createdAt, cardId: invoiceImport && draft.kind === "expense" ? selectedCard?.id : undefined, invoiceDueDate: invoiceImport && draft.kind === "expense" ? dueDate : undefined, importId: draft.importId, importSource: fileInfo.bankName })));
  };
  return <Sheet visible={visible} title="Importar extrato ou fatura" subtitle="O banco entrega as linhas. Você dá a palavra final." onClose={onClose}>
    {!fileInfo ? <>
      <View style={styles.bankImportHero}>
        <View style={styles.bankImportHeroIcon}><MaterialCommunityIcons name="file-table-outline" size={30} color={COLORS.grape} /></View>
        <Text style={styles.bankImportHeroTitle}>Traga o arquivo, sem trazer a bagunça</Text>
        <Text style={styles.bankImportHeroText}>Extratos CSV do Inter e Nubank, faturas CSV do Nubank e faturas PDF do Inter. Tudo passa por revisão antes de entrar.</Text>
        <Pressable style={[styles.bankFileButton, reading && styles.buttonDisabled]} onPress={selectFile} disabled={reading}>{reading ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="upload" size={18} color="#FFFFFF" />}<Text style={styles.bankFileButtonText}>{reading ? "Lendo o arquivo..." : "Escolher CSV ou PDF"}</Text></Pressable>
      </View>
      <View style={styles.bankImportSafety}><Feather name="check-circle" size={17} color={COLORS.success} /><Text style={styles.bankImportSafetyText}>Nada entra automaticamente. Transferências suspeitas e linhas repetidas ficam desmarcadas.</Text></View>
      {error ? <View style={styles.bankImportError}><Feather name="alert-circle" size={17} color={COLORS.danger} /><Text style={styles.bankImportErrorText}>{error}</Text></View> : null}
    </> : <>
      <View style={styles.bankFileSummary}><MaterialCommunityIcons name="bank-outline" size={24} color={COLORS.grape} /><View style={styles.flex}><Text style={styles.bankFileBank}>{fileInfo.bankName}</Text><Text style={styles.bankFileName} numberOfLines={1}>{fileInfo.fileName}</Text></View><Pressable style={styles.bankFileChange} onPress={selectFile}><Text style={styles.bankFileChangeText}>Trocar</Text></Pressable></View>
      {fileInfo.validationMessage ? <View style={fileInfo.validationMessage.startsWith("Atenção") ? styles.bankReviewNotice : styles.bankImportSafety}><Feather name={fileInfo.validationMessage.startsWith("Atenção") ? "alert-triangle" : "check-circle"} size={17} color={fileInfo.validationMessage.startsWith("Atenção") ? COLORS.warning : COLORS.success} /><Text style={fileInfo.validationMessage.startsWith("Atenção") ? styles.bankReviewNoticeText : styles.bankImportSafetyText}>{fileInfo.validationMessage}</Text></View> : null}
      <Text style={styles.fieldLabel}>{invoiceImport ? "A qual cartão pertence esta fatura?" : "Em qual carteira esse extrato entra?"}</Text>
      <View style={styles.walletOptions}>{(invoiceImport ? cards : wallets).map((source) => <Pressable key={source.id} style={[styles.walletOption, (invoiceImport ? cardId : walletId) === source.id && styles.walletOptionActive]} onPress={() => invoiceImport ? setCardId(source.id) : setWalletId(source.id)}><View style={[styles.colorDot, { backgroundColor: source.color }]} /><Text style={styles.walletOptionText}>{source.name}</Text>{(invoiceImport ? cardId : walletId) === source.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View>
      {invoiceImport && <><Text style={styles.fieldLabel}>Mês de vencimento da fatura</Text><View style={styles.referenceMonthPicker}><Pressable style={styles.referenceArrow} onPress={() => setInvoiceMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><Feather name="chevron-left" size={18} color={COLORS.grape} /></Pressable><Text style={styles.referenceMonthText}>{invoiceMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</Text><Pressable style={styles.referenceArrow} onPress={() => setInvoiceMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><Feather name="chevron-right" size={18} color={COLORS.grape} /></Pressable></View><Text style={styles.invoiceImportHint}>Todas as compras selecionadas entrarão juntas nesta fatura, inclusive parcelas antigas.</Text></>}
      {!(invoiceImport ? cards.length : wallets.length) && <View style={styles.bankImportError}><Text style={styles.bankImportErrorText}>{invoiceImport ? "Crie o cartão em Carteiras antes de importar a fatura." : "Crie uma carteira antes de importar."}</Text></View>}
      <View style={styles.bankImportTotals}><View style={styles.bankImportTotalBlock}><Text style={styles.bankImportTotalLabel}>SELECIONADAS</Text><Text style={styles.bankImportTotalValue}>{selected.length}</Text></View><View style={styles.bankImportTotalBlock}><Text style={styles.bankImportTotalLabel}>ENTRADAS</Text><Text style={styles.bankImportTotalMoney}>+ {money(income)}</Text></View><View style={styles.bankImportTotalBlock}><Text style={styles.bankImportTotalLabel}>GASTOS</Text><Text style={styles.bankImportTotalMoney}>− {money(expenses)}</Text></View></View>
      {(drafts.some((draft) => draft.transferLike) || drafts.some((draft) => draft.duplicate) || fileInfo.ignoredRows > 0) && <View style={styles.bankReviewNotice}><MaterialCommunityIcons name="text-box-search-outline" size={19} color={COLORS.warning} /><Text style={styles.bankReviewNoticeText}>Linhas suspeitas, repetidas ou inválidas foram separadas. Revise antes de importar.</Text></View>}
      <View style={styles.bankReviewHeader}><Text style={styles.bankReviewTitle}>O que entra no Nenero?</Text><Pressable onPress={() => setDrafts((current) => current.map((draft) => ({ ...draft, selected: false })))}><Text style={styles.bankReviewActionText}>Limpar</Text></Pressable></View>
      <View style={styles.bankDraftList}>{drafts.map((draft) => {
        const visual = getCategoryVisual(draft.category, draft.kind);
        const expanded = expandedId === draft.importId;
        return <View key={draft.importId} style={[styles.bankDraftCard, !draft.selected && styles.bankDraftCardMuted, draft.duplicate && styles.bankDraftCardDuplicate]}>
          <View style={styles.bankDraftTop}><Pressable style={[styles.bankDraftCheck, draft.selected && styles.bankDraftCheckActive]} onPress={() => !draft.duplicate && updateDraft(draft.importId, { selected: !draft.selected })} disabled={draft.duplicate}>{draft.selected && <Feather name="check" size={14} color="#FFFFFF" />}</Pressable><View style={styles.flex}><TextInput style={styles.bankDraftTitleInput} value={draft.title} onChangeText={(title) => updateDraft(draft.importId, { title })} editable={!draft.duplicate} /><Text style={styles.bankDraftOriginal} numberOfLines={2}>{draft.originalDescription}</Text></View><View style={styles.bankDraftValueBlock}><Text style={[styles.bankDraftValue, draft.kind === "income" && styles.income]}>{draft.kind === "income" ? "+" : "−"} {money(draft.value)}</Text><Text style={styles.bankDraftDate}>{new Date(draft.createdAt).toLocaleDateString("pt-BR")}</Text></View></View>
          <View style={styles.bankDraftMeta}><View style={[styles.bankDraftCategory, { backgroundColor: visual.background }]}><MaterialCommunityIcons name={visual.icon} size={13} color={visual.color} /><Text style={[styles.bankDraftCategoryText, { color: visual.color }]}>{draft.category}</Text></View>{draft.transferLike && <Text style={styles.bankDraftReviewText}>REVISAR</Text>}{draft.duplicate && <Text style={styles.bankDraftDuplicateText}>JÁ IMPORTADA</Text>}<Pressable style={styles.bankDraftEdit} onPress={() => setExpandedId(expanded ? null : draft.importId)}><Feather name={expanded ? "chevron-up" : "edit-2"} size={14} color={COLORS.grape} /><Text style={styles.bankDraftEditText}>{expanded ? "Fechar" : "Editar"}</Text></Pressable></View>
          {expanded && <View style={styles.bankDraftEditor}><Text style={styles.fieldLabel}>Tipo</Text><View style={styles.segment}><Pressable style={[styles.segmentItem, draft.kind === "expense" && styles.segmentActive]} onPress={() => changeDraftKind(draft, "expense")}><Text style={[styles.segmentText, draft.kind === "expense" && styles.segmentActiveText]}>Gasto</Text></Pressable><Pressable style={[styles.segmentItem, draft.kind === "income" && styles.segmentActive]} onPress={() => changeDraftKind(draft, "income")}><Text style={[styles.segmentText, draft.kind === "income" && styles.segmentActiveText]}>Entrada</Text></Pressable></View><Text style={styles.fieldLabel}>Categoria</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categoriesByKind[draft.kind].map((category) => <CategoryChip key={category} category={category} kind={draft.kind} selected={draft.category === category} onPress={() => updateDraft(draft.importId, { category })} />)}</ScrollView></View>}
        </View>;
      })}</View>
      {invalid && <Text style={styles.bankImportValidation}>Toda movimentação selecionada precisa ter um nome.</Text>}
      <PrimaryButton label={`Importar ${selected.length} movimentações`} onPress={submit} disabled={!(invoiceImport ? cardId : walletId) || !selected.length || invalid} />
    </>}
  </Sheet>;
}

function ProfileModal({ visible, goal, userName, userEmail, userInitials, onClose, onNameSave, onPasswordChange, onImportBank, onSave, onSignOut, themeMode, onThemeChange }: {
  visible: boolean;
  goal: string;
  userName: string;
  userEmail: string;
  userInitials: string;
  onClose: () => void;
  onNameSave: (name: string) => Promise<void>;
  onPasswordChange: (currentPassword: string, newPassword: string) => Promise<void>;
  onImportBank: () => void;
  onSave: (goal: string) => void;
  onSignOut: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}) {
  const [draft, setDraft] = useState(goal);
  const [nameDraft, setNameDraft] = useState(userName === "você" ? "" : userName);
  const [nameError, setNameError] = useState("");
  const [nameSaveStatus, setNameSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaveStatus, setPasswordSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (!visible) return;
    setDraft(goal);
    setNameDraft(userName === "você" ? "" : userName);
    setNameError("");
    setNameSaveStatus("idle");
    setPasswordEditorOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
    setPasswordError("");
    setPasswordSaveStatus("idle");
  }, [visible, goal, userName]);
  const saveName = async () => {
    const normalizedName = nameDraft.trim().slice(0, 40);
    const currentName = userName === "você" ? "" : userName.trim().slice(0, 40);
    if (!normalizedName) {
      setNameError("Digite um nome para continuar.");
      setNameSaveStatus("idle");
      return;
    }
    setNameDraft(normalizedName);
    if (normalizedName === currentName) {
      setNameError("");
      setNameSaveStatus("idle");
      return;
    }
    setNameSaveStatus("saving");
    setNameError("");
    try {
      await onNameSave(normalizedName);
      setNameSaveStatus("saved");
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "Não foi possível salvar seu nome.");
      setNameSaveStatus("idle");
    }
  };
  const savePassword = async () => {
    if (!currentPassword) {
      setPasswordError("Digite sua senha atual.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setPasswordError("A confirmação não corresponde à nova senha.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("A nova senha precisa ser diferente da atual.");
      return;
    }
    setPasswordError("");
    setPasswordSaveStatus("saving");
    try {
      await onPasswordChange(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      setPasswordSaveStatus("saved");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Não foi possível alterar a senha.");
      setPasswordSaveStatus("idle");
    }
  };
  return <Sheet visible={visible} title="Seu perfil" subtitle="Diga ao Nenero onde você quer chegar." onClose={onClose}>
    <View style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{userInitials}</Text></View><View style={styles.flex}><Text style={styles.profileName} numberOfLines={1}>{userName}</Text><Text style={styles.profileMeta} numberOfLines={1}>{userEmail}</Text></View></View>
    <View style={styles.profileNameEditor}>
      <View style={styles.profileNameEditorHeader}>
        <Text style={styles.fieldLabel}>Como quer ser chamado?</Text>
        {nameSaveStatus === "saving" ? <View style={styles.profileNameStatus}><ActivityIndicator size="small" color={COLORS.grape} /><Text style={styles.profileNameStatusText}>Salvando...</Text></View> : null}
        {nameSaveStatus === "saved" ? <View style={styles.profileNameStatus}><Feather name="check-circle" size={13} color={COLORS.success} /><Text style={styles.profileNameSavedText}>Salvo</Text></View> : null}
      </View>
      <TextInput
        style={styles.input}
        value={nameDraft}
        onChangeText={(value) => { setNameDraft(value); setNameError(""); setNameSaveStatus("idle"); }}
        onBlur={() => { void saveName(); }}
        maxLength={40}
        placeholder="Seu primeiro nome"
        placeholderTextColor={COLORS.placeholder}
        autoCapitalize="words"
        returnKeyType="done"
      />
      {nameError ? <Text style={styles.profileNameError}>{nameError}</Text> : null}
    </View>
    <Text style={styles.fieldLabel}>Aparência</Text>
    <View style={styles.themeSelector}>{(["system", "light", "dark"] as ThemeMode[]).map((mode) => <Pressable key={mode} style={[styles.themeOption, themeMode === mode && styles.themeOptionActive]} onPress={() => onThemeChange(mode)}><Feather name={mode === "system" ? "monitor" : mode === "light" ? "sun" : "moon"} size={15} color={themeMode === mode ? "#FFFFFF" : COLORS.muted} /><Text style={[styles.themeOptionText, themeMode === mode && styles.themeOptionTextActive]}>{mode === "system" ? "Sistema" : mode === "light" ? "Claro" : "Escuro"}</Text></Pressable>)}</View>
    <Text style={styles.fieldLabel}>Meu objetivo financeiro</Text>
    <TextInput
      style={styles.goalInput}
      value={draft}
      onChangeText={setDraft}
      multiline
      maxLength={600}
      placeholder="Ex.: Quero guardar R$ 800 por mês para montar minha reserva de emergência e reduzir os gastos com delivery."
      placeholderTextColor={COLORS.placeholder}
      textAlignVertical="top"
    />
    <Text style={styles.goalHint}>Escreva como se estivesse conversando com alguém. A IA usará esse objetivo para avaliar o mês.</Text>
    <PrimaryButton label="Salvar objetivo" onPress={() => onSave(draft.trim())} disabled={!draft.trim()} />
    <View style={styles.profileSecuritySection}>
      <Text style={styles.profileDataEyebrow}>SEGURANÇA</Text>
      <Pressable style={styles.profileSecurityButton} onPress={() => { setPasswordEditorOpen((open) => !open); setPasswordError(""); setPasswordSaveStatus("idle"); }}>
        <View style={styles.profileSecurityIcon}><Feather name="lock" size={19} color={COLORS.grape} /></View>
        <View style={styles.flex}><Text style={styles.profileImportTitle}>Alterar senha</Text><Text style={styles.profileImportText}>Atualize a senha usada para entrar na sua conta.</Text></View>
        <Feather name={passwordEditorOpen ? "chevron-up" : "chevron-down"} size={20} color={COLORS.grape} />
      </Pressable>
      {passwordEditorOpen ? <View style={styles.passwordEditor}>
        <Text style={styles.fieldLabel}>Senha atual</Text>
        <TextInput style={styles.input} value={currentPassword} onChangeText={(value) => { setCurrentPassword(value); setPasswordError(""); setPasswordSaveStatus("idle"); }} placeholder="Digite sua senha atual" placeholderTextColor={COLORS.placeholder} secureTextEntry autoComplete="current-password" />
        <Text style={styles.fieldLabel}>Nova senha</Text>
        <TextInput style={styles.input} value={newPassword} onChangeText={(value) => { setNewPassword(value); setPasswordError(""); setPasswordSaveStatus("idle"); }} placeholder="Pelo menos 8 caracteres" placeholderTextColor={COLORS.placeholder} secureTextEntry autoComplete="new-password" />
        <Text style={styles.fieldLabel}>Confirmar nova senha</Text>
        <TextInput style={styles.input} value={passwordConfirmation} onChangeText={(value) => { setPasswordConfirmation(value); setPasswordError(""); setPasswordSaveStatus("idle"); }} placeholder="Digite novamente" placeholderTextColor={COLORS.placeholder} secureTextEntry autoComplete="new-password" onSubmitEditing={() => { void savePassword(); }} />
        {passwordError ? <Text style={styles.profileNameError}>{passwordError}</Text> : null}
        {passwordSaveStatus === "saved" ? <View style={styles.passwordSuccess}><Feather name="check-circle" size={16} color={COLORS.success} /><Text style={styles.passwordSuccessText}>Senha alterada com sucesso.</Text></View> : null}
        <PrimaryButton label={passwordSaveStatus === "saving" ? "Alterando senha..." : "Alterar senha"} onPress={() => { void savePassword(); }} disabled={passwordSaveStatus === "saving" || !currentPassword || !newPassword || !passwordConfirmation} />
      </View> : null}
    </View>
    <View style={styles.profileDataSection}>
      <Text style={styles.profileDataEyebrow}>TRAZER SEUS DADOS</Text>
      <Pressable style={styles.profileImportButton} onPress={onImportBank}>
        <View style={styles.profileImportIcon}><MaterialCommunityIcons name="file-table-outline" size={22} color={COLORS.grape} /></View>
          <View style={styles.flex}><Text style={styles.profileImportTitle}>Importar extrato ou fatura</Text><Text style={styles.profileImportText}>Extratos em CSV e faturas Nubank CSV ou Inter PDF, sempre com revisão.</Text></View>
        <Feather name="chevron-right" size={20} color={COLORS.grape} />
      </Pressable>
    </View>
    <Pressable style={styles.signOutButton} onPress={onSignOut}><Feather name="log-out" size={16} color={COLORS.danger} /><Text style={styles.signOutButtonText}>Sair desta conta</Text></Pressable>
  </Sheet>;
}

function AppLoadingScreen() {
  return <SafeAreaView style={styles.authSafe}>
    <StatusBar style={IS_DARK ? "light" : "dark"} />
    <View style={styles.loadingScreen}>
      <View style={styles.authBrandMark}><Text style={styles.authBrandFace}>◡</Text></View>
      <ActivityIndicator color={COLORS.grape} />
      <Text style={styles.loadingText}>Abrindo seu Nenero...</Text>
    </View>
  </SafeAreaView>;
}

function SupabaseSetupScreen() {
  return <SafeAreaView style={styles.authSafe}>
    <StatusBar style={IS_DARK ? "light" : "dark"} />
    <View style={styles.setupScreen}>
      <View style={styles.authBrandMark}><Text style={styles.authBrandFace}>◡</Text></View>
      <Text style={styles.authTitle}>Falta ligar a nuvem</Text>
      <Text style={styles.authSubtitle}>Configure estas variáveis antes de publicar o app:</Text>
      <View style={styles.setupCode}>
        <Text style={styles.setupCodeText}>EXPO_PUBLIC_SUPABASE_URL</Text>
        <Text style={styles.setupCodeText}>EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY</Text>
      </View>
    </View>
  </SafeAreaView>;
}

function OnboardingScreen({ onComplete }: { onComplete: (data: OnboardingData) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [walletName, setWalletName] = useState("");
  const [walletBalance, setWalletBalance] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [incomeDay, setIncomeDay] = useState("5");
  const [financialGoal, setFinancialGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const steps = [
    { eyebrow: "SEM CRACHÁ, PROMETEMOS", title: "Como te chamamos sem gritar “ei, você”?", copy: "Seu nome deixa os resumos mais pessoais. E evita que o Nenero invente um apelido duvidoso.", icon: "user" as const },
    { eyebrow: "A CASINHA DO DINHEIRO", title: "Onde seus reais tiram uma soneca?", copy: "Crie sua carteira principal. Vale conta corrente, dinheiro ou conta digital — só não vale “debaixo do colchão”.", icon: "credit-card" as const },
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
  const next = async () => {
    if (!valid) return;
    if (step < steps.length - 1) {
      setStep((value) => value + 1);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onComplete({
        name: name.trim(),
        walletName: walletName.trim(),
        walletBalance: parsedBalance,
        monthlyIncome: parsedIncome,
        incomeDay: parsedIncomeDay,
        financialGoal: financialGoal.trim(),
      });
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Não foi possível concluir a configuração.");
    } finally {
      setLoading(false);
    }
  };
  return <SafeAreaView style={styles.onboardingSafe}>
    <StatusBar style={IS_DARK ? "light" : "dark"} />
    <KeyboardAvoidingView style={styles.onboardingKeyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.onboardingTop}>
        <View style={styles.onboardingBrand}><View style={styles.brandMark}><Text style={styles.brandFace}>◡</Text></View><Text style={styles.brand}>nenero</Text></View>
        <Text style={styles.onboardingCount}>{step + 1}/{steps.length} · sem prova no final</Text>
      </View>
      <View style={styles.onboardingTrack}>{steps.map((_, index) => <View key={index} style={[styles.onboardingTrackPart, index <= step && styles.onboardingTrackPartActive]} />)}</View>
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
            {parsedIncome > 0 && parsedIncomeDay >= 1 && parsedIncomeDay <= 31 && <View style={styles.onboardingPreview}><Feather name="repeat" size={16} color={COLORS.success} /><Text style={styles.onboardingPreviewText}>Pode avisar os boletos: {money(parsedIncome)} serão programados todo dia {parsedIncomeDay} na carteira {walletName || "principal"}.</Text></View>}
          </>}
          {step === 3 && <>
            <Text style={styles.fieldLabel}>Meu objetivo financeiro</Text>
            <TextInput style={styles.onboardingGoalInput} value={financialGoal} onChangeText={setFinancialGoal} placeholder="Ex.: Quero montar uma reserva de emergência e reduzir os gastos por impulso." placeholderTextColor={COLORS.placeholder} multiline maxLength={600} textAlignVertical="top" />
            <View style={styles.onboardingReady}><View style={styles.onboardingReadyFace}><Text style={styles.onboardingReadyFaceText}>◡</Text></View><Text style={styles.onboardingReadyText}>Carteira, renda e objetivo vão entrar prontos. A parte de ficar milionário continua com você.</Text></View>
          </>}
          {error ? <Text style={styles.authError}>{error}</Text> : null}
        </View>
      </ScrollView>
      <View style={styles.onboardingFooter}>
        {step > 0 ? <Pressable style={styles.onboardingBack} onPress={() => setStep((value) => value - 1)} disabled={loading}><Feather name="arrow-left" size={18} color={COLORS.grape} /><Text style={styles.onboardingBackText}>Voltar</Text></Pressable> : <View style={styles.onboardingBackPlaceholder} />}
        <Pressable style={[styles.onboardingNext, (!valid || loading) && styles.buttonDisabled]} onPress={next} disabled={!valid || loading}><Text style={styles.onboardingNextText}>{loading ? "Salvando..." : step === steps.length - 1 ? "Bora organizar isso" : "Continuar"}</Text><Feather name={step === steps.length - 1 ? "check" : "arrow-right"} size={18} color="#FFFFFF" /></Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!supabase || !email.trim() || password.length < 6) return;
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (authError) setError(authError.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : authError.message);
    setLoading(false);
  };

  const valid = email.includes("@") && password.length >= 6;
  return <SafeAreaView style={styles.authSafe}>
    <StatusBar style={IS_DARK ? "light" : "dark"} />
    <KeyboardAvoidingView style={styles.authKeyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.authBrandRow}><View style={styles.authBrandMark}><Text style={styles.authBrandFace}>◡</Text></View><Text style={styles.authBrand}>nenero</Text></View>
        <Text style={styles.authTitle}>Seu dinheiro te esperou.</Text>
        <Text style={styles.authSubtitle}>Entre para acessar seus dados em qualquer aparelho.</Text>
        <View style={styles.authCard}>
          <Field label="E-mail" value={email} onChange={setEmail} placeholder="voce@exemplo.com" keyboardType="email-address" />
          <Field label="Senha" value={password} onChange={setPassword} placeholder="Mínimo de 6 caracteres" secureTextEntry />
          {error ? <Text style={styles.authError}>{error}</Text> : null}
          <PrimaryButton label={loading ? "Só um instante..." : "Entrar"} onPress={submit} disabled={!valid || loading} />
        </View>
        <Text style={styles.authPrivacy}>🔒 Cada conta acessa apenas os próprios dados financeiros.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function AnalysisModal({ visible, analysis, loading, error, onRetry, onClose }: { visible: boolean; analysis: AiAnalysis | null; loading: boolean; error: string; onRetry: () => void; onClose: () => void }) {
  const statusColor = analysis?.status === "danger" ? COLORS.coral : analysis?.status === "attention" ? COLORS.warning : COLORS.success;
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

const createStyleDefinition = () => ({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  onboardingSafe: { flex: 1, backgroundColor: COLORS.paper },
  onboardingKeyboard: { flex: 1 },
  onboardingTop: { height: 64, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  onboardingBrand: { flexDirection: "row", alignItems: "center", gap: 9 },
  onboardingCount: { color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  onboardingTrack: { flexDirection: "row", gap: 7, paddingHorizontal: 22 },
  onboardingTrackPart: { flex: 1, height: 5, borderRadius: 3, backgroundColor: COLORS.line },
  onboardingTrackPartActive: { backgroundColor: COLORS.grape },
  onboardingContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 42, paddingBottom: 24, maxWidth: 540, width: "100%", alignSelf: "center" },
  onboardingIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.accentBorder, alignItems: "center", justifyContent: "center", shadowColor: COLORS.grapeDark, shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4, transform: [{ rotate: "-4deg" }] },
  onboardingEyebrow: { color: COLORS.grape, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginTop: 28 },
  onboardingTitle: { color: COLORS.ink, fontSize: 34, lineHeight: 39, fontWeight: "900", letterSpacing: -1.4, marginTop: 7, maxWidth: 400 },
  onboardingCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 11, maxWidth: 430 },
  onboardingForm: { marginTop: 32 },
  onboardingGoalInput: { minHeight: 150, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, padding: 16, color: COLORS.ink, fontSize: 14, lineHeight: 21 },
  onboardingPreview: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: COLORS.successSurface, borderRadius: 15, padding: 13, marginTop: 2 },
  onboardingPreviewText: { flex: 1, color: COLORS.success, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  onboardingReady: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.lime, borderRadius: 18, padding: 14, marginTop: 16 },
  onboardingReadyFace: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.mark, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  onboardingReadyFaceText: { color: COLORS.lime, fontSize: 24, fontWeight: "900", marginTop: -6 },
  onboardingReadyText: { flex: 1, color: "#3D3A2C", fontSize: 10, lineHeight: 15, fontWeight: "800" },
  onboardingFooter: { minHeight: 82, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: COLORS.line, backgroundColor: COLORS.paper, flexDirection: "row", alignItems: "center", gap: 12 },
  onboardingBack: { height: 52, minWidth: 90, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  onboardingBackText: { color: COLORS.grape, fontSize: 12, fontWeight: "900" },
  onboardingBackPlaceholder: { width: 90 },
  onboardingNext: { flex: 1, height: 54, borderRadius: 17, backgroundColor: COLORS.grape, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, shadowColor: COLORS.grapeDark, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 5 },
  onboardingNextText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  authSafe: { flex: 1, backgroundColor: COLORS.paper },
  authKeyboard: { flex: 1 },
  authScroll: { flexGrow: 1, justifyContent: "center", padding: 24, maxWidth: 480, width: "100%", alignSelf: "center" },
  authBrandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 30 },
  authBrandMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: COLORS.grape, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  authBrandFace: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", marginTop: -7 },
  authBrand: { color: COLORS.ink, fontSize: 29, fontWeight: "900", letterSpacing: -1.5 },
  authTitle: { color: COLORS.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1.2 },
  authSubtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 9, marginBottom: 22 },
  authCard: { backgroundColor: COLORS.surface, borderRadius: 25, padding: 20, borderWidth: 1, borderColor: COLORS.line, shadowColor: COLORS.grapeDark, shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  authError: { color: COLORS.danger, backgroundColor: COLORS.dangerSurface, borderRadius: 12, padding: 11, fontSize: 11, lineHeight: 16 },
  authSuccess: { color: COLORS.success, backgroundColor: COLORS.successSurface, borderRadius: 12, padding: 11, fontSize: 11, lineHeight: 16 },
  authSwitch: { alignItems: "center", paddingTop: 18, paddingBottom: 4 },
  authSwitchText: { color: COLORS.grape, fontSize: 11, fontWeight: "900" },
  authPrivacy: { color: COLORS.muted, fontSize: 10, textAlign: "center", marginTop: 18 },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  loadingText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  setupScreen: { flex: 1, justifyContent: "center", padding: 28, maxWidth: 480, width: "100%", alignSelf: "center" },
  setupCode: { backgroundColor: COLORS.mark, borderRadius: 16, padding: 16, gap: 8 },
  setupCodeText: { color: COLORS.lime, fontSize: 11, fontWeight: "800" },
  app: { flex: 1, backgroundColor: COLORS.paper, maxWidth: 620, width: "100%", alignSelf: "center" },
  topbar: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  cloudError: { marginHorizontal: 20, marginBottom: 8, borderRadius: 13, backgroundColor: COLORS.dangerSurface, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  cloudErrorText: { flex: 1, color: COLORS.danger, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.grape, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  brandFace: { color: "white", fontSize: 22, fontWeight: "900", marginTop: -5 },
  brand: { color: COLORS.ink, fontSize: 22, fontWeight: "900", letterSpacing: -1.2 },
  avatar: { width: 35, height: 35, borderRadius: 14, backgroundColor: COLORS.lime, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.ink, fontWeight: "900", fontSize: 12 },
  content: { padding: 20, paddingTop: 12, paddingBottom: 120 },
  helloRow: { marginBottom: 20 },
  eyebrow: { color: COLORS.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 5 },
  h1: { color: COLORS.ink, fontSize: 30, lineHeight: 35, fontWeight: "900", letterSpacing: -1.2 },
  moodPill: { maxWidth: 145, minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: COLORS.sky, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 20, marginBottom: 3 },
  moodText: { flexShrink: 1, fontSize: 10, lineHeight: 13, fontWeight: "800", color: COLORS.info, textAlign: "center" },
  moodActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  aiRefreshButton: { width: 34, height: 34, borderRadius: 13, backgroundColor: COLORS.accentSurface, borderWidth: 1, borderColor: COLORS.accentBorder, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  moodAttention: { backgroundColor: COLORS.warningSurface },
  moodAttentionText: { color: COLORS.warning },
  moodDanger: { backgroundColor: COLORS.dangerSurface },
  moodDangerText: { color: COLORS.danger },
  heroDeck: { height: 270, position: "relative", marginHorizontal: 2 },
  heroDeckCard: { position: "absolute", top: 0, left: 0, right: 0 },
  heroDeckBack: { zIndex: 1 },
  heroDeckFront: { zIndex: 2 },
  heroDeckNavigation: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 5, marginTop: 1 },
  heroDeckDots: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroDeckDotButton: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.lineStrong },
  heroDeckDotButtonActive: { width: 20, backgroundColor: COLORS.grape },
  heroDeckHint: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroDeckHintText: { color: COLORS.muted, fontSize: 8, fontWeight: "700" },
  balanceCard: { minHeight: 252, borderRadius: 28, padding: 24, overflow: "hidden", shadowColor: COLORS.grapeDark, shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 9 },
  balanceGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(201,244,90,0.15)", top: -85, right: -45 },
  balanceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  balanceLabel: { color: "rgba(255,255,255,0.78)", fontSize: 13, fontWeight: "700" },
  balanceAiBadge: { minHeight: 25, borderRadius: 13, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  balanceAiBadgeText: { color: COLORS.mark, fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  balanceValue: { color: "white", fontSize: 39, fontWeight: "900", letterSpacing: -1.8, marginTop: 7 },
  savedTotalLine: { alignSelf: "flex-start", minHeight: 30, borderRadius: 13, paddingHorizontal: 10, marginTop: 9, backgroundColor: "rgba(20,13,45,0.28)", flexDirection: "row", alignItems: "center", gap: 6 },
  savedTotalLabel: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "700" },
  savedTotalValue: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  balanceCopy: { color: "rgba(255,255,255,0.86)", fontSize: 13, marginTop: 7, marginBottom: 23 },
  balanceAnalysis: { marginTop: 7, marginBottom: 18 },
  balanceAnalysisHeadline: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  balanceAnalysisSummary: { color: "rgba(255,255,255,0.78)", fontSize: 11, lineHeight: 16, marginTop: 4 },
  whiteButton: { alignSelf: "flex-start", backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 },
  whiteButtonText: { color: "#532CB8", fontWeight: "800", fontSize: 13 },
  salaryCycleCard: { minHeight: 252, borderRadius: 28, borderWidth: 1, borderColor: "rgba(201,244,90,0.22)", padding: 18, overflow: "hidden", shadowColor: "#1B102F", shadowOpacity: 0.28, shadowRadius: 22, shadowOffset: { width: 0, height: 11 }, elevation: 7 },
  salaryCycleGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "rgba(201,244,90,0.12)", top: -105, right: -42 },
  salaryCycleGlowSmall: { position: "absolute", width: 92, height: 92, borderRadius: 46, backgroundColor: "rgba(155,123,255,0.18)", bottom: -50, left: -28 },
  salaryCycleHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  salaryCycleIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  salaryCycleHeaderCopy: { flex: 1 },
  salaryCycleIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  salaryCycleEyebrow: { color: COLORS.lime, fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  salaryCycleDate: { color: "#D8CEEC", fontSize: 9, fontWeight: "700", textTransform: "lowercase", marginTop: 4 },
  salaryCycleSettings: { width: 36, height: 36, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  salaryCycleLabel: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "700", marginTop: 18 },
  salaryCycleValue: { color: "#FFFFFF", fontSize: 32, fontWeight: "900", letterSpacing: -1.1, marginTop: 2 },
  salaryCycleValueDanger: { color: "#FF9B8F" },
  salaryCycleTrack: { height: 7, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)", marginTop: 12 },
  salaryCycleTrackFill: { height: "100%", borderRadius: 4, backgroundColor: COLORS.lime },
  salaryCycleBreakdown: { gap: 9, paddingTop: 15, marginTop: 15, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)" },
  salaryCycleLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  salaryCycleLineLabel: { flex: 1, color: "#D8CEEC", fontSize: 10, fontWeight: "700" },
  salaryCycleIncome: { color: COLORS.lime, fontSize: 10, fontWeight: "900" },
  salaryCycleExpense: { color: "#FFAA9F", fontSize: 10, fontWeight: "900" },
  salaryCycleEmpty: { minHeight: 44, borderRadius: 14, paddingHorizontal: 12, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  salaryCycleEmptyText: { flex: 1, color: "#F2ECFF", fontSize: 9, lineHeight: 13, fontWeight: "800" },
  cycleIncomeSummary: { backgroundColor: COLORS.surfaceMuted, borderRadius: 16, padding: 15, marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cycleIncomeSummaryLabel: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  cycleIncomeSummaryValue: { color: COLORS.success, fontSize: 17, fontWeight: "900" },
  cycleIncomeDay: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  cycleIncomeDayNumber: { color: COLORS.grape, fontSize: 15, lineHeight: 17, fontWeight: "900" },
  cycleIncomeDayLabel: { color: COLORS.grape, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  cycleIncomeValue: { color: COLORS.muted, fontSize: 10, fontWeight: "600", marginTop: 3 },
  cycleEmptyState: { alignItems: "center", paddingVertical: 18, paddingHorizontal: 12 },
  cycleEmptyIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  cycleEmptyTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "900" },
  cycleEmptyCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 7 },
  metricsRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  metricCard: { flex: 1, padding: 16, borderRadius: 20 },
  metricIncomeCard: { backgroundColor: COLORS.successSurface, borderWidth: 1, borderColor: COLORS.successBorder },
  metricExpenseCard: { backgroundColor: COLORS.dangerSurface, borderWidth: 1, borderColor: COLORS.dangerBorder },
  metricIncomeLabel: { color: COLORS.success },
  metricExpenseLabel: { color: COLORS.danger },
  metricIncomeValue: { color: COLORS.ink },
  metricExpenseValue: { color: COLORS.ink },
  iconBubble: { width: 30, height: 30, borderRadius: 11, justifyContent: "center", alignItems: "center", marginBottom: 13 },
  metricLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  metricValue: { color: COLORS.ink, fontSize: 17, fontWeight: "900", marginTop: 4, letterSpacing: -0.5 },
  commitmentCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: COLORS.successSurface, borderRadius: 18, padding: 14, marginTop: 12 },
  commitmentHint: { color: COLORS.success, fontSize: 9, marginTop: 3 },
  aiInsightCard: { minHeight: 154, borderRadius: 22, padding: 17, marginTop: 14, backgroundColor: COLORS.accentSurface, borderWidth: 1, borderColor: COLORS.accentBorder },
  aiInsightAttention: { backgroundColor: COLORS.warningSurface, borderColor: COLORS.warningBorder },
  aiInsightDanger: { backgroundColor: COLORS.dangerSurface, borderColor: COLORS.dangerBorder },
  aiInsightHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  aiInsightIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.grape },
  aiInsightIconAttention: { backgroundColor: COLORS.warning },
  aiInsightIconDanger: { backgroundColor: COLORS.danger },
  aiInsightEyebrow: { flex: 1, color: COLORS.grape, fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  aiInsightAction: { minHeight: 31, borderRadius: 12, paddingHorizontal: 10, backgroundColor: COLORS.surface, flexDirection: "row", alignItems: "center", gap: 5 },
  aiInsightActionText: { color: COLORS.grape, fontSize: 9, fontWeight: "900" },
  aiInsightTitle: { color: COLORS.ink, fontSize: 17, lineHeight: 21, fontWeight: "900", letterSpacing: -0.35, marginTop: 14 },
  aiInsightText: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 5, maxWidth: 430 },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 12 },
  sectionTitleText: { color: COLORS.ink, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  sectionAction: { color: COLORS.grape, fontSize: 12, fontWeight: "800" },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  lifeFeatureCard: { minHeight: 76, backgroundColor: COLORS.accentSurface, borderRadius: 19, padding: 14, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: COLORS.accentBorder },
  lifeFeatureIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  lifeFeatureEyebrow: { color: COLORS.grape, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  lifeFeatureTitle: { color: COLORS.ink, fontSize: 13, lineHeight: 17, fontWeight: "900", marginTop: 3 },
  toolsIntro: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: -10, marginBottom: 18, maxWidth: 440 },
  toolFeaturedCard: { minHeight: 275, borderRadius: 26, padding: 21, overflow: "hidden", backgroundColor: "#2B214D", borderWidth: 1, borderColor: "#6540C8" },
  toolFeaturedTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toolFeaturedIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: COLORS.grape, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  toolAvailableBadge: { minHeight: 25, borderRadius: 12, paddingHorizontal: 9, backgroundColor: COLORS.lime, alignItems: "center", justifyContent: "center" },
  toolAvailableText: { color: COLORS.mark, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  toolFeaturedEyebrow: { color: COLORS.lime, fontSize: 8, fontWeight: "900", letterSpacing: 0.9, marginTop: 28 },
  toolFeaturedTitle: { color: "#FFFFFF", fontSize: 23, lineHeight: 27, fontWeight: "900", letterSpacing: -0.7, marginTop: 7, maxWidth: 360 },
  toolFeaturedText: { color: "#CEC7DD", fontSize: 11, lineHeight: 17, marginTop: 8, maxWidth: 390 },
  toolOpenLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 23 },
  toolOpenText: { color: COLORS.lime, fontSize: 11, fontWeight: "900" },
  toolsComingTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900", marginTop: 27, marginBottom: 11 },
  toolsComingGrid: { flexDirection: "row", gap: 10 },
  toolComingCard: { flex: 1, minHeight: 160, borderRadius: 19, padding: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line },
  toolComingIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  toolComingName: { color: COLORS.ink, fontSize: 12, fontWeight: "900", marginTop: 13 },
  toolComingText: { color: COLORS.muted, fontSize: 9, lineHeight: 13, marginTop: 4 },
  toolComingBadge: { color: COLORS.grape, fontSize: 7, fontWeight: "900", letterSpacing: 0.7, marginTop: 12 },
  listCard: { backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 15, borderWidth: 1, borderColor: COLORS.line },
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
  entryAmountBlock: { flexShrink: 0, maxWidth: 118, alignItems: "flex-end" },
  entryInvoiceText: { color: COLORS.muted, fontSize: 8, fontWeight: "700", marginTop: 5, textAlign: "right", maxWidth: 118 },
  rowValue: { color: COLORS.ink, fontSize: 12, fontWeight: "900", textAlign: "right" },
  editEntryButton: { width: 32, height: 32, borderRadius: 11, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  income: { color: COLORS.success },
  tipCard: { flexDirection: "row", gap: 13, backgroundColor: COLORS.lime, borderRadius: 20, padding: 16, marginTop: 18, alignItems: "center" },
  tipMascot: { width: 48, height: 48, borderRadius: 17, backgroundColor: COLORS.mark, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  tipFace: { color: COLORS.lime, fontSize: 14, fontWeight: "900" },
  tipCopy: { flex: 1 },
  tipTitle: { color: COLORS.mark, fontWeight: "900", fontSize: 13 },
  tipText: { color: "#45402E", fontSize: 11, lineHeight: 16, marginTop: 3 },
  nav: { position: "absolute", left: 12, right: 12, bottom: 10, height: 72, backgroundColor: COLORS.surface, flexDirection: "row", borderRadius: 24, borderWidth: 1, borderColor: COLORS.line, shadowColor: COLORS.ink, shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  navLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "700" },
  navActive: { color: COLORS.grape, fontWeight: "900" },
  navDot: { position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.grape },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22 },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.grape, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13 },
  smallButtonText: { color: "white", fontSize: 11, fontWeight: "800" },
  summaryStrip: { height: 50, backgroundColor: COLORS.accentSurface, borderRadius: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  summaryText: { color: COLORS.grapeDark, fontSize: 12, fontWeight: "800" },
  filterToggle: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D8CCF6", backgroundColor: COLORS.surface },
  filterToggleActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  filterActiveDot: { position: "absolute", top: 5, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.lime, borderWidth: 1, borderColor: COLORS.surface },
  filtersPanel: { backgroundColor: COLORS.accentSurface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 14, marginBottom: 16 },
  filtersPanelHeader: { minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  filtersPanelTitle: { color: COLORS.ink, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  clearFilter: { flexDirection: "row", alignItems: "center", gap: 3 },
  clearFilterText: { color: COLORS.grape, fontSize: 11, fontWeight: "900" },
  filterLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 7 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  filterScroll: { gap: 8, paddingBottom: 18 },
  filterChip: { minHeight: 37, paddingHorizontal: 13, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", gap: 7 },
  filterChipActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  filterChipText: { color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  filterChipTextActive: { color: "#FFFFFF" },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  emptyState: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 28, alignItems: "center", borderWidth: 1, borderColor: COLORS.line },
  emptyIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  emptyText: { color: COLORS.muted, fontSize: 11, marginTop: 5 },
  recurringHero: { backgroundColor: COLORS.sky, borderRadius: 23, padding: 20, marginBottom: 16 },
  recurringHeroLabel: { color: COLORS.info, fontSize: 11, fontWeight: "800" },
  recurringHeroValue: { color: COLORS.ink, fontSize: 29, fontWeight: "900", letterSpacing: -1, marginVertical: 5 },
  recurringHeroCopy: { color: COLORS.ink, fontSize: 11 },
  monthPicker: { height: 66, backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 9, marginBottom: 4 },
  monthArrow: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  monthCenter: { alignItems: "center" },
  monthCaption: { color: COLORS.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  monthLabel: { color: COLORS.ink, fontSize: 15, fontWeight: "900", textTransform: "capitalize", marginTop: 3 },
  recurringRow: { backgroundColor: COLORS.surface, borderRadius: 18, marginBottom: 10, padding: 13, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: COLORS.line },
  editRecurringButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  toggleRecurringButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  emptySectionText: { color: COLORS.muted, fontSize: 11, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.line },
  billCard: { backgroundColor: COLORS.surface, borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: COLORS.line, overflow: "hidden" },
  billMain: { padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  billFooter: { borderTopWidth: 1, borderTopColor: COLORS.line, minHeight: 52, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  billActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  billValue: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  paidBadge: { backgroundColor: COLORS.successSurface, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  pendingBadge: { backgroundColor: COLORS.dangerSurface, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  paidBadgeText: { color: COLORS.success, fontSize: 9, fontWeight: "900" },
  pendingBadgeText: { color: COLORS.danger, fontSize: 9, fontWeight: "900" },
  payButton: { backgroundColor: COLORS.grape, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  payButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  pauseButton: { backgroundColor: COLORS.accentSurface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  pauseButtonText: { color: COLORS.grape, fontSize: 10, fontWeight: "900" },
  disabledRow: { opacity: 0.48 },
  dateBadge: { width: 45, height: 48, borderRadius: 13, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  incomeDateBadge: { backgroundColor: COLORS.successSurface },
  dateSmall: { color: COLORS.grape, fontSize: 8, fontWeight: "900" },
  dateBig: { color: COLORS.grapeDark, fontSize: 18, fontWeight: "900" },
  walletColorPalette: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  walletColorOption: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "transparent" },
  walletColorOptionActive: { borderColor: COLORS.ink, shadowColor: COLORS.ink, shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  walletCard: { minHeight: 162, borderRadius: 25, padding: 20, marginBottom: 14, shadowColor: COLORS.ink, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  walletTop: { flexDirection: "row", justifyContent: "space-between" },
  walletEditBadge: { width: 34, height: 34, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  walletDots: { color: "rgba(255,255,255,0.7)", letterSpacing: 2 },
  walletName: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700", marginTop: 29 },
  walletBalance: { color: "white", fontSize: 26, fontWeight: "900", marginTop: 4, letterSpacing: -0.8 },
  creditCardBlock: { marginBottom: 14 },
  creditCardFace: { minHeight: 162, borderRadius: 25, padding: 20, shadowColor: COLORS.ink, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  creditCardAvailable: { color: "#FFFFFF", fontSize: 23, fontWeight: "900", letterSpacing: -0.7, marginTop: 3 },
  creditCardMeta: { color: "rgba(255,255,255,0.72)", fontSize: 9, fontWeight: "700", marginTop: 7 },
  invoiceList: { backgroundColor: COLORS.surface, borderWidth: 1, borderTopWidth: 0, borderColor: COLORS.line, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, padding: 11, marginHorizontal: 9 },
  invoiceRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  invoiceDateBadge: { width: 39, height: 43, borderRadius: 12, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  invoiceDateDay: { color: COLORS.grapeDark, fontSize: 15, lineHeight: 17, fontWeight: "900" },
  invoiceDateMonth: { color: COLORS.grape, fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  invoiceTitle: { color: COLORS.ink, fontSize: 10, fontWeight: "900", textTransform: "capitalize" },
  invoiceMeta: { color: COLORS.muted, fontSize: 8, marginTop: 3 },
  invoiceValue: { color: COLORS.ink, fontSize: 10, fontWeight: "900" },
  invoicePayButton: { minHeight: 31, borderRadius: 11, paddingHorizontal: 9, backgroundColor: COLORS.grape, flexDirection: "row", alignItems: "center", gap: 4 },
  invoicePayButtonText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  invoiceReopenButton: { backgroundColor: COLORS.accentSurface },
  invoiceReopenButtonText: { color: COLORS.grape },
  dashedButton: { height: 58, borderWidth: 1.5, borderStyle: "dashed", borderColor: COLORS.accentBorder, borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  dashedText: { color: COLORS.grape, fontSize: 12, fontWeight: "800" },
  dreamWalletPressable: { borderRadius: 27, marginTop: 24, shadowColor: "#33245E", shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 7 },
  dreamWalletCard: { borderRadius: 27, padding: 20, overflow: "hidden" },
  dreamWalletTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dreamWalletIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: COLORS.lime, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  dreamWalletAutoBadge: { minHeight: 25, borderRadius: 13, paddingHorizontal: 9, backgroundColor: "rgba(255,255,255,0.13)", borderWidth: 1, borderColor: "rgba(255,255,255,0.17)", alignItems: "center", justifyContent: "center" },
  dreamWalletAutoText: { color: "#E8DFFF", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  dreamWalletLabel: { color: "#DCD1F7", fontSize: 12, fontWeight: "800", marginTop: 20 },
  dreamWalletBalance: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", letterSpacing: -1, marginTop: 3 },
  dreamWalletCopy: { color: "#DCD3EF", fontSize: 10, lineHeight: 15, marginTop: 6 },
  dreamWalletOpen: { minHeight: 36, marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.13)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dreamWalletOpenText: { color: COLORS.lime, fontSize: 10, fontWeight: "900" },
  potCard: { backgroundColor: COLORS.surface, borderRadius: 23, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: COLORS.line },
  potTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  potIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  potName: { color: COLORS.ink, fontSize: 16, fontWeight: "900" },
  potDescription: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  potTopActions: { alignItems: "flex-end", gap: 7 },
  potPercent: { color: COLORS.grape, fontSize: 16, fontWeight: "900" },
  potDeleteIcon: { width: 31, height: 31, borderRadius: 11, borderWidth: 1, borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerSurface, alignItems: "center", justifyContent: "center" },
  potProgressTrack: { height: 10, backgroundColor: COLORS.surfaceMuted, borderRadius: 5, overflow: "hidden", marginTop: 18 },
  potProgressFill: { height: "100%", backgroundColor: COLORS.lime, borderRadius: 5 },
  potValues: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  potValueLabel: { color: COLORS.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  potSaved: { color: COLORS.ink, fontSize: 20, fontWeight: "900", marginTop: 3 },
  potGoalBlock: { alignItems: "flex-end" },
  potGoal: { color: COLORS.muted, fontSize: 15, fontWeight: "800", marginTop: 5 },
  potPlan: { color: COLORS.muted, fontSize: 10, marginTop: 8 },
  potYieldBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.tealSurface, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 7, marginTop: 9 },
  potYieldText: { color: COLORS.teal, fontSize: 9, fontWeight: "800" },
  potSourceLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9 },
  potSourceText: { flex: 1, color: COLORS.muted, fontSize: 9, fontWeight: "700" },
  potDepositButton: { height: 45, backgroundColor: COLORS.grape, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  potDepositButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  potComplete: { minHeight: 45, backgroundColor: COLORS.successSurface, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  potCompleteText: { color: COLORS.success, fontSize: 11, fontWeight: "900" },
  emptyPotButton: { backgroundColor: COLORS.grape, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 11, marginTop: 16 },
  emptyPotButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  modalWrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,22,43,0.45)" },
  sheet: { maxHeight: "91%", backgroundColor: COLORS.paper, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingBottom: 28 },
  sheetContent: { paddingBottom: 24 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.lineStrong, alignSelf: "center", marginTop: 10, marginBottom: 18 },
  sheetHeader: { flexDirection: "row", gap: 14, alignItems: "flex-start", marginBottom: 20 },
  sheetTitle: { color: COLORS.ink, fontSize: 24, fontWeight: "900", letterSpacing: -0.8 },
  sheetSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  close: { width: 35, height: 35, borderRadius: 12, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.line },
  field: { marginBottom: 16 },
  fieldLabel: { color: COLORS.ink, fontSize: 11, fontWeight: "800", marginBottom: 7 },
  input: { height: 52, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, paddingHorizontal: 15, color: COLORS.ink, fontSize: 14, fontWeight: "600" },
  potDescriptionInput: { minHeight: 88, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, padding: 14, color: COLORS.ink, fontSize: 13, lineHeight: 18, marginBottom: 16 },
  potPreview: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: COLORS.accentSurface, borderRadius: 14, padding: 13, marginBottom: 16 },
  potPreviewText: { color: COLORS.grapeDark, fontSize: 11, fontWeight: "800" },
  interestToggleCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 17, padding: 14, marginBottom: 16 },
  interestToggleCopy: { flex: 1 },
  interestToggleTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  interestToggleHint: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  interestFields: { backgroundColor: COLORS.tealSurface, borderWidth: 1, borderColor: COLORS.tealBorder, borderRadius: 18, padding: 14, marginBottom: 16 },
  realRateCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: COLORS.tealSurface, borderRadius: 14, padding: 12 },
  realRateLabel: { color: COLORS.teal, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  realRateValue: { color: COLORS.teal, fontSize: 17, fontWeight: "900", marginTop: 3 },
  realRateHint: { color: COLORS.muted, fontSize: 8, lineHeight: 12, marginTop: 2 },
  quickDepositRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  potTransferNote: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: COLORS.accentSurface, borderRadius: 16, padding: 13, marginBottom: 18 },
  potTransferNoteText: { flex: 1, color: COLORS.grapeDark, fontSize: 9, lineHeight: 14, fontWeight: "700" },
  potWalletOptions: { gap: 8, marginBottom: 20 },
  potWalletOption: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  potWalletOptionActive: { borderColor: COLORS.grape, backgroundColor: COLORS.accentSurface },
  potWalletOptionUnavailable: { opacity: 0.45 },
  potWalletColor: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  potWalletName: { color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  potWalletBalance: { color: COLORS.muted, fontSize: 9, marginTop: 3 },
  potWalletCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.grape, alignItems: "center", justifyContent: "center" },
  potInsufficientText: { color: COLORS.danger, backgroundColor: COLORS.dangerSurface, borderRadius: 12, padding: 11, fontSize: 10, fontWeight: "700", marginBottom: 14 },
  potTransferPreview: { borderRadius: 14, padding: 13, backgroundColor: COLORS.successSurface, marginBottom: 14 },
  potTransferPreviewLabel: { color: COLORS.success, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  potTransferPreviewText: { color: COLORS.success, fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 4 },
  quickDeposit: { flex: 1, height: 48, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" },
  quickDepositActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  quickDepositText: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  quickDepositTextActive: { color: "#FFFFFF" },
  potOverGoal: { color: COLORS.success, backgroundColor: COLORS.successSurface, fontSize: 10, lineHeight: 15, fontWeight: "700", borderRadius: 12, padding: 11, marginBottom: 14 },
  potDeleteSummary: { minHeight: 86, borderRadius: 19, backgroundColor: COLORS.accentSurface, padding: 15, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  potDeleteSummaryIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  potDeleteSummaryLabel: { color: COLORS.grapeDark, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  potDeleteSummaryValue: { color: COLORS.ink, fontSize: 21, fontWeight: "900", marginTop: 2 },
  potDeleteSummaryText: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  potDeleteReturnButton: { minHeight: 82, borderRadius: 18, borderWidth: 1, borderColor: COLORS.accentBorder, backgroundColor: COLORS.surface, padding: 13, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 10 },
  potDeleteChoiceIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  potDeleteReturnTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  potDeleteChoiceText: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  potDeleteDiscardButton: { minHeight: 82, borderRadius: 18, borderWidth: 1, borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerSurface, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  potDeleteDiscardIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.dangerSurface, alignItems: "center", justifyContent: "center" },
  potDeleteDiscardTitle: { color: COLORS.danger, fontSize: 12, fontWeight: "900" },
  potDeleteEmptyButton: { minHeight: 50, borderRadius: 15, backgroundColor: COLORS.danger, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  potDeleteEmptyButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  potDeleteWarning: { color: COLORS.muted, fontSize: 9, textAlign: "center", marginTop: 12 },
  deleteEntryButton: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerSurface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  deleteEntryButtonText: { color: COLORS.danger, fontSize: 11, fontWeight: "900" },
  deleteWalletButton: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerSurface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  deleteWalletButtonText: { color: COLORS.danger, fontSize: 11, fontWeight: "900" },
  lifeSalaryCard: { backgroundColor: COLORS.sky, borderRadius: 19, padding: 17, marginBottom: 18 },
  lifeSalaryLabel: { color: COLORS.info, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  lifeSalaryValue: { color: COLORS.ink, fontSize: 25, fontWeight: "900", marginTop: 5 },
  lifeSalaryHint: { color: COLORS.ink, fontSize: 10, lineHeight: 14, marginTop: 4 },
  lifeHoursHint: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: -8, marginBottom: 15 },
  lifeResultCard: { backgroundColor: COLORS.mark, borderRadius: 20, padding: 18, marginTop: 16 },
  lifeResultEyebrow: { color: COLORS.lime, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  lifeResultValue: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", marginTop: 5 },
  lifeResultCopy: { color: "#D7D1E0", fontSize: 10, lineHeight: 15, marginTop: 5 },
  lifeAiLoading: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.accentSurface, borderRadius: 15, padding: 14, marginTop: 12 },
  lifeAiLoadingText: { flex: 1, color: COLORS.grapeDark, fontSize: 10, fontWeight: "700" },
  lifeAiError: { color: COLORS.danger, backgroundColor: COLORS.dangerSurface, borderRadius: 13, padding: 12, fontSize: 10, lineHeight: 15, marginTop: 12 },
  lifeVerdict: { backgroundColor: COLORS.surface, borderRadius: 18, borderWidth: 1.5, padding: 16, marginTop: 12 },
  lifeVerdictBadge: { alignSelf: "flex-start", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  lifeVerdictBadgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  lifeVerdictTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900", marginTop: 11 },
  lifeVerdictText: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  referenceDateRow: { flexDirection: "row", gap: 9, marginBottom: 8 },
  dayField: { width: 66, height: 58, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  miniFieldLabel: { color: COLORS.muted, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  dayInput: { color: COLORS.ink, fontSize: 18, fontWeight: "900", textAlign: "center", width: "100%", padding: 0, marginTop: 2 },
  referenceMonthPicker: { flex: 1, height: 58, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 7 },
  referenceArrow: { width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  referenceMonthText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "900", textTransform: "capitalize", textAlign: "center" },
  invoiceImportHint: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: 7, marginBottom: 16 },
  cardOptionMeta: { color: COLORS.muted, fontSize: 8, marginTop: 2 },
  invoicePreview: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.accentSurface, borderRadius: 13, padding: 11, marginBottom: 15 },
  invoicePreviewText: { flex: 1, color: COLORS.grapeDark, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  cardDayFields: { flexDirection: "row", gap: 10 },
  cycleExplain: { flexDirection: "row", alignItems: "flex-start", gap: 11, backgroundColor: COLORS.accentSurface, borderRadius: 17, padding: 14, marginBottom: 18 },
  cycleExplainText: { flex: 1, color: COLORS.grapeDark, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  dateError: { color: COLORS.danger, fontSize: 10, fontWeight: "700", marginBottom: 13 },
  segment: { backgroundColor: COLORS.surfaceMuted, borderRadius: 15, padding: 4, flexDirection: "row", marginBottom: 18 },
  segmentItem: { flex: 1, height: 41, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  segmentActive: { backgroundColor: COLORS.surface },
  segmentText: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  segmentActiveText: { color: COLORS.grape },
  chips: { gap: 8, paddingBottom: 18 },
  chip: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 },
  chipActive: { backgroundColor: COLORS.accentSurface, borderColor: COLORS.accentBorder },
  chipText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  chipTextActive: { color: "#FFFFFF" },
  walletOptions: { gap: 8, marginBottom: 5 },
  walletOption: { minHeight: 48, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 10 },
  walletOptionActive: { borderColor: COLORS.accentBorder, backgroundColor: COLORS.accentSurface },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  walletOptionText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  profileDataSection: { marginTop: 26, paddingTop: 22, borderTopWidth: 1, borderTopColor: COLORS.line },
  profileDataEyebrow: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 9 },
  profileImportButton: { minHeight: 72, borderRadius: 18, borderWidth: 1, borderColor: COLORS.accentBorder, backgroundColor: COLORS.accentSurface, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  profileImportIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  profileImportTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  profileImportText: { color: COLORS.muted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  bankImportHero: { borderRadius: 24, backgroundColor: COLORS.accentSurface, padding: 22, alignItems: "center", borderWidth: 1, borderColor: COLORS.accentBorder },
  bankImportHeroIcon: { width: 62, height: 62, borderRadius: 21, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  bankImportHeroTitle: { color: COLORS.ink, fontSize: 20, lineHeight: 24, fontWeight: "900", letterSpacing: -0.5, textAlign: "center", marginTop: 17 },
  bankImportHeroText: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 7, maxWidth: 330 },
  bankFileButton: { minHeight: 50, alignSelf: "stretch", borderRadius: 15, backgroundColor: COLORS.grape, marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  bankFileButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  bankImportSafety: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 15, backgroundColor: COLORS.successSurface, padding: 13, marginTop: 13 },
  bankImportSafetyText: { flex: 1, color: COLORS.success, fontSize: 9, lineHeight: 14, fontWeight: "700" },
  bankImportError: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 15, backgroundColor: COLORS.dangerSurface, padding: 13, marginTop: 12 },
  bankImportErrorText: { flex: 1, color: COLORS.danger, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  bankFileSummary: { minHeight: 72, borderRadius: 18, borderWidth: 1, borderColor: COLORS.accentBorder, backgroundColor: COLORS.accentSurface, padding: 13, marginBottom: 19, flexDirection: "row", alignItems: "center", gap: 11 },
  bankFileBank: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  bankFileName: { color: COLORS.muted, fontSize: 9, marginTop: 3, maxWidth: 230 },
  bankFileChange: { minHeight: 32, borderRadius: 12, paddingHorizontal: 10, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  bankFileChangeText: { color: COLORS.grape, fontSize: 9, fontWeight: "900" },
  bankImportTotals: { minHeight: 78, borderRadius: 18, backgroundColor: COLORS.mark, paddingHorizontal: 14, marginTop: 17, flexDirection: "row", alignItems: "center", gap: 11 },
  bankImportTotalBlock: { flex: 1 },
  bankImportTotalLabel: { color: "#AFA8BD", fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  bankImportTotalValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 3 },
  bankImportTotalMoney: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", marginTop: 5 },
  bankReviewNotice: { borderRadius: 15, backgroundColor: COLORS.warningSurface, padding: 13, marginTop: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  bankReviewNoticeText: { flex: 1, color: COLORS.warning, fontSize: 9, lineHeight: 14, fontWeight: "700" },
  bankReviewHeader: { marginTop: 25, marginBottom: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  bankReviewTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "900" },
  bankReviewActionText: { color: COLORS.grape, fontSize: 9, fontWeight: "900" },
  bankDraftList: { gap: 9, marginBottom: 18 },
  bankDraftCard: { borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, padding: 13 },
  bankDraftCardMuted: { backgroundColor: COLORS.surfaceMuted },
  bankDraftCardDuplicate: { opacity: 0.62 },
  bankDraftTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bankDraftCheck: { width: 27, height: 27, borderRadius: 9, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  bankDraftCheckActive: { borderColor: COLORS.grape, backgroundColor: COLORS.grape },
  bankDraftTitleInput: { color: COLORS.ink, fontSize: 11, fontWeight: "900", padding: 0 },
  bankDraftOriginal: { color: COLORS.muted, fontSize: 8, lineHeight: 12, marginTop: 3 },
  bankDraftValueBlock: { alignItems: "flex-end", maxWidth: 110 },
  bankDraftValue: { color: COLORS.ink, fontSize: 10, fontWeight: "900" },
  bankDraftDate: { color: COLORS.muted, fontSize: 8, fontWeight: "700", marginTop: 4 },
  bankDraftMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 11 },
  bankDraftCategory: { minHeight: 25, borderRadius: 11, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  bankDraftCategoryText: { fontSize: 8, fontWeight: "900" },
  bankDraftReviewText: { color: COLORS.warning, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  bankDraftDuplicateText: { color: COLORS.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.4 },
  bankDraftEdit: { minHeight: 25, marginLeft: "auto", paddingHorizontal: 8, borderRadius: 10, backgroundColor: COLORS.accentSurface, flexDirection: "row", alignItems: "center", gap: 4 },
  bankDraftEditText: { color: COLORS.grape, fontSize: 8, fontWeight: "900" },
  bankDraftEditor: { borderTopWidth: 1, borderTopColor: COLORS.line, marginTop: 13, paddingTop: 14 },
  bankImportValidation: { color: COLORS.danger, fontSize: 10, fontWeight: "700", marginBottom: 12 },
  autoPostNote: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: COLORS.successSurface, borderRadius: 14, padding: 12, marginTop: 10 },
  autoPostText: { flex: 1, color: COLORS.success, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: COLORS.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.line, marginBottom: 20 },
  profileAvatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: COLORS.lime, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: COLORS.ink, fontSize: 14, fontWeight: "900" },
  profileName: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  profileMeta: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  profileNameEditor: { marginBottom: 24 },
  profileNameEditorHeader: { minHeight: 20, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  profileNameStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  profileNameStatusText: { color: COLORS.grape, fontSize: 9, fontWeight: "800" },
  profileNameSavedText: { color: COLORS.success, fontSize: 9, fontWeight: "800" },
  profileNameError: { color: COLORS.danger, fontSize: 10, lineHeight: 14, marginTop: 7 },
  profileSecuritySection: { marginTop: 26, paddingTop: 22, borderTopWidth: 1, borderTopColor: COLORS.line },
  profileSecurityButton: { minHeight: 68, borderRadius: 18, borderWidth: 1, borderColor: COLORS.accentBorder, backgroundColor: COLORS.accentSurface, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  profileSecurityIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  passwordEditor: { marginTop: 14, gap: 7 },
  passwordSuccess: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, padding: 11, backgroundColor: COLORS.successSurface, marginTop: 3 },
  passwordSuccessText: { color: COLORS.success, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  signOutButton: { height: 48, borderRadius: 15, borderWidth: 1, borderColor: COLORS.dangerBorder, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  signOutButtonText: { color: COLORS.danger, fontSize: 11, fontWeight: "900" },
  goalInput: { minHeight: 130, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, padding: 14, color: COLORS.ink, fontSize: 13, lineHeight: 19 },
  goalHint: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  themeSelector: { flexDirection: "row", gap: 8, marginBottom: 18 },
  themeOption: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
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
  analysisBullet: { width: 21, height: 21, borderRadius: 8, backgroundColor: COLORS.accentSurface, alignItems: "center", justifyContent: "center" },
  analysisBulletText: { color: COLORS.grape, fontSize: 9, fontWeight: "900" },
  analysisItemText: { flex: 1, color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  appSuggestion: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: COLORS.accentSurface, borderRadius: 14, padding: 12, marginBottom: 9 },
  suggestionIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  refreshAnalysis: { height: 48, borderRadius: 15, borderWidth: 1, borderColor: COLORS.accentBorder, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  refreshAnalysisText: { color: COLORS.grape, fontSize: 11, fontWeight: "900" },
  primaryButton: { height: 54, marginTop: 20, backgroundColor: COLORS.grape, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  primaryButtonText: { color: "white", fontSize: 13, fontWeight: "900" },
  buttonDisabled: { opacity: 0.38 },
});
const createStyles = () => StyleSheet.create(createStyleDefinition() as any);
let styles = createStyles();

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}
