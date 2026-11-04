// TaxiTarifa web — orquestração da interface.
import {
  calcular, demonstrativoTexto, Fmt, componentes, dataNoFuso, tarifaDe,
  tituloServico, descricaoRegraAeroporto, regraAeroportoDe, ordenarCapitais,
} from "./tarifas.js";
import { analisarTrajeto } from "./municipios.js";
import { sugerir, geocodificar, rotas, provedorAtivo } from "./rotas.js";

const $ = (s) => document.querySelector(s);
function el(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
}

// ---------- Estado ----------

let CATALOGO = null;
let FERIADOS = {};
let MUNICIPIOS = {};
let capitais = [];
let tabela = null;

const campos = {
  origem: { texto: "", lugar: null },
  destino: { texto: "", lugar: null },
};
let paradas = [];        // {id, texto, lugar, espera}
let proximaParada = 1;
let modo = "sair";
let ultimaCorrida = null;
let ultimasRotas = null;
let assinaturaResultado = null;
let mapa = null;
let camadaMapa = null;

const cfg = { chaveGoogle: localStorage.getItem("tt-chave-google") || "" };

// ---------- Inicialização ----------

async function iniciar() {
  const [cat, mun] = await Promise.all([
    fetch("dados/catalogo.json").then(r => r.json()),
    fetch("dados/municipios.json").then(r => r.json()),
  ]);
  CATALOGO = cat;
  FERIADOS = cat.feriadosLocais || {};
  MUNICIPIOS = mun;
  capitais = ordenarCapitais(cat.capitais);

  const sel = $("#cidade");
  for (const c of capitais) {
    const op = el("option", null, `${c.cidade} – ${c.uf}`);
    op.value = `${c.cidade}-${c.uf}`;
    sel.appendChild(op);
  }
  sel.addEventListener("change", () => selecionarCidade(sel.value));
  selecionarCidade(`${capitais[0].cidade}-${capitais[0].uf}`);

  prepararCampoEndereco(document.querySelector('[data-campo="origem"]'), campos.origem);
  prepararCampoEndereco(document.querySelector('[data-campo="destino"]'), campos.destino);
  $("#btn-add-parada").addEventListener("click", adicionarParada);

  for (const b of document.querySelectorAll("#modo button")) {
    b.addEventListener("click", () => {
      modo = b.dataset.valor;
      document.querySelectorAll("#modo button").forEach(x => x.classList.toggle("ativo", x === b));
      $("#rotulo-horario").textContent = modo === "sair" ? "Horário de saída" : "Chegar até";
      marcarDesatualizado();
    });
  }
  $("#bandeira").addEventListener("change", () => {
    $("#bandeira-caption").classList.toggle("oculto", !$("#bandeira").value);
    marcarDesatualizado();
  });
  $("#aeroporto").addEventListener("change", () => {
    $("#aeroporto-caption").classList.toggle("oculto", !$("#aeroporto").checked);
    marcarDesatualizado();
  });
  for (const id of ["#partida", "#servico", "#volumes", "#nova-corrida"]) {
    $(id).addEventListener("change", marcarDesatualizado);
  }
  $("#servico").addEventListener("change", atualizarCaptionTarifas);

  $("#btn-calcular").addEventListener("click", aoCalcular);

  // Diálogos
  $("#btn-historico").addEventListener("click", abrirHistorico);
  $("#btn-config").addEventListener("click", () => {
    $("#chave-google").value = cfg.chaveGoogle;
    $("#dlg-config").showModal();
  });
  $("#btn-salvar-config").addEventListener("click", () => {
    cfg.chaveGoogle = $("#chave-google").value.trim();
    localStorage.setItem("tt-chave-google", cfg.chaveGoogle);
    atualizarProvedorCaption();
    $("#dlg-config").close();
  });
  for (const b of document.querySelectorAll(".btn-fechar")) {
    b.addEventListener("click", () => b.closest("dialog").close());
  }
  atualizarProvedorCaption();
}

