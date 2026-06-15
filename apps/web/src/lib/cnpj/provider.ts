import type { CnpjLookupResult } from "@/lib/clients/types";

export interface CnpjProvider {
  lookup(document: string): Promise<CnpjLookupResult | null>;
}

class DisabledCnpjProvider implements CnpjProvider {
  async lookup(): Promise<CnpjLookupResult | null> {
    return null;
  }
}

class BrasilApiCnpjProvider implements CnpjProvider {
  async lookup(document: string): Promise<CnpjLookupResult | null> {
    const digits = document.replace(/\D/g, "");
    if (digits.length !== 14) return null;

    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      cnpj?: string;
      razao_social?: string;
      nome_fantasia?: string;
      municipio?: string;
      uf?: string;
    };
    if (!data.razao_social) return null;
    return {
      document: data.cnpj ?? digits,
      legalName: data.razao_social,
      tradeName: data.nome_fantasia || undefined,
      municipality: data.municipio || undefined,
      state: data.uf || undefined,
      provider: "brasilapi",
      raw: data,
    };
  }
}

export function getCnpjProvider(): CnpjProvider {
  if (process.env.CNPJ_PROVIDER === "brasilapi") {
    return new BrasilApiCnpjProvider();
  }
  return new DisabledCnpjProvider();
}

export function isCnpjLookupConfigured(): boolean {
  return process.env.CNPJ_PROVIDER === "brasilapi";
}

