import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { supabase, supabaseConfigured } from "./lib/supabase";

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
};
type Wallet = { id: string; name: string; initial: number; color: string };
type SavingsPot = {
  id: string;
  name: string;
  description: string;
  goal: number;
  months: number;
  createdAt: string;
  contributions: { id: string; value: number; createdAt: string }[];
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
  goal: string;
  analysis: AiAnalysis | null;
};

const COLORS = {
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

const walletPalette = ["#7147E8", "#FF7B6B", "#2DAE8C", "#E0A72B"];
const categories = ["Mercado", "Casa", "Transporte", "Lazer", "Assinatura", "Outros"];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: number) => brl.format(value);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const AI_ANALYSIS_STORAGE_KEY = "@nenero/analysis-v2";

const initialWallets: Wallet[] = [];
const initialEntries: Entry[] = [];
const initialRecurring: Recurring[] = [];

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
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
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState("");
  const [modal, setModal] = useState<"entry" | "wallet" | "recurring" | "pot" | "potDeposit" | "lifeCalculator" | "profile" | "analysis" | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<Recurring | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [selectedPot, setSelectedPot] = useState<SavingsPot | null>(null);

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
          setWallets(data.wallets ?? initialWallets);
          setEntries(data.entries ?? initialEntries);
          setRecurring(data.recurring ?? initialRecurring);
          setSavingsPots(data.savingsPots ?? []);
        } else {
          setWallets([]);
          setEntries([]);
          setRecurring([]);
          setSavingsPots([]);
        }
        setGoal(savedGoal ?? "");
        setAnalysis(savedAnalysis ? JSON.parse(savedAnalysis) : null);
      } finally {
        setReady(true);
      }
    })();
  }, [authReady, session?.user.id]);

  useEffect(() => {
    if (ready && session) AsyncStorage.setItem(`@nenero/data:${session.user.id}`, JSON.stringify({ wallets, entries, recurring, savingsPots }));
  }, [wallets, entries, recurring, savingsPots, ready, session?.user.id]);

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
        setWallets(payload.wallets ?? []);
        setEntries(payload.entries ?? []);
        setRecurring(payload.recurring ?? []);
        setSavingsPots(payload.savingsPots ?? []);
        setGoal(payload.goal ?? "");
        setAnalysis(payload.analysis ?? null);
      } else {
        const payload: FinancialDataPayload = { wallets, entries, recurring, savingsPots, goal, analysis };
        const { error: insertError } = await supabase.from("user_financial_data").upsert({
          user_id: session.user.id,
          payload,
          schema_version: 1,
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
    const payload: FinancialDataPayload = { wallets, entries, recurring, savingsPots, goal, analysis };
    const timer = setTimeout(async () => {
      const { error } = await client.from("user_financial_data").upsert({
        user_id: session.user.id,
        payload,
        schema_version: 1,
        updated_at: new Date().toISOString(),
      });
      setCloudError(error ? `Falha ao sincronizar: ${error.message}` : "");
    }, 700);
    return () => clearTimeout(timer);
  }, [wallets, entries, recurring, savingsPots, goal, analysis, ready, session?.user.id, cloudUserId]);

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

  const totalBalance = useMemo(() => {
    const initial = wallets.reduce((sum, wallet) => sum + wallet.initial, 0);
    return entries.reduce((sum, entry) => sum + (entry.kind === "income" ? entry.value : -entry.value), initial);
  }, [wallets, entries]);

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
      const saved = pot.contributions.reduce((sum, contribution) => sum + contribution.value, 0);
      return {
        name: pot.name,
        description: pot.description,
        goal: pot.goal,
        months: pot.months,
        saved,
        remaining: Math.max(0, pot.goal - saved),
        progressPercent: Math.min(100, Math.round((saved / pot.goal) * 100)),
        monthlyTarget: Math.round((pot.goal / pot.months) * 100) / 100,
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
  const userName = (session?.user.user_metadata?.name as string | undefined)?.trim()
    || userEmail.split("@")[0]?.replace(/[._-]+/g, " ")
    || "você";
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
    setGoal("");
    setAnalysis(null);
    setCloudError("");
    setCloudUserId(null);
  };

  if (!supabaseConfigured) return <SupabaseSetupScreen />;
  if (!authReady || (session && !ready)) return <AppLoadingScreen />;
  if (!session) return <AuthScreen />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.topbar}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandFace}>◡</Text></View>
            <Text style={styles.brand}>nenero</Text>
          </View>
          <Pressable style={styles.avatar} onPress={() => setModal("profile")} accessibilityLabel="Abrir perfil"><Text style={styles.avatarText}>{userInitials}</Text></Pressable>
        </View>

        {cloudError ? <View style={styles.cloudError}><Feather name="cloud-off" size={14} color="#B54337" /><Text style={styles.cloudErrorText}>{cloudError}</Text></View> : null}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {tab === "inicio" && (
            <Home
              userName={userName}
              balance={totalBalance}
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
              onWallet={() => setModal("wallet")}
              onRecurring={() => setModal("recurring")}
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
              onAdd={() => setModal("pot")}
              onDeposit={(pot) => { setSelectedPot(pot); setModal("potDeposit"); }}
            />
          )}
          {tab === "carteiras" && <WalletList wallets={wallets} entries={entries} onAdd={() => setModal("wallet")} />}
        </ScrollView>

        <BottomNav tab={tab} setTab={setTab} />
      </View>

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
      />
      <WalletModal
        visible={modal === "wallet"}
        onClose={() => setModal(null)}
        onSave={(wallet) => { setWallets((items) => [...items, { ...wallet, id: uid(), color: walletPalette[items.length % walletPalette.length] ?? COLORS.grape }]); setModal(null); }}
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
          setModal(null);
        }}
      />
      <SavingsPotDepositModal
        visible={modal === "potDeposit"}
        pot={selectedPot}
        onClose={() => { setModal(null); setSelectedPot(null); }}
        onSave={(value) => {
          if (!selectedPot) return;
          setSavingsPots(items => items.map(pot => pot.id === selectedPot.id ? {
            ...pot,
            contributions: [...pot.contributions, { id: uid(), value, createdAt: new Date().toISOString() }],
          } : pot));
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
        onSave={(value) => { setGoal(value); setAnalysis(null); setModal(null); }}
        onSignOut={signOut}
      />
      <AnalysisModal visible={modal === "analysis"} analysis={analysis} loading={analyzing} error={analysisError} onRetry={runAnalysis} onClose={() => setModal(null)} />
    </SafeAreaView>
  );
}