function cidadeID() { return `${tabela.cidade}-${tabela.uf}`; }

function selecionarCidade(id) {
  tabela = capitais.find(c => `${c.cidade}-${c.uf}` === id);
  $("#cidade").value = id;
  // Limpa lugares resolvidos (pertenciam à cidade anterior) e escolhas locais.
  campos.origem.lugar = null;
  campos.destino.lugar = null;
  for (const p of paradas) p.lugar = null;
  document.querySelectorAll(".lugar-resolvido").forEach(e => (e.textContent = ""));
  $("#bandeira").value = "";
  $("#bandeira-caption").classList.add("oculto");
  $("#aeroporto").checked = false;
  $("#aeroporto-caption").classList.add("oculto");
  $("#servico").value = "comum";

  atualizarCaptionTarifas();
  $("#versao-caption").textContent = tabela.versao;
  $("#linha-servico").classList.toggle("oculto", !tabela.especial);
  const regraAero = descricaoRegraAeroporto(tabela);
  $("#linha-aeroporto").classList.toggle("oculto", !regraAero);
  $("#aeroporto-caption").textContent = regraAero || "";
  // Horário padrão: agora + 15 min, no fuso da cidade.
  const c = componentes(new Date(Date.now() + 15 * 60000), tabela.fusoID);
  const dois = (n) => String(n).padStart(2, "0");
  $("#partida").value = `${c.ano}-${dois(c.mes)}-${dois(c.dia)}T${dois(c.hora)}:${dois(c.minuto)}`;
  const difere = new Date().toLocaleTimeString("pt-BR", { timeZone: tabela.fusoID, hour: "2-digit" })
    !== new Date().toLocaleTimeString("pt-BR", { hour: "2-digit" });
  $("#fuso-caption").textContent = `Horário local de ${tabela.cidade} (${tabela.fusoID}).`;
  $("#fuso-caption").classList.toggle("oculto", !difere);
  marcarDesatualizado();
}

function atualizarCaptionTarifas() {
  const t = tarifaDe(tabela, $("#servico").value);
  $("#tarifas-caption").textContent =
    `Bandeirada ${Fmt.brl(t.bandeirada)} · km B1 ${Fmt.brl(t.kmBandeira1)} · `
    + `km B2 ${Fmt.brl(t.kmBandeira2)} · hora parada ${Fmt.brl(t.horaParada)}`;
  $("#linha-volumes").classList.toggle("oculto", t.taxaVolume <= 0);
}

function atualizarProvedorCaption() {
  $("#provedor-caption").textContent = provedorAtivo(cfg) === "google"
    ? "Rotas: Google Maps (trânsito previsto por horário)."
    : "Rotas: OpenStreetMap (modo gratuito) — o tempo NÃO considera o trânsito. "
      + "Cole a sua chave do Google em ⚙️ para previsão de trânsito.";
}

// ---------- Campos de endereço com autocompletar ----------

