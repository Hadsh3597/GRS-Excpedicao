"use strict";

/* FIREBASE */
const firebaseConfig = {
  apiKey: "AIzaSyCVNEMoCrzed5Pn6leILGJd-hgNAbWyo2E",
  authDomain: "sistema-de-entregas-89bab.firebaseapp.com",
  databaseURL: "https://sistema-de-entregas-89bab-default-rtdb.firebaseio.com",
  projectId: "sistema-de-entregas-89bab",
  storageBucket: "sistema-de-entregas-89bab.firebasestorage.app",
  messagingSenderId: "383878275976",
  appId: "1:383878275976:web:4f2d952e2af82ff0c1503d",
  measurementId: "G-30BH511H4Y"
};

if (typeof firebase === "undefined") throw new Error("Firebase não carregado.");
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

const db = firebase.database();
const dbRefEntregas = db.ref("entregas");
const dbRefAvisos = db.ref("avisos");
const dbRefOcorrencias = db.ref("ocorrencias");
const dbRefDavsAbertas = db.ref("davs_abertas");
const dbRefMotos = db.ref("motos");
const dbRefMotoLancamentos = db.ref("moto_lancamentos");
const dbRefConfigMotoboys = db.ref("configuracoes/motoboys");

window.entregasGlobais = [];
window.avisosGlobais = [];
window.ocorrenciasGlobais = [];
window.davsAbertasGlobais = [];
window.motoLancamentosGlobais = [];

let motos = [];
let carregouEntregas = false;
let carregouAvisos = false;
let carregouOcorrencias = false;
let carregouDavsAbertas = false;
let carregouMotos = false;
let carregouLancamentos = false;
let carregouNomesMotoboys = false;
let indiceConferencia = 0;
let historicoConferidos = [];
let vendedorFocusIndex = -1;
let filaAvisos = [];
let avisosExibidos = new Set();
let modalAvisoInstance = null;

const NOMES_MOTOBOYS_PADRAO = {
  "1": { nome: "Wellington", cor: "#198754" },
  "2": { nome: "Rogerio", cor: "#0d6efd" },
  "3": { nome: "Giovane", cor: "#ffc107" },
  "4": { nome: "Djavan", cor: "#dc3545" }
};

let nomesMotoboys = JSON.parse(JSON.stringify(NOMES_MOTOBOYS_PADRAO));

/* UTILIDADES */
const elemento = id => document.getElementById(id);
const valorElemento = (id, padrao = "") => elemento(id)?.value ?? padrao;
const idsIguais = (a, b) => String(a) === String(b);

