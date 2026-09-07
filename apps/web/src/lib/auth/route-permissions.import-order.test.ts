import { describe, expect, it } from "vitest";
// A ORDEM destes imports é o objeto do teste: os módulos de visibilidade vêm
// PRIMEIRO, como acontece quando a página de um módulo é o ponto de entrada.
import "@/lib/coe/visibility";
import "@/lib/allocation-ai/visibility";
import "@/lib/project-risk/visibility";
import "@/lib/consultant-score/visibility";
import { accessForPath, routePermissions } from "@/lib/auth/route-permissions";

/**
 * Regressão de CICLO DE IMPORT.
 *
 * `route-permissions` importa cada `lib/<modulo>/visibility` para montar
 * `routePermissions`; esses módulos precisam de `FINANCIAL_ROLES`. Enquanto essa
 * constante morava em `route-permissions`, inicializar um visibility ANTES
 * fechava o ciclo: o binding resolvia como `undefined` e a regra de rota nascia
 * SEM `access` — silenciosamente, sem erro. Mover `FINANCIAL_ROLES` para
 * `lib/auth/roles` (folha) quebrou o ciclo.
 *
 * O teste padrão de `route-permissions` NÃO pega isso, porque lá o próprio
 * `route-permissions` é o módulo de entrada.
 */
describe("route-permissions — ordem de inicialização", () => {
  const guarded = [
    "/app/coe",
    "/app/alocacao-ia",
    "/app/risco-projetos",
    "/app/score",
  ];

  it.each(guarded)("%s mantém `access` mesmo com visibility carregado antes", (prefix) => {
    const rule = routePermissions.find((r) => r.prefix === prefix);
    expect(rule).toBeDefined();
    expect(rule!.access).toBeDefined();
    expect(Array.isArray(rule!.access) ? rule!.access : []).not.toHaveLength(0);
  });

  it.each(guarded)("%s não cai para o fallback aberto da rota /app", (prefix) => {
    // Um `access` undefined faria `accessForPath` devolver undefined (e não
    // "ALL"), quebrando `canAccess` de forma difícil de rastrear.
    expect(accessForPath(prefix)).not.toBeUndefined();
    expect(accessForPath(prefix)).not.toBe("ALL");
  });
});