function prepararCampoEndereco(container, estado) {
  const input = container.querySelector("input");
  const caixa = container.querySelector(".sugestoes");
  const resolvido = container.querySelector(".lugar-resolvido");
  let timer = null;
  let sugestoesAtuais = [];
  let indiceAtivo = -1;

  const fecharCaixa = () => {
    caixa.innerHTML = "";
    sugestoesAtuais = [];
    indiceAtivo = -1;
  };

  const destacar = (i) => {
    indiceAtivo = i;
    [...caixa.children].forEach((filho, k) => filho.classList.toggle("ativa", k === i));
    if (i >= 0 && caixa.children[i]) {
      caixa.children[i].scrollIntoView({ block: "nearest" });
    }
  };

  const escolher = async (s) => {
    fecharCaixa();
    input.value = s.detalhe ? `${s.rotulo}, ${s.detalhe}` : s.rotulo;
    estado.texto = input.value;
    try {
      estado.lugar = await s.resolver();
      resolvido.textContent = `📍 ${estado.lugar.nome} — ${estado.lugar.endereco}`;
    } catch { estado.lugar = null; }
    marcarDesatualizado();
  };

  input.addEventListener("input", () => {
    estado.texto = input.value;
    if (estado.lugar) { estado.lugar = null; resolvido.textContent = ""; }
    marcarDesatualizado();
    clearTimeout(timer);
    if (input.value.trim().length < 3) { fecharCaixa(); return; }
    const atraso = provedorAtivo(cfg) === "google" ? 350 : 1100;
    timer = setTimeout(async () => {
      try {
        const lista = await sugerir(input.value, tabela, cfg);
        fecharCaixa();
        sugestoesAtuais = lista;
        lista.forEach((s, i) => {
          const item = el("div", "sugestao");
          item.appendChild(el("div", null, s.rotulo));
          if (s.detalhe) item.appendChild(el("small", null, s.detalhe));
          item.addEventListener("mousedown", (ev) => { ev.preventDefault(); escolher(s); });
          item.addEventListener("mousemove", () => destacar(i));
          caixa.appendChild(item);
        });
      } catch { fecharCaixa(); }
    }, atraso);
  });

  // Teclado: ↑/↓ navegam o menu (sem rolar a página), Enter escolhe, Esc fecha.
  input.addEventListener("keydown", (ev) => {
    if (!sugestoesAtuais.length) return;
    if (ev.key === "ArrowDown" || ev.key === "Down") {
      ev.preventDefault();
      destacar(Math.min(indiceAtivo + 1, sugestoesAtuais.length - 1));
    } else if (ev.key === "ArrowUp" || ev.key === "Up") {
      ev.preventDefault();
      destacar(Math.max(indiceAtivo - 1, 0));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      escolher(sugestoesAtuais[indiceAtivo >= 0 ? indiceAtivo : 0]);
    } else if (ev.key === "Escape") {
      fecharCaixa();
    }
  });

  input.addEventListener("blur", () => setTimeout(fecharCaixa, 250));
}

function adicionarParada() {
  const p = { id: proximaParada++, texto: "", lugar: null, espera: 10 };
  paradas.push(p);
  const bloco = el("div", "parada");
  bloco.dataset.id = p.id;

  const topo = el("div", "parada-topo");
  const campo = el("div", "campo-endereco");
  const input = document.createElement("input");
  input.type = "text"; input.placeholder = "Endereço da parada";
  input.autocomplete = "off"; input.spellcheck = false;
  campo.appendChild(input);
  campo.appendChild(el("div", "sugestoes"));
  campo.appendChild(el("p", "lugar-resolvido"));
  const lixo = el("button", "btn-lixo", "🗑");
  lixo.title = "Remover esta parada";
  lixo.addEventListener("click", () => {
    paradas = paradas.filter(x => x.id !== p.id);
    bloco.remove();
    marcarDesatualizado();
  });
  topo.appendChild(campo);
  topo.appendChild(lixo);
  bloco.appendChild(topo);

  const esperaLinha = el("div", "parada-espera");
  esperaLinha.appendChild(el("span", null, "Espera na parada (min):"));
  const esperaInput = document.createElement("input");
  esperaInput.type = "number"; esperaInput.min = 0; esperaInput.max = 240;
  esperaInput.step = 5; esperaInput.value = 10;
  esperaInput.addEventListener("change", () => {
    p.espera = Math.max(0, Number(esperaInput.value) || 0);
    marcarDesatualizado();
  });
  esperaLinha.appendChild(esperaInput);
  bloco.appendChild(esperaLinha);

  $("#paradas").appendChild(bloco);
  prepararCampoEndereco(campo, p);
}

// ---------- Selo de desatualizado ----------

