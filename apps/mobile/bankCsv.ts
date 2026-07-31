export type BankMovementKind = "expense" | "income";

export type ParsedBankTransaction = {
  importId: string;
  identifier?: string;
  title: string;
  originalDescription: string;
  value: number;
  kind: BankMovementKind;
  category: string;
  createdAt: string;
  transferLike: boolean;
  reviewReason?: string;
};

export type ParsedBankStatement = {
  bankName: string;
  accountLabel?: string;
  transactions: ParsedBankTransaction[];
  ignoredRows: number;
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .replace(/\s+/g, " ")
  .trim();

const parseCsvLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
};

const parseBankDate = (value: string) => {
  const brazilian = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilian) {
    const [, day, month, year] = brazilian;
    return new Date(Number(year), Number(month) - 1, Number(day), 12).toISOString();
  }
  const international = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (international) {
    const [, year, month, day] = international;
    return new Date(Number(year), Number(month) - 1, Number(day), 12).toISOString();
  }
  return null;
};

const parseBankMoney = (value: string) => {
  let cleaned = value.trim().replace(/[R$\s"]/g, "");
  const negativeByParentheses = cleaned.startsWith("(") && cleaned.endsWith(")");
  cleaned = cleaned.replace(/[()]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    cleaned = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0 && /^\-?\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "");
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negativeByParentheses ? -Math.abs(parsed) : parsed;
};

const displayName = (value: string) => {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed !== trimmed.toLocaleUpperCase("pt-BR")) return trimmed;
  const connectors = new Set(["da", "das", "de", "do", "dos", "e"]);
  return trimmed.toLocaleLowerCase("pt-BR").split(" ").map((part, index) => (
    index > 0 && connectors.has(part)
      ? part
      : `${part.charAt(0).toLocaleUpperCase("pt-BR")}${part.slice(1)}`
  )).join(" ");
};

const transactionTitle = (history: string, description: string) => {
  const combined = [history, description].filter(Boolean).join(" - ");
  const normalizedCombined = normalize(combined);
  const pixDescription = (description || history).match(
    /transfer[eê]ncia\s+(?:enviada|recebida)\s+pelo\s+pix\s*-\s*([^-]+)/i,
  );
  if (pixDescription?.[1]) return displayName(pixDescription[1]);
  if (normalize(history).startsWith("pix ") && description && !/^\d+$/.test(description)) {
    return displayName(description);
  }
  if (normalizedCombined.includes("pagamento de fatura") || normalizedCombined.includes("pagamento fatura")) {
    return "Pagamento de fatura";
  }
  if (normalizedCombined.includes("valor adicionado na conta por cartao de credito")) {
    return "Pix no Crédito";
  }
  if (normalizedCombined.includes("aplicacao")) {
    return description ? `Aplicação · ${displayName(description)}` : displayName(history || description);
  }
  if (normalizedCombined.includes("resgate")) {
    return description && !/^\d+$/.test(description)
      ? `Resgate · ${displayName(description)}`
      : displayName(history || description);
  }
  if (description && !/^\d+$/.test(description)) return displayName(description);
  return displayName(history || description || "Movimentação bancária");
};

const suggestedCategory = (description: string, kind: BankMovementKind) => {
  const text = normalize(description);
  if (kind === "income") {
    if (text.includes("salario")) return "Salário";
    if (text.includes("freelance") || text.includes("freela")) return "Freelance";
    if (text.includes("ferias")) return "Férias";
    if (text.includes("bonific") || text.includes("bonus")) return "Bonificações";
    if (text.includes("13o") || text.includes("decimo terceiro")) return "13º salário";
    if (text.includes("rendimento") || text.includes("juros") || text.includes("pontos")) return "Rendimentos";
    if (text.includes("reembolso") || text.includes("estorno")) return "Reembolso";
    if (text.includes("venda")) return "Venda";
    return "Outras entradas";
  }
  if (/(mercado|mercadinho|supermercado|atacadao|hortifruti|padaria)/.test(text)) return "Mercado";
  if (/(ifood|delivery|rappi|aiqfome|ubereats)/.test(text)) return "Delivery";
  if (/(escola|colegio|faculdade|universidade|curso|livraria)/.test(text)) return "Educação";
  if (/(farmacia|drogaria|hospital|clinica|medico|dentista|laboratorio)/.test(text)) return "Saúde";
  if (/(uber|99app|taxi|posto|combustivel|gasolina|onibus|metro|estacionamento)/.test(text)) return "Transporte";
  if (/(aluguel|condominio|energia|eletricidade|agua|internet|telefone|casa)/.test(text)) return "Casa";
  if (/(netflix|spotify|amazon prime|hbo|disney|assinatura|mensalidade)/.test(text)) return "Assinatura";
  if (/(cinema|bar|restaurante|lanchonete|show|ingresso|jogo)/.test(text)) return "Lazer";
  return "Outros";
};

const transferReview = (description: string) => {
  const text = normalize(description);
  if (text.includes("aplicacao") || text.includes("resgate")) {
    return "Parece movimentação entre conta e investimento";
  }
  if (text.includes("valor adicionado na conta por cartao de credito")) {
    return "Parece crédito usado para financiar outro pagamento";
  }
  if (text.includes("dep conta intl") || text.includes("conta internacional")) {
    return "Parece transferência para outra conta sua";
  }
  return null;
};

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const findHeader = (lines: string[]) => {
  const delimiters = [";", ",", "\t"];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    for (const delimiter of delimiters) {
      const cells = parseCsvLine(lines[lineIndex]!, delimiter);
      const headers = cells.map(normalize);
      const hasDate = headers.some((header) => header === "data" || header.includes("data lancamento"));
      const hasValue = headers.some((header) => (
        header === "valor" ||
        header === "amount" ||
        header.includes("debito") ||
        header.includes("credito")
      ));
      const hasDescription = headers.some((header) => (
        header.includes("descricao") ||
        header.includes("historico") ||
        header.includes("detalhes") ||
        header.includes("memo")
      ));
      if (hasDate && hasValue && hasDescription) {
        return { lineIndex, delimiter, headers };
      }
    }
  }
  return null;
};

