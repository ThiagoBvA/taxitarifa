// Testes de paridade do motor web com o app nativo (TarifaChecks do Swift).
// Rodar: node web/js/testes.mjs  — todos os valores devem bater AO CENTAVO.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calcular, bandeiraEm, motivoB2, dataNoFuso, anoCoberto, ordenarCapitais,
} from "./tarifas.js";

const base = dirname(fileURLToPath(import.meta.url));
const catalogo = JSON.parse(readFileSync(join(base, "../dados/catalogo.json"), "utf8"));
const FERIADOS = catalogo.feriadosLocais || {};
const capitais = ordenarCapitais(catalogo.capitais);
const cap = (uf) => capitais.find(c => c.uf === uf);
const recife = cap("PE");

let falhas = 0;
function check(cond, nome) {
  if (cond) console.log(`  ✓ ${nome}`);
  else { console.log(`  ✗ FALHOU: ${nome}`); falhas++; }
}
const d = (ano, mes, dia, h = 0, min = 0) => dataNoFuso("America/Recife", ano, mes, dia, h, min);
const trecho = (extra) => ({
  nomeOrigem: "A", nomeDestino: "B", distanciaMetros: 10000,
  partida: d(2026, 7, 14, 10, 0), duracaoSeg: 20 * 60, esperaAposMinutos: 0, ...extra,
});
const b = (tab, data) => bandeiraEm(tab, data, FERIADOS);

console.log("— Regras de bandeira (Recife) —");
check(b(recife, d(2026, 7, 14, 10)) === 1, "terça 10h → B1");
check(b(recife, d(2026, 7, 14, 19, 59)) === 1, "terça 19h59 → B1");
check(b(recife, d(2026, 7, 14, 20)) === 2, "terça 20h → B2");
check(b(recife, d(2026, 7, 15, 5, 59)) === 2, "quarta 5h59 → B2");
check(b(recife, d(2026, 7, 15, 6)) === 1, "quarta 6h → B1");
check(b(recife, d(2026, 7, 18, 12)) === 1, "sábado 12h → B1");
check(b(recife, d(2026, 7, 18, 13)) === 2, "sábado 13h → B2");
check(b(recife, d(2026, 7, 19, 10)) === 2, "domingo 10h → B2");
check(b(recife, d(2026, 7, 20, 5, 30)) === 2, "segunda 5h30 → B2");
check(b(recife, d(2026, 7, 20, 8)) === 1, "segunda 8h → B1");
check(b(recife, d(2026, 12, 15, 10)) === 2, "15/dez 10h → B2");
check(b(recife, d(2026, 2, 16, 11)) === 2, "Carnaval 2026 11h → B2 (período especial)");

console.log("— Feriados locais —");
const sp = cap("SP"), rj = cap("RJ"), go = cap("GO"), jp = cap("PB");
check(b(sp, d(2026, 7, 9, 10)) === 2, "SP: 9/jul 10h → B2 (estadual)");
check((motivoB2(sp, d(2026, 7, 9, 10), FERIADOS) || "").includes("Constitucionalista"),
  "SP: motivo cita o feriado");
check(b(rj, d(2027, 1, 20, 10)) === 2, "RJ: São Sebastião → B2");
check(b(recife, d(2026, 6, 24, 10)) === 2, "Recife: São João → B2");
check(b(recife, d(2026, 7, 16, 14)) === 2, "Recife: N. Sra. do Carmo 14h → B2");
check((motivoB2(recife, d(2026, 7, 16, 14), FERIADOS) || "").includes("Carmo"),
  "Recife: motivo cita a padroeira");
check(b(recife, d(2027, 1, 25, 10)) === 1, "Recife: feriado municipal de SP não se aplica");
check(anoCoberto(2026) && anoCoberto(2027) && !anoCoberto(2028), "trava de feriados móveis");
check(b(sp, d(2026, 7, 18, 15)) === 1, "SP: sábado 15h → B1 (sem antecipação)");
check(b(sp, d(2026, 9, 7, 10)) === 2, "SP: feriado 7/set → B2");
check(b(go, d(2026, 7, 19, 10)) === 1, "Goiânia: domingo 10h → B1 (regra das 13h)");
check(b(go, d(2026, 7, 19, 14)) === 2, "Goiânia: domingo 14h → B2");
check(b(jp, d(2026, 7, 18, 19)) === 2, "JP: sábado 19h → B2");
check(b(jp, d(2026, 7, 19, 10)) === 1, "JP: domingo 10h → B1");
check(b(jp, d(2026, 7, 14, 21)) === 2, "JP: terça 21h → B2");