function assinaturaAtual() {
  return JSON.stringify({
    cidade: cidadeID(), origem: campos.origem.texto, destino: campos.destino.texto,
    paradas: paradas.map(p => [p.texto, p.espera]),
    partida: $("#partida").value, modo,
    servico: $("#servico").value, bandeira: $("#bandeira").value,
    aeroporto: $("#aeroporto").checked, volumes: $("#volumes").value,
    novaCorrida: $("#nova-corrida").checked,
  });
}

function marcarDesatualizado() {
  const tem = ultimaCorrida && assinaturaResultado !== assinaturaAtual();
  $("#selo-desatualizado").classList.toggle("oculto", !tem);
}

// ---------- Cálculo ----------

async function resolverCampo(estado, rotulo) {
  if (estado.lugar) return estado.lugar;
  if (!estado.texto.trim()) throw new Error(`Preencha o campo “${rotulo}”.`);
  return geocodificar(estado.texto, tabela, cfg);
}

async function rotearCascata(pontos, partindo) {
  const geom = MUNICIPIOS[cidadeID()] || null;
  const trechos = [];
  const alternativas = [];
  const rotasPrincipais = [];
  let partidaTrecho = partindo;
  for (let i = 0; i < pontos.length - 1; i++) {
    const todas = await rotas(pontos[i], pontos[i + 1], partidaTrecho, cfg);
    const principal = todas[0];
    const espera = i < paradas.length ? paradas[i].espera : 0;
    const analise = analisarTrajeto(principal.pontos, geom);
    const trechoDe = (rt) => ({
      nomeOrigem: pontos[i].nome,
      nomeDestino: pontos[i + 1].nome,
      distanciaMetros: rt.distanciaMetros,
      partida: partidaTrecho,
      duracaoSeg: rt.duracaoSeg,
      esperaAposMinutos: espera,
      foraDoMunicipio: analise.foraDoMunicipio,
      fracaoFora: analise.fracaoFora || 1,
      foraNoInicio: analise.foraNoInicio,
    });
    trechos.push(trechoDe(principal));
    alternativas.push(todas.slice(1, 4).map(trechoDe));
    rotasPrincipais.push(principal);
    partidaTrecho = new Date(partidaTrecho.getTime() + (principal.duracaoSeg + espera * 60) * 1000);
  }
  return { trechos, alternativas, rotasPrincipais, chegada: partidaTrecho };
}

function partidaEscolhida() {
  const [dataParte, horaParte] = $("#partida").value.split("T");
  const [ano, mes, dia] = dataParte.split("-").map(Number);
  const [hora, minuto] = horaParte.split(":").map(Number);
  return dataNoFuso(tabela.fusoID, ano, mes, dia, hora, minuto);
}

async function aoCalcular() {
  const btn = $("#btn-calcular");
  btn.disabled = true;
  btn.textContent = "Consultando rotas…";
  $("#erro").classList.add("oculto");
  try {
    const pontos = [await resolverCampo(campos.origem, "local de partida")];
    for (const p of paradas) pontos.push(await resolverCampo(p, "endereço da parada"));
    pontos.push(await resolverCampo(campos.destino, "destino final"));

    let partida = partidaEscolhida();
    const alvo = partida;
    if (modo === "chegar") {
      let estimativa = new Date(alvo.getTime() - 45 * 60000);
      for (let i = 0; i < 3; i++) {
        const r = await rotearCascata(pontos, estimativa);
        const erro = alvo.getTime() - r.chegada.getTime();
        estimativa = new Date(estimativa.getTime() + erro);
        if (Math.abs(erro) < 120000) break;
      }
      partida = estimativa;
    }

    const rot = await rotearCascata(pontos, partida);
    const opcoes = {
      servico: tabela.especial ? $("#servico").value : "comum",
      volumes: Number($("#volumes").value) || 0,
      novaCorridaPorTrecho: $("#nova-corrida").checked,
      bandeiraManual: Number($("#bandeira").value) || null,
      corridaAeroporto: $("#aeroporto").checked,
      chegadaDesejada: modo === "chegar" ? alvo : null,
    };
    const corrida = calcular(tabela, rot.trechos, opcoes, FERIADOS, rot.alternativas);
    if (provedorAtivo(cfg) === "osm") {
      corrida.avisos.push("Rotas no modo gratuito (OpenStreetMap): o tempo de percurso "
        + "NÃO considera o trânsito. Para previsão de trânsito por horário, configure "
        + "a chave do Google em ⚙️.");
    }
    ultimaCorrida = corrida;
    ultimasRotas = rot.rotasPrincipais;
    assinaturaResultado = assinaturaAtual();
    marcarDesatualizado();
    desenharMapa(rot.rotasPrincipais, pontos);
    renderCorrida($("#resultado"), corrida);
    salvarHistorico(corrida);
    $("#resultado").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    $("#erro").textContent = `Não foi possível calcular: ${e.message}`;
    $("#erro").classList.remove("oculto");
  } finally {
    btn.disabled = false;
    btn.textContent = "Calcular corrida";
  }
}

