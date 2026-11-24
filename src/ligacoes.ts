// Sugestão automática de "possível série": compara dois casos por tipo, distância, data e jeito de agir.
// É só uma pista para você olhar; não afirma nada.

export type Caso = {
  id: string;
  data: string;
  municipio: string;
  tipo: string;
  arma?: string;
  alvo?: string;
  veiculo?: string;
  lat?: number;
  lng?: number;
};

const GRUPO: Record<string, string> = {
  homicidio: 'vida', tentativa: 'vida', feminicidio: 'vida', latrocinio: 'patrimonio-violento',
  roubo: 'patrimonio-violento', furto: 'patrimonio', confronto: 'patrimonio-violento', arma: 'arma',
};

export function km(a: Caso, b: Caso): number {
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return Infinity;
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const dias = (a: Caso, b: Caso) => Math.abs(Date.parse(a.data) - Date.parse(b.data)) / 86400000;

export function semelhanca(a: Caso, b: Caso): { pontos: number; motivos: string[] } {
  const motivos: string[] = [];
  let pontos = 0;
  if (a.tipo === b.tipo) { pontos += 2; motivos.push('mesmo tipo de crime'); }
  else if (GRUPO[a.tipo] && GRUPO[a.tipo] === GRUPO[b.tipo]) { pontos += 1; motivos.push('crimes parecidos'); }
  const d = km(a, b);
  if (d <= 60) { pontos += 2; motivos.push(d < 1 ? 'mesma cidade' : `${Math.round(d)} km de distância`); }
  else if (d <= 120) { pontos += 1; motivos.push(`${Math.round(d)} km de distância`); }
  const t = dias(a, b);
  if (t <= 14) { pontos += 2; motivos.push(t < 1 ? 'mesmo dia' : `${Math.round(t)} dias de diferença`); }
  else if (t <= 30) { pontos += 1; motivos.push(`${Math.round(t)} dias de diferença`); }
  if (a.arma && a.arma === b.arma) { pontos += 1; motivos.push(`mesma arma (${a.arma})`); }
  if (a.alvo && a.alvo === b.alvo) { pontos += 1; motivos.push(`mesmo alvo (${a.alvo})`); }
  if (a.veiculo && a.veiculo === b.veiculo) { pontos += 1; motivos.push(`mesmo veículo (${a.veiculo})`); }
  return { pontos, motivos };
}

export const LIMITE_SERIE = 6;

export function parecidos<T extends Caso>(alvo: T, todos: T[]): { caso: T; pontos: number; motivos: string[] }[] {
  return todos
    .filter((c) => c.id !== alvo.id)
    .map((c) => ({ caso: c, ...semelhanca(alvo, c) }))
    .filter((s) => s.pontos >= LIMITE_SERIE)
    .sort((x, y) => y.pontos - x.pontos);
}
