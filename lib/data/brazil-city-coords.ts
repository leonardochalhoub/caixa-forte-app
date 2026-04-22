/**
 * Curated coordinates for the Brazilian municipalities + capitals
 * we care about on the sysadmin teacher-map. The set covers every
 * state capital plus the top-100 most-populous cities, which
 * comfortably blankets where teachers sign up from. When a teacher's
 * city isn't in the table we fall back to the state capital's
 * coordinates (by the UF in their `profiles.location` field) so the
 * pin still lands on the right part of Brazil.
 */

export interface CityCoord {
  name: string;
  uf: string;
  lat: number;
  lng: number;
}

function n(name: string, uf: string, lat: number, lng: number): CityCoord {
  return { name, uf, lat, lng };
}

/**
 * The 27 Brazilian state capitals plus Federal District. Used as the
 * fallback anchor when a teacher's exact city is missing from the
 * extended table below.
 */
export const STATE_CAPITALS: Record<string, CityCoord> = {
  AC: n("Rio Branco", "AC", -9.9747, -67.8243),
  AL: n("Maceió", "AL", -9.6498, -35.7089),
  AP: n("Macapá", "AP", 0.035, -51.0705),
  AM: n("Manaus", "AM", -3.119, -60.0217),
  BA: n("Salvador", "BA", -12.9714, -38.5014),
  CE: n("Fortaleza", "CE", -3.7319, -38.5267),
  DF: n("Brasília", "DF", -15.7942, -47.8822),
  ES: n("Vitória", "ES", -20.3155, -40.3128),
  GO: n("Goiânia", "GO", -16.6869, -49.2648),
  MA: n("São Luís", "MA", -2.5307, -44.3068),
  MT: n("Cuiabá", "MT", -15.601, -56.0974),
  MS: n("Campo Grande", "MS", -20.4697, -54.6201),
  MG: n("Belo Horizonte", "MG", -19.9167, -43.9345),
  PA: n("Belém", "PA", -1.4558, -48.5039),
  PB: n("João Pessoa", "PB", -7.1195, -34.845),
  PR: n("Curitiba", "PR", -25.4284, -49.2733),
  PE: n("Recife", "PE", -8.0476, -34.877),
  PI: n("Teresina", "PI", -5.0892, -42.8019),
  RJ: n("Rio de Janeiro", "RJ", -22.9068, -43.1729),
  RN: n("Natal", "RN", -5.7945, -35.211),
  RS: n("Porto Alegre", "RS", -30.0346, -51.2177),
  RO: n("Porto Velho", "RO", -8.7619, -63.9039),
  RR: n("Boa Vista", "RR", 2.8235, -60.6758),
  SC: n("Florianópolis", "SC", -27.5954, -48.548),
  SP: n("São Paulo", "SP", -23.5505, -46.6333),
  SE: n("Aracaju", "SE", -10.9091, -37.0677),
  TO: n("Palmas", "TO", -10.1689, -48.3317),
};

/**
 * Extended list of notable municipalities. Names are the IBGE
 * canonical form so the lookup matches whatever the signup
 * picker stored.
 */
