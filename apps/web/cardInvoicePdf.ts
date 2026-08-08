import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  type ParsedBankStatement,
  type ParsedBankTransaction,
  parseBankMoney,
  stableHash,
  suggestedCategory,
} from "./bankCsv";

const MONTHS: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

const normalizeSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const parseInvoiceDate = (value: string) => {
  const match = value.match(/^(\d{1,2}) de ([a-zç]{3})\.? (\d{4})$/i);
  if (!match) return null;
  const month = MONTHS[match[2]!.toLocaleLowerCase("pt-BR")];
  if (month === undefined) return null;
  return new Date(Number(match[3]), month, Number(match[1]), 12).toISOString();
};

type PdfTextItem = { str: string; transform: number[] };

const pageLines = (items: PdfTextItem[]) => {
  const grouped = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5]! * 2) / 2;
    grouped.set(y, [...(grouped.get(y) ?? []), item]);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, lineItems]) => lineItems.sort((a, b) => a.transform[4]! - b.transform[4]!));
};

export async function parseInterInvoicePdf(data: ArrayBuffer, fileName: string): Promise<ParsedBankStatement> {
  const document = await getDocument({ data: new Uint8Array(data) }).promise;
  const transactions: ParsedBankTransaction[] = [];
  const occurrences = new Map<string, number>();
  let ignoredRows = 0;
  let invoiceTotal: number | null = null;
  let currentCard = "";
  let isInterInvoice = false;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = pageLines(content.items as PdfTextItem[]);
    const pageText = lines.flat().map((item) => item.str).join(" ");
    if (/Banco Inter|Resumo da fatura|Despesas da fatura/i.test(pageText)) isInterInvoice = true;
    const totalMatch = pageText.match(/Total da sua fatura\s+R\$\s+([\d.,]+)/i);
    if (totalMatch) invoiceTotal = parseBankMoney(totalMatch[1]!) ?? invoiceTotal;

    for (const items of lines) {
      const cells = items.map((item) => normalizeSpaces(item.str)).filter(Boolean);
      const line = cells.join(" ");
      const cardMatch = line.match(/^CARTÃO\s+(\d{4}\*+\d{4})$/i);
      if (cardMatch) {
        currentCard = cardMatch[1]!;
        continue;
      }
      const dateMatch = line.match(/^(\d{1,2} de [a-zç]{3}\.? \d{4})\s+(.+)$/i);
      if (!dateMatch) continue;
      const createdAt = parseInvoiceDate(dateMatch[1]!);
      const moneyIndex = cells.findLastIndex((cell) => /^(?:\+\s*)?R\$\s*[\d.,]+$/.test(cell));
      if (!createdAt || moneyIndex < 0) {
        ignoredRows += 1;
        continue;
      }
      const signedText = cells[moneyIndex]!;
      const value = parseBankMoney(signedText.replace("+", ""));
      if (!value || value <= 0) {
        ignoredRows += 1;
        continue;
      }
      const dateCellCount = cells.findIndex((cell) => cell.includes(dateMatch[1]!)) + 1;
      const detailCells = cells.slice(Math.max(1, dateCellCount), moneyIndex).filter((cell) => cell !== "-");
      let description = normalizeSpaces(detailCells.join(" "))
        .replace(/^P AGAMENTO\b/i, "PAGAMENTO")
        .replace(/\(Parcela\s+(\d+) de (\d+)\)/i, "· Parcela $1/$2");
      if (!description) description = "Compra no cartão";
      const payment = /^\+/.test(signedText) || /pagamento/i.test(description);
      const kind = payment ? "income" as const : "expense" as const;
      const signature = ["Banco Inter", currentCard, createdAt.slice(0, 10), value.toFixed(2), description].join("|");
      const occurrence = (occurrences.get(signature) ?? 0) + 1;
      occurrences.set(signature, occurrence);
      transactions.push({
        importId: `card-pdf-${stableHash(`${signature}|${occurrence}`)}`,
        title: description,
        originalDescription: [description, currentCard].filter(Boolean).join(" · "),
        value,
        kind,
        category: suggestedCategory(description, kind),
        createdAt,
        transferLike: payment,
        reviewReason: payment ? "Pagamento da fatura: evite importar se ele já aparece no extrato da conta" : undefined,
      });
    }
  }

  if (!isInterInvoice) throw new Error("Este PDF não parece ser uma fatura do Banco Inter.");
  if (!transactions.length) throw new Error("A fatura foi aberta, mas não encontrei compras válidas.");
  const expenseTotal = transactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.value, 0);
  const totalMatches = invoiceTotal === null || Math.abs(expenseTotal - invoiceTotal) < 0.011;
  return {
    bankName: "Banco Inter · Fatura",
    accountLabel: currentCard || undefined,
    transactions,
    ignoredRows,
    validationMessage: invoiceTotal === null
      ? "Compras encontradas; o total da fatura não pôde ser conferido automaticamente."
      : totalMatches
        ? `Valores conferidos com o total da fatura (R$ ${invoiceTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`
        : `Atenção: as compras somam R$ ${expenseTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}, mas a fatura informa R$ ${invoiceTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
  };
}