function Home({ userName, balance, recurringTotal, monthlyIncome, monthlyExpenses, entries, wallets, analysis, analyzing, hasGoal, onAnalyze, onRefresh, onAdd, onEditEntry, onWallet, onRecurring, onSavingsPot, onLifeCalculator }: {
  userName: string;
  balance: number; recurringTotal: number; monthlyIncome: number; monthlyExpenses: number; entries: Entry[]; wallets: Wallet[];
  analysis: AiAnalysis | null; analyzing: boolean; hasGoal: boolean; onAnalyze: () => void; onRefresh: () => void;
  onAdd: () => void; onEditEntry: (entry: Entry) => void; onWallet: () => void; onRecurring: () => void; onSavingsPot: () => void; onLifeCalculator: () => void;
}) {
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).toUpperCase();
  const balanceGradient: [string, string] = analysis?.status === "danger"
    ? ["#7C3453", "#4E244B"]
    : analysis?.status === "attention"
      ? ["#8550C8", "#5B32C8"]
      : ["#7951ED", "#5B32C8"];
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
          {aiStatusLabel && <View style={[styles.balanceAiBadge, { backgroundColor: aiStatusColor }]}><MaterialCommunityIcons name="creation" size={12} color={COLORS.ink} /><Text style={styles.balanceAiBadgeText}>{aiStatusLabel}</Text></View>}
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
        <Pressable style={styles.whiteButton} onPress={onAdd}>
          <Feather name="plus" size={18} color={COLORS.grapeDark} />
          <Text style={styles.whiteButtonText}>Novo lançamento</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.metricsRow}>
        <View style={[styles.metricCard, { backgroundColor: "#EAF8D0" }]}>
          <View style={[styles.iconBubble, { backgroundColor: "#799B22" }]}><Feather name="arrow-down-left" size={17} color="white" /></View>
          <Text style={styles.metricLabel}>Entrou este mês</Text>
          <Text style={styles.metricValue}>{money(monthlyIncome)}</Text>
        </View>
        <View style={[styles.metricCard, { backgroundColor: "#FFF0ED" }]}>
          <View style={[styles.iconBubble, { backgroundColor: COLORS.coral }]}><Feather name="arrow-up-right" size={17} color="white" /></View>
          <Text style={styles.metricLabel}>Saiu este mês</Text>
          <Text style={styles.metricValue}>{money(monthlyExpenses)}</Text>
        </View>
      </View>
      <View style={styles.commitmentCard}>
        <View style={[styles.iconBubble, { backgroundColor: "#87A928", marginBottom: 0 }]}><Feather name="repeat" size={16} color="white" /></View>
        <View style={styles.flex}><Text style={styles.metricLabel}>Já comprometido em gastos fixos</Text><Text style={styles.commitmentHint}>Contas ativas deste mês</Text></View>
        <Text style={styles.metricValue}>{money(recurringTotal)}</Text>
      </View>

      <SectionTitle title="Atalhos sem enrolação" />
      <View style={styles.quickRow}>
        <QuickAction icon="credit-card" label="Nova carteira" onPress={onWallet} />
        <QuickAction icon="calendar" label="Planejar mês" onPress={onRecurring} />
        <QuickAction icon="target" label="Meus cofrinhos" onPress={onSavingsPot} />
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
        {hasFilters ? (
          <Pressable style={styles.clearFilter} onPress={() => { setKindFilter("all"); setWalletFilter("all"); }}>
            <Feather name="x" size={14} color={COLORS.grape} />
            <Text style={styles.clearFilterText}>Limpar</Text>
          </Pressable>
        ) : <Feather name="sliders" size={18} color={COLORS.grape} />}
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

function WalletList({ wallets, entries, onAdd }: { wallets: Wallet[]; entries: Entry[]; onAdd: () => void }) {
  const walletBalance = (wallet: Wallet) => entries.filter(e => e.walletId === wallet.id).reduce((sum, e) => sum + (e.kind === "income" ? e.value : -e.value), wallet.initial);
  return (
    <>
      <PageHeader eyebrow="CADA REAL NO SEU CANTO" title="Carteiras" button="Criar" onPress={onAdd} />
      {wallets.map((wallet) => (
        <View key={wallet.id} style={[styles.walletCard, { backgroundColor: wallet.color }]}>
          <View style={styles.walletTop}><Feather name="credit-card" size={22} color="white" /><Text style={styles.walletDots}>••••</Text></View>
          <Text style={styles.walletName}>{wallet.name}</Text>
          <Text style={styles.walletBalance}>{money(walletBalance(wallet))}</Text>
        </View>
      ))}
      <Pressable style={styles.dashedButton} onPress={onAdd}><Feather name="plus" size={20} color={COLORS.grape} /><Text style={styles.dashedText}>Criar outra carteira</Text></Pressable>
    </>
  );
}