function numeroSeguro(valor, padrao = 0) {
  if (valor === null || valor === undefined || valor === "") return padrao;
  const n = Number(String(valor).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : padrao;
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function textoSeguro(valor, padrao = "-") {
  return valor === null || valor === undefined || valor === "" ? padrao : String(valor);
}

function normalizarTexto(texto) {
  return String(texto || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim();
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getHoraAtual() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatarMoeda(valor) {
  return numeroSeguro(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataCompleta(data) {
  const s = String(data || "").substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [a,m,d] = s.split("-");
    return `${d}/${m}/${a}`;
  }
  return s || "-";
}

function obterDataEntregaISO(entrega) {
  const data = String(entrega?.data_lancamento || entrega?.dataLancamento || entrega?.data || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(data)) return data.substring(0,10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [d,m,a] = data.split("/");
    return `${a}-${m}-${d}`;
  }
  const id = numeroSeguro(entrega?.id);
  if (id > 100000000000) {
    const dt = new Date(id);
    if (!Number.isNaN(dt.getTime())) {
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
    }
  }
  return "";
}

function exibirToastConfirmacao(mensagem) {
  const toast = elemento("toastSucesso");
  if (!toast) return;
  elemento("toastSucessoMensagem").textContent = mensagem;
  bootstrap.Toast.getOrCreateInstance(toast).show();
}

function encontrarEntregaPorId(id) {
  return window.entregasGlobais.find(e => idsIguais(e.id, id));
}

/* MOTOS / NOMES */
function nomeMotoboy(id) {
  return nomesMotoboys[String(id)]?.nome || `Motoboy ${id}`;
}

function opcoesMotoboysHTML(incluirReserva = false, valorSelecionado = "") {
  const opcoes = Object.entries(nomesMotoboys).map(([id, dados]) =>
    `<option value="${id}" ${String(id) === String(valorSelecionado) ? "selected" : ""}>${escaparHTML(dados.nome)}</option>`
  );
  if (incluirReserva) opcoes.push(`<option value="reserva" ${String(valorSelecionado)==="reserva"?"selected":""}>Moto reserva</option>`);
  return opcoes.join("");
}

function atualizarNomesMotoboysUI() {
  document.querySelectorAll("[data-motoboy-id]").forEach(el => {
    const id = el.dataset.motoboyId;
    el.textContent = nomeMotoboy(id);
  });

  const selects = [
    ["motoboy", false],
    ["moto-editar-motoboy", true],
    ["abastecimento-motoboy", false],
    ["ocorrencia-motoboy", false]
  ];

  selects.forEach(([id, reserva]) => {
    const select = elemento(id);
    if (!select) return;
    const valorAtual = select.value;
    if (id === "motoboy" && !valorAtual) {
      select.innerHTML = opcoesMotoboysHTML(false, "1");
    } else if (id === "ocorrencia-motoboy") {
      select.innerHTML = `<option value="">Selecione o motoboy</option>${opcoesMotoboysHTML(reserva, valorAtual)}`;
    } else {
      select.innerHTML = opcoesMotoboysHTML(reserva, valorAtual);
    }
  });

  renderizarListaMotoboysConfig();

  const p = new URLSearchParams(location.search);
  if (p.get("m")) renderizarListas();
  else if (p.get("view") === "motos") renderizarMotos();
}

function renderizarListaMotoboysConfig() {
  const container = elemento("lista-motoboys-config");
  if (!container) return;
  container.innerHTML = Object.entries(nomesMotoboys).map(([id, dados]) => `
    <div class="motoboy-config-row">
      <div class="motoboy-config-id">${id}</div>
      <div class="motoboy-config-meta">
        <div class="motoboy-config-label">Motoboy ${id}</div>
        <div class="motoboy-config-help">Posição fixa do sistema</div>
      </div>
      <input type="text" class="form-control motoboy-config-input flex-grow-1" data-motoboy-input="${id}"
        value="${escaparHTML(dados.nome)}" maxlength="60" placeholder="Nome do motoboy"
        oninput="capitalizarInput(this)">
    </div>
  `).join("");
}

async function salvarNomesMotoboys() {
  const novos = {};
  for (const id of Object.keys(NOMES_MOTOBOYS_PADRAO)) {
    const input = document.querySelector(`[data-motoboy-input="${id}"]`);
    const nome = input?.value.trim() || "";
    if (!nome) return alert(`Informe o nome do Motoboy ${id}.`);
    novos[id] = {
      nome,
      cor: NOMES_MOTOBOYS_PADRAO[id].cor
    };
  }

  const nomesNormalizados = Object.values(novos).map(x => normalizarTexto(x.nome));
  if (new Set(nomesNormalizados).size !== nomesNormalizados.length) {
    return alert("Os nomes dos motoboys precisam ser diferentes entre si.");
  }

  try {
    await dbRefConfigMotoboys.set(novos);
    nomesMotoboys = novos;
    carregouNomesMotoboys = true;
    atualizarNomesMotoboysUI();
    exibirToastConfirmacao("✅ Nomes dos motoboys atualizados!");
  } catch (erro) {
    alert(`Erro ao salvar nomes: ${erro.message}`);
  }
}

/* FIREBASE */
function converterSnapshot(snapshot) {
  const dados = snapshot.val();
  if (!dados) return [];
  if (Array.isArray(dados)) {
    return dados.map((item, i) => item ? ({...item, firebaseKey: item.firebaseKey || String(i)}) : null).filter(Boolean);
  }
  return Object.entries(dados).filter(([,v]) => v && typeof v === "object")
    .map(([firebaseKey,v]) => ({...v, firebaseKey}));
}

function iniciarListenersFirebase() {
  dbRefConfigMotoboys.on("value", snap => {
    const dados = snap.val();
    if (dados && typeof dados === "object") {
      nomesMotoboys = Object.fromEntries(Object.keys(NOMES_MOTOBOYS_PADRAO).map(id => [
        id,
        {
          nome: String(dados[id]?.nome || NOMES_MOTOBOYS_PADRAO[id].nome),
          cor: NOMES_MOTOBOYS_PADRAO[id].cor
        }
      ]));
    } else {
      nomesMotoboys = JSON.parse(JSON.stringify(NOMES_MOTOBOYS_PADRAO));
      dbRefConfigMotoboys.set(nomesMotoboys).catch(console.error);
    }
    carregouNomesMotoboys = true;
    atualizarNomesMotoboysUI();
    renderizarListas();
  }, erro => {
    carregouNomesMotoboys = true;
    console.error(erro);
    atualizarNomesMotoboysUI();
  });

  dbRefEntregas.on("value", snap => {
    window.entregasGlobais = converterSnapshot(snap).sort((a,b) => numeroSeguro(b.id)-numeroSeguro(a.id));
    carregouEntregas = true;
    renderizarListas();
  }, erro => { carregouEntregas = true; console.error(erro); });

  dbRefAvisos.on("value", snap => {
    window.avisosGlobais = converterSnapshot(snap).sort((a,b) => numeroSeguro(b.id)-numeroSeguro(a.id));
    carregouAvisos = true;
    renderizarListas();
  }, erro => { carregouAvisos = true; console.error(erro); });

  dbRefOcorrencias.on("value", snap => {
    window.ocorrenciasGlobais = converterSnapshot(snap).sort((a,b) => numeroSeguro(b.id)-numeroSeguro(a.id));
    carregouOcorrencias = true;
    renderizarListas();
  }, erro => { carregouOcorrencias = true; console.error(erro); });

  dbRefDavsAbertas.on("value", snap => {
    window.davsAbertasGlobais = converterSnapshot(snap).sort((a,b) => numeroSeguro(b.id)-numeroSeguro(a.id));
    carregouDavsAbertas = true;
    renderizarListas();
  }, erro => { carregouDavsAbertas = true; console.error(erro); });

  dbRefMotos.on("value", snap => {
    const dados = snap.val();
    carregouMotos = true;
    if (dados) {
      motos = normalizarMotos(dados);
      salvarMotosLocalmente();
    } else {
      motos = criarMotosPadrao();
      dbRefMotos.set(motosParaObjeto()).catch(console.error);
    }
    renderizarListas();
  }, erro => { carregouMotos = true; console.error(erro); });

  dbRefMotoLancamentos.on("value", snap => {
    window.motoLancamentosGlobais = converterSnapshot(snap);
    carregouLancamentos = true;
    renderizarListas();
  }, erro => { carregouLancamentos = true; console.error(erro); });
}

/* ENTREGAS */
window.salvarEntrega = async function(event) {
  event.preventDefault();
  const dav = valorElemento("dav").trim();
  const entrega = {
    id: Date.now(),
    dav,
    vendedor: valorElemento("vendedor").trim(),
    cliente: valorElemento("cliente").trim(),
    endereco: valorElemento("endereco").trim(),
    valor: numeroSeguro(valorElemento("valor")).toFixed(2),
    pagamento: valorElemento("pagamento", "Dinheiro"),
    observacoes: valorElemento("observacoes").trim(),
    motoboy: String(valorElemento("motoboy", "1")),
    status: "Pendente",
    data_lancamento: hojeISO(),
    hora_entrada: getHoraAtual(),
    hora_na_rota: "",
    hora_conclusao: "",
    motivo_nao_entrega: "",
    conferida: false,
    status_conferencia: "Em Aberto"
  };
  try {
    await dbRefEntregas.push().set(entrega);
    elemento("form-entrega").reset();
    elemento("motoboy").value = "1";
    elemento("status-geocoding").textContent = "";
    avisosExibidos.clear();
    exibirToastConfirmacao(`✅ DAV #${dav} cadastrada!`);
    elemento("dav").focus();
  } catch (erro) { alert(`Erro ao cadastrar: ${erro.message}`); }
};

async function atualizarEntrega(id, alteracoes) {
  const entrega = encontrarEntregaPorId(id);
  if (!entrega?.firebaseKey) return;
  await db.ref(`entregas/${entrega.firebaseKey}`).update(alteracoes);
}

window.colocarNaRota = id => atualizarEntrega(id, {status:"Na Rota", hora_na_rota:getHoraAtual()});
window.marcarComoEntregue = id => atualizarEntrega(id, {status:"Entregue", hora_conclusao:getHoraAtual()});

window.marcarComoNaoEntregue = async function(id) {
  const motivo = prompt("Informe o motivo da não entrega:");
  if (!motivo?.trim()) return;
  await atualizarEntrega(id, {status:"Não Entregue", hora_conclusao:getHoraAtual(), motivo_nao_entrega:motivo.trim()});
};

window.voltarStatusEntrega = async function(id) {
  const e = encontrarEntregaPorId(id);
  if (!e) return;
  if (["Entregue","Não Entregue"].includes(e.status)) {
    await atualizarEntrega(id, {status:"Na Rota", hora_conclusao:"", motivo_nao_entrega:""});
  } else if (e.status === "Na Rota") {
    await atualizarEntrega(id, {status:"Pendente", hora_na_rota:"", hora_conclusao:"", motivo_nao_entrega:""});
  }
};

window.alterarMotoboyEntrega = async function(id, motoboy) {
  const e = encontrarEntregaPorId(id);
  if (e?.status === "Entregue") return alert("Não é possível alterar uma entrega concluída.");
  await atualizarEntrega(id, {motoboy:String(motoboy)});
};

window.removerEntrega = async function(id) {
  if (!confirm("Deseja apagar esta entrega?")) return;
  const e = encontrarEntregaPorId(id);
  if (e?.firebaseKey) {
    await db.ref(`entregas/${e.firebaseKey}`).remove();
    exibirToastConfirmacao("✅ Entrega excluída!");
  }
};

window.marcarConferida = (id, status=true) =>
  atualizarEntrega(id, {conferida:Boolean(status), status_conferencia:status?"Conferida":"Em Aberto"});

/* COPIAR DADOS DA ENTREGA */
const ICONE_COPIAR = `<svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h7A1.5 1.5 0 0 1 14 1.5v9a1.5 1.5 0 0 1-1.5 1.5H12v-1h.5a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-7a.5.5 0 0 0-.5.5V2H4z"/><path d="M1.5 4A1.5 1.5 0 0 0 0 5.5v9A1.5 1.5 0 0 0 1.5 16h7a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 8.5 4zM1 5.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5z"/></svg>`;
const ICONE_COPIADO = `<svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M13.78 3.72a.75.75 0 0 1 0 1.06l-7 7a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06L6.25 10.19l6.47-6.47a.75.75 0 0 1 1.06 0z"/></svg>`;

async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch (_) { /* cai no fallback */ }
  // fallback para http / navegadores antigos
  const ta = document.createElement("textarea");
  ta.value = texto;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (_) {}
  document.body.removeChild(ta);
  return ok;
}

window.copiarDadosEntrega = async (id, btn) => {
  const e = encontrarEntregaPorId(id);
  if (!e) return;
  const texto = [e.cliente, e.endereco, e.vendedor].map(v => textoSeguro(v)).join("\n");
  const ok = await copiarTexto(texto);
  if (!btn) return;
  clearTimeout(btn._timer);
  btn.classList.toggle("copiado", ok);
  btn.classList.toggle("erro", !ok);
  btn.innerHTML = ok ? ICONE_COPIADO : "✕";
  btn.title = ok ? "Copiado!" : "Não foi possível copiar";
  btn._timer = setTimeout(() => {
    btn.classList.remove("copiado", "erro");
    btn.innerHTML = ICONE_COPIAR;
    btn.title = "Copiar cliente, endereço e vendedor";
  }, 1500);
};

/* CARDS DE ENTREGA */
function criarCardEntrega(entrega, permitirTroca, painelAdmin) {
  const card = document.createElement("div");
  const idJS = JSON.stringify(String(entrega.id));
  const motoboyId = String(entrega.motoboy || "");
  const motoboy = nomesMotoboys[motoboyId] || {nome:`Motoboy ${motoboyId}`, cor:"#6c757d"};
  const badges = {"Pendente":"bg-warning text-dark","Na Rota":"bg-warning text-dark","Entregue":"bg-success","Não Entregue":"bg-danger"};
  let seletor = `<span class="badge badge-custom-primary">${escaparHTML(motoboy.nome)}</span>`;

  if (permitirTroca) {
    const options = Object.entries(nomesMotoboys).map(([id,d]) =>
      `<option value="${id}" ${id===motoboyId?"selected":""}>${escaparHTML(d.nome)}</option>`).join("");
    seletor = `<select class="select-motoboy-card" onchange='alterarMotoboyEntrega(${idJS},this.value)' ${entrega.status==="Entregue"?"disabled":""}>${options}</select>`;
  }

  let acao = "";
  if (entrega.status === "Pendente") acao = `<button onclick='colocarNaRota(${idJS})' class="btn btn-sm btn-primary">🚀 Despachar</button>`;
  if (entrega.status === "Na Rota") {
    acao = painelAdmin ? `<span class="badge bg-warning text-dark">🛵 Em trânsito</span>` :
      `<button onclick='marcarComoEntregue(${idJS})' class="btn btn-sm btn-success">✅ Entregue</button>
       <button onclick='marcarComoNaoEntregue(${idJS})' class="btn btn-sm btn-danger">❌ Não entregue</button>`;
  }
  const voltar = entrega.status !== "Pendente" ? `<button onclick='voltarStatusEntrega(${idJS})' class="btn btn-sm btn-outline-warning">↩️ Voltar</button>` : "";

  card.className = `card shadow-sm border-0 ${["Entregue","Não Entregue"].includes(entrega.status)?"opacity-75":""}`;
  card.innerHTML = `
    <div class="card-body py-2 px-3">
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div><strong>#${escaparHTML(textoSeguro(entrega.dav))}</strong> - ${escaparHTML(textoSeguro(entrega.cliente))}
          <span class="badge ${badges[entrega.status]||"bg-secondary"} ms-2">${escaparHTML(textoSeguro(entrega.status))}</span>
        </div>
        <div class="text-end">${seletor}<small class="d-block text-muted">${formatarMoeda(entrega.valor)} (${escaparHTML(textoSeguro(entrega.pagamento))})</small></div>
      </div>
      <small class="text-muted d-block"><strong>Vend:</strong> ${escaparHTML(textoSeguro(entrega.vendedor))} | <strong>End:</strong> ${escaparHTML(textoSeguro(entrega.endereco))}<button type="button" class="btn-copiar-entrega" onclick='copiarDadosEntrega(${idJS},this)' title="Copiar cliente, endereço e vendedor" aria-label="Copiar cliente, endereço e vendedor">${ICONE_COPIAR}</button></small>
      ${entrega.observacoes?`<small class="text-danger d-block"><strong>Obs:</strong> ${escaparHTML(entrega.observacoes)}</small>`:""}
      <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top gap-2 flex-wrap">
        <div class="time-tracker">📥 ${escaparHTML(textoSeguro(entrega.hora_entrada))} | 🛵 ${escaparHTML(textoSeguro(entrega.hora_na_rota))} | 🏁 ${escaparHTML(textoSeguro(entrega.hora_conclusao))}</div>
        <div class="d-flex gap-1 flex-wrap">${acao}${voltar}<button onclick='removerEntrega(${idJS})' class="btn btn-sm btn-outline-danger">🗑️</button></div>
      </div>
      ${entrega.status==="Não Entregue"?`<small class="text-danger fw-bold">Motivo: ${escaparHTML(textoSeguro(entrega.motivo_nao_entrega))}</small>`:""}
    </div>`;
  return card;
}

function renderizarListaAdmin() {
  const c = elemento("lista-admin");
  const filtro = valorElemento("filtro-data-admin");
  const lista = window.entregasGlobais.filter(e => !filtro || obterDataEntregaISO(e) === filtro);
  c.innerHTML = "";
  if (!carregouEntregas) return c.innerHTML = `<div class="text-center text-muted py-4">Carregando...</div>`;
  if (!lista.length) return c.innerHTML = `<div class="text-center text-muted py-4">Nenhuma entrega encontrada.</div>`;
  lista.forEach(e => c.appendChild(criarCardEntrega(e,true,true)));
}

function renderizarListaMotoboy(id) {
  const c = elemento("lista-motoboy");
  const filtro = valorElemento("filtro-data-motoboy");
  elemento("titulo-motoboy").textContent = `Entregas do Motoboy - ${nomeMotoboy(id)}`;
  const lista = window.entregasGlobais.filter(e => String(e.motoboy)===String(id) && (!filtro || obterDataEntregaISO(e)===filtro));
  c.innerHTML = "";
  if (!lista.length) return c.innerHTML = `<div class="text-center text-muted py-5">Nenhuma entrega encontrada.</div>`;
  lista.forEach(e => c.appendChild(criarCardEntrega(e,false,false)));
}

/* CONFERÊNCIA */
function renderizarConferencia() {
  const tbody = elemento("tbody-conferencia");
  const filtro = valorElemento("filtro-data-conferencia");
  const lista = window.entregasGlobais.filter(e => {
    const p = normalizarTexto(e.pagamento);
    return (p.includes("dinheiro") || p.includes("cartao")) && e.conferida !== true &&
      normalizarTexto(e.status_conferencia) !== "conferida" && (!filtro || obterDataEntregaISO(e)===filtro);
  }).sort((a,b)=>numeroSeguro(a.id)-numeroSeguro(b.id));

  tbody.innerHTML = "";
  if (!lista.length) return tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">Nenhuma entrega pendente.</td></tr>`;
  indiceConferencia = Math.min(indiceConferencia, lista.length-1);

  lista.forEach((e,i) => {
    const tr = document.createElement("tr");
    tr.dataset.id = e.id;
    if (i===indiceConferencia) tr.classList.add("row-selected");
    tr.onclick = ev => { if (!ev.target.closest("button")) selecionarLinhaConferencia(i); };
    const idJS = JSON.stringify(String(e.id));
    tr.innerHTML = `<td>${formatarDataCompleta(obterDataEntregaISO(e))}</td><td><strong>#${escaparHTML(e.dav)}</strong></td>
      <td>${escaparHTML(e.vendedor)}</td><td>${escaparHTML(e.cliente)}</td><td><small>${escaparHTML(e.endereco)}</small></td>
      <td><strong>${formatarMoeda(e.valor)}</strong></td><td>${escaparHTML(e.pagamento)}</td>
      <td>${escaparHTML(nomeMotoboy(e.motoboy))}</td><td><span class="badge bg-warning text-dark">Em aberto</span></td>
      <td><button class="btn btn-sm btn-success" onclick='executarConferencia(${idJS})'>✅ Conferir</button></td>`;
    tbody.appendChild(tr);
  });
}

function selecionarLinhaConferencia(index) {
  const linhas = [...document.querySelectorAll("#tbody-conferencia tr[data-id]")];
  if (!linhas.length) return;
  indiceConferencia = Math.max(0,Math.min(index,linhas.length-1));
  linhas.forEach((l,i)=>l.classList.toggle("row-selected",i===indiceConferencia));
  linhas[indiceConferencia]?.scrollIntoView({block:"nearest"});
}

function executarConferencia(id) {
  historicoConferidos.push(String(id));
  window.marcarConferida(id,true);
}

/* AVISOS */
window.salvarAviso = async function(event) {
  event.preventDefault();
  const nome = valorElemento("aviso-nome").trim();
  const aviso = valorElemento("aviso-texto").trim();
  if (!nome || !aviso) return;
  await dbRefAvisos.push().set({id:Date.now(),nome,aviso,data:hojeISO()});
  elemento("form-aviso").reset();
  exibirToastConfirmacao("✅ Aviso adicionado!");
};

window.excluirAviso = async function(key) {
  if (confirm("Excluir este aviso?")) await db.ref(`avisos/${key}`).remove();
};

function renderizarAvisos() {
  const c = elemento("lista-avisos");
  c.innerHTML = "";
  if (!carregouAvisos) return c.innerHTML = `<div class="text-center text-muted py-4">Carregando...</div>`;
  if (!window.avisosGlobais.length) return c.innerHTML = `<div class="text-center text-muted py-4">Nenhum aviso cadastrado.</div>`;
  window.avisosGlobais.forEach(a => {
    const card = document.createElement("div");
    card.className = "card shadow-sm border-0";
    card.innerHTML = `<div class="card-body py-2 px-3 d-flex justify-content-between gap-2">
      <div><div class="fw-bold text-custom-primary">🔔 ${escaparHTML(a.nome)}</div><div>${escaparHTML(a.aviso)}</div>
      <small class="text-muted">${formatarDataCompleta(a.data)}</small></div>
      <button class="btn btn-sm btn-outline-danger">🗑️</button></div>`;
    card.querySelector("button").onclick = () => excluirAviso(a.firebaseKey);
    c.appendChild(card);
  });
}

function paraDataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Início (sexta-feira) do ciclo semanal sexta->quinta que contém a data informada.
// Filtragem por intervalo de datas reais (sem "número de semana"), evitando qualquer
// dependência do cálculo de semana ISO nativo do navegador (que é sempre segunda->domingo
// e não pode ser alterado via <input type="week">).
function inicioCicloSextaISO(dataRef) {
  const s = String(dataRef || hojeISO()).substring(0, 10);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";

  // getDay(): 0=domingo...6=sábado. Distância até a sexta-feira anterior (ou o próprio dia, se já for sexta).
  const diasDesdeSexta = (d.getDay() - 5 + 7) % 7;
  d.setDate(d.getDate() - diasDesdeSexta);
  return paraDataISO(d);
}

// Fim (quinta-feira) do ciclo semanal sexta->quinta que contém a data informada.
function fimCicloSextaISO(dataRef) {
  const inicio = inicioCicloSextaISO(dataRef);
  if (!inicio) return "";
  const d = new Date(`${inicio}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return paraDataISO(d);
}

window.salvarOcorrencia = async function(event) {
  event.preventDefault();

  const vendedor = valorElemento("ocorrencia-vendedor").trim();
  const dav = valorElemento("ocorrencia-dav").trim();
  const cliente = valorElemento("ocorrencia-cliente").trim();
  const motoboy = valorElemento("ocorrencia-motoboy").trim();
  const motoboyNome = nomeMotoboy(motoboy);
  const endereco = valorElemento("ocorrencia-endereco").trim();
  const motivo = valorElemento("ocorrencia-motivo").trim();

  if (!vendedor || !dav || !cliente || !motoboy || !endereco || !motivo) {
    return alert("Preencha todos os campos da ocorrência.");
  }

  const ref = dbRefOcorrencias.push();

  try {
    await ref.set({
      id: Date.now(),
      vendedor,
      dav,
      cliente,
      motoboy,
      motoboyNome,
      endereco,
      motivo,
      data: hojeISO(),
      criado_em: new Date().toISOString()
    });

    elemento("form-ocorrencia").reset();
    elemento("ocorrencia-motoboy").value = "";

    exibirToastConfirmacao(`✅ Ocorrência da DAV #${dav} registrada!`);
    renderizarOcorrencias();
  } catch (erro) {
    alert(`Erro ao registrar ocorrência: ${erro.message}`);
  }
};

window.excluirOcorrencia = async function(key) {
  if (!key || !confirm("Deseja excluir esta ocorrência?")) return;

  try {
    await db.ref(`ocorrencias/${key}`).remove();
    exibirToastConfirmacao("✅ Ocorrência excluída!");
  } catch (erro) {
    alert(`Erro ao excluir ocorrência: ${erro.message}`);
  }
};

window.limparFiltroOcorrencias = function() {
  if (elemento("filtro-ocorrencias-inicio")) elemento("filtro-ocorrencias-inicio").value = "";
  if (elemento("filtro-ocorrencias-fim")) elemento("filtro-ocorrencias-fim").value = "";
  renderizarOcorrencias();
};

function renderizarOcorrencias() {
  const c = elemento("lista-ocorrencias");
  if (!c) return;

  // Filtro por intervalo de datas reais. Campo vazio = sem limite naquele lado.
  // Ambos vazios = mostra todas as ocorrências (comportamento explícito de "limpar filtro").
  const inicio = valorElemento("filtro-ocorrencias-inicio");
  const fim = valorElemento("filtro-ocorrencias-fim");

  const lista = (window.ocorrenciasGlobais || []).filter(o => {
    const data = String(o.data || "").substring(0, 10);
    if (inicio && data < inicio) return false;
    if (fim && data > fim) return false;
    return true;
  });

  if (elemento("resumo-semana-ocorrencias")) {
    let texto = "Todas as ocorrências";
    if (inicio && fim) texto = `${formatarDataCompleta(inicio)} a ${formatarDataCompleta(fim)}`;
    else if (inicio) texto = `A partir de ${formatarDataCompleta(inicio)}`;
    else if (fim) texto = `Até ${formatarDataCompleta(fim)}`;
    elemento("resumo-semana-ocorrencias").textContent = texto;
  }

  c.innerHTML = "";

  if (!carregouOcorrencias) {
    return c.innerHTML = `<div class="text-center text-muted py-4">Carregando...</div>`;
  }

  if (!lista.length) {
    return c.innerHTML = `<div class="text-center text-muted py-5">Nenhuma ocorrência encontrada${(inicio || fim) ? " neste período." : "."}</div>`;
  }

  lista.forEach(o => {
    const card = document.createElement("div");
    card.className = "card shadow-sm border-0";

    card.innerHTML = `
      <div class="card-body py-3 px-3">
        <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <div class="fw-bold text-custom-primary">⚠️ DAV #${escaparHTML(textoSeguro(o.dav))} - ${escaparHTML(textoSeguro(o.cliente))}</div>
            <div class="small text-muted mt-1"><strong>Vendedor:</strong> ${escaparHTML(textoSeguro(o.vendedor))} | <strong>Motoboy:</strong> ${escaparHTML(textoSeguro(o.motoboyNome || o.motoboy))}</div>
          </div>
          <div class="text-end">
            <span class="badge badge-custom-primary">${escaparHTML(formatarDataCompleta(o.data))}</span>
          </div>
        </div>

        <div class="small mt-2">
          <strong>Endereço:</strong> ${escaparHTML(textoSeguro(o.endereco))}
        </div>

        <div class="mt-2 p-2 rounded border border-danger-subtle bg-danger-subtle">
          <strong class="text-danger">Motivo:</strong> ${escaparHTML(textoSeguro(o.motivo))}
        </div>

        <div class="mt-3 d-flex justify-content-end">
          <button type="button" class="btn btn-sm btn-outline-danger">🗑️ Excluir ocorrência</button>
        </div>
      </div>`;

    card.querySelector("button").onclick = () => excluirOcorrencia(o.firebaseKey);

    c.appendChild(card);
  });
}

/* DAV'S ABERTAS */
const SITUACOES_DAV = {
  vendedor: "Informado ao vendedor",
  cliente:  "Mensagem enviada ao cliente",
  armario:     "Armário",
  entrega:  "Entrega"
};

/* "" = todas | "sem" = só as que não têm situação | resto = chave de SITUACOES_DAV */
function preencherFiltroSituacaoDav() {
  const select = elemento("filtro-situacao-dav");
  if (!select) return;
  const atual = select.value;
  select.innerHTML = `
    <option value="">Todas</option>
    <option value="sem">Sem situação</option>
    ${Object.entries(SITUACOES_DAV).map(([valor, rotulo]) =>
      `<option value="${valor}">${rotulo}</option>`
    ).join("")}`;
  select.value = atual || "";
}

function situacaoValidaDav(dav) {
  return SITUACOES_DAV[dav?.situacao] ? dav.situacao : "";
}

/* Popula o filtro de vendedor com os nomes cadastrados + quaisquer nomes já usados nas DAVs */
function preencherFiltroVendedorDav() {
  const select = elemento("filtro-vendedor-dav");
  if (!select) return;
  const atual = select.value;
  const doDados = (window.davsAbertasGlobais || []).map(d => textoSeguro(d.vendedor)).filter(Boolean);
  const vendedores = [...new Set([...getVendedores(), ...doDados])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  select.innerHTML = `
    <option value="">Todos</option>
    ${vendedores.map(v => `<option value="${escaparHTML(v)}">${escaparHTML(v)}</option>`).join("")}`;
  select.value = vendedores.includes(atual) ? atual : "";
}

function davsAbertasFiltradas() {
  let lista = window.davsAbertasGlobais || [];
  const filtroSituacao = valorElemento("filtro-situacao-dav");
  const filtroVendedor = valorElemento("filtro-vendedor-dav");

  if (filtroSituacao === "sem") lista = lista.filter(d => situacaoValidaDav(d) === "");
  else if (filtroSituacao) lista = lista.filter(d => situacaoValidaDav(d) === filtroSituacao);

  if (filtroVendedor) lista = lista.filter(d => textoSeguro(d.vendedor) === filtroVendedor);

  return lista;
}

window.salvarDavAberta = async function(event) {
  event.preventDefault();

  const comanda = valorElemento("dav-aberta-comanda").trim();
  const cliente = valorElemento("dav-aberta-cliente").trim();
  const vendedor = valorElemento("dav-aberta-vendedor").trim();
  const data = valorElemento("dav-aberta-data");
  const valorInformado = valorElemento("dav-aberta-valor").trim();
  const valor = numeroSeguro(valorInformado);

  if (!comanda || !cliente || !vendedor || !data || !valorInformado || valor < 0) {
    return alert("Preencha todos os campos da DAV aberta.");
  }

  try {
    await dbRefDavsAbertas.push().set({
      id: Date.now(), comanda, cliente, vendedor, data, valor,
      situacao: "", criado_em: new Date().toISOString()
    });
    elemento("form-dav-aberta").reset();
    elemento("dav-aberta-data").value = hojeISO();
    elemento("dav-aberta-comanda").focus();
    exibirToastConfirmacao("✅ DAV aberta adicionada!");
  } catch (erro) {
    alert(`Erro ao adicionar DAV aberta: ${erro.message}`);
  }
};

window.alterarSituacaoDavAberta = async function(key, situacao) {
  if (!key) return;
  try {
    await db.ref(`davs_abertas/${key}`).update({ situacao });
  } catch (erro) {
    alert(`Erro ao atualizar situação: ${erro.message}`);
  }
};

window.excluirDavAberta = async function(key) {
  if (!key) return;
  try {
    await db.ref(`davs_abertas/${key}`).remove();
    exibirToastConfirmacao("✅ DAV aberta excluída!");
  } catch (erro) {
    alert(`Erro ao excluir DAV aberta: ${erro.message}`);
  }
};

function renderizarDavsAbertas() {
  const c = elemento("lista-davs-abertas");
  if (!c) return;

  preencherFiltroVendedorDav();

  const total = (window.davsAbertasGlobais || []).length;
  const lista = davsAbertasFiltradas();
  const filtrando = !!valorElemento("filtro-situacao-dav") || !!valorElemento("filtro-vendedor-dav");
  const plural = n => `${n} DAV${n === 1 ? "" : "s"} aberta${n === 1 ? "" : "s"}`;

  const resumo = elemento("resumo-davs-abertas");
  if (resumo) resumo.textContent = filtrando ? `${lista.length} de ${plural(total)}` : plural(total);
  c.innerHTML = "";

  if (!carregouDavsAbertas) {
    c.innerHTML = `<div class="col-12 text-center text-muted py-4">Carregando...</div>`;
    return;
  }
  if (!total) {
    c.innerHTML = `<div class="col-12 text-center text-muted py-5">Nenhuma DAV aberta cadastrada.</div>`;
    return;
  }
  if (!lista.length) {
    c.innerHTML = `<div class="col-12 text-center text-muted py-5">Nenhuma DAV aberta com esse filtro.</div>`;
    return;
  }

  lista.forEach(dav => {
    const situacao = situacaoValidaDav(dav);
    const card = document.createElement("div");
    card.className = "col-md-6";
    card.innerHTML = `
      <article class="dav-aberta-card ${situacao ? `dav-status-${situacao}` : ""}">
        <div class="dav-aberta-topo">
          <div>
            <div class="dav-aberta-label">COMANDA</div>
            <div class="dav-aberta-comanda">#${escaparHTML(textoSeguro(dav.comanda))}</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="dav-aberta-data">${escaparHTML(formatarDataCompleta(dav.data))}</span>
            <button type="button" class="btn btn-sm dav-aberta-excluir" aria-label="Excluir DAV aberta" title="Excluir DAV aberta">×</button>
          </div>
        </div>
        <div class="dav-aberta-cliente">${escaparHTML(textoSeguro(dav.cliente))}</div>
        <div class="dav-aberta-vendedor">👤 ${escaparHTML(textoSeguro(dav.vendedor))}</div>
        <div class="dav-aberta-rodape">
          <strong>${formatarMoeda(dav.valor)}</strong>
          <select class="form-select form-select-sm dav-aberta-situacao" aria-label="Situação da DAV">
            <option value="" ${situacao === "" ? "selected" : ""}>Sem situação</option>
            ${Object.entries(SITUACOES_DAV).map(([valor, rotulo]) =>
              `<option value="${valor}" ${situacao === valor ? "selected" : ""}>${rotulo}</option>`
            ).join("")}
          </select>
        </div>
      </article>`;

    card.querySelector("select").onchange = event => alterarSituacaoDavAberta(dav.firebaseKey, event.target.value);
    card.querySelector(".dav-aberta-excluir").onclick = () => excluirDavAberta(dav.firebaseKey);
    c.appendChild(card);
  });
}

function checarAvisosCliente(input) {
  const cliente = normalizarTexto(input?.value);
  if (!cliente) { avisosExibidos.clear(); filaAvisos=[]; return; }
  window.avisosGlobais.forEach(a => {
    const chave = normalizarTexto(a.nome);
    const id = a.firebaseKey || a.id;
    if (chave && cliente.split(/\s+/).includes(chave) && !avisosExibidos.has(id)) {
      avisosExibidos.add(id); filaAvisos.push(a);
    }
  });
  exibirProximoAviso();
}

function exibirProximoAviso() {
  const modal = elemento("modalAvisoAlerta");
  if (!modal || modal.classList.contains("show") || !filaAvisos.length) return;
  const a = filaAvisos.shift();
  elemento("avisoAlertaNome").textContent = a.nome;
  elemento("avisoAlertaTexto").textContent = a.aviso;
  modalAvisoInstance = bootstrap.Modal.getOrCreateInstance(modal);
  modalAvisoInstance.show();
}

/* VENDEDORES */
function getVendedores() {
  try { return JSON.parse(localStorage.getItem("grs_vendedores")) || ["Carlos","Ana","Roberto","Lorraine"]; }
  catch { return ["Carlos","Ana","Roberto","Lorraine"]; }
}

function salvarVendedores(lista) {
  localStorage.setItem("grs_vendedores",JSON.stringify(lista));
  atualizarVendedoresUI();
}

function adicionarVendedor() {
  const input = elemento("novo-vendedor-input");
  const nome = input.value.trim();
  if (!nome) return;
  const lista = getVendedores();
  if (!lista.some(v=>normalizarTexto(v)===normalizarTexto(nome))) lista.push(nome);
  salvarVendedores(lista); input.value="";
}

function removerVendedor(nome) { salvarVendedores(getVendedores().filter(v=>v!==nome)); }

function atualizarVendedoresUI() {
  const ul = elemento("lista-vendedores-config");
  if (!ul) return;
  ul.innerHTML = "";
  getVendedores().forEach(nome => {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex justify-content-between align-items-center";
    li.innerHTML = `<span>${escaparHTML(nome)}</span><button class="btn btn-sm btn-outline-danger">🗑️</button>`;
    li.querySelector("button").onclick = () => removerVendedor(nome);
    ul.appendChild(li);
  });
}

function filtrarVendedores(termo) {
  const c = elemento("vendedor-autocomplete-list");
  c.innerHTML=""; vendedorFocusIndex=-1;
  if (!termo.trim()) return c.classList.add("d-none");
  const lista = getVendedores().filter(v=>normalizarTexto(v).startsWith(normalizarTexto(termo)));
  if (!lista.length) return c.classList.add("d-none");
  lista.forEach((nome,i)=>{
    const div=document.createElement("div");
    div.className=`autocomplete-item ${i===0?"active":""}`;
    div.textContent=nome; div.onclick=()=>selecionarVendedor(nome); c.appendChild(div);
  });
  vendedorFocusIndex=0; c.classList.remove("d-none");
}

function selecionarVendedor(nome) {
  elemento("vendedor").value=nome;
  fecharAutocompleteVendedor();
}

function fecharAutocompleteVendedor() {
  const c=elemento("vendedor-autocomplete-list");
  if(c){c.innerHTML="";c.classList.add("d-none");vendedorFocusIndex=-1;}
}

function navegarSugestoesVendedor(event) {
  const itens=[...document.querySelectorAll("#vendedor-autocomplete-list .autocomplete-item")];
  if(!itens.length)return;
  if(event.key==="ArrowDown"){event.preventDefault();vendedorFocusIndex=(vendedorFocusIndex+1)%itens.length;}
  else if(event.key==="ArrowUp"){event.preventDefault();vendedorFocusIndex=(vendedorFocusIndex-1+itens.length)%itens.length;}
  else if(event.key==="Enter"||event.key==="Tab"){event.preventDefault();selecionarVendedor(itens[vendedorFocusIndex]?.textContent);return;}
  else return;
  itens.forEach((x,i)=>x.classList.toggle("active",i===vendedorFocusIndex));
}

function capitalizarInput(input) {
  if(!input)return;
  const cursor=input.selectionStart;
  input.value=input.value.toLowerCase().split(" ").map((p,i)=>
    i>0&&["de","da","do","das","dos","e"].includes(p)?p:p.charAt(0).toUpperCase()+p.slice(1)).join(" ");
  if(cursor!==null)input.setSelectionRange(cursor,cursor);
}

/* GEOCODIFICAÇÃO E ATRIBUIÇÃO AUTOMÁTICA */
const MAPA_MOTOBOYS_IDS = {
  WELLINGTON:"1",
  ROGERIO:"2",
  GIOVANE:"3",
  DJAVAN:"4"
};

const ZONAS = {
  DJAVAN:[
    [-46.9817997,-22.473275],[-46.966686,-22.4662565],[-46.9610141,-22.4670103],[-46.9565372,-22.4626482],
    [-46.9369425,-22.4547151],[-46.9311429,-22.4480495],[-46.9270126,-22.441778],[-46.9172936,-22.4433534],
    [-46.9151094,-22.4369055],[-46.9414593,-22.4156823],[-46.9317421,-22.4089965],[-46.9319817,-22.4027965],
    [-46.9419198,-22.4002332],[-46.9409088,-22.394763],[-46.946451,-22.3938495],[-46.9454074,-22.3912811],
    [-46.9490169,-22.389865],[-46.9507166,-22.3895798],[-46.9509602,-22.3880156],[-46.9509142,-22.388134],
    [-46.9517556,-22.3872833],[-46.9605581,-22.3942221],[-46.9734807,-22.3905261],[-46.9938642,-22.3952463],
    [-46.9899673,-22.4002729],[-46.9891602,-22.4048233],[-46.9834258,-22.4042429],[-46.9786517,-22.4068908],
    [-46.9886726,-22.434405],[-46.9817997,-22.473275]
  ],
  ROGERIO:[
    [-46.9453842,-22.3912596],[-46.946451,-22.3938495],[-46.9409088,-22.394763],[-46.9419198,-22.4002332],
    [-46.93203,-22.4028362],[-46.9207504,-22.406163],[-46.9151713,-22.4010447],[-46.910279,-22.396997],
    [-46.9033265,-22.3879102],[-46.901964,-22.3817497],[-46.9017389,-22.3760455],[-46.9039062,-22.3745278],
    [-46.9061163,-22.3771372],[-46.9118986,-22.3761832],[-46.9162282,-22.37492],[-46.9252669,-22.3677801],
    [-46.930056,-22.372786],[-46.9355031,-22.3715172],[-46.9361436,-22.3732644],[-46.9421026,-22.3739806],
    [-46.9429481,-22.3760746],[-46.9425491,-22.3786845],[-46.9423995,-22.3801974],[-46.9425932,-22.3814821],
    [-46.9430503,-22.3842796],[-46.9453842,-22.3912596]
  ],
  GIOVANE:[
    [-46.9899867,-22.2699847],[-46.9847433,-22.3067965],[-46.9670621,-22.320454],[-46.9602814,-22.3484796],
    [-46.9679173,-22.356993],[-46.9551523,-22.3630972],[-46.9521505,-22.3603474],[-46.9482189,-22.3576281],
    [-46.9442707,-22.3598507],[-46.9381766,-22.3596125],[-46.9359021,-22.3579059],[-46.9288345,-22.3599847],
    [-46.9225364,-22.3627201],[-46.9099621,-22.3583346],[-46.9070738,-22.3197382],[-46.88903367,-22.3275986],
    [-46.8860451,-22.3148946],[-46.9219654,-22.3124728],[-46.9384879,-22.3192221],[-46.9464703,-22.2879345],
    [-46.9302482,-22.2749092],[-46.9377154,-22.2581493],[-46.9899867,-22.2699847]
  ],
  WELLINGTON:[
    [-46.9375683,-22.3585464],[-46.9439487,-22.3587739],[-46.9478969,-22.3565513],[-46.951748,-22.3592755],
    [-46.9548731,-22.3620601],[-46.9555597,-22.361703],[-46.9615144,-22.3588752],[-46.9677478,-22.3558587],
    [-46.9722968,-22.37095],[-46.9777687,-22.3914859],[-46.9734865,-22.3905534],[-46.9605639,-22.3942494],
    [-46.9517614,-22.3873106],[-46.9509196,-22.388134],[-46.9509656,-22.3890156],[-46.950722,-22.3895798],
    [-46.9490223,-22.389865],[-46.9453859,-22.391276],[-46.9430503,-22.3842746],[-46.9425878,-22.3814771],
    [-46.9423941,-22.3801924],[-46.942511,-22.3789717],[-46.9426826,-22.3775306],[-46.9429856,-22.3761093],
    [-46.9420972,-22.3739756],[-46.9361382,-22.3732594],[-46.9355406,-22.3715519],[-46.9300935,-22.3728207],
    [-46.9253044,-22.3677801],[-46.9162282,-22.37492],[-46.9118986,-22.3761832],[-46.9068293,-22.36964],
    [-46.9061186,-22.367435],[-46.9079077,-22.3656764],[-46.9096833,-22.3572975],[-46.922575,-22.361683],
    [-46.9268444,-22.3551437],[-46.9304873,-22.3560062],[-46.9358802,-22.3568291],[-46.9375683,-22.3585464]
  ]
};

function pontoDentroDoPoligono(ponto,poligono) {
  const x=ponto[0],y=ponto[1];
  let dentro=false;
  for(let i=0,j=poligono.length-1;i<poligono.length;j=i++){
    const xi=poligono[i][0],yi=poligono[i][1],xj=poligono[j][0],yj=poligono[j][1];
    const cruza=yi>y!==yj>y && x<((xj-xi)*(y-yi))/(yj-yi)+xi;
    if(cruza)dentro=!dentro;
  }
  return dentro;
}

async function identificarMotoboyAutomatico() {
  const endereco=valorElemento("endereco").trim();
  const status=elemento("status-geocoding");
  if(!endereco||!status)return;

  status.textContent="🔍 Identificando rota automaticamente...";
  status.className="form-text text-muted";

  const limpo=endereco
    .replace(/^r\.?\s+/i,"Rua ")
    .replace(/^av\.?\s+/i,"Avenida ")
    .replace(/^al\.\s+/i,"Alameda ")
    .replace(/^pç\.\s+/i,"Praça ");

  const consultas=[
    `${limpo}, Mogi Guaçu, SP, Brasil`,
    `${limpo}, Mogi Mirim, SP, Brasil`,
    `${endereco}, Mogi Guaçu, SP, Brasil`,
    `${endereco}, SP, Brasil`
  ];

  try {
    let resultado=null;
    for(const consulta of consultas){
      const resp=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(consulta)}&limit=1`);
      if(!resp.ok)continue;
      const dados=await resp.json();
      if(Array.isArray(dados)&&dados.length){resultado=dados[0];break;}
    }

    if(!resultado){
      status.textContent="❌ Endereço não localizado no mapa.";
      status.className="form-text text-danger";
      return;
    }

    const ponto=[Number(resultado.lon),Number(resultado.lat)];
    let zona=null;
    for(const [nome,poligono] of Object.entries(ZONAS)){
      if(pontoDentroDoPoligono(ponto,poligono)){zona=nome;break;}
    }

    if(zona&&MAPA_MOTOBOYS_IDS[zona]){
      elemento("motoboy").value=MAPA_MOTOBOYS_IDS[zona];
      status.textContent=`📍 Endereço localizado! Atribuído para ${nomeMotoboy(MAPA_MOTOBOYS_IDS[zona])}.`;
      status.className="form-text text-success fw-bold";
    }else{
      status.textContent="⚠️ Endereço localizado, mas fora das zonas.";
      status.className="form-text text-warning";
    }
  }catch(erro){
    console.error(erro);
    status.textContent="⚠️ Não foi possível determinar a rota.";
    status.className="form-text text-muted";
  }
}

/* MOTOS */
const MOTO_STORAGE_KEY="grs_motos";

function normalizarPlaca(placa) {
  return String(placa||"").toUpperCase().replace(/[^A-Z0-9]/g,"").trim();
}

function criarMotosPadrao() {
  return [
    {id:"moto1",motoboyId:"1",placa:"ABC1D23"},
    {id:"moto2",motoboyId:"2",placa:"ABC2D34"},
    {id:"moto3",motoboyId:"3",placa:"ABC3D45"},
    {id:"moto4",motoboyId:"4",placa:"ABC4D56"},
    {id:"moto5",motoboyId:"reserva",placa:"ABC5D67"}
  ];
}

function normalizarMotos(dados) {
  const padrao=criarMotosPadrao();
  return padrao.map((p,i)=>{
    const m=Array.isArray(dados)?dados[i]:(dados?.[`moto${i+1}`]||dados?.[i]||dados?.[String(i)])||p;
    let motoboyId=String(m.motoboyId||"");
    if(!motoboyId) {
      const achado=Object.entries(nomesMotoboys).find(([,d])=>normalizarTexto(d.nome)===normalizarTexto(m.nome));
      motoboyId=achado?.[0]||(i<4?String(i+1):"reserva");
    }
    return {id:`moto${i+1}`,motoboyId,placa:normalizarPlaca(m.placa||p.placa)};
  });
}

function motosParaObjeto() {
  return Object.fromEntries(motos.map(m=>[m.id,{id:m.id,motoboyId:m.motoboyId,placa:normalizarPlaca(m.placa)}]));
}

function carregarMotosLocalmente() {
  try { motos=normalizarMotos(JSON.parse(localStorage.getItem(MOTO_STORAGE_KEY)||"null")); }
  catch { motos=criarMotosPadrao(); }
}

function salvarMotosLocalmente(){localStorage.setItem(MOTO_STORAGE_KEY,JSON.stringify(motos));}
async function salvarMotos(){salvarMotosLocalmente();await dbRefMotos.set(motosParaObjeto());}

function nomeVinculo(m){return m.motoboyId==="reserva"?"Moto reserva":nomeMotoboy(m.motoboyId);}

function ordenarLancamentos(lista) {
  return [...lista].sort((a,b)=>String(b.data||"").localeCompare(String(a.data||""))||
    String(b.criado_em||"").localeCompare(String(a.criado_em||"")));
}

function aplicarFiltroMes(lista,mes){return mes?lista.filter(x=>String(x.data||"").substring(0,7)===mes):lista;}

function obterAbastecimentos(motoboyId,mes="") {
  return ordenarLancamentos(aplicarFiltroMes(window.motoLancamentosGlobais.filter(x=>
    x.tipo==="combustivel"&&String(x.motoboyId)===String(motoboyId)),mes));
}

function obterManutencoes(placa,mes="") {
  const p=normalizarPlaca(placa);
  return ordenarLancamentos(aplicarFiltroMes(window.motoLancamentosGlobais.filter(x=>
    x.tipo==="manutencao"&&normalizarPlaca(x.placa)===p),mes));
}

function somar(lista){return lista.reduce((t,x)=>t+numeroSeguro(x.valor),0);}

function calcularMedia(lista) {
  const validos=[...lista].filter(x=>numeroSeguro(x.km)>0&&numeroSeguro(x.litros)>0)
    .sort((a,b)=>numeroSeguro(a.km)-numeroSeguro(b.km));
  let km=0,litros=0,ultima=0;
  for(let i=1;i<validos.length;i++){
    const distancia=numeroSeguro(validos[i].km)-numeroSeguro(validos[i-1].km);
    const l=numeroSeguro(validos[i].litros);
    if(distancia>0&&l>0){km+=distancia;litros+=l;ultima=distancia/l;}
  }
  return {geral:litros?km/litros:0,ultima};
}

function obterKmAtual(m) {
  const valores=[...obterAbastecimentos(m.motoboyId),...obterManutencoes(m.placa)]
    .map(x=>numeroSeguro(x.km)).filter(Boolean);
  return valores.length?Math.max(...valores):0;
}

function renderizarMotos() {
  const c=elemento("lista-motos");
  c.innerHTML="";
  if(!carregouMotos||!carregouLancamentos)return c.innerHTML=`<div class="col-12 text-center text-muted py-5">Carregando motos...</div>`;
  const mes=valorElemento("filtro-mes-motos");

  motos.forEach((m,index)=>{
    const nome=nomeVinculo(m);
    const combustiveis=m.motoboyId==="reserva"?[]:obterAbastecimentos(m.motoboyId,mes);
    const manutencoes=obterManutencoes(m.placa,mes);
    const media=calcularMedia(combustiveis);
    const km=obterKmAtual(m);
    const col=document.createElement("div");
    col.className="col-12 col-lg-6";
    col.innerHTML=`<div class="moto-card p-3 h-100">
      <div class="moto-card-header mb-3"><div><h5 class="m-0 fw-bold text-custom-primary">${escaparHTML(nome)}</h5>
      <div class="text-muted small">Placa: <strong>${escaparHTML(m.placa)}</strong></div></div>
      <span class="badge bg-secondary moto-badge">${km?km.toLocaleString("pt-BR")+" km":"Sem KM"}</span></div>
      <div class="row g-2 mb-3">
        <div class="col-6"><div class="moto-metric"><div class="moto-metric-label">Combustível ${mes?"no mês":"total"}</div>
        <div class="moto-metric-value text-success">${formatarMoeda(somar(combustiveis))}</div><small class="text-muted">Motoboy: ${escaparHTML(nome)}</small></div></div>
        <div class="col-6"><div class="moto-metric"><div class="moto-metric-label">Manutenção ${mes?"no mês":"total"}</div>
        <div class="moto-metric-value text-danger">${formatarMoeda(somar(manutencoes))}</div><small class="text-muted">Placa: ${escaparHTML(m.placa)}</small></div></div>
        <div class="col-6"><div class="moto-metric"><div class="moto-metric-label">Média geral</div><div class="moto-metric-value">${media.geral?media.geral.toFixed(2)+" km/L":"-"}</div></div></div>
        <div class="col-6"><div class="moto-metric"><div class="moto-metric-label">Última média</div><div class="moto-metric-value">${media.ultima?media.ultima.toFixed(2)+" km/L":"-"}</div></div></div>
      </div>
      <div class="small text-muted mb-3">Último abastecimento: ${combustiveis[0]?formatarDataCompleta(combustiveis[0].data)+" - "+formatarMoeda(combustiveis[0].valor):"Nenhum"}
      <br>Última manutenção: ${manutencoes[0]?formatarDataCompleta(manutencoes[0].data)+" - "+escaparHTML(manutencoes[0].descricao):"Nenhuma"}</div>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-sm btn-custom-primary editar">✏️ Editar</button>
        <button class="btn btn-sm btn-success abastecer">⛽ Abastecer</button>
        <button class="btn btn-sm btn-warning manutencao">🔧 Manutenção</button>
        <button class="btn btn-sm btn-outline-success hist-comb">Histórico combustível</button>
        <button class="btn btn-sm btn-outline-warning hist-man">Histórico manutenção</button>
      </div></div>`;
    col.querySelector(".editar").onclick=()=>editarMoto(index);
    col.querySelector(".abastecer").onclick=()=>abrirModalAbastecimento(index);
    col.querySelector(".manutencao").onclick=()=>abrirModalManutencao(index);
    col.querySelector(".hist-comb").onclick=()=>abrirHistoricoCombustivel(index);
    col.querySelector(".hist-man").onclick=()=>abrirHistoricoManutencao(index);
    c.appendChild(col);
  });
}

function editarMoto(index) {
  const m=motos[index]; if(!m)return;
  elemento("moto-editar-index").value=index;
  elemento("moto-editar-motoboy").innerHTML=opcoesMotoboysHTML(true,m.motoboyId);
  elemento("moto-editar-motoboy").value=m.motoboyId;
  elemento("moto-editar-placa").value=m.placa;
  bootstrap.Modal.getOrCreateInstance(elemento("modalEditarMoto")).show();
}

async function salvarEdicaoMoto() {
  const index=numeroSeguro(valorElemento("moto-editar-index"),-1);
  const m=motos[index]; if(!m)return;
  const motoboyId=valorElemento("moto-editar-motoboy");
  const placa=normalizarPlaca(valorElemento("moto-editar-placa"));
  if(!placa)return alert("Informe a placa.");
  if(motoboyId!=="reserva"&&motos.some((x,i)=>i!==index&&x.motoboyId===motoboyId))return alert("Este motoboy já está em outro card.");
  m.motoboyId=motoboyId;m.placa=placa;
  await salvarMotos();
  bootstrap.Modal.getOrCreateInstance(elemento("modalEditarMoto")).hide();
  exibirToastConfirmacao("✅ Moto atualizada!");
}

function abrirModalAbastecimento(index=-1) {
  const m=motos[index];
  elemento("abastecimento-card-index").value=index;
  elemento("abastecimento-data").value=hojeISO();
  elemento("abastecimento-valor").value="";
  elemento("abastecimento-litros").value="";
  elemento("abastecimento-observacao").value="";
  elemento("abastecimento-motoboy").innerHTML=opcoesMotoboysHTML(false,m&&m.motoboyId!=="reserva"?m.motoboyId:"");
  elemento("abastecimento-motoboy").value=m&&m.motoboyId!=="reserva"?m.motoboyId:"";
  const ult=m&&m.motoboyId!=="reserva"?obterAbastecimentos(m.motoboyId)[0]:null;
  elemento("abastecimento-km").value=ult?.km||"";
  bootstrap.Modal.getOrCreateInstance(elemento("modalAbastecimento")).show();
}

async function salvarAbastecimento() {
  const motoboyId=valorElemento("abastecimento-motoboy");
  const valor=numeroSeguro(valorElemento("abastecimento-valor"));
  const litros=numeroSeguro(valorElemento("abastecimento-litros"));
  const km=numeroSeguro(valorElemento("abastecimento-km"));
  if(!nomesMotoboys[motoboyId])return alert("Selecione o motoboy.");
  if(valor<=0||litros<=0||km<=0)return alert("Preencha valor, litros e KM corretamente.");
  const ref=dbRefMotoLancamentos.push();
  await ref.set({
    id:ref.key,tipo:"combustivel",motoboyId,motoboyNome:nomeMotoboy(motoboyId),
    data:valorElemento("abastecimento-data")||hojeISO(),valor,litros,km,
    observacao:valorElemento("abastecimento-observacao").trim(),origem:"manual",criado_em:new Date().toISOString()
  });
  bootstrap.Modal.getOrCreateInstance(elemento("modalAbastecimento")).hide();
  exibirToastConfirmacao("✅ Abastecimento salvo!");
}

function abrirModalManutencao(index=-1) {
  const m=motos[index];
  elemento("manutencao-card-index").value=index;
  elemento("manutencao-placa").value=m?.placa||"";
  elemento("manutencao-data").value=hojeISO();
  elemento("manutencao-valor").value="";
  elemento("manutencao-descricao").value="";
  elemento("manutencao-observacao").value="";
  elemento("manutencao-km").value=m?obterKmAtual(m)||"":"";
  bootstrap.Modal.getOrCreateInstance(elemento("modalManutencao")).show();
}

async function salvarManutencao() {
  const placa=normalizarPlaca(valorElemento("manutencao-placa"));
  const valor=numeroSeguro(valorElemento("manutencao-valor"));
  const descricao=valorElemento("manutencao-descricao").trim();
  if(!placa||valor<=0||!descricao)return alert("Preencha placa, valor e descrição.");
  const ref=dbRefMotoLancamentos.push();
  await ref.set({
    id:ref.key,tipo:"manutencao",placa,data:valorElemento("manutencao-data")||hojeISO(),valor,descricao,
    km:numeroSeguro(valorElemento("manutencao-km")),observacao:valorElemento("manutencao-observacao").trim(),
    origem:"manual",criado_em:new Date().toISOString()
  });
  bootstrap.Modal.getOrCreateInstance(elemento("modalManutencao")).hide();
  exibirToastConfirmacao("✅ Manutenção salva!");
}

function cardHistorico(item,tipo,rotulo) {
  const card=document.createElement("div");
  card.className="card shadow-sm border-0";
  card.innerHTML=`<div class="card-body py-2 px-3 d-flex justify-content-between gap-3">
    <div><div class="fw-bold ${tipo==="combustivel"?"text-success":"text-warning"}">${tipo==="combustivel"?"⛽":"🔧"} ${formatarDataCompleta(item.data)}</div>
    <div><strong>${escaparHTML(rotulo)}</strong> | ${formatarMoeda(item.valor)}</div>
    <small class="text-muted">${tipo==="combustivel"?`Litros: ${numeroSeguro(item.litros).toLocaleString("pt-BR")} | KM: ${numeroSeguro(item.km).toLocaleString("pt-BR")}`:
      `KM: ${numeroSeguro(item.km).toLocaleString("pt-BR")}`}</small>
    ${item.observacao?`<div class="small text-muted">${escaparHTML(item.observacao)}</div>`:""}</div>
    <button class="btn btn-sm btn-outline-danger">🗑️ Excluir</button></div>`;
  card.querySelector("button").onclick=()=>excluirLancamentoMoto(item.firebaseKey||item.id);
  return card;
}

function abrirHistoricoCombustivel(index) {
  const m=motos[index],c=elemento("lista-historico-combustivel"),nome=nomeVinculo(m);
  elemento("titulo-historico-combustivel").textContent=`Histórico de abastecimentos - ${nome}`;
  c.innerHTML="";
  const lista=m.motoboyId==="reserva"?[]:obterAbastecimentos(m.motoboyId,valorElemento("filtro-mes-motos"));
  if(!lista.length)c.innerHTML=`<div class="text-center text-muted py-4">Nenhum abastecimento encontrado.</div>`;
  lista.forEach(x=>c.appendChild(cardHistorico(x,"combustivel",x.motoboyNome||nome)));
  bootstrap.Modal.getOrCreateInstance(elemento("modalHistoricoCombustivel")).show();
}

function abrirHistoricoManutencao(index) {
  const m=motos[index],c=elemento("lista-historico-manutencao");
  elemento("titulo-historico-manutencao").textContent=`Histórico de manutenções - ${m.placa}`;
  c.innerHTML="";
  const lista=obterManutencoes(m.placa,valorElemento("filtro-mes-motos"));
  if(!lista.length)c.innerHTML=`<div class="text-center text-muted py-4">Nenhuma manutenção encontrada.</div>`;
  lista.forEach(x=>c.appendChild(cardHistorico(x,"manutencao",x.descricao)));
  bootstrap.Modal.getOrCreateInstance(elemento("modalHistoricoManutencao")).show();
}

async function excluirLancamentoMoto(key) {
  if(!key||!confirm("Excluir este lançamento?"))return;
  await db.ref(`moto_lancamentos/${key}`).remove();
  bootstrap.Modal.getInstance(elemento("modalHistoricoCombustivel"))?.hide();
  bootstrap.Modal.getInstance(elemento("modalHistoricoManutencao"))?.hide();
  exibirToastConfirmacao("✅ Lançamento excluído!");
}

/* TEMA */
function aplicarTemaEscuro(ativo) {
  document.documentElement.toggleAttribute("data-theme",ativo);
  if(ativo)document.documentElement.setAttribute("data-theme","dark");
  localStorage.setItem("grs_tema",ativo?"dark":"light");
}

function inicializarTema() {
  const t=elemento("themeToggle");
  if (!t) return;
  t.checked=localStorage.getItem("grs_tema")==="dark";
  t.onchange=()=>aplicarTemaEscuro(t.checked);
}

/* NAVEGAÇÃO */
function renderizarListas() {
  const p=new URLSearchParams(location.search);
  const view=p.get("view"),motoboy=p.get("m");
  document.querySelectorAll("#sidebar-nav .nav-link").forEach(x=>x.classList.remove("active"));
  ["view-admin","view-motoboy","view-conferencia","view-avisos","view-ocorrencias","view-motos","view-davs-abertas"].forEach(id=>elemento(id)?.classList.add("d-none"));

  if(view==="motos"){elemento("nav-motos")?.classList.add("active");elemento("view-motos").classList.remove("d-none");return renderizarMotos();}
  if(view==="davs-abertas"){elemento("nav-davs-abertas")?.classList.add("active");elemento("view-davs-abertas").classList.remove("d-none");return renderizarDavsAbertas();}
  if(view==="avisos"){elemento("nav-avisos")?.classList.add("active");elemento("view-avisos").classList.remove("d-none");return renderizarAvisos();}
  if(view==="ocorrencias"){elemento("nav-ocorrencias")?.classList.add("active");elemento("view-ocorrencias").classList.remove("d-none");return renderizarOcorrencias();}
  if(view==="conferencia"){elemento("nav-conferencia")?.classList.add("active");elemento("view-conferencia").classList.remove("d-none");return renderizarConferencia();}
  if(motoboy){elemento(`nav-m${motoboy}`)?.classList.add("active");elemento("view-motoboy").classList.remove("d-none");return renderizarListaMotoboy(motoboy);}
  elemento("nav-admin")?.classList.add("active");elemento("view-admin").classList.remove("d-none");renderizarListaAdmin();
}

function inicializarNavegacao() {
  document.querySelectorAll('#sidebar-nav a[href^="index.html"]').forEach(a=>a.onclick=e=>{
    e.preventDefault();const u=new URL(a.href,location.href);history.pushState({},"",u.pathname+u.search);renderizarListas();
  });
  addEventListener("popstate",renderizarListas);
}

/* XLSX */
function exportarXLSX() {
  if(!window.XLSX)return alert("Biblioteca XLSX não carregada.");
  const p=new URLSearchParams(location.search),motoboy=p.get("m");
  const filtro=motoboy?valorElemento("filtro-data-motoboy"):valorElemento("filtro-data-admin");
  const lista=window.entregasGlobais.filter(e=>(!filtro||obterDataEntregaISO(e)===filtro)&&(!motoboy||String(e.motoboy)===motoboy));
  if(!lista.length)return alert("Não há entregas para exportar.");
  const dados=lista.map(e=>({"Data":obterDataEntregaISO(e),"DAV":e.dav,"Vendedor":e.vendedor,"Cliente":e.cliente,
    "Endereço":e.endereco,"Valor":numeroSeguro(e.valor),"Pagamento":e.pagamento,
    "Motoboy":nomeMotoboy(e.motoboy),"Status":e.status,"Observações":e.observacoes||""}));
  const ws=XLSX.utils.json_to_sheet(dados),wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Entregas");XLSX.writeFile(wb,`GRS_Entregas_${filtro||"todas"}.xlsx`);
}

function exportarDavsAbertasXLSX() {
  if(!window.XLSX)return alert("Biblioteca XLSX não carregada.");
  const lista=davsAbertasFiltradas();
  if(!lista.length)return alert("Não há DAV's abertas para exportar.");
  const textoSituacao=s=>SITUACOES_DAV[s]||"Sem Situação";
  const sufixoVendedor=valorElemento("filtro-vendedor-dav");
  const sufixoSituacao=valorElemento("filtro-situacao-dav");
  const sufixoFiltro=[sufixoVendedor,sufixoSituacao].filter(Boolean).join("_");
  const dados=lista.map(d=>({"Comanda":textoSeguro(d.comanda),"Cliente":textoSeguro(d.cliente),
    "Operador":textoSeguro(d.vendedor),"Situação":textoSituacao(d.situacao),
    "Data":formatarDataCompleta(d.data),"Valor R$":numeroSeguro(d.valor)}));
  const ws=XLSX.utils.json_to_sheet(dados),wb=XLSX.utils.book_new();
  ws["!cols"]=[{wch:10},{wch:32},{wch:16},{wch:26},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,ws,"DAVs Abertas");
  XLSX.writeFile(wb,`GRS_DAVs_Abertas_${sufixoFiltro?`${sufixoFiltro}_`:""}${hojeISO()}.xlsx`);
}

window.processarImportacaoExcel=function(){
  const input=elemento("arquivo-excel-import"),status=elemento("status-importacao");
  if(!input.files.length)return alert("Selecione um arquivo.");
  const reader=new FileReader();status.textContent="⏳ Importando entregas...";
  reader.onload=async ev=>{
    try{
      const wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array",cellDates:true});
      const linhas=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});
      let total=0;
      for(let i=0;i<linhas.length;i++){
        const l=linhas[i];if(!l?.length)continue;
        await dbRefEntregas.push().set({id:Date.now()+i,dav:textoSeguro(l[0],"-"),vendedor:textoSeguro(l[1],"Geral"),
          cliente:textoSeguro(l[2],"Não informado"),endereco:textoSeguro(l[3],"-"),valor:numeroSeguro(l[4]).toFixed(2),
          pagamento:textoSeguro(l[5],"Dinheiro"),motoboy:String(l[6]||"1"),status:"Entregue",data_lancamento:hojeISO(),
          hora_entrada:"08:00",hora_na_rota:"08:30",hora_conclusao:"09:00",observacoes:"Importado de Excel",
          motivo_nao_entrega:"",conferida:false,status_conferencia:"Em Aberto"});total++;
      }
      status.textContent=`✅ ${total} entregas importadas!`;input.value="";
    }catch(erro){status.textContent=`❌ ${erro.message}`;}
  };
  reader.readAsArrayBuffer(input.files[0]);
};

/* EVENTOS */
document.addEventListener("keydown",e=>{
  if(new URLSearchParams(location.search).get("view")!=="conferencia"||e.target.matches("input,textarea,select"))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){
    e.preventDefault();const id=historicoConferidos.pop();if(id)window.marcarConferida(id,false);return;
  }
  const linhas=[...document.querySelectorAll("#tbody-conferencia tr[data-id]")];
  if(!linhas.length)return;
  if(e.key==="ArrowDown"){e.preventDefault();selecionarLinhaConferencia(indiceConferencia+1);}
  else if(e.key==="ArrowUp"){e.preventDefault();selecionarLinhaConferencia(indiceConferencia-1);}
  else if(e.key==="Enter"){e.preventDefault();executarConferencia(linhas[indiceConferencia].dataset.id);}
});

document.addEventListener("click",e=>{if(!e.target.closest(".position-relative"))fecharAutocompleteVendedor();});

document.addEventListener("DOMContentLoaded", () => {
  const hoje = hojeISO();
  if (elemento("filtro-data-admin")) elemento("filtro-data-admin").value = hoje;
  if (elemento("filtro-data-motoboy")) elemento("filtro-data-motoboy").value = hoje;
  if (elemento("filtro-data-conferencia")) elemento("filtro-data-conferencia").value = hoje;
  if (elemento("filtro-ocorrencias-inicio")) elemento("filtro-ocorrencias-inicio").value = inicioCicloSextaISO(hoje);
  if (elemento("filtro-ocorrencias-fim")) elemento("filtro-ocorrencias-fim").value = fimCicloSextaISO(hoje);
  if (elemento("dav-aberta-data")) elemento("dav-aberta-data").value = hoje;
  if (elemento("ocorrencia-motoboy")) elemento("ocorrencia-motoboy").innerHTML = `<option value="">Selecione o motoboy</option>${opcoesMotoboysHTML(false, "")}`;

  preencherFiltroSituacaoDav();
  inicializarTema();
  carregarMotosLocalmente();
  atualizarVendedoresUI();
  renderizarListaMotoboysConfig();
  atualizarNomesMotoboysUI();
  inicializarNavegacao();

  elemento("btnConfirmarAvisoAlerta").onclick = () => { modalAvisoInstance?.hide(); setTimeout(exibirProximoAviso, 300); };
  iniciarListenersFirebase();
  renderizarListas();
});

/* FUNÇÕES DO HTML */
Object.assign(window,{
  renderizarListas,renderizarOcorrencias,renderizarDavsAbertas,exportarXLSX,exportarDavsAbertasXLSX,checarAvisosCliente,capitalizarInput,filtrarVendedores,
  selecionarVendedor,navegarSugestoesVendedor,adicionarVendedor,removerVendedor,
  identificarMotoboyAutomatico,executarConferencia,selecionarLinhaConferencia,
  editarMoto,salvarEdicaoMoto,abrirModalAbastecimento,salvarAbastecimento,
  abrirModalManutencao,salvarManutencao,abrirHistoricoCombustivel,
  abrirHistoricoManutencao,excluirLancamentoMoto,exibirToastConfirmacao,
  salvarNomesMotoboys
});