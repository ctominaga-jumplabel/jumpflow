// Backfill da criptografia dos valores de recebimento do consultor.
//
// Roda DEPOIS da migration 20261022120100_encrypt_consultant_cost_values, que
// converteu as colunas para TEXT mantendo os valores em claro. Este script:
//   1. cifra (AES-256-GCM, chave FIELD_ENCRYPTION_KEY) todo valor ainda em claro
//      nas colunas listadas em ENCRYPTED_COLUMNS;
//   2. cifra também esses mesmos valores dentro do before/after do histórico de
//      AuditEvent (entityType da tabela), que guardava os números em claro
//      (desligável com --skip-audit).
//
// SAFE TO RE-RUN: valores já cifrados (prefixo enc:v1:) são ignorados. NÃO
// re-cifra valores já cifrados: não serve para rotação de chave.
// Sem --apply é DRY RUN: só conta o que seria cifrado, não grava nada.
// Cada UPDATE só grava se a coluna ainda tiver o valor lido (sem lost update
// se o app gravar no meio do backfill).
// Recusa rodar com a chave de DESENVOLVIMENTO (sem FIELD_ENCRYPTION_KEY), salvo
// --allow-dev-key (só para banco local).
//
// Uso (a partir de packages/database/, com a conexão direta/session pooler e a
// MESMA chave configurada no Railway):
//   FIELD_ENCRYPTION_KEY=... DATABASE_URL=$DIRECT_URL \
//     node scripts/encrypt-sensitive-values.mjs [--apply] [--skip-audit]

import { PrismaClient } from "@prisma/client";
import {
  ENCRYPTED_COLUMNS,
  encryptMoney,
  isEncryptedValue,
  loadCurrentKey,
  normalizeMoney,
} from "./lib/field-encryption.mjs";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const REDACT_AUDIT = !process.argv.includes("--skip-audit");
const ALLOW_DEV_KEY = process.argv.includes("--allow-dev-key");

function quoteIdent(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

async function encryptTable(table, columns, current) {
  const cols = Object.keys(columns);
  const notEncrypted = cols
    .map((c) => `(${quoteIdent(c)} IS NOT NULL AND ${quoteIdent(c)} NOT LIKE 'enc:v1:%')`)
    .join(" OR ");
  const rows = await prisma.$queryRawUnsafe(
    `SELECT "id", ${cols.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)} WHERE ${notEncrypted}`,
  );
  let updated = 0;
  const invalid = [];
  const skippedChanged = [];
  for (const row of rows) {
    const sets = [];
    const guards = [];
    const values = [];
    for (const col of cols) {
      const value = row[col];
      if (value === null || isEncryptedValue(value)) continue;
      if (normalizeMoney(value) === null) {
        invalid.push({ id: row.id, col, value });
        continue;
      }
      values.push(encryptMoney(columns[col], value, current));
      sets.push(`${quoteIdent(col)} = $${values.length}`);
      // Guarda otimista: só grava se o valor ainda for o lido.
      values.push(value);
      guards.push(`${quoteIdent(col)} = $${values.length}`);
    }
    if (sets.length === 0) continue;
    if (APPLY) {
      values.push(row.id);
      const count = await prisma.$executeRawUnsafe(
        `UPDATE ${quoteIdent(table)} SET ${sets.join(", ")} WHERE "id" = $${values.length} AND ${guards.join(" AND ")}`,
        ...values,
      );
      if (count === 0) {
        skippedChanged.push(row.id);
        continue;
      }
    }
    updated += 1;
  }
  console.log(
    `${table}: ${rows.length} linha(s) com valor em claro; ${APPLY ? "cifradas" : "a cifrar"}: ${updated}.`,
  );
  for (const id of skippedChanged) {
    console.warn(`  ! ${table} id=${id}: alterado durante o backfill — rode de novo.`);
  }
  for (const item of invalid) {
    console.warn(`  ! ${table}.${item.col} id=${item.id}: valor ilegivel (${item.value}) — nao alterado.`);
  }
  return updated;
}

function encryptJsonPayload(payload, columns, current) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { payload, changed: false };
  }
  let changed = false;
  const next = { ...payload };
  for (const [col, field] of Object.entries(columns)) {
    // Chave física (ex. "hourlyRate") e a do app (ex. "hourlyRateEncrypted").
    for (const key of [col, `${col}Encrypted`]) {
      const value = next[key];
      if (value === null || value === undefined || isEncryptedValue(value)) continue;
      const encrypted = encryptMoney(field, value, current);
      if (encrypted === null) continue;
      next[key] = encrypted;
      changed = true;
    }
  }
  return { payload: next, changed };
}

async function redactAudit(current) {
  let total = 0;
  for (const [entityType, columns] of Object.entries(ENCRYPTED_COLUMNS)) {
    // Consultant: o histórico do Consultant não carrega hourlyCost (nunca foi
    // auditado pela aplicação); o laço cobre a tabela por completude.
    const events = await prisma.auditEvent.findMany({
      where: { entityType },
      select: { id: true, before: true, after: true },
    });
    let changedEvents = 0;
    for (const event of events) {
      const before = encryptJsonPayload(event.before, columns, current);
      const after = encryptJsonPayload(event.after, columns, current);
      if (!before.changed && !after.changed) continue;
      changedEvents += 1;
      if (APPLY) {
        await prisma.auditEvent.update({
          where: { id: event.id },
          data: {
            ...(before.changed ? { before: before.payload } : {}),
            ...(after.changed ? { after: after.payload } : {}),
          },
        });
      }
    }
    console.log(
      `AuditEvent[${entityType}]: ${events.length} evento(s); ${APPLY ? "cifrados" : "a cifrar"}: ${changedEvents}.`,
    );
    total += changedEvents;
  }
  return total;
}

async function main() {
  const current = loadCurrentKey();
  if (current.isDev) {
    if (!ALLOW_DEV_KEY) {
      throw new Error(
        "FIELD_ENCRYPTION_KEY ausente: recusando cifrar com a chave de DESENVOLVIMENTO. Use --allow-dev-key apenas em banco local.",
      );
    }
    console.warn(
      "AVISO: usando a chave de DESENVOLVIMENTO (--allow-dev-key). Nunca rode assim contra producao.",
    );
  }
  console.log(
    `${APPLY ? "APLICANDO" : "DRY RUN (use --apply para gravar)"} — chave "${current.id}".`,
  );
  let total = 0;
  for (const [table, columns] of Object.entries(ENCRYPTED_COLUMNS)) {
    total += await encryptTable(table, columns, current);
  }
  if (REDACT_AUDIT) total += await redactAudit(current);
  console.log(`Concluido. Registros ${APPLY ? "alterados" : "a alterar"}: ${total}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