function SavingsPotList({ pots, onAdd, onDeposit }: { pots: SavingsPot[]; onAdd: () => void; onDeposit: (pot: SavingsPot) => void }) {
  return (
    <>
      <PageHeader eyebrow="UM POUQUINHO VIRA MUITO" title="Cofrinhos" button="Criar" onPress={onAdd} />
      {pots.length ? pots.map(pot => {
        const saved = pot.contributions.reduce((sum, contribution) => sum + contribution.value, 0);
        const progress = Math.min(100, Math.round((saved / pot.goal) * 100));
        const remaining = Math.max(0, pot.goal - saved);
        const deadline = new Date(new Date(pot.createdAt).getFullYear(), new Date(pot.createdAt).getMonth() + pot.months, 1);
        const monthlyTarget = pot.goal / pot.months;
        return (
          <View key={pot.id} style={styles.potCard}>
            <View style={styles.potTop}>
              <View style={styles.potIcon}><MaterialCommunityIcons name="piggy-bank-outline" size={25} color={COLORS.grape} /></View>
              <View style={styles.flex}><Text style={styles.potName}>{pot.name}</Text><Text style={styles.potDescription}>{pot.description || "Um objetivo com lugar marcado."}</Text></View>
              <Text style={styles.potPercent}>{progress}%</Text>
            </View>
            <View style={styles.potProgressTrack}><View style={[styles.potProgressFill, { width: `${progress}%` }]} /></View>
            <View style={styles.potValues}>
              <View><Text style={styles.potValueLabel}>JÁ GUARDOU</Text><Text style={styles.potSaved}>{money(saved)}</Text></View>
              <View style={styles.potGoalBlock}><Text style={styles.potValueLabel}>META</Text><Text style={styles.potGoal}>{money(pot.goal)}</Text></View>
            </View>
            <Text style={styles.potPlan}>{money(monthlyTarget)}/mês · até {deadline.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</Text>
            {remaining > 0 ? (
              <Pressable style={styles.potDepositButton} onPress={() => onDeposit(pot)}><Feather name="plus" size={17} color="white" /><Text style={styles.potDepositButtonText}>Colocar dinheiro</Text></Pressable>
            ) : (
              <View style={styles.potComplete}><Feather name="check-circle" size={17} color="#66851D" /><Text style={styles.potCompleteText}>Meta batida. Esse porquinho está forte!</Text></View>
            )}
          </View>
        );
      }) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><MaterialCommunityIcons name="piggy-bank-outline" size={25} color={COLORS.grape} /></View>
          <Text style={styles.emptyTitle}>Seu primeiro cofrinho</Text>
          <Text style={styles.emptyText}>Dê nome à meta e comece com qualquer valor.</Text>
          <Pressable style={styles.emptyPotButton} onPress={onAdd}><Text style={styles.emptyPotButtonText}>Criar cofrinho</Text></Pressable>
        </View>
      )}
    </>
  );
}

function PageHeader({ eyebrow, title, button, onPress }: { eyebrow: string; title: string; button: string; onPress: () => void }) {
  return <View style={styles.pageHeader}><View><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.h1}>{title}</Text></View><Pressable style={styles.smallButton} onPress={onPress}><Feather name="plus" size={16} color="white" /><Text style={styles.smallButtonText}>{button}</Text></Pressable></View>;
}

function EntryRow({ entry, wallet, last, onEdit }: { entry: Entry; wallet?: Wallet; last: boolean; onEdit?: () => void }) {
  const icon = entry.category === "Mercado" ? "shopping-bag" : entry.category === "Lazer" ? "coffee" : entry.kind === "income" ? "briefcase" : "tag";
  return (
    <View style={[styles.entryRow, !last && styles.entryBorder]}>
      <View style={[styles.entryIcon, { backgroundColor: entry.kind === "income" ? "#EAF8D0" : "#F1ECFF" }]}><Feather name={icon} size={18} color={entry.kind === "income" ? "#6F8D20" : COLORS.grape} /></View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{entry.title}</Text>
        <Text style={styles.rowMeta}>{entry.category} · {new Date(entry.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</Text>
        {wallet && <View style={styles.entryWallet}><View style={[styles.entryWalletDot, { backgroundColor: wallet.color }]} /><Text style={styles.entryWalletText}>{wallet.name}</Text></View>}
      </View>
      <Text style={[styles.rowValue, entry.kind === "income" && styles.income]}>{entry.kind === "income" ? "+" : "−"} {money(entry.value)}</Text>
      {onEdit && <Pressable style={styles.editEntryButton} onPress={onEdit} accessibilityLabel={`Editar ${entry.title}`}><Feather name="edit-2" size={14} color={COLORS.grape} /></Pressable>}
    </View>
  );
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return <View style={styles.sectionTitle}><Text style={styles.sectionTitleText}>{title}</Text>{action && <Text style={styles.sectionAction}>{action}</Text>}</View>;
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return <Pressable style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]} onPress={onPress}><View style={styles.quickIcon}><Feather name={icon} size={21} color={COLORS.grape} /></View><Text style={styles.quickLabel}>{label}</Text></Pressable>;
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: "inicio", label: "Início", icon: "home" }, { key: "movimentos", label: "Movimentos", icon: "list" },
    { key: "recorrentes", label: "Planejados", icon: "repeat" }, { key: "cofrinhos", label: "Cofrinhos", icon: "target" },
    { key: "carteiras", label: "Carteiras", icon: "credit-card" },
  ];
  return <View style={styles.nav}>{tabs.map((item) => <Pressable key={item.key} style={styles.navItem} onPress={() => setTab(item.key)}><Feather name={item.icon} size={21} color={tab === item.key ? COLORS.grape : "#AAA4B3"} /><Text style={[styles.navLabel, tab === item.key && styles.navActive]}>{item.label}</Text>{tab === item.key && <View style={styles.navDot} />}</Pressable>)}</View>;
}

