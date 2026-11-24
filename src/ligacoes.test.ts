// Teste rápido da sugestão de séries: npm test
import assert from 'node:assert';
import { km, parecidos, semelhanca } from './ligacoes.ts';

const abelardo = { id: 'a', data: '2026-11-21', municipio: 'Abelardo Luz', tipo: 'tentativa', arma: 'faca', alvo: 'pessoa', lat: -26.56, lng: -52.33 };
const slo = { id: 'b', data: '2026-11-21', municipio: 'São Lourenço do Oeste', tipo: 'tentativa', arma: 'faca', alvo: 'pessoa', lat: -26.36, lng: -52.85 };
const itajai = { id: 'c', data: '2026-11-17', municipio: 'Itajaí', tipo: 'latrocinio', arma: 'faca', alvo: 'comercio', lat: -26.91, lng: -48.66 };
const semLugar = { id: 'd', data: '2026-11-21', municipio: '', tipo: 'tentativa' };

assert.ok(Math.abs(km(abelardo, slo) - 57) < 10, 'distância Abelardo–SLO ~57 km');
assert.equal(km(abelardo, semLugar), Infinity);
assert.ok(semelhanca(abelardo, slo).pontos >= 6, 'facadas no mesmo dia e perto = possível série');
assert.ok(semelhanca(abelardo, itajai).pontos < 6, 'Itajaí fica longe demais');
assert.deepEqual(parecidos(abelardo, [abelardo, slo, itajai, semLugar]).map((p) => p.caso.id), ['b']);
console.log('ok: ligações');