// ---------- Mapa ----------

function desenharMapa(rotasPrincipais, pontos) {
  $("#mapa").classList.remove("oculto");
  if (!mapa) {
    mapa = L.map("mapa");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap",
    }).addTo(mapa);
    camadaMapa = L.layerGroup().addTo(mapa);
  }
  camadaMapa.clearLayers();
  const tudo = [];
  for (const r of rotasPrincipais) {
    L.polyline(r.pontos, { color: "#1468d6", weight: 5, opacity: 0.85 }).addTo(camadaMapa);
    tudo.push(...r.pontos);
  }
  pontos.forEach((p, i) => {
    L.marker([p.lat, p.lon]).addTo(camadaMapa)
      .bindPopup(`${i === 0 ? "Partida" : i === pontos.length - 1 ? "Destino" : `Parada ${i}`}: ${p.nome}`);
  });
  mapa.invalidateSize();
  mapa.fitBounds(L.latLngBounds(tudo).pad(0.12));
}

// ---------- Renderização do resultado ----------

function kv(chave, valor, destaque) {
  const linha = el("div", "kv");
  linha.appendChild(el("span", null, chave));
  linha.appendChild(el("span", destaque ? "v destaque" : "v", valor));
  return linha;
}

function linhaDemo(l) {
  const d = el("div", "linha-demo");
  const topo = el("div", "ld-topo");
  topo.appendChild(el("span", null, l.descricao));
  topo.appendChild(el("span", "ld-valor", Fmt.brl(l.valor)));
  d.appendChild(topo);
  d.appendChild(el("div", "ld-regra", l.regra));
  return d;
}