function Sheet({ visible, title, subtitle, onClose, children }: { visible: boolean; title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} style={styles.modalWrap}><Pressable style={styles.backdrop} onPress={onClose} /><View style={styles.sheet}><View style={styles.handle} /><View style={styles.sheetHeader}><View style={styles.flex}><Text style={styles.sheetTitle}>{title}</Text><Text style={styles.sheetSubtitle}>{subtitle}</Text></View><Pressable style={styles.close} onPress={onClose}><Feather name="x" size={19} color={COLORS.ink} /></Pressable></View><ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} showsVerticalScrollIndicator={false}>{children}</ScrollView></View></KeyboardAvoidingView></Modal>;
}

function Field({ label, value, onChange, placeholder, keyboardType, secureTextEntry }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: "decimal-pad" | "number-pad" | "email-address";
  secureTextEntry?: boolean;
}) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#B4AFBB" keyboardType={keyboardType} secureTextEntry={secureTextEntry} autoCapitalize={keyboardType === "email-address" ? "none" : undefined} autoCorrect={keyboardType === "email-address" ? false : undefined} /></View>;
}

function EntryModal({ visible, wallets, item, onClose, onSave }: { visible: boolean; wallets: Wallet[]; item: Entry | null; onClose: () => void; onSave: (entry: Omit<Entry, "id">) => void }) {
  const today = new Date();
  const [kind, setKind] = useState<EntryKind>("expense"); const [title, setTitle] = useState(""); const [value, setValue] = useState(""); const [category, setCategory] = useState(categories[0]!); const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  const [referenceMonth, setReferenceMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [referenceDay, setReferenceDay] = useState(String(today.getDate()));
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
    setKind(item?.kind ?? "expense");
    setTitle(item?.title ?? "");
    setValue(item ? String(item.value).replace(".", ",") : "");
    setCategory(item?.category ?? categories[0]!);
    setWalletId(item?.walletId ?? wallets[0]?.id ?? "");
    setReferenceMonth(new Date(itemDate.getFullYear(), itemDate.getMonth(), 1));
    setReferenceDay(String(itemDate.getDate()));
  }, [visible, item, wallets]);
  const save = () => { const parsed = Number(value.replace(",", ".")); if (title.trim() && parsed > 0 && walletId && validDate) { onSave({ title: title.trim(), value: parsed, kind, category, walletId, createdAt: referenceDate.toISOString() }); } };
  return <Sheet visible={visible} title={item ? "Editar movimentação" : "Novo lançamento"} subtitle={item ? "Corrija os dados sem criar outro lançamento." : "Conta pra gente por onde o dinheiro passeou."} onClose={onClose}>
    <View style={styles.segment}><Pressable style={[styles.segmentItem, kind === "expense" && styles.segmentActive]} onPress={() => setKind("expense")}><Text style={[styles.segmentText, kind === "expense" && styles.segmentActiveText]}>Gasto</Text></Pressable><Pressable style={[styles.segmentItem, kind === "income" && styles.segmentActive]} onPress={() => setKind("income")}><Text style={[styles.segmentText, kind === "income" && styles.segmentActiveText]}>Entrada</Text></Pressable></View>
    <Field label="O que foi?" value={title} onChange={setTitle} placeholder="Ex.: almoço, salário..." />
    <Field label="Quanto?" value={value} onChange={setValue} placeholder="R$ 0,00" keyboardType="decimal-pad" />
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
    <Text style={styles.fieldLabel}>Categoria</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categories.map(c => <Pressable key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}><Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text></Pressable>)}</ScrollView>
    <Text style={styles.fieldLabel}>Carteira</Text><View style={styles.walletOptions}>{wallets.map(w => <Pressable key={w.id} style={[styles.walletOption, walletId === w.id && styles.walletOptionActive]} onPress={() => setWalletId(w.id)}><View style={[styles.colorDot, { backgroundColor: w.color }]} /><Text style={styles.walletOptionText}>{w.name}</Text>{walletId === w.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View>
    <PrimaryButton label={item ? "Salvar alterações" : "Salvar lançamento"} onPress={save} disabled={!title.trim() || !value || !validDate || !walletId} />
  </Sheet>;
}

function WalletModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (wallet: Omit<Wallet, "id" | "color">) => void }) {
  const [name, setName] = useState(""); const [initial, setInitial] = useState("");
  const save = () => { const parsed = Number(initial.replace(",", ".")) || 0; if (name.trim()) { onSave({ name: name.trim(), initial: parsed }); setName(""); setInitial(""); } };
  return <Sheet visible={visible} title="Nova carteira" subtitle="Um cantinho novo pro seu dinheiro." onClose={onClose}><Field label="Nome da carteira" value={name} onChange={setName} placeholder="Ex.: Conta do dia a dia" /><Field label="Saldo inicial" value={initial} onChange={setInitial} placeholder="R$ 0,00" keyboardType="decimal-pad" /><PrimaryButton label="Criar carteira" onPress={save} disabled={!name.trim()} /></Sheet>;
}

