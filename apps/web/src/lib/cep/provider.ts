export interface CepLookupResult {
  postalCode: string;
  street?: string;
  district?: string;
  city?: string;
  state?: string;
  provider: string;
  raw?: unknown;
}

export interface CepProvider {
  lookup(postalCode: string): Promise<CepLookupResult | null>;
}

class DisabledCepProvider implements CepProvider {
  async lookup(): Promise<CepLookupResult | null> {
    return null;
  }
}

class BrasilApiCepProvider implements CepProvider {
  async lookup(postalCode: string): Promise<CepLookupResult | null> {
    const digits = postalCode.replace(/\D/g, "");
    if (digits.length !== 8) return null;
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      cep?: string;
      street?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
    };
    return {
      postalCode: data.cep ?? digits,
      street: data.street || undefined,
      district: data.neighborhood || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      provider: "brasilapi",
      raw: data,
    };
  }
}

export function getCepProvider(): CepProvider {
  if (process.env.CEP_PROVIDER === "brasilapi") {
    return new BrasilApiCepProvider();
  }
  return new DisabledCepProvider();
}

export function isCepLookupConfigured(): boolean {
  return process.env.CEP_PROVIDER === "brasilapi";
}