function renderCorrida(container, corrida) {
  container.innerHTML = "";
  const fz = corrida.fusoID;

  const resumo = el("section", "cartao");
  resumo.appendChild(el("h2", null, "Resumo"));
  resumo.appendChild(kv("Saída", Fmt.dataHora(corrida.partida, fz)));
  resumo.appendChild(kv("Chegada estimada", Fmt.dataHora(corrida.chegadaFinal, fz)));
  resumo.appendChild(kv("Distância total", `${Fmt.km(corrida.distanciaTotalKm)} km`));
  resumo.appendChild(kv("Serviço", tituloServico(corrida.servico)));
  resumo.appendChild(kv("Valor total estimado", Fmt.brl(corrida.total), true));
  if (corrida.faixaTotal) {
    resumo.appendChild(kv("Conforme o trajeto",
      `${Fmt.brl(corrida.faixaTotal.min)} – ${Fmt.brl(corrida.faixaTotal.max)}`));
  }
  container.appendChild(resumo);

  for (const t of corrida.trechos) {
    const sec = el("section", "cartao");
    sec.appendChild(el("h2", null, `Trecho ${t.indice + 1}: ${t.nomeOrigem} → ${t.nomeDestino}`));
    sec.appendChild(kv("Horário", `${Fmt.hora(t.partida, fz)} – ${Fmt.hora(t.chegada, fz)}`));
    sec.appendChild(kv("Distância", `${Fmt.km(t.distanciaKm)} km`));
    for (const l of t.linhas) sec.appendChild(linhaDemo(l));
    const st = kv("Subtotal do trecho", Fmt.brl(t.subtotal));
    st.classList.add("subtotal");
    sec.appendChild(st);
    container.appendChild(sec);
  }

  if (corrida.linhasGerais.length) {
    const sec = el("section", "cartao");
    sec.appendChild(el("h2", null, "Adicionais da corrida"));
    for (const l of corrida.linhasGerais) sec.appendChild(linhaDemo(l));
    container.appendChild(sec);
  }

  const demo = el("section", "cartao");
  demo.appendChild(el("h2", null, "Demonstrativo"));
  const botoes = el("div", "botoes-demo");
  const btnPdf = el("button", null, "🖨 Salvar em PDF (A4)");
  btnPdf.addEventListener("click", () => imprimir(corrida));
  const btnCopiar = el("button", null, "📋 Copiar demonstrativo");
  btnCopiar.addEventListener("click", async () => {
    await navigator.clipboard.writeText(demonstrativoTexto(corrida));
    btnCopiar.textContent = "✓ Copiado!";
    setTimeout(() => (btnCopiar.textContent = "📋 Copiar demonstrativo"), 2000);
  });
  botoes.appendChild(btnPdf);
  botoes.appendChild(btnCopiar);
  demo.appendChild(botoes);
  container.appendChild(demo);

  const regras = el("section", "cartao");
  regras.appendChild(el("h2", null, "Regras aplicadas e avisos"));
  for (const a of corrida.avisos) regras.appendChild(el("div", "aviso", a));
  regras.appendChild(el("p", "legenda", `Tarifas: ${corrida.tabelaVersao}.`));
  regras.appendChild(el("p", "legenda", corrida.regrasB2Resumo));
  for (const o of corrida.observacoesCidade) regras.appendChild(el("p", "legenda", `Obs.: ${o}`));
  container.appendChild(regras);
}

// ---------- Impressão (PDF A4) ----------

function imprimir(corrida) {
  const fz = corrida.fusoID;
  const area = $("#impressao");
  area.innerHTML = "";
  area.appendChild(el("h1", null, "Estimativa de corrida de táxi"));
  area.appendChild(el("p", "imp-sub",
    `${corrida.cidade} · Serviço ${tituloServico(corrida.servico).toLowerCase()}`));
  area.appendChild(el("p", "imp-gerado",
    `Demonstrativo gerado em ${Fmt.dataHora(new Date(), fz)} — TaxiTarifa`));

  const secao = (titulo, montar) => {
    const s = el("div", "imp-secao");
    if (titulo) s.appendChild(el("div", "imp-titulo", titulo));
    const card = el("div", "imp-card");
    montar(card);
    s.appendChild(card);
    area.appendChild(s);
  };

  secao("Resumo", (c) => {
    c.appendChild(kv("Saída", Fmt.dataHora(corrida.partida, fz)));
    c.appendChild(kv("Chegada estimada", Fmt.dataHora(corrida.chegadaFinal, fz)));
    c.appendChild(kv("Distância total", `${Fmt.km(corrida.distanciaTotalKm)} km`));
    c.appendChild(kv("Serviço", tituloServico(corrida.servico)));
    c.appendChild(kv("Valor total estimado", Fmt.brl(corrida.total), true));
    if (corrida.faixaTotal) {
      c.appendChild(kv("Conforme o trajeto",
        `${Fmt.brl(corrida.faixaTotal.min)} – ${Fmt.brl(corrida.faixaTotal.max)}`));
    }
  });
  for (const t of corrida.trechos) {
    secao(`Trecho ${t.indice + 1}: ${t.nomeOrigem} → ${t.nomeDestino}`, (c) => {
      c.appendChild(kv("Horário", `${Fmt.hora(t.partida, fz)} – ${Fmt.hora(t.chegada, fz)}`));
      c.appendChild(kv("Distância", `${Fmt.km(t.distanciaKm)} km`));
      for (const l of t.linhas) c.appendChild(linhaDemo(l));
      const st = kv("Subtotal do trecho", Fmt.brl(t.subtotal));
      st.classList.add("subtotal");
      c.appendChild(st);
    });
  }
  if (corrida.linhasGerais.length) {
    secao("Adicionais da corrida", (c) => {
      for (const l of corrida.linhasGerais) c.appendChild(linhaDemo(l));
    });
  }
  const total = el("div", "imp-secao");
  const cardTotal = el("div", "imp-card imp-total");
  cardTotal.appendChild(el("span", null, "TOTAL ESTIMADO"));
  cardTotal.appendChild(el("span", null, Fmt.brl(corrida.total)));
  total.appendChild(cardTotal);
  area.appendChild(total);
  secao("Regras aplicadas e avisos", (c) => {
    for (const a of corrida.avisos) c.appendChild(el("div", "aviso", a));
    c.appendChild(el("p", "legenda", `Tarifas: ${corrida.tabelaVersao}.`));
    c.appendChild(el("p", "legenda", corrida.regrasB2Resumo));
    for (const o of corrida.observacoesCidade) c.appendChild(el("p", "legenda", `Obs.: ${o}`));
    c.appendChild(el("p", "legenda", "Valores estimados. O valor real depende do trajeto "
      + "efetivamente percorrido e da medição do taxímetro."));
  });
  window.print();
}