function RecurringModal({ visible, wallets, item, onClose, onSave }: { visible: boolean; wallets: Wallet[]; item: Recurring | null; onClose: () => void; onSave: (item: Omit<Recurring, "id" | "active">) => void }) {
  const [kind, setKind] = useState<EntryKind>("expense"); const [title, setTitle] = useState(""); const [value, setValue] = useState(""); const [day, setDay] = useState(""); const [category, setCategory] = useState("Casa"); const [walletId, setWalletId] = useState(wallets[0]?.id ?? "");
  useEffect(() => {
    if (!visible) return;
    setKind(item?.kind ?? "expense");
    setTitle(item?.title ?? "");
    setValue(item ? String(item.value).replace(".", ",") : "");
    setDay(item ? String(item.day) : "");
    setCategory(item?.category ?? "Casa");
    setWalletId(item?.walletId ?? wallets[0]?.id ?? "");
  }, [visible, item, wallets]);
  const save = () => {
    const parsed = Number(value.replace(",", ".")); const parsedDay = Number(day);
    if (title.trim() && parsed > 0 && parsedDay >= 1 && parsedDay <= 31 && walletId) {
      onSave({ title: title.trim(), value: parsed, day: parsedDay, category: kind === "income" ? "Salário" : category, kind, walletId });
      setTitle(""); setValue(""); setDay("");
    }
  };
  return <Sheet visible={visible} title={item ? "Editar planejamento" : "Planejar o mês"} subtitle={item ? "Ajuste os próximos meses sem perder o histórico." : "Entradas e gastos no dia certo, sem depender da memória."} onClose={onClose}>
    <View style={styles.segment}>
      <Pressable style={[styles.segmentItem, kind === "expense" && styles.segmentActive]} onPress={() => setKind("expense")}><Text style={[styles.segmentText, kind === "expense" && styles.segmentActiveText]}>Gasto fixo</Text></Pressable>
      <Pressable style={[styles.segmentItem, kind === "income" && styles.segmentActive]} onPress={() => setKind("income")}><Text style={[styles.segmentText, kind === "income" && styles.segmentActiveText]}>Salário / entrada</Text></Pressable>
    </View>
    <Field label={kind === "income" ? "Qual entrada?" : "Qual gasto?"} value={title} onChange={setTitle} placeholder={kind === "income" ? "Ex.: salário" : "Ex.: aluguel, internet..."} />
    <Field label="Valor" value={value} onChange={setValue} placeholder="R$ 0,00" keyboardType="decimal-pad" />
    <Field label={kind === "income" ? "Depositar em qual dia?" : "Vence em qual dia?"} value={day} onChange={setDay} placeholder="Ex.: 10" keyboardType="number-pad" />
    {kind === "expense" && <>
      <Text style={styles.fieldLabel}>Categoria</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categories.map(c => <Pressable key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}><Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text></Pressable>)}</ScrollView>
    </>}
      <Text style={styles.fieldLabel}>{kind === "income" ? "Carteira que recebe" : "Carteira usada no pagamento"}</Text>
      <View style={styles.walletOptions}>{wallets.map(wallet => <Pressable key={wallet.id} style={[styles.walletOption, walletId === wallet.id && styles.walletOptionActive]} onPress={() => setWalletId(wallet.id)}><View style={[styles.colorDot, { backgroundColor: wallet.color }]} /><Text style={styles.walletOptionText}>{wallet.name}</Text>{walletId === wallet.id && <Feather name="check" size={17} color={COLORS.grape} />}</Pressable>)}</View>
      {kind === "income" && <View style={styles.autoPostNote}><Feather name="zap" size={16} color="#66851D" /><Text style={styles.autoPostText}>O valor será contabilizado na data programada, mesmo que o Nenero fique fechado naquele dia.</Text></View>}
    <PrimaryButton label={item ? "Salvar alterações" : kind === "income" ? "Programar entrada" : "Salvar gasto fixo"} onPress={save} disabled={!title.trim() || !value || !day || !walletId} />
  </Sheet>;
}

function SavingsPotModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (pot: Pick<SavingsPot, "name" | "description" | "goal" | "months">) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [months, setMonths] = useState("9");
  useEffect(() => {
    if (visible) { setName(""); setDescription(""); setGoalValue(""); setMonths("9"); }
  }, [visible]);
  const goal = Number(goalValue.replace(",", "."));
  const parsedMonths = Number(months);
  const valid = Boolean(name.trim()) && goal > 0 && parsedMonths >= 1 && parsedMonths <= 120;
  return <Sheet visible={visible} title="Novo cofrinho" subtitle="Dê um destino para cada real guardado." onClose={onClose}>
    <Field label="Nome do cofrinho" value={name} onChange={setName} placeholder="Ex.: Viagem, notebook, reserva..." />
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
    <Field label="Quanto quer juntar?" value={goalValue} onChange={setGoalValue} placeholder="R$ 1.800,00" keyboardType="decimal-pad" />
    <Field label="Em quantos meses?" value={months} onChange={setMonths} placeholder="Ex.: 9" keyboardType="number-pad" />
    {goal > 0 && parsedMonths > 0 && <View style={styles.potPreview}><Feather name="calendar" size={17} color={COLORS.grape} /><Text style={styles.potPreviewText}>Para chegar lá: {money(goal / parsedMonths)} por mês.</Text></View>}
    <PrimaryButton label="Criar cofrinho" onPress={() => valid && onSave({ name: name.trim(), description: description.trim(), goal, months: parsedMonths })} disabled={!valid} />
  </Sheet>;
}