const EXTRA_CITIES: CityCoord[] = [
  n("Guarulhos", "SP", -23.4628, -46.5333),
  n("Campinas", "SP", -22.9071, -47.0633),
  n("São Bernardo do Campo", "SP", -23.6914, -46.565),
  n("Santo André", "SP", -23.6639, -46.5383),
  n("Osasco", "SP", -23.5329, -46.7917),
  n("Ribeirão Preto", "SP", -21.1767, -47.8208),
  n("Sorocaba", "SP", -23.5015, -47.4526),
  n("Santos", "SP", -23.9608, -46.3336),
  n("São José dos Campos", "SP", -23.2237, -45.9009),
  n("Jundiaí", "SP", -23.1857, -46.8978),
  n("Piracicaba", "SP", -22.7253, -47.6492),
  n("Bauru", "SP", -22.3246, -49.0871),
  n("Barueri", "SP", -23.5106, -46.8761),
  n("Taubaté", "SP", -23.0264, -45.5553),
  n("Limeira", "SP", -22.5647, -47.4019),
  n("São Vicente", "SP", -23.9631, -46.3919),
  n("Franca", "SP", -20.5389, -47.4003),
  n("Presidente Prudente", "SP", -22.1208, -51.3882),
  n("Marília", "SP", -22.2171, -49.9501),
  n("Americana", "SP", -22.7397, -47.3311),
  n("Duque de Caxias", "RJ", -22.7858, -43.3117),
  n("Nova Iguaçu", "RJ", -22.7556, -43.4603),
  n("Niterói", "RJ", -22.8833, -43.1036),
  n("São Gonçalo", "RJ", -22.8269, -43.0533),
  n("Campos dos Goytacazes", "RJ", -21.7622, -41.3181),
  n("Petrópolis", "RJ", -22.5112, -43.1779),
  n("Volta Redonda", "RJ", -22.5235, -44.1036),
  n("Maricá", "RJ", -22.9194, -42.8186),
  n("Cabo Frio", "RJ", -22.8894, -42.0183),
  n("Macaé", "RJ", -22.3711, -41.7860),
  n("Nova Friburgo", "RJ", -22.2819, -42.5311),
  n("Teresópolis", "RJ", -22.4119, -42.9658),
  n("Angra dos Reis", "RJ", -23.0063, -44.3178),
  n("Itaboraí", "RJ", -22.7447, -42.8597),
  n("Magé", "RJ", -22.6539, -43.0406),
  n("São João de Meriti", "RJ", -22.8036, -43.3703),
  n("Belford Roxo", "RJ", -22.7644, -43.3994),
  n("Contagem", "MG", -19.9321, -44.0538),
  n("Uberlândia", "MG", -18.9186, -48.2772),
  n("Juiz de Fora", "MG", -21.7642, -43.3503),
  n("Betim", "MG", -19.9677, -44.2006),
  n("Montes Claros", "MG", -16.7349, -43.8617),
  n("Ribeirão das Neves", "MG", -19.7672, -44.0867),
  n("Uberaba", "MG", -19.7483, -47.9319),
  n("Governador Valadares", "MG", -18.8547, -41.9494),
  n("Ipatinga", "MG", -19.4681, -42.5369),
  n("Sete Lagoas", "MG", -19.4658, -44.2467),
  n("Santa Luzia", "MG", -19.7697, -43.8517),
  n("Divinópolis", "MG", -20.1389, -44.8911),
  n("Ibirité", "MG", -20.0219, -44.0589),
  n("Poços de Caldas", "MG", -21.7878, -46.5619),
  n("Vila Velha", "ES", -20.3297, -40.2925),
  n("Serra", "ES", -20.1289, -40.3075),
  n("Cariacica", "ES", -20.2636, -40.4169),
  n("Cachoeiro de Itapemirim", "ES", -20.8489, -41.1128),
  n("Linhares", "ES", -19.3939, -40.0644),
  n("São José", "SC", -27.6111, -48.6236),
  n("Joinville", "SC", -26.3044, -48.8487),
  n("Blumenau", "SC", -26.9155, -49.0709),
  n("Chapecó", "SC", -27.1006, -52.615),
  n("Itajaí", "SC", -26.9078, -48.6617),
  n("Criciúma", "SC", -28.6775, -49.3697),
  n("Lages", "SC", -27.8167, -50.3267),
  n("Balneário Camboriú", "SC", -26.9906, -48.635),
  n("Canoas", "RS", -29.9177, -51.1839),
  n("Caxias do Sul", "RS", -29.1678, -51.1794),
  n("Pelotas", "RS", -31.7719, -52.3425),
  n("Santa Maria", "RS", -29.6842, -53.8069),
  n("Gravataí", "RS", -29.9442, -50.9919),
  n("Viamão", "RS", -30.0811, -51.0233),
  n("Novo Hamburgo", "RS", -29.6781, -51.1309),
  n("São Leopoldo", "RS", -29.7594, -51.1469),
  n("Rio Grande", "RS", -32.035, -52.0986),
  n("Passo Fundo", "RS", -28.2625, -52.4067),
  n("Londrina", "PR", -23.3105, -51.1595),
  n("Maringá", "PR", -23.4256, -51.9384),
  n("Ponta Grossa", "PR", -25.095, -50.1619),
  n("Cascavel", "PR", -24.9555, -53.455),
  n("São José dos Pinhais", "PR", -25.5366, -49.2064),
  n("Foz do Iguaçu", "PR", -25.5478, -54.5882),
  n("Colombo", "PR", -25.29, -49.2238),
  n("Guarapuava", "PR", -25.3935, -51.4626),
  n("Paranaguá", "PR", -25.5205, -48.5095),
  n("Feira de Santana", "BA", -12.2664, -38.9664),
  n("Vitória da Conquista", "BA", -14.8611, -40.8394),
  n("Itabuna", "BA", -14.7877, -39.28),
  n("Juazeiro", "BA", -9.4111, -40.4986),
  n("Camaçari", "BA", -12.6972, -38.3244),
  n("Ilhéus", "BA", -14.7875, -39.0442),
  n("Jequié", "BA", -13.8581, -40.0836),
  n("Lauro de Freitas", "BA", -12.8944, -38.3225),
  n("Teixeira de Freitas", "BA", -17.5394, -39.7419),
  n("Barreiras", "BA", -12.1525, -44.99),
  n("Caucaia", "CE", -3.7361, -38.6531),
  n("Juazeiro do Norte", "CE", -7.213, -39.3147),
  n("Maracanaú", "CE", -3.8769, -38.6258),
  n("Sobral", "CE", -3.686, -40.3497),
  n("Crato", "CE", -7.2342, -39.4094),
  n("Jaboatão dos Guararapes", "PE", -8.1128, -35.015),
  n("Olinda", "PE", -8.0089, -34.8553),
  n("Caruaru", "PE", -8.2836, -35.9761),
  n("Petrolina", "PE", -9.3892, -40.5028),
  n("Paulista", "PE", -7.9408, -34.8728),
  n("Cabo de Santo Agostinho", "PE", -8.2869, -35.0353),
  n("Camaragibe", "PE", -8.0211, -34.9808),
  n("Garanhuns", "PE", -8.885, -36.4944),
  n("Mossoró", "RN", -5.1878, -37.3444),
  n("Parnamirim", "RN", -5.9156, -35.2628),
  n("Campina Grande", "PB", -7.2306, -35.8811),
  n("Santa Rita", "PB", -7.1139, -34.9781),
  n("Patos", "PB", -7.0242, -37.2797),
  n("Arapiraca", "AL", -9.7522, -36.6611),
  n("Palmeira dos Índios", "AL", -9.405, -36.6281),
  n("Parnaíba", "PI", -2.905, -41.7769),
  n("Picos", "PI", -7.0772, -41.4672),
  n("Nossa Senhora do Socorro", "SE", -10.8547, -37.1261),
  n("Imperatriz", "MA", -5.5192, -47.4775),
  n("São Luís de Montes Belos", "GO", -16.5236, -50.3725),
  n("Anápolis", "GO", -16.3267, -48.9531),
  n("Aparecida de Goiânia", "GO", -16.8236, -49.2456),
  n("Rio Verde", "GO", -17.7972, -50.9264),
  n("Luziânia", "GO", -16.2528, -47.9503),
  n("Águas Lindas de Goiás", "GO", -15.7603, -48.2811),
  n("Várzea Grande", "MT", -15.6464, -56.1325),
  n("Rondonópolis", "MT", -16.4706, -54.6356),
  n("Sinop", "MT", -11.8606, -55.5056),
  n("Dourados", "MS", -22.2211, -54.8056),
  n("Três Lagoas", "MS", -20.7511, -51.6783),
  n("Ananindeua", "PA", -1.3658, -48.3725),
  n("Santarém", "PA", -2.4431, -54.7083),
  n("Marabá", "PA", -5.3686, -49.1178),
  n("Parauapebas", "PA", -6.0678, -49.9028),
  n("Castanhal", "PA", -1.2936, -47.9228),
  n("Ji-Paraná", "RO", -10.8853, -61.9515),
  n("Ariquemes", "RO", -9.9131, -63.0408),
  n("Parintins", "AM", -2.6278, -56.7356),
  n("Itacoatiara", "AM", -3.1433, -58.4442),
];