// ---------- Histórico ----------

function salvarHistorico(corrida) {
  const lista = JSON.parse(localStorage.getItem("tt-historico") || "[]");
  lista.unshift({ geradaEm: new Date().toISOString(), corrida: serializar(corrida) });
  localStorage.setItem("tt-historico", JSON.stringify(lista.slice(0, 10)));
}

function serializar(corrida) {
  return JSON.parse(JSON.stringify(corrida, (k, v) => (v instanceof Date ? v.toISOString() : v)));
}

function reidratar(c) {
  const corrida = { ...c };
  corrida.partida = new Date(c.partida);
  corrida.chegadaFinal = new Date(c.chegadaFinal);
  corrida.trechos = c.trechos.map(t => ({ ...t, partida: new Date(t.partida), chegada: new Date(t.chegada) }));
  return corrida;
}

function abrirHistorico() {
  const lista = JSON.parse(localStorage.getItem("tt-historico") || "[]");
  const cont = $("#historico-lista");
  const det = $("#historico-detalhe");
  cont.innerHTML = "";
  det.innerHTML = "";
  if (!lista.length) {
    cont.appendChild(el("p", "legenda", "Sem estimativas guardadas. As últimas 10 corridas calculadas aparecem aqui."));
  }
  for (const entrada of lista) {
    const corrida = reidratar(entrada.corrida);
    const item = el("div", "item-hist");
    const topo = el("div", "ih-topo");
    topo.appendChild(el("span", null, corrida.cidade));
    topo.appendChild(el("span", null, Fmt.brl(corrida.total)));
    item.appendChild(topo);
    const primeiro = corrida.trechos[0];
    const ultimo = corrida.trechos[corrida.trechos.length - 1];
    if (primeiro && ultimo) {
      item.appendChild(el("small", null, `${primeiro.nomeOrigem} → ${ultimo.nomeDestino}`));
    }
    item.appendChild(el("small", null, Fmt.dataHora(corrida.partida, corrida.fusoID)));
    item.addEventListener("click", () => {
      det.innerHTML = "";
      renderCorrida(det, corrida);
    });
    cont.appendChild(item);
  }
  $("#dlg-historico").showModal();
}

iniciar().catch(e => {
  $("#erro").textContent = `Falha ao carregar os dados do app: ${e.message}`;
  $("#erro").classList.remove("oculto");
});