function SavingsPotDepositModal({ visible, pot, onClose, onSave }: { visible: boolean; pot: SavingsPot | null; onClose: () => void; onSave: (value: number) => void }) {
  const [customValue, setCustomValue] = useState("");
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  useEffect(() => {
    if (visible) { setCustomValue(""); setSelectedValue(null); }
  }, [visible, pot]);
  const custom = Number(customValue.replace(",", "."));
  const value = selectedValue ?? custom;
  const saved = pot?.contributions.reduce((sum, contribution) => sum + contribution.value, 0) ?? 0;
  const remaining = Math.max(0, (pot?.goal ?? 0) - saved);
  return <Sheet visible={visible} title={`Guardar em ${pot?.name ?? "cofrinho"}`} subtitle={`Faltam ${money(remaining)} para bater a meta.`} onClose={onClose}>
    <Text style={styles.fieldLabel}>Escolha um valor rápido</Text>
    <View style={styles.quickDepositRow}>
      {[100, 150, 200].map(amount => <Pressable key={amount} style={[styles.quickDeposit, selectedValue === amount && styles.quickDepositActive]} onPress={() => { setSelectedValue(amount); setCustomValue(""); }}><Text style={[styles.quickDepositText, selectedValue === amount && styles.quickDepositTextActive]}>{money(amount)}</Text></Pressable>)}
    </View>
    <Field label="Outro valor" value={customValue} onChange={(text) => { setCustomValue(text); setSelectedValue(null); }} placeholder="R$ 0,00" keyboardType="decimal-pad" />
    {value > remaining && remaining > 0 && <Text style={styles.potOverGoal}>Esse aporte passa a meta em {money(value - remaining)}. Pode comemorar adiantado.</Text>}
    <PrimaryButton label={`Guardar ${value > 0 ? money(value) : "dinheiro"}`} onPress={() => value > 0 && onSave(value)} disabled={!value || value <= 0} />
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
  const monthlyExpenses = monthEntries.filter(entry => entry.kind === "expense").reduce((sum, entry) => sum + entry.value, 0);
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
        saved: pot.contributions.reduce((sum, contribution) => sum + contribution.value, 0),
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

  const verdictColor = verdict?.status === "not_worth_it" ? COLORS.coral : verdict?.status === "think_twice" ? "#D69A20" : "#789B22";
  return <Sheet visible={visible} title="Calculadora de vida gasta" subtitle="Converta preço em tempo de trabalho antes de passar o cartão." onClose={onClose}>
    <View style={styles.lifeSalaryCard}>
      <Text style={styles.lifeSalaryLabel}>SALÁRIO IDENTIFICADO NESTE MÊS</Text>
      <Text style={styles.lifeSalaryValue}>{money(monthlySalary)}</Text>
      <Text style={styles.lifeSalaryHint}>{monthlySalary > 0 ? `Sua hora vale aproximadamente ${money(hourlyIncome)}.` : "Cadastre uma entrada como Salário ou Renda para calcular."}</Text>
    </View>
    <Field label="O que você quer comprar?" value={product} onChange={setProduct} placeholder="Ex.: celular, tênis, viagem..." />
    <Field label="Preço do produto" value={priceText} onChange={(text) => { setPriceText(text); setCalculatedHours(null); setVerdict(null); }} placeholder="R$ 0,00" keyboardType="decimal-pad" />
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

function ProfileModal({ visible, goal, userName, userEmail, userInitials, onClose, onSave, onSignOut }: {
  visible: boolean;
  goal: string;
  userName: string;
  userEmail: string;
  userInitials: string;
  onClose: () => void;
  onSave: (goal: string) => void;
  onSignOut: () => void;
}) {
  const [draft, setDraft] = useState(goal);
  useEffect(() => { if (visible) setDraft(goal); }, [visible, goal]);
  return <Sheet visible={visible} title="Seu perfil" subtitle="Diga ao Nenero onde você quer chegar." onClose={onClose}>
    <View style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{userInitials}</Text></View><View style={styles.flex}><Text style={styles.profileName}>{userName}</Text><Text style={styles.profileMeta}>{userEmail}</Text></View></View>
    <Text style={styles.fieldLabel}>Meu objetivo financeiro</Text>
    <TextInput
      style={styles.goalInput}
      value={draft}
      onChangeText={setDraft}
      multiline
      maxLength={600}
      placeholder="Ex.: Quero guardar R$ 800 por mês para montar minha reserva de emergência e reduzir os gastos com delivery."
      placeholderTextColor="#A9A3B2"
      textAlignVertical="top"
    />
    <Text style={styles.goalHint}>Escreva como se estivesse conversando com alguém. A IA usará esse objetivo para avaliar o mês.</Text>
    <PrimaryButton label="Salvar objetivo" onPress={() => onSave(draft.trim())} disabled={!draft.trim()} />
    <Pressable style={styles.signOutButton} onPress={onSignOut}><Feather name="log-out" size={16} color="#B54337" /><Text style={styles.signOutButtonText}>Sair desta conta</Text></Pressable>
  </Sheet>;
}

function AppLoadingScreen() {
  return <SafeAreaView style={styles.authSafe}>
    <StatusBar style="dark" />
    <View style={styles.loadingScreen}>
      <View style={styles.authBrandMark}><Text style={styles.authBrandFace}>◡</Text></View>
      <ActivityIndicator color={COLORS.grape} />
      <Text style={styles.loadingText}>Abrindo seu Nenero...</Text>
    </View>
  </SafeAreaView>;
}

function SupabaseSetupScreen() {
  return <SafeAreaView style={styles.authSafe}>
    <StatusBar style="dark" />
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
    <StatusBar style="dark" />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  authSafe: { flex: 1, backgroundColor: "#F3EEFF" },
  authKeyboard: { flex: 1 },
  authScroll: { flexGrow: 1, justifyContent: "center", padding: 24, maxWidth: 480, width: "100%", alignSelf: "center" },
  authBrandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 30 },
  authBrandMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: COLORS.grape, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] },
  authBrandFace: { color: COLORS.white, fontSize: 30, fontWeight: "900", marginTop: -7 },
  authBrand: { color: COLORS.ink, fontSize: 29, fontWeight: "900", letterSpacing: -1.5 },
  authTitle: { color: COLORS.ink, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -1.2 },
  authSubtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 9, marginBottom: 22 },
  authCard: { backgroundColor: COLORS.white, borderRadius: 25, padding: 20, borderWidth: 1, borderColor: COLORS.line, shadowColor: COLORS.grapeDark, shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  authError: { color: "#B54337", backgroundColor: "#FFF0ED", borderRadius: 12, padding: 11, fontSize: 11, lineHeight: 16 },
  authSuccess: { color: "#58721B", backgroundColor: "#F0F9D9", borderRadius: 12, padding: 11, fontSize: 11, lineHeight: 16 },
  authSwitch: { alignItems: "center", paddingTop: 18, paddingBottom: 4 },
  authSwitchText: { color: COLORS.grape, fontSize: 11, fontWeight: "900" },
  authPrivacy: { color: COLORS.muted, fontSize: 10, textAlign: "center", marginTop: 18 },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  loadingText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  setupScreen: { flex: 1, justifyContent: "center", padding: 28, maxWidth: 480, width: "100%", alignSelf: "center" },
  setupCode: { backgroundColor: COLORS.ink, borderRadius: 16, padding: 16, gap: 8 },
  setupCodeText: { color: COLORS.lime, fontSize: 11, fontWeight: "800" },
  app: { flex: 1, backgroundColor: COLORS.paper, maxWidth: 620, width: "100%", alignSelf: "center" },
  topbar: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  cloudError: { marginHorizontal: 20, marginBottom: 8, borderRadius: 13, backgroundColor: "#FFF0ED", padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  cloudErrorText: { flex: 1, color: "#B54337", fontSize: 10, lineHeight: 14, fontWeight: "700" },
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
  balanceLabel: { color: "#DED3FF", fontSize: 13, fontWeight: "700" },
  balanceAiBadge: { minHeight: 25, borderRadius: 13, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  balanceAiBadgeText: { color: COLORS.ink, fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  balanceValue: { color: "white", fontSize: 39, fontWeight: "900", letterSpacing: -1.8, marginTop: 7 },
  balanceCopy: { color: "#E9E3FA", fontSize: 13, marginTop: 7, marginBottom: 23 },
  balanceAnalysis: { marginTop: 7, marginBottom: 18 },
  balanceAnalysisHeadline: { color: COLORS.white, fontSize: 14, fontWeight: "900" },
  balanceAnalysisSummary: { color: "#E9E3FA", fontSize: 11, lineHeight: 16, marginTop: 4 },
  whiteButton: { alignSelf: "flex-start", backgroundColor: "white", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 },
  whiteButtonText: { color: COLORS.grapeDark, fontWeight: "800", fontSize: 13 },
  metricsRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  metricCard: { flex: 1, padding: 16, borderRadius: 20 },
  iconBubble: { width: 30, height: 30, borderRadius: 11, justifyContent: "center", alignItems: "center", marginBottom: 13 },
  metricLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  metricValue: { color: COLORS.ink, fontSize: 17, fontWeight: "900", marginTop: 4, letterSpacing: -0.5 },
  commitmentCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F0F9D9", borderRadius: 18, padding: 14, marginTop: 12 },
  commitmentHint: { color: "#71804A", fontSize: 9, marginTop: 3 },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 12 },
  sectionTitleText: { color: COLORS.ink, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  sectionAction: { color: COLORS.grape, fontSize: 12, fontWeight: "800" },
  quickRow: { flexDirection: "row", gap: 10 },
  quickAction: { flex: 1, minHeight: 102, backgroundColor: COLORS.white, borderRadius: 18, padding: 13, justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.line },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  quickIcon: { width: 36, height: 36, backgroundColor: "#F0EBFF", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLabel: { color: COLORS.ink, fontSize: 12, lineHeight: 15, fontWeight: "800" },
  lifeFeatureCard: { minHeight: 76, backgroundColor: "#EEE8FF", borderRadius: 19, padding: 14, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#D9CDF8" },
  lifeFeatureIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  lifeFeatureEyebrow: { color: COLORS.grape, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  lifeFeatureTitle: { color: COLORS.ink, fontSize: 13, lineHeight: 17, fontWeight: "900", marginTop: 3 },
  listCard: { backgroundColor: COLORS.white, borderRadius: 20, paddingHorizontal: 15, borderWidth: 1, borderColor: COLORS.line },
  entryRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12 },
  entryBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  entryIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  rowTitle: { color: COLORS.ink, fontSize: 13, fontWeight: "800" },
  rowMeta: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  entryWallet: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  entryWalletDot: { width: 6, height: 6, borderRadius: 3 },
  entryWalletText: { color: COLORS.muted, fontSize: 9, fontWeight: "700" },
  rowValue: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
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
  clearFilter: { flexDirection: "row", alignItems: "center", gap: 3 },
  clearFilterText: { color: COLORS.grape, fontSize: 11, fontWeight: "900" },
  filterLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 7 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  filterScroll: { gap: 8, paddingBottom: 18 },
  filterChip: { minHeight: 37, paddingHorizontal: 13, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", gap: 7 },
  filterChipActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  filterChipText: { color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  filterChipTextActive: { color: COLORS.white },
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
  payButtonText: { color: COLORS.white, fontSize: 10, fontWeight: "900" },
  pauseButton: { backgroundColor: "#F0EBFF", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  pauseButtonText: { color: COLORS.grape, fontSize: 10, fontWeight: "900" },
  disabledRow: { opacity: 0.48 },
  dateBadge: { width: 45, height: 48, borderRadius: 13, backgroundColor: "#F0EBFF", alignItems: "center", justifyContent: "center" },
  incomeDateBadge: { backgroundColor: "#EAF8D0" },
  dateSmall: { color: COLORS.grape, fontSize: 8, fontWeight: "900" },
  dateBig: { color: COLORS.grapeDark, fontSize: 18, fontWeight: "900" },
  walletCard: { minHeight: 162, borderRadius: 25, padding: 20, marginBottom: 14, shadowColor: COLORS.ink, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  walletTop: { flexDirection: "row", justifyContent: "space-between" },
  walletDots: { color: "rgba(255,255,255,0.7)", letterSpacing: 2 },
  walletName: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700", marginTop: 29 },
  walletBalance: { color: "white", fontSize: 26, fontWeight: "900", marginTop: 4, letterSpacing: -0.8 },
  dashedButton: { height: 58, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#B9A8EC", borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  dashedText: { color: COLORS.grape, fontSize: 12, fontWeight: "800" },
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
  potDepositButton: { height: 45, backgroundColor: COLORS.grape, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  potDepositButtonText: { color: COLORS.white, fontSize: 12, fontWeight: "900" },
  potComplete: { minHeight: 45, backgroundColor: "#EAF8D0", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  potCompleteText: { color: "#66851D", fontSize: 11, fontWeight: "900" },
  emptyPotButton: { backgroundColor: COLORS.grape, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 11, marginTop: 16 },
  emptyPotButtonText: { color: COLORS.white, fontSize: 11, fontWeight: "900" },
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
  quickDepositRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  quickDeposit: { flex: 1, height: 48, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" },
  quickDepositActive: { backgroundColor: COLORS.grape, borderColor: COLORS.grape },
  quickDepositText: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  quickDepositTextActive: { color: COLORS.white },
  potOverGoal: { color: "#66851D", backgroundColor: "#EAF8D0", fontSize: 10, lineHeight: 15, fontWeight: "700", borderRadius: 12, padding: 11, marginBottom: 14 },
  lifeSalaryCard: { backgroundColor: COLORS.sky, borderRadius: 19, padding: 17, marginBottom: 18 },
  lifeSalaryLabel: { color: "#36758C", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  lifeSalaryValue: { color: COLORS.ink, fontSize: 25, fontWeight: "900", marginTop: 5 },
  lifeSalaryHint: { color: "#4D7481", fontSize: 10, lineHeight: 14, marginTop: 4 },
  lifeHoursHint: { color: COLORS.muted, fontSize: 9, lineHeight: 14, marginTop: -8, marginBottom: 15 },
  lifeResultCard: { backgroundColor: COLORS.ink, borderRadius: 20, padding: 18, marginTop: 16 },
  lifeResultEyebrow: { color: COLORS.lime, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  lifeResultValue: { color: COLORS.white, fontSize: 25, fontWeight: "900", marginTop: 5 },
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
  chip: { borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20 },
  chipActive: { backgroundColor: "#EDE6FF", borderColor: "#BBA7F4" },
  chipText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  chipTextActive: { color: COLORS.grapeDark },
  walletOptions: { gap: 8, marginBottom: 5 },
  walletOption: { minHeight: 48, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 10 },
  walletOptionActive: { borderColor: "#B9A6EE", backgroundColor: "#F3EFFF" },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  walletOptionText: { flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: "700" },
  autoPostNote: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#F0F9D9", borderRadius: 14, padding: 12, marginTop: 10 },
  autoPostText: { flex: 1, color: "#58721B", fontSize: 10, lineHeight: 14, fontWeight: "700" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: COLORS.white, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: COLORS.line, marginBottom: 20 },
  profileAvatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: COLORS.lime, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: COLORS.ink, fontSize: 14, fontWeight: "900" },
  profileName: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  profileMeta: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  signOutButton: { height: 48, borderRadius: 15, borderWidth: 1, borderColor: "#F0BEB8", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  signOutButtonText: { color: "#B54337", fontSize: 11, fontWeight: "900" },
  goalInput: { minHeight: 130, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, padding: 14, color: COLORS.ink, fontSize: 13, lineHeight: 19 },
  goalHint: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
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

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}