const BY_KEY = new Map<string, CityCoord>();
for (const c of [...Object.values(STATE_CAPITALS), ...EXTRA_CITIES]) {
  BY_KEY.set(`${c.name.toLowerCase()}|${c.uf.toUpperCase()}`, c);
}

/**
 * Parse a stored profile location (format `"City, UF"` or free text)
 * and resolve it to coordinates. Falls back to the state capital when
 * the specific city isn't in the curated table; returns null when we
 * can't even identify a UF.
 */
export function locateCity(raw: string | null | undefined): CityCoord | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try "City, UF" split first — the Brazilian picker always writes this.
  const parts = trimmed.split(/,\s*/);
  if (parts.length === 2) {
    const city = parts[0] ?? "";
    const uf = parts[1] ?? "";
    const hit = BY_KEY.get(`${city.toLowerCase()}|${uf.toUpperCase()}`);
    if (hit) return hit;
    const cap = STATE_CAPITALS[uf.toUpperCase()];
    if (cap) {
      return { ...cap, name: city };
    }
  }

  // Treat bare UF codes as state-capital requests so "RJ" → Rio de Janeiro.
  if (/^[a-zA-Z]{2}$/.test(trimmed)) {
    const cap = STATE_CAPITALS[trimmed.toUpperCase()];
    if (cap) return cap;
  }

  // Free-form (foreign city or partial). Best-effort lookup by name.
  const lower = trimmed.toLowerCase();
  for (const coord of BY_KEY.values()) {
    if (coord.name.toLowerCase() === lower) return coord;
  }
  return null;
}