const findColumn = (headers: string[], matches: string[]) => headers.findIndex((header) => (
  matches.some((match) => header === match || header.includes(match))
));

export function parseBankCsv(content: string, fileName: string): ParsedBankStatement {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = findHeader(lines);
  if (!header) {
    throw new Error("Não encontrei colunas de data, descrição e valor neste CSV.");
  }

  const dateIndex = findColumn(header.headers, ["data lancamento", "data"]);
  const valueIndex = findColumn(header.headers, ["valor", "amount"]);
  const debitIndex = findColumn(header.headers, ["debito"]);
  const creditIndex = findColumn(header.headers, ["credito"]);
  const historyIndex = header.headers.findIndex((column) => (
    column === "historico" || column === "lancamento" || column === "historical"
  ));
  const descriptionIndex = findColumn(header.headers, ["descricao", "detalhes", "memo"]);
  const identifierIndex = findColumn(header.headers, ["identificador", "transaction id", "id transacao"]);
  const balanceIndex = findColumn(header.headers, ["saldo"]);
  const accountLine = lines
    .slice(0, header.lineIndex)
    .map((line) => parseCsvLine(line, header.delimiter))
    .find((cells) => normalize(cells[0] ?? "") === "conta");
  const accountLabel = accountLine?.[1]?.trim() || undefined;
  const normalizedFileName = normalize(fileName);
  const normalizedContentStart = normalize(lines.slice(0, Math.min(lines.length, 8)).join(" "));
  const bankName = (
    identifierIndex >= 0 ||
    normalizedFileName.startsWith("nu_") ||
    normalizedContentStart.includes("nubank")
  )
    ? "Nubank"
    : normalizedContentStart.includes("extrato conta corrente")
      ? "Banco Inter"
      : "Extrato bancário";

  const occurrenceBySignature = new Map<string, number>();
  const transactions: ParsedBankTransaction[] = [];
  let ignoredRows = 0;

  for (const line of lines.slice(header.lineIndex + 1)) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line, header.delimiter);
    const createdAt = dateIndex >= 0 ? parseBankDate(cells[dateIndex] ?? "") : null;
    let signedValue = valueIndex >= 0 ? parseBankMoney(cells[valueIndex] ?? "") : null;
    if (signedValue === null && (debitIndex >= 0 || creditIndex >= 0)) {
      const debit = debitIndex >= 0 ? parseBankMoney(cells[debitIndex] ?? "") : null;
      const credit = creditIndex >= 0 ? parseBankMoney(cells[creditIndex] ?? "") : null;
      signedValue = credit && credit !== 0 ? Math.abs(credit) : debit && debit !== 0 ? -Math.abs(debit) : null;
    }
    if (!createdAt || signedValue === null || signedValue === 0) {
      ignoredRows += 1;
      continue;
    }

    const history = historyIndex >= 0 ? cells[historyIndex]?.trim() ?? "" : "";
    const description = descriptionIndex >= 0 ? cells[descriptionIndex]?.trim() ?? "" : "";
    const originalDescription = [history, description].filter(Boolean).join(" · ");
    const kind: BankMovementKind = signedValue < 0 ? "expense" : "income";
    const identifier = identifierIndex >= 0 ? cells[identifierIndex]?.trim() || undefined : undefined;
    const balance = balanceIndex >= 0 ? cells[balanceIndex]?.trim() ?? "" : "";
    const reviewReason = transferReview(originalDescription);
    const signature = [
      bankName,
      accountLabel ?? "",
      createdAt.slice(0, 10),
      signedValue.toFixed(2),
      identifier ?? "",
      normalize(originalDescription),
      balance,
    ].join("|");
    const occurrence = (occurrenceBySignature.get(signature) ?? 0) + 1;
    occurrenceBySignature.set(signature, occurrence);

    transactions.push({
      importId: `bank-csv-${stableHash(`${signature}|${occurrence}`)}`,
      identifier,
      title: transactionTitle(history, description),
      originalDescription,
      value: Math.abs(signedValue),
      kind,
      category: suggestedCategory(originalDescription, kind),
      createdAt,
      transferLike: Boolean(reviewReason),
      reviewReason: reviewReason ?? undefined,
    });
  }

  if (!transactions.length) {
    throw new Error("O CSV foi aberto, mas não encontrei movimentações válidas.");
  }

  return { bankName, accountLabel, transactions, ignoredRows };
}
