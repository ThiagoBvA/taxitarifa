// Motor tarifário do TaxiTarifa (porta fiel do Swift TaxiTarifaKit).
// Dinheiro em CENTAVOS inteiros; Math.round = meio para cima em positivos,
// o mesmo arredondamento do app nativo (NSDecimalRound .plain).

// ---------- Feriados nacionais ----------

const NACIONAIS_FIXOS = [
  [1, 1, "Confraternização Universal"], [4, 21, "Tiradentes"],
  [5, 1, "Dia do Trabalho"], [9, 7, "Independência"],
  [10, 12, "Nossa Senhora Aparecida"], [11, 2, "Finados"],
  [11, 15, "Proclamação da República"], [11, 20, "Consciência Negra"],
  [12, 25, "Natal"],
];

// Móveis por ano: Sexta-feira Santa e Corpus Christi. ESTENDER A CADA ANO.
const NACIONAIS_MOVEIS = {
  2026: [[4, 3, "Sexta-feira Santa"], [6, 4, "Corpus Christi"]],
  2027: [[3, 26, "Sexta-feira Santa"], [5, 27, "Corpus Christi"]],
};

export function anoCoberto(ano) {
  return Boolean(NACIONAIS_MOVEIS[ano]);
}

export function nomeFeriado(ano, mes, dia, cidadeID, feriadosLocais) {
  for (const [m, d, nome] of NACIONAIS_FIXOS) {
    if (m === mes && d === dia) return nome;
  }
  for (const [m, d, nome] of NACIONAIS_MOVEIS[ano] || []) {
    if (m === mes && d === dia) return nome;
  }
  const locais = (feriadosLocais || {})[cidadeID] || [];
  for (const f of locais) {
    if (f.mes === mes && f.dia === dia && (f.ano == null || f.ano === ano)) {
      return `${f.nome} — feriado ${f.tipo}`;
    }
  }
  return null;
}

// ---------- Datas em fuso IANA ----------

const DIAS_SEMANA = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
const cacheFmt = {};

function formatador(fusoID) {
  if (!cacheFmt[fusoID]) {
    cacheFmt[fusoID] = new Intl.DateTimeFormat("en-US", {
      timeZone: fusoID, weekday: "short", year: "numeric", month: "numeric",
      day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
      hour12: false,
    });
  }
  return cacheFmt[fusoID];
}

/** Componentes de calendário de um Date no fuso da cidade. */
export function componentes(data, fusoID) {
  const partes = {};
  for (const p of formatador(fusoID).formatToParts(data)) partes[p.type] = p.value;
  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    diaSemana: DIAS_SEMANA[partes.weekday],   // 1 = domingo … 7 = sábado
    hora: Number(partes.hour) % 24,
    minuto: Number(partes.minute),
  };
}

/** Date correspondente ao relógio de parede (ano…minuto) no fuso da cidade. */
export function dataNoFuso(fusoID, ano, mes, dia, hora, minuto) {
  let palpite = Date.UTC(ano, mes - 1, dia, hora, minuto);
  // corrige pelo deslocamento observado (Brasil não tem horário de verão)
  for (let i = 0; i < 2; i++) {
    const c = componentes(new Date(palpite), fusoID);
    const visto = Date.UTC(c.ano, c.mes - 1, c.dia, c.hora, c.minuto);
    const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
    if (visto === alvo) break;
    palpite += alvo - visto;
  }
  return new Date(palpite);
}

// ---------- Formatação pt-BR ----------

