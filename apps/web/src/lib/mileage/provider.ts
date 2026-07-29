/**
 * Cálculo de distância de carro para o Reembolso Quilometragem.
 *
 * Segue o mesmo padrão de degradação honesta do provider de CEP
 * (`lib/cep/provider.ts`): quando não há chave configurada, retorna um provider
 * "desligado" e o formulário cai para entrada MANUAL da quilometragem — nunca
 * fingimos um cálculo.
 *
 * Provider suportado: OpenRouteService (gratuito, com chave). Geocoda os
 * endereços (Pelias) e calcula a rota de carro (directions/driving-car). A chave
 * vive só no servidor (`OPENROUTESERVICE_API_KEY`); este módulo nunca é
 * importado no cliente — as server actions o chamam.
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Rótulo resolvido pelo geocoder (ex.: "Av. Paulista, São Paulo"). */
  label: string;
}

export interface MileageInput {
  origin: string;
  destination: string;
  /** Ida e volta: calcula o trajeto de volta (destino → origem) à parte. */
  roundTrip: boolean;
}

export interface MileageResult {
  /** Quilometragem do trajeto de ida (origem → destino). */
  outboundKm: number;
  /** Quilometragem da volta (destino → origem); 0 quando não é ida e volta. */
  returnKm: number;
  /** Total = outbound (+ return quando ida e volta). */
  totalKm: number;
  originLabel: string;
  destinationLabel: string;
}

export type MileageFailureReason =
  | "NOT_CONFIGURED"
  | "ORIGIN_NOT_FOUND"
  | "DESTINATION_NOT_FOUND"
  | "NO_ROUTE"
  | "PROVIDER_ERROR";

export type MileageOutcome =
  | ({ ok: true } & MileageResult)
  | { ok: false; reason: MileageFailureReason };

export interface DistanceProvider {
  geocode(address: string): Promise<GeocodeResult | null>;
  /** Distância de carro em metros entre dois pontos, ou null se não há rota. */
  routeMeters(from: GeocodeResult, to: GeocodeResult): Promise<number | null>;
}

const ORS_BASE = "https://api.openrouteservice.org";

/** Arredonda metros para km com 2 casas (mesma escala de Decimal(10,2)). */
function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 100) / 100;
}

class OpenRouteServiceProvider implements DistanceProvider {
  constructor(private readonly apiKey: string) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    const url = new URL(`${ORS_BASE}/geocode/search`);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("text", address);
    url.searchParams.set("boundary.country", "BR");
    url.searchParams.set("size", "1");
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { label?: string };
      }>;
    };
    const feature = data.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lng, lat] = coords;
    return { lat, lng, label: feature?.properties?.label ?? address };
  }

  async routeMeters(
    from: GeocodeResult,
    to: GeocodeResult,
  ): Promise<number | null> {
    const response = await fetch(`${ORS_BASE}/v2/directions/driving-car`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      routes?: Array<{ summary?: { distance?: number } }>;
    };
    const distance = data.routes?.[0]?.summary?.distance;
    return typeof distance === "number" ? distance : null;
  }
}

export function isDistanceConfigured(): boolean {
  return Boolean(process.env.OPENROUTESERVICE_API_KEY);
}

export function getDistanceProvider(): DistanceProvider | null {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return null;
  return new OpenRouteServiceProvider(apiKey);
}

/**
 * Calcula a quilometragem de carro entre origem e destino. Quando `roundTrip`,
 * calcula a VOLTA (destino → origem) numa chamada separada, pois o trajeto de
 * volta pode divergir do de ida (mão única, retornos). Erros do provedor viram
 * `MileageFailureReason` para o chamador decidir a mensagem/fallback.
 */
export async function computeMileage(
  input: MileageInput,
): Promise<MileageOutcome> {
  const provider = getDistanceProvider();
  if (!provider) return { ok: false, reason: "NOT_CONFIGURED" };

  try {
    const [origin, destination] = await Promise.all([
      provider.geocode(input.origin),
      provider.geocode(input.destination),
    ]);
    if (!origin) return { ok: false, reason: "ORIGIN_NOT_FOUND" };
    if (!destination) return { ok: false, reason: "DESTINATION_NOT_FOUND" };

    const outboundMeters = await provider.routeMeters(origin, destination);
    if (outboundMeters === null) return { ok: false, reason: "NO_ROUTE" };
    const outboundKm = metersToKm(outboundMeters);

    let returnKm = 0;
    if (input.roundTrip) {
      const returnMeters = await provider.routeMeters(destination, origin);
      if (returnMeters === null) return { ok: false, reason: "NO_ROUTE" };
      returnKm = metersToKm(returnMeters);
    }

    return {
      ok: true,
      outboundKm,
      returnKm,
      totalKm: Math.round((outboundKm + returnKm) * 100) / 100,
      originLabel: origin.label,
      destinationLabel: destination.label,
    };
  } catch (error) {
    console.error("[mileage] provider error", error);
    return { ok: false, reason: "PROVIDER_ERROR" };
  }
}