console.log("— Cálculo (Recife) —");
const calc = (trechos, opcoes, alt) => calcular(recife, trechos, opcoes || {}, FERIADOS, alt);
const simples = calc([trecho({})]);
check(simples.total === 3862, `10 km B1 comum = R$ 38,62 (obtido: ${simples.total})`);
const especial = calc([trecho({})], { servico: "especial" });
check(especial.total === 4691, `10 km B1 especial = R$ 46,91 (obtido: ${especial.total})`);
const virada = calc([trecho({ partida: d(2026, 7, 14, 19, 50) })]);
check(virada.total === 4212, `virada 20h rateia B1/B2 = R$ 42,12 (obtido: ${virada.total})`);
check(virada.avisos.length > 0, "virada gera aviso de rateio");
const comParada = calc([
  trecho({ nomeDestino: "P", distanciaMetros: 5000, duracaoSeg: 600, esperaAposMinutos: 30 }),
  trecho({ nomeOrigem: "P", distanciaMetros: 5000, duracaoSeg: 600, partida: d(2026, 7, 14, 10, 40) }),
]);
check(comParada.total === 5196, `parada de 30 min = R$ 51,96 (obtido: ${comParada.total})`);
check(comParada.trechos[0].linhas.some(l => l.regra.includes("hora parada")), "espera no demonstrativo");
const duasBand = calc([
  trecho({ distanciaMetros: 5000, duracaoSeg: 600, esperaAposMinutos: 30 }),
  trecho({ distanciaMetros: 5000, duracaoSeg: 600, partida: d(2026, 7, 14, 10, 40) }),
], { novaCorridaPorTrecho: true });
check(duasBand.total === 4374, `nova corrida por trecho = R$ 43,74 (obtido: ${duasBand.total})`);
const comVolumes = calc([trecho({})], { volumes: 2 });
check(comVolumes.total === 3940, `2 volumes → R$ 39,40 (obtido: ${comVolumes.total})`);

console.log("— Bandeira manual —");
const manualB2 = calc([trecho({})], { bandeiraManual: 2 });
check(manualB2.total === 4562, `B2 manual em horário de B1 = R$ 45,62 (obtido: ${manualB2.total})`);
check(manualB2.avisos.some(a => a.includes("manualmente")), "aviso de bandeira manual");
const manualB1 = calc([trecho({ partida: d(2026, 7, 14, 21) })], { bandeiraManual: 1 });
check(manualB1.total === 3862, `B1 manual à noite = R$ 38,62 (obtido: ${manualB1.total})`);

console.log("— Aeroporto —");
const dd = (tab) => dataNoFuso(tab.fusoID, 2026, 3, 10, 10, 0);
const aeroporto = (uf, esperado) => {
  const tab = cap(uf);
  const c = calcular(tab, [trecho({ partida: dd(tab) })], { corridaAeroporto: true }, FERIADOS);
  check(c.total === esperado, `${tab.cidade} aeroporto = ${esperado} (obtido: ${c.total})`);
};
aeroporto("BA", 5167);
aeroporto("PI", 5180);
aeroporto("MS", 4760);