export const Fmt = {
  brl(centavos) {
    return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },
  km(v) {
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  },
  hora(data, fusoID) {
    return data.toLocaleTimeString("pt-BR", { timeZone: fusoID, hour: "2-digit", minute: "2-digit" });
  },
  dataHora(data, fusoID) {
    const d = data.toLocaleDateString("pt-BR", { timeZone: fusoID, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
    return `${d} às ${Fmt.hora(data, fusoID)}`;
  },
};

// ---------- Tabela ----------

function centavos(v) { return Math.round(v * 100); }

/** Tarifa (em centavos) do serviço escolhido. */
export function tarifaDe(tabela, servico) {
  const t = servico === "especial" && tabela.especial ? tabela.especial : tabela.comum;
  return {
    bandeirada: centavos(t.bandeirada),
    kmBandeira1: centavos(t.kmBandeira1),
    kmBandeira2: centavos(t.kmBandeira2),
    horaParada: centavos(t.horaParada),
    taxaVolume: centavos(t.taxaVolume || 0),
  };
}

export function tituloServico(servico) {
  return servico === "especial" ? "Especial (aeroporto e hotéis)" : "Comum";
}

/** Recife primeiro, demais em ordem alfabética pt-BR (igual ao app nativo). */
export function ordenarCapitais(capitais) {
  const recife = capitais.filter(c => c.uf === "PE");
  const demais = capitais.filter(c => c.uf !== "PE")
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"));
  return [...recife, ...demais];
}

export function regraAeroportoDe(tabela) {
  const r = tabela.regraAeroporto;
  if (!r) return null;
  if (r.bandeira2 !== undefined) return { tipo: "bandeira2" };
  if (r.servicoEspecial !== undefined) return { tipo: "servicoEspecial" };
  if (r.acrescimoPercentual !== undefined) {
    return { tipo: "acrescimoPercentual", percentual: r.acrescimoPercentual._0 };
  }
  return null;
}

export function descricaoRegraAeroporto(tabela) {
  const r = regraAeroportoDe(tabela);
  if (!r) return null;
  if (r.tipo === "bandeira2") {
    return "Nesta cidade, corridas de/para o aeroporto correm em Bandeira 2.";
  }
  if (r.tipo === "acrescimoPercentual") {
    return `Nesta cidade, corridas de/para o aeroporto têm acréscimo de ${r.percentual}% sobre o valor.`;
  }
  return "Nesta cidade, o ponto do aeroporto usa a tarifa do serviço especial (bandeirada própria).";
}

export function resumoRegrasB2(tabela) {
  const partes = [];
  const n = tabela.noturnaB2;
  if (n) partes.push(`das ${n.inicioHora}h às ${n.fimHora}h`);
  const s = tabela.b2SabadoInicioHora;
  if (s != null) partes.push(s === 0 ? "sábados o dia inteiro" : `sábados a partir das ${s}h`);
  if (tabela.b2DomingoIntegral) partes.push("domingos o dia inteiro");
  else if (tabela.b2DomingoInicioHora != null) partes.push(`domingos a partir das ${tabela.b2DomingoInicioHora}h`);
  if (tabela.b2Feriados) partes.push("feriados nacionais, estaduais e municipais");
  else if (tabela.b2FeriadosInicioHora != null) partes.push(`feriados a partir das ${tabela.b2FeriadosInicioHora}h`);
  if ((tabela.mesesIntegraisB2 || []).includes(12)) partes.push("dezembro o mês inteiro");
  if (tabela.b2ForaDoMunicipio === "trechoFora") partes.push("percursos fora do município");
  if (tabela.b2ForaDoMunicipio === "corridaInteira") partes.push("corrida inteira quando sai do município");
  if (tabela.retornoForaMunicipio != null) partes.push(`custo de retorno de até ${tabela.retornoForaMunicipio}% ao sair do município`);
  if ((tabela.periodosEspeciais || []).length) partes.push("períodos especiais autorizados");
  if (!partes.length) return "Sem regra de Bandeira 2 cadastrada para esta cidade.";
  return `Bandeira 2 em ${tabela.cidade}: ${partes.join("; ")}.`;
}

// ---------- Resolvedor de bandeira ----------

/** A regra que coloca o instante em Bandeira 2, ou null se Bandeira 1. */
export function motivoB2(tabela, data, feriadosLocais) {
  const c = componentes(data, tabela.fusoID);
  if ((tabela.mesesIntegraisB2 || []).includes(c.mes)) {
    return "mês inteiro em Bandeira 2";
  }
  for (const p of tabela.periodosEspeciais || []) {
    const ini = new Date(p.inicio);
    const fim = new Date(p.fim);
    if (ini <= data && data < fim) return p.nome;
  }
  const cidadeID = `${tabela.cidade}-${tabela.uf}`;
  const feriado = nomeFeriado(c.ano, c.mes, c.dia, cidadeID, feriadosLocais);
  if (feriado) {
    if (tabela.b2Feriados) return `feriado: ${feriado}`;
    if (tabela.b2FeriadosInicioHora != null && c.hora >= tabela.b2FeriadosInicioHora) {
      return `feriado: ${feriado} (a partir das ${tabela.b2FeriadosInicioHora}h)`;
    }
  }
  const n = tabela.noturnaB2;
  if (n && (c.hora < n.fimHora || c.hora >= n.inicioHora)) {
    return `horário noturno (${n.inicioHora}h às ${n.fimHora}h)`;
  }
  const s = tabela.b2SabadoInicioHora;
  if (c.diaSemana === 7 && s != null && c.hora >= s) {
    return s === 0 ? "sábado (Bandeira 2 o dia inteiro)" : `sábado (a partir das ${s}h)`;
  }
  if (c.diaSemana === 1) {
    if (tabela.b2DomingoIntegral) return "domingo (Bandeira 2 o dia inteiro)";
    if (tabela.b2DomingoInicioHora != null && c.hora >= tabela.b2DomingoInicioHora) {
      return `domingo (a partir das ${tabela.b2DomingoInicioHora}h)`;
    }
  }
  return null;
}

export function bandeiraEm(tabela, data, feriadosLocais) {
  return motivoB2(tabela, data, feriadosLocais) ? 2 : 1;
}

// ---------- Cálculo da corrida ----------

/**
 * trechos: [{ nomeOrigem, nomeDestino, distanciaMetros, partida(Date), duracaoSeg,
 *             esperaAposMinutos, foraDoMunicipio, fracaoFora, foraNoInicio }]
 * opcoes:  { servico, volumes, novaCorridaPorTrecho, bandeiraManual(1|2|null),
 *            corridaAeroporto, chegadaDesejada(Date|null) }
 * alternativas: [[trecho,…] por trecho] | null  (para a faixa de preço)
 */
export function calcular(tabela, trechos, opcoes, feriadosLocais, alternativas) {
  const op = {
    servico: "comum", volumes: 0, novaCorridaPorTrecho: false,
    bandeiraManual: null, corridaAeroporto: false, chegadaDesejada: null,
    ...opcoes,
  };
  const regraAero = op.corridaAeroporto ? regraAeroportoDe(tabela) : null;
  let servicoEfetivo = op.servico;
  if (regraAero && regraAero.tipo === "servicoEspecial" && tabela.especial) {
    servicoEfetivo = "especial";
  }
  let bandeiraForcada = null;
  let motivoForcada = null;
  if (op.bandeiraManual) {
    bandeiraForcada = op.bandeiraManual;
    motivoForcada = "selecionada manualmente";
  } else if (regraAero && regraAero.tipo === "bandeira2") {
    bandeiraForcada = 2;
    motivoForcada = "corrida de/para o aeroporto";
  } else if (tabela.b2ForaDoMunicipio === "corridaInteira"
             && trechos.some(t => t.foraDoMunicipio)) {
    bandeiraForcada = 2;
    motivoForcada = "corrida com origem/destino fora do município";
  }
  const t = tarifaDe(tabela, servicoEfetivo);
  const par = { bandeiraForcada, motivoForcada, tarifa: t };

  const minutosPorBandeira = (inicio, duracaoSeg) => {
    const total = Math.max(1, Math.round(duracaoSeg / 60));
    let b1 = 0, b2 = 0, primeiroB2 = null;
    for (let m = 0; m < total; m++) {
      const instante = new Date(inicio.getTime() + (m * 60 + 30) * 1000);
      if (bandeiraEm(tabela, instante, feriadosLocais) === 2) {
        b2++;
        if (!primeiroB2) primeiroB2 = instante;
      } else b1++;
    }
    return { b1, b2, primeiroB2 };
  };

  // Segmentos de quilometragem de um trecho (mesma precedência do nativo).
  const segmentosDo = (trecho) => {
    const km = trecho.distanciaMetros / 1000;
    if (par.bandeiraForcada) {
      return {
        segmentos: [{ km, bandeira: par.bandeiraForcada,
                      regra: `Bandeira ${par.bandeiraForcada} — ${par.motivoForcada}` }],
        cruzou: false, minB1: 0, minB2: 0,
      };
    }
    const porRelogio = (inicio, duracaoSeg, kmParte, sufixoB1 = "") => {
      const a = minutosPorBandeira(inicio, duracaoSeg);
      const total = Math.max(1, a.b1 + a.b2);
      const segs = [];
      const kmB1 = kmParte * a.b1 / total;
      const kmB2 = kmParte * a.b2 / total;
      if (kmB1 > 0) segs.push({ km: kmB1, bandeira: 1, regra: `Bandeira 1 — horário normal${sufixoB1}` });
      if (kmB2 > 0) {
        const motivo = (a.primeiroB2 && motivoB2(tabela, a.primeiroB2, feriadosLocais)) || "Bandeira 2";
        segs.push({ km: kmB2, bandeira: 2, regra: `Bandeira 2 — ${motivo}` });
      }
      return { segs, cruzou: a.b1 > 0 && a.b2 > 0, minB1: a.b1, minB2: a.b2 };
    };
    if (tabela.b2ForaDoMunicipio === "trechoFora" && trecho.foraDoMunicipio) {
      const regraFora = `Bandeira 2 — percurso fora do município de ${tabela.cidade}`;
      const fFora = Math.min(Math.max(trecho.fracaoFora ?? 1, 0), 1);
      if (fFora >= 0.999) {
        return { segmentos: [{ km, bandeira: 2, regra: regraFora }], cruzou: false, minB1: 0, minB2: 0 };
      }
      const kmFora = km * fFora;
      const kmDentro = km - kmFora;
      const duracaoDentro = trecho.duracaoSeg * (1 - fFora);
      const inicioDentro = trecho.foraNoInicio
        ? new Date(trecho.partida.getTime() + trecho.duracaoSeg * fFora * 1000)
        : trecho.partida;
      const r = porRelogio(inicioDentro, duracaoDentro, kmDentro, ` (dentro de ${tabela.cidade})`);
      const segFora = { km: kmFora, bandeira: 2, regra: regraFora };
      const segmentos = trecho.foraNoInicio ? [segFora, ...r.segs] : [...r.segs, segFora];
      return { segmentos, cruzou: r.cruzou, minB1: r.minB1, minB2: r.minB2 };
    }
    const r = porRelogio(trecho.partida, trecho.duracaoSeg, km);
    return { segmentos: r.segs, cruzou: r.cruzou, minB1: r.minB1, minB2: r.minB2 };
  };

  const custoKm = (trecho) =>
    segmentosDo(trecho).segmentos.reduce((soma, seg) => {
      const taxa = seg.bandeira === 1 ? t.kmBandeira1 : t.kmBandeira2;
      return soma + Math.round(seg.km * taxa);
    }, 0);

  const avisos = [];
  const trechosCalc = [];

  trechos.forEach((trecho, i) => {
    const linhas = [];
    if (i === 0 || op.novaCorridaPorTrecho) {
      linhas.push({
        descricao: "Bandeirada",
        regra: `valor fixo de partida do taxímetro — serviço ${tituloServico(servicoEfetivo).toLowerCase()}`,
        valor: t.bandeirada,
      });
    }
    const resultado = segmentosDo(trecho);
    if (resultado.cruzou) {
      avisos.push(`O trecho ${i + 1} cruza a virada de bandeira: a distância foi rateada `
        + `proporcionalmente ao tempo rodado em cada bandeira `
        + `(${resultado.minB1} min em B1, ${resultado.minB2} min em B2).`);
    }
    if (tabela.b2ForaDoMunicipio === "trechoFora" && trecho.foraDoMunicipio
        && !par.bandeiraForcada && (trecho.fracaoFora ?? 1) < 0.999) {
      const kmTotal = trecho.distanciaMetros / 1000;
      avisos.push(`O trecho ${i + 1} foi dividido na divisa do município: `
        + `${Fmt.km(kmTotal * (1 - trecho.fracaoFora))} km dentro de ${tabela.cidade} `
        + `(bandeira pelo horário) e ${Fmt.km(kmTotal * trecho.fracaoFora)} km fora `
        + `(Bandeira 2). Divisa localizada pela malha municipal do IBGE.`);
    }
    for (const seg of resultado.segmentos) {
      if (seg.km <= 0.0005) continue;
      const taxa = seg.bandeira === 1 ? t.kmBandeira1 : t.kmBandeira2;
      linhas.push({
        descricao: `${Fmt.km(seg.km)} km em Bandeira ${seg.bandeira} × ${Fmt.brl(taxa)}/km`,
        regra: seg.regra,
        valor: Math.round(seg.km * taxa),
      });
    }
    if (trecho.esperaAposMinutos > 0 && !op.novaCorridaPorTrecho) {
      linhas.push({
        descricao: `Espera na parada: ${trecho.esperaAposMinutos} min × ${Fmt.brl(t.horaParada)}/h`,
        regra: "hora parada — taxímetro em espera com o táxi à disposição",
        valor: Math.round(t.horaParada * trecho.esperaAposMinutos / 60),
      });
    }
    trechosCalc.push({
      indice: i,
      nomeOrigem: trecho.nomeOrigem,
      nomeDestino: trecho.nomeDestino,
      partida: trecho.partida,
      chegada: new Date(trecho.partida.getTime() + trecho.duracaoSeg * 1000),
      distanciaKm: trecho.distanciaMetros / 1000,
      linhas,
      subtotal: linhas.reduce((s, l) => s + l.valor, 0),
    });
  });

  const gerais = [];
  if (op.volumes > 0 && t.taxaVolume > 0) {
    gerais.push({
      descricao: `${op.volumes} volume(s) no porta-malas × ${Fmt.brl(t.taxaVolume)}`,
      regra: "taxa por volume transportado",
      valor: Math.round(t.taxaVolume * op.volumes),
    });
  }
  if (op.novaCorridaPorTrecho) {
    avisos.push("Modo “nova corrida a cada trecho”: bandeirada cobrada em todos os trechos "
      + "e sem cobrança de hora parada (o táxi é dispensado em cada parada).");
  }
  if (op.bandeiraManual) {
    avisos.push(`Bandeira ${op.bandeiraManual} fixada manualmente — as regras automáticas de `
      + "bandeira da cidade não foram aplicadas neste cálculo (ex.: feriado local).");
  }
  if (!op.bandeiraManual && trechos.some(x => x.foraDoMunicipio)) {
    if (tabela.b2ForaDoMunicipio === "trechoFora"
        && trechos.some(x => x.foraDoMunicipio && (x.fracaoFora ?? 1) >= 0.999)) {
      avisos.push(`Trecho(s) que saem de ${tabela.cidade} correm em Bandeira 2 `
        + "(regra local para percursos fora do município).");
    }
    if (tabela.b2ForaDoMunicipio === "corridaInteira") {
      avisos.push(`Pela regra local de ${tabela.cidade}, a corrida INTEIRA corre em `
        + "Bandeira 2 quando a origem ou o destino fica em outro município.");
    }
  }
  if (op.corridaAeroporto) {
    if (regraAero && regraAero.tipo === "acrescimoPercentual") {
      const base = trechosCalc.reduce((s, x) => s + x.subtotal, 0)
        + gerais.reduce((s, l) => s + l.valor, 0);
      gerais.push({
        descricao: `Acréscimo de ${regraAero.percentual}% — corrida de/para o aeroporto`,
        regra: "regra tarifária local do aeroporto",
        valor: Math.round(base * regraAero.percentual / 100),
      });
    }
    const desc = descricaoRegraAeroporto(tabela);
    if (desc) avisos.push(`Regra de aeroporto aplicada: ${desc}`);
  }
  if (tabela.retornoForaMunicipio != null && trechos.some(x => x.foraDoMunicipio)) {
    const base = trechosCalc.reduce((s, x) => s + x.subtotal, 0)
      + gerais.reduce((s, l) => s + l.valor, 0);
    gerais.push({
      descricao: `Custo de retorno (até ${tabela.retornoForaMunicipio}%) — corrida para fora do município`,
      regra: "adicional facultativo previsto na norma local",
      valor: Math.round(base * tabela.retornoForaMunicipio / 100),
    });
    avisos.push(`O custo de retorno de ${tabela.cidade} é facultativo/condicionado `
      + "(veja as observações da cidade) — pode ser dispensado combinando com o taxista; "
      + "sem ele, desconte a última linha do total.");
  }
  if (op.chegadaDesejada) {
    avisos.push("Horário de saída calculado de trás para frente para chegar até "
      + `${Fmt.dataHora(op.chegadaDesejada, tabela.fusoID)}, com o trânsito previsto.`);
  }
  if (trechos.length) {
    const anoCorrida = componentes(trechos[0].partida, tabela.fusoID).ano;
    if (!anoCoberto(anoCorrida)) {
      avisos.push(`Atenção: os feriados móveis de ${anoCorrida} ainda não estão cadastrados `
        + "— Sexta-feira Santa e Corpus Christi podem não ser reconhecidos como Bandeira 2.");
    }
  }

  // Faixa de preço com rotas alternativas.
  let faixaTotal = null;
  if (alternativas && alternativas.length === trechos.length) {
    const totalBase = trechosCalc.reduce((s, x) => s + x.subtotal, 0)
      + gerais.reduce((s, l) => s + l.valor, 0);
    let minT = totalBase, maxT = totalBase;
    trechos.forEach((trecho, i) => {
      if (!alternativas[i] || !alternativas[i].length) return;
      const principal = custoKm(trecho);
      const custos = [...alternativas[i].map(custoKm), principal];
      minT += Math.min(...custos) - principal;
      maxT += Math.max(...custos) - principal;
    });
    if (minT < maxT) {
      faixaTotal = { min: minT, max: maxT };
      avisos.push("A faixa de valor considera as rotas alternativas para cada trecho — "
        + "o taxímetro cobra pelo caminho efetivamente percorrido.");
    }
  }

  const ultimo = trechos[trechos.length - 1];
  const chegadaFinal = ultimo
    ? new Date(ultimo.partida.getTime() + (ultimo.duracaoSeg + ultimo.esperaAposMinutos * 60) * 1000)
    : new Date();

  const corrida = {
    trechos: trechosCalc,
    linhasGerais: gerais,
    avisos,
    partida: trechos[0] ? trechos[0].partida : new Date(),
    chegadaFinal,
    tabelaVersao: tabela.versao,
    servico: servicoEfetivo,
    cidade: `${tabela.cidade} – ${tabela.uf}`,
    fusoID: tabela.fusoID,
    regrasB2Resumo: resumoRegrasB2(tabela),
    observacoesCidade: tabela.observacoes || [],
    faixaTotal,
  };
  corrida.total = trechosCalc.reduce((s, x) => s + x.subtotal, 0)
    + gerais.reduce((s, l) => s + l.valor, 0);
  corrida.distanciaTotalKm = trechosCalc.reduce((s, x) => s + x.distanciaKm, 0);
  return corrida;
}

/** Demonstrativo completo em texto, para copiar/colar. */
export function demonstrativoTexto(corrida) {
  const fz = corrida.fusoID;
  let s = `ESTIMATIVA DE CORRIDA DE TÁXI — ${corrida.cidade.toUpperCase()}\n`;
  s += `Serviço: ${tituloServico(corrida.servico)}\n`;
  s += `Saída: ${Fmt.dataHora(corrida.partida, fz)}\n`;
  s += `Chegada estimada: ${Fmt.dataHora(corrida.chegadaFinal, fz)}\n`;
  s += `Distância total: ${Fmt.km(corrida.distanciaTotalKm)} km\n`;
  if (corrida.faixaTotal) {
    s += `Faixa conforme o trajeto: ${Fmt.brl(corrida.faixaTotal.min)} a ${Fmt.brl(corrida.faixaTotal.max)}\n`;
  }
  s += "\n";
  for (const tr of corrida.trechos) {
    s += `TRECHO ${tr.indice + 1}: ${tr.nomeOrigem} → ${tr.nomeDestino}\n`;
    s += `  ${Fmt.hora(tr.partida, fz)} – ${Fmt.hora(tr.chegada, fz)} · ${Fmt.km(tr.distanciaKm)} km\n`;
    for (const l of tr.linhas) s += `  • ${l.descricao} = ${Fmt.brl(l.valor)}  [${l.regra}]\n`;
    s += `  Subtotal: ${Fmt.brl(tr.subtotal)}\n\n`;
  }
  for (const l of corrida.linhasGerais) s += `• ${l.descricao} = ${Fmt.brl(l.valor)}  [${l.regra}]\n`;
  s += `\nTOTAL ESTIMADO: ${Fmt.brl(corrida.total)}\n`;
  if (corrida.avisos.length) {
    s += "\nObservações:\n";
    for (const a of corrida.avisos) s += `  – ${a}\n`;
  }
  s += `\nTarifas: ${corrida.tabelaVersao}.\n`;
  s += "Estimativa com trânsito previsto. O valor real depende do trajeto "
    + "efetivamente percorrido e da medição do taxímetro.\n";
  return s;
}