console.log("— Fora do município —");
const foraInteiro = calc([trecho({ foraDoMunicipio: true, fracaoFora: 1 })]);
check(foraInteiro.total === 4562, `Recife → Jaboatão inteiro fora = R$ 45,62 (obtido: ${foraInteiro.total})`);
check(foraInteiro.trechos[0].linhas.some(l => l.regra.includes("fora do município")), "linha cita a regra");
const manualVence = calc([trecho({ foraDoMunicipio: true, fracaoFora: 1 })], { bandeiraManual: 1 });
check(manualVence.total === 3862, "bandeira manual B1 prevalece");
const vit = cap("ES");
const cVit = calcular(vit, [trecho({ partida: dd(vit), foraDoMunicipio: true, fracaoFora: 1 })], {}, FERIADOS);
check(cVit.total === 5420, `Vitória → Vila Velha = R$ 54,20 (obtido: ${cVit.total})`);
const cSP = calcular(sp, [trecho({ partida: dd(sp), foraDoMunicipio: true, fracaoFora: 1 })], {}, FERIADOS);
check(cSP.total === 8183, `SP: B1 + 50% metropolitano = R$ 81,83 (obtido: ${cSP.total})`);
check(cSP.trechos[0].linhas.some(l => l.regra.includes("horário normal")), "SP: km segue B1");
const cGO = calcular(go, [trecho({ partida: dd(go), foraDoMunicipio: true, fracaoFora: 1 })], {}, FERIADOS);
check(cGO.total === 4861, `Goiânia: trecho fora → B2 = R$ 48,61 (obtido: ${cGO.total})`);
const cur = cap("PR");
const cCur = calcular(cur, [trecho({ partida: dd(cur), foraDoMunicipio: true, fracaoFora: 1 })], {}, FERIADOS);
check(cCur.total === 5980, `Curitiba: retorno de 30% = R$ 59,80 (obtido: ${cCur.total})`);
const ba = cap("BA");
const cBA = calcular(ba, [
  { nomeOrigem: "A", nomeDestino: "B", distanciaMetros: 5000, partida: dd(ba), duracaoSeg: 600, esperaAposMinutos: 0, foraDoMunicipio: false },
  { nomeOrigem: "B", nomeDestino: "Lauro", distanciaMetros: 5000, partida: new Date(dd(ba).getTime() + 600000), duracaoSeg: 600, esperaAposMinutos: 0, foraDoMunicipio: true, fracaoFora: 1 },
], {}, FERIADOS);
check(cBA.total === 5167, `Salvador: corrida inteira em B2 = R$ 51,67 (obtido: ${cBA.total})`);

console.log("— Divisão na divisa —");
const recifeCabo = calc([trecho({
  distanciaMetros: 20000, duracaoSeg: 40 * 60,
  foraDoMunicipio: true, fracaoFora: 0.4, foraNoInicio: false,
})]);
check(recifeCabo.total === 7772, `Recife → Cabo (40% fora) = R$ 77,72 (obtido: ${recifeCabo.total})`);
check(recifeCabo.trechos[0].linhas.some(l => l.regra.includes("dentro de Recife")), "linha B1 dentro");
check(recifeCabo.avisos.some(a => a.includes("dividido na divisa")), "aviso da divisão");
const divisaNoturna = calc([trecho({
  partida: d(2026, 7, 14, 19, 50), foraDoMunicipio: true, fracaoFora: 0.5,
})]);
check(divisaNoturna.total === 4212, `divisa + virada noturna = R$ 42,12 (obtido: ${divisaNoturna.total})`);
const voltaCabo = calc([trecho({
  distanciaMetros: 20000, duracaoSeg: 40 * 60,
  foraDoMunicipio: true, fracaoFora: 0.4, foraNoInicio: true,
})]);
check(voltaCabo.total === 7772, `volta Cabo → Recife = R$ 77,72 (obtido: ${voltaCabo.total})`);

console.log("— Faixa de preço —");
const comFaixa = calc([trecho({})], {}, [[trecho({ distanciaMetros: 12000, duracaoSeg: 25 * 60 })]]);
check(comFaixa.faixaTotal && comFaixa.faixaTotal.min === 3862 && comFaixa.faixaTotal.max === 4532,
  `faixa 38,62–45,32 (obtido: ${JSON.stringify(comFaixa.faixaTotal)})`);
check(comFaixa.total === 3862, "principal permanece 38,62");

console.log("— Sanidade do catálogo —");
check(capitais.length === 27, `27 capitais (obtido: ${capitais.length})`);
check(capitais[0].uf === "PE", "Recife é a primeira");
for (const c of capitais) {
  const ok = c.comum.bandeirada > 0 && c.comum.kmBandeira1 > 0
    && c.comum.kmBandeira2 >= c.comum.kmBandeira1 && c.comum.horaParada > 0;
  if (!ok) check(false, `${c.cidade}: valores inválidos`);
}
check(true, "valores positivos e km B2 ≥ km B1 em todas");

console.log("");
if (falhas === 0) console.log("TODOS OS TESTES PASSARAM ✓");
else { console.log(`${falhas} TESTE(S) FALHARAM ✗`); process.exit(1); }
