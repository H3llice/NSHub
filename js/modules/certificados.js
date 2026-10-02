import { renderSecoesTecnicasRelatorio, prepararCilindros, renderizarCilindros, lerCamposTecnicosRelatorio, hojeISO, preencherQuantidadesPadraoKit } from './relatorios.js'

const API = 'https://override-steerable-professed.ngrok-free.dev'

// ─── Auth helper (mesmo padrão dos outros módulos) ────────────────────────────
function tratarSessaoExpirada(res) {
  if (res.status === 401) {
    localStorage.removeItem('ns_token')
    localStorage.removeItem('ns_usuario')
    alert('Sua sessão expirou. Faça login novamente.')
    window.location.href = './login.html'
    throw new Error('Sessão expirada')
  }
  return res
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('ns_token')
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true'
    }
  })
  return tratarSessaoExpirada(res)
}

async function apiJson(url, options = {}) {
  const token = localStorage.getItem('ns_token')
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {})
    }
  })
  return tratarSessaoExpirada(res)
}

const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
const perfil = usuarioAtual?.perfil || 'usuario'
const podeEmitirCertificado = perfil === 'admin' || perfil === 'gerente'
// Emitir/cancelar/excluir é restrito a gerente/admin, mas editar os dados
// (antes de emitido) também é permitido ao Usuário — Técnico e Financeiro
// não têm essa tela na sidebar e o backend já bloqueia o acesso direto.
const podeEditarCertificado = podeEmitirCertificado || perfil === 'usuario'
const tokenAtual = localStorage.getItem('ns_token')

// ══════════════════════════════════════════════════════════════════════════
// CERTIFICADO DE BALSA — etapa final do fluxo OS → Relatório → Certificado,
// OU criado direto (avulso), sem exigir OS/Relatório/Embarcação cadastrada
// antes — necessário pra transição pro sistema novo (OS/Relatório ainda no
// papel) e pra importar certificados antigos depois. Navio/armador/porto/
// telefone/email são sempre texto livre no Certificado, nunca dependem de
// cadastro prévio de Embarcacao/Cliente. Por enquanto só cobre balsa; os
// demais tipos (baleeira/turco/colete) continuam no formulário avulso antigo,
// acessível em Serviços → Certificados.
// ══════════════════════════════════════════════════════════════════════════

const STATUS_LABEL = {
  pendente: { texto: 'Pendente', cor: '#fd7e14' },
  emitido: { texto: 'Emitido', cor: '#198754' },
  migrado: { texto: 'Migrado', cor: '#0d6efd' },
  cancelado: { texto: 'Cancelado', cor: '#dc3545' },
}

export function badgeStatusCertificado(status) {
  return badgeStatus(status)
}

function badgeStatus(status) {
  const s = STATUS_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

// Renderiza dentro do mesmo container da página de Relatórios — reaproveita a
// navegação já existente (Serviços → Ordens de serviço → Relatório → Certificado).
window.gerarCertificadoDeRelatorio = async function (relatorioId) {
  const res = await apiJson(`${API}/certificados`, {
    method: 'POST',
    body: JSON.stringify({ relatorioId })
  })

  if (res.ok) {
    const certificado = await res.json()
    const empresas = await apiFetch(`${API}/empresas`).then(r => r.json())
    exibirCertificado(certificado, empresas)
  } else {
    const err = await res.json()
    alert('Erro ao gerar certificado: ' + (err.erro || 'falha'))
  }
}

// "+ Novo certificado" -> "Certificado de Balsa": leva direto pro mesmo
// formulário completo da edição, só que vazio — sem etapa intermediária, sem
// exigir Embarcação/Cliente já cadastrados. O botão "Criar" no lugar de
// "Salvar"/"Emitir" é a única diferença.
window.abrirNovoCertificadoAvulso = async function () {
  const empresas = await apiFetch(`${API}/empresas`).then(r => r.json())
  exibirCertificado({}, empresas)
}

// Usada pela aba "Certificados" (Serviços → Certificados, ver js/app.js) nas
// tabelas dos tipos que vivem no backend (balsa e os de lista) — baleeira/turco
// ainda têm sua própria tabela, alimentada pelo avulso antigo em localStorage.
// filtros: { tipo, navio, armador, tecnico, numero, ano, pagina } — sem tipo, o backend lista balsa — repassados direto
// pro backend (GET /certificados), que já sabe cair no cadastro de Embarcacao/
// Armador quando o texto livre do Certificado não bate, e resolver o técnico
// pelo Relatorio.tecnicoNome (ou dadosTecnicos.tecnicoNome no avulso) — o
// campo "Técnico responsável" atribuído na tela, não quem criou o registro.
// Devolve a resposta paginada inteira ({ certificados, total, pagina, totalPaginas }),
// não só o array — quem chama precisa do total/totalPaginas pra montar os botões.
export async function listarCertificados(filtros = {}) {
  try {
    const params = new URLSearchParams()
    if (filtros.tipo) params.set('tipo', filtros.tipo)
    if (filtros.navio) params.set('navio', filtros.navio)
    if (filtros.armador) params.set('armador', filtros.armador)
    if (filtros.tecnico) params.set('tecnico', filtros.tecnico)
    if (filtros.numero) params.set('busca', filtros.numero)
    if (filtros.ano) params.set('ano', filtros.ano)
    params.set('pagina', filtros.pagina || 1)
    const resp = await apiFetch(`${API}/certificados?${params}`).then(r => r.json())
    return { certificados: resp.certificados || [], total: resp.total || 0, pagina: resp.pagina || 1, totalPaginas: resp.totalPaginas || 1 }
  } catch {
    return { certificados: [], total: 0, pagina: 1, totalPaginas: 1 }
  }
}

export function urlPdfCertificado(id) {
  return `${API}/certificados/${id}/pdf?token=${encodeURIComponent(tokenAtual)}`
}

window.abrirCertificado = async function (id) {
  const [certificado, empresas] = await Promise.all([
    apiFetch(`${API}/certificados/${id}`).then(r => r.json()),
    apiFetch(`${API}/empresas`).then(r => r.json())
  ])

  if (certificado.tipo && certificado.tipo !== 'balsa') {
    await exibirCertificadoLista(certificado, empresas)
    return
  }
  exibirCertificado(certificado, empresas)
}

function exibirCertificado(c, empresas) {
  prepararCilindros(c.relatorio?.cilindros || c.dadosTecnicos?.cilindros, false)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')
  document.getElementById('relatorios').innerHTML = renderCertificado(c, empresas)
  renderizarCilindros()
  // Certificado do zero (sem id ainda) — sugere as quantidades padrão do kit.
  // Vindo de relatório ou já salvo antes, os valores que já estão lá prevalecem.
  if (!c.id) preencherQuantidadesPadraoKit(c.equipCapacidade)
}

window.atualizarQuantidadesPadraoCertificado = function () {
  preencherQuantidadesPadraoKit(document.getElementById('cert-equipCapacidade').value)
}

// Certificado emitido é referência oficial (assinatura já registrada), mas ao
// contrário de OC/Solicitação/Relatório ele não trava para edição depois de
// emitido — gerente/admin pode corrigir dataEmissao/validade/observações a
// qualquer momento.
function validadePadrao(dataEmissaoStr) {
  if (!dataEmissaoStr) return ''
  const [ano, mes, dia] = dataEmissaoStr.split('-').map(Number)
  const data = new Date(Date.UTC(ano + 1, mes - 1, dia))
  return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

window.atualizarValidadePadrao = function () {
  const dataEmissao = document.getElementById('cert-dataEmissao').value
  document.getElementById('cert-validade').value = validadePadrao(dataEmissao)
}

// Navio/armador/porto/telefone/email e os dados do equipamento são sempre
// texto livre, guardados direto no Certificado — nunca exigem uma Embarcacao/
// Cliente cadastrados antes. Quando o certificado tem um Relatório vinculado
// (fluxo OS -> Relatório), editar aqui também atualiza o Relatório de origem
// por baixo dos panos (única exceção às travas de documento concluído).
function renderCertificado(c, empresas) {
  const novo = !c.id
  const cancelado = c.status === 'cancelado'
  const r = c.relatorio
  const dis = (!podeEditarCertificado || cancelado) ? 'disabled' : ''
  const dataEmissaoValor = c.dataEmissao ? c.dataEmissao.split('T')[0] : hojeISO()
  const validadeValor = c.validade || validadePadrao(dataEmissaoValor)
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${c.empresaId === e.id ? 'selected' : ''}>${e.nome} (${e.sigla})</option>`
  ).join('')

  const origem = novo
    ? 'Novo certificado avulso — sem Ordem de Serviço/Relatório vinculado. Preencha os dados e clique em Criar.'
    : r ? `Gerado a partir do Relatório ${r.numero}/${r.ano}` : 'Certificado avulso — sem Ordem de Serviço/Relatório vinculado'

  return `
    <div style="margin-top:20px; max-width:1000px;">
      <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="abrirPagina(event, 'certificados')">← Voltar</button>
        ${!novo ? `
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <a class="btn btn-secondary" href="${urlPdfCertificado(c.id)}" target="_blank">PDF</a>
            ${(perfil === 'admin' || perfil === 'gerente') ? `
              ${!cancelado ? `<button class="btn btn-warning" onclick="cancelarCertificado(${c.id})">Cancelar</button>` : ''}
              <button class="btn btn-danger" onclick="excluirCertificado(${c.id})">Excluir</button>
            ` : ''}
          </div>
        ` : ''}
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
        <h3 style="margin:0;">${novo ? 'Novo Certificado de Balsa (avulso)' : `Certificado ${c.numero}/${c.ano}`}</h3>
        ${!novo ? badgeStatus(c.status) : ''}
      </div>
      <p style="color:#999; font-size:13px; margin-bottom:20px;">${origem}</p>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Identificação</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div><label>Empresa executante *</label><select id="cert-empresaId" class="form-control" ${dis}>${opcoesEmpresas}</select></div>
          <div><label>Navio *</label><input type="text" id="cert-navio" class="form-control" value="${c.navio || c.embarcacao?.nome || ''}" ${dis}></div>
          <div><label>Armador</label><input type="text" id="cert-armador" class="form-control" value="${c.armador || ''}" ${dis}></div>
          <div><label>Porto de Registro</label><input type="text" id="cert-portoRegistro" class="form-control" value="${c.portoRegistro || ''}" ${dis}></div>
          <div><label>Telefone</label><input type="text" id="cert-telefone" class="form-control" value="${c.telefone || ''}" ${dis}></div>
          <div><label>Email</label><input type="text" id="cert-email" class="form-control" value="${c.email || ''}" ${dis}></div>
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Equipamento</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          <div><label>Equipamento</label><input type="text" id="cert-equipTipo" class="form-control" value="${c.equipTipo || r?.equipTipo || 'BALSA INFLÁVEL'}" ${dis}></div>
          <div><label>Nº Série</label><input type="text" id="cert-equipNumeroSerie" class="form-control" value="${c.equipNumeroSerie || r?.equipNumeroSerie || ''}" ${dis}></div>
          <div><label>Ano Fabricação</label><input type="text" id="cert-equipAnoFabricacao" class="form-control" placeholder="Ex: 01/2010" value="${c.equipAnoFabricacao || r?.equipAnoFabricacao || ''}" ${dis}></div>
          <div><label>Marca/Fabricante</label><input type="text" id="cert-equipFabricante" class="form-control" value="${c.equipFabricante || r?.equipFabricante || ''}" ${dis}></div>
          <div><label>Modelo</label><input type="text" id="cert-equipModelo" class="form-control" value="${c.equipModelo || r?.equipModelo || ''}" ${dis}></div>
          <div><label>Classe</label><input type="text" id="cert-equipClasse" class="form-control" placeholder="Ex: Classe II Pack B" value="${c.equipClasse || r?.equipClasse || ''}" ${dis}></div>
          <div><label>Capacidade (pessoas)</label><input type="number" id="cert-equipCapacidade" class="form-control" value="${c.equipCapacidade ?? r?.equipCapacidade ?? ''}" ${novo ? 'onchange="atualizarQuantidadesPadraoCertificado()"' : ''} ${dis}></div>
        </div>
      </div>

      ${renderSecoesTecnicasRelatorio(r || c.dadosTecnicos || {}, false, { incluirTesteImo: false, incluirServicosBalsa: false, nomeTecnicoDefault: c.criadoPor?.nome || usuarioAtual?.nome || '' })}

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Emissão</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div>
            <label>Data de Emissão *</label>
            <input type="date" id="cert-dataEmissao" class="form-control" onchange="atualizarValidadePadrao()"
              value="${dataEmissaoValor}" ${dis}>
          </div>
          <div>
            <label>Validade *</label>
            <input type="text" id="cert-validade" class="form-control" placeholder="Ex: 04/09/2027" value="${validadeValor}" ${dis}>
          </div>
        </div>
        <div style="margin-top:16px;">
          <label>Observações</label>
          <textarea id="cert-observacoes" class="form-control" rows="3" ${dis}>${c.observacoes || ''}</textarea>
        </div>

        ${botoesCertificado(c, { criar: 'criarCertificadoAvulso', salvar: 'atualizarCertificado', emitir: 'emitirCertificado' })}
      </div>
    </div>
  `
}

// Rodapé de ações do formulário (Criar / Salvar / Emitir / Cancelar / Excluir)
// — mesmo para balsa e certificados de lista, só mudam as funções chamadas.
function botoesCertificado(c, fn) {
  const novo = !c.id
  // migrado (importado do sistema antigo) conta como já finalizado igual
  // emitido pra fins de UI — não mostra botão de emitir de novo — mas
  // continua editável por gerente/admin (mesma regra do emitido).
  const emitido = c.status === 'emitido' || c.status === 'migrado'
  if (c.status === 'cancelado') return `
    <p style="margin-top:16px; color:#dc3545; font-size:13px; font-weight:600;">Certificado cancelado.</p>
    ${podeEmitirCertificado ? `<button type="button" class="btn btn-danger" onclick="excluirCertificado(${c.id})">Excluir Certificado</button>` : ''}
  `
  if (!podeEditarCertificado) return `
    <p style="margin-top:16px; color:#999; font-size:13px;">${emitido ? 'Certificado emitido.' : 'Aguardando um gerente ou administrador revisar e emitir este certificado.'}</p>
  `
  if (novo) return `
    <div style="margin-top:16px;">
      <button type="button" class="btn btn-success" onclick="${fn.criar}()">Criar Certificado</button>
    </div>
  `
  return `
    <div style="margin-top:16px; display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between;">
      <div style="display:flex; gap:12px;">
        <button type="button" class="btn btn-secondary" onclick="${fn.salvar}(${c.id})">Salvar</button>
        ${!emitido && podeEmitirCertificado ? `<button type="button" class="btn btn-success" onclick="${fn.emitir}(${c.id})">Emitir Certificado</button>` : ''}
      </div>
      ${podeEmitirCertificado ? `
      <div style="display:flex; gap:12px;">
        <button type="button" class="btn btn-warning" onclick="cancelarCertificado(${c.id})">Cancelar Certificado</button>
        <button type="button" class="btn btn-danger" onclick="excluirCertificado(${c.id})">Excluir Certificado</button>
      </div>
      ` : ''}
    </div>
  `
}

function lerFormularioCertificado() {
  const equip = {
    equipTipo: document.getElementById('cert-equipTipo').value,
    equipNumeroSerie: document.getElementById('cert-equipNumeroSerie').value,
    equipAnoFabricacao: document.getElementById('cert-equipAnoFabricacao').value,
    equipFabricante: document.getElementById('cert-equipFabricante').value,
    equipModelo: document.getElementById('cert-equipModelo').value,
    equipClasse: document.getElementById('cert-equipClasse').value,
    equipCapacidade: document.getElementById('cert-equipCapacidade').value,
  }
  const empresaId = document.getElementById('cert-empresaId').value
  const navio = document.getElementById('cert-navio').value.trim()

  return {
    empresaId,
    navio,
    armador: document.getElementById('cert-armador').value,
    portoRegistro: document.getElementById('cert-portoRegistro').value,
    telefone: document.getElementById('cert-telefone').value,
    email: document.getElementById('cert-email').value,
    dataEmissao: document.getElementById('cert-dataEmissao').value,
    validade: document.getElementById('cert-validade').value.trim(),
    observacoes: document.getElementById('cert-observacoes').value,
    ...equip,
    relatorio: { empresaId, ...equip, ...lerCamposTecnicosRelatorio() }
  }
}

window.criarCertificadoAvulso = async function () {
  const body = lerFormularioCertificado()

  if (!body.empresaId || !body.navio) {
    alert('Empresa e Navio são obrigatórios.')
    return
  }

  const res = await apiJson(`${API}/certificados`, {
    method: 'POST',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    const certificado = await res.json()
    alert('Certificado criado com sucesso!')
    window.abrirCertificado(certificado.id)
  } else {
    const err = await res.json()
    alert('Erro ao criar certificado: ' + (err.erro || 'falha'))
  }
}

window.atualizarCertificado = async function (id) {
  const body = lerFormularioCertificado()

  if (!body.empresaId || !body.navio) {
    alert('Empresa e Navio são obrigatórios.')
    return
  }

  const res = await apiJson(`${API}/certificados/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    alert('Certificado atualizado com sucesso!')
    window.abrirCertificado(id)
  } else {
    const err = await res.json()
    alert('Erro ao atualizar certificado: ' + (err.erro || 'falha'))
  }
}

window.emitirCertificado = async function (id) {
  const body = lerFormularioCertificado()

  if (!body.empresaId || !body.navio) {
    alert('Empresa e Navio são obrigatórios.')
    return
  }
  if (!body.dataEmissao || !body.validade) {
    alert('Data de emissão e validade são obrigatórias para emitir o certificado')
    return
  }
  if (!confirm('Emitir este certificado?')) return

  const res = await apiJson(`${API}/certificados/${id}/emitir`, {
    method: 'POST',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    alert('Certificado emitido com sucesso!')
    window.abrirCertificado(id)
  } else {
    const err = await res.json()
    alert('Erro ao emitir certificado: ' + (err.erro || 'falha'))
  }
}

// Cancelar: fica no banco com status "cancelado", NÃO libera o número.
window.cancelarCertificado = async function (id) {
  if (!confirm('Cancelar este certificado? Ele continua no sistema (marcado como Cancelado), mas não pode mais ser editado ou emitido — e o número não é reaproveitado.')) return

  const res = await apiJson(`${API}/certificados/${id}/cancelar`, { method: 'POST' })

  if (res.ok) {
    alert('Certificado cancelado.')
    // Chamado tanto da lista (Serviços → Certificados, ver js/app.js) quanto
    // de dentro do certificado aberto — atualiza o que estiver na tela.
    if (document.getElementById('tabela-certificados')) window.atualizarTabelaCertificados()
    else window.abrirCertificado(id)
  } else {
    const err = await res.json()
    alert('Erro ao cancelar certificado: ' + (err.erro || 'falha'))
  }
}

// Excluir: some do banco de vez — libera o número pro próximo certificado
// (usada com nome diferente do "deletarCertificado" legado do formulário
// avulso antigo em js/app.js, pra não colidir esse global).
window.excluirCertificado = async function (id) {
  if (!confirm('Excluir este certificado permanentemente? Essa ação não pode ser desfeita, e o número volta a ficar disponível pro próximo certificado.')) return

  const res = await apiJson(`${API}/certificados/${id}`, { method: 'DELETE' })

  if (res.ok) {
    alert('Certificado excluído.')
    window.abrirPagina({ preventDefault() {} }, 'certificados')
  } else {
    const err = await res.json()
    alert('Erro ao excluir certificado: ' + (err.erro || 'falha'))
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CERTIFICADOS DE LISTA — Aparelho de respiração, Cilindros reserva, Coletes
// (navio e aeronave): cabeçalho do navio + uma tabela com uma linha por peça.
// Cabeçalho, colunas e textos padrão de cada tipo vêm do backend
// (GET /certificados/modelos, definidos em backend/templates/certificado-lista.js)
// — esta tela só monta o formulário a partir deles. Sempre avulsos (sem OS/
// Relatório), mesma numeração e mesmo fluxo de emitir/cancelar/excluir da balsa.
// ══════════════════════════════════════════════════════════════════════════

let modelosLista = null
let certificadoListaAtual = null
let itensLista = []

async function carregarModelosLista() {
  if (!modelosLista) modelosLista = await apiFetch(`${API}/certificados/modelos`).then(r => r.json())
  return modelosLista
}

export async function nomeTipoCertificado(tipo) {
  const modelos = await carregarModelosLista()
  return modelos[tipo]?.nome || tipo
}

function escapeAttr(valor) {
  return String(valor ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

// "mesAnoSeguinte": respiração/cilindros imprimem "Próxima inspeção: 08/2027"
// — um ano depois do mês da inspeção. Os demais tipos têm texto fixo.
function validadePadraoLista(modelo, dataEmissaoStr) {
  if (modelo.validade.padrao !== 'mesAnoSeguinte') return modelo.validade.padrao
  if (!dataEmissaoStr) return ''
  const [ano, mes] = dataEmissaoStr.split('-')
  return `${mes}/${Number(ano) + 1}`
}

function linhaPadrao(modelo) {
  return Object.fromEntries(modelo.colunas.map(col => [col.campo, col.padrao || '']))
}

window.abrirNovoCertificadoLista = async function (tipo) {
  const empresas = await apiFetch(`${API}/empresas`).then(r => r.json())
  await exibirCertificadoLista({ tipo }, empresas)
}

async function exibirCertificadoLista(c, empresas) {
  const modelos = await carregarModelosLista()
  const modelo = modelos[c.tipo]
  certificadoListaAtual = c
  itensLista = Array.isArray(c.itens) && c.itens.length ? c.itens.map(i => ({ ...i })) : [linhaPadrao(modelo)]

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')
  document.getElementById('relatorios').innerHTML = renderCertificadoLista(c, modelo, empresas)
  renderizarItensLista()
}

function renderCertificadoLista(c, modelo, empresas) {
  const novo = !c.id
  const cancelado = c.status === 'cancelado'
  const dis = (!podeEditarCertificado || cancelado) ? 'disabled' : ''
  const dataEmissaoValor = c.dataEmissao ? c.dataEmissao.split('T')[0] : hojeISO()
  const validadeValor = c.validade || validadePadraoLista(modelo, dataEmissaoValor)
  const observacaoValor = novo ? modelo.observacaoPadrao : (c.observacoes || '')
  const tecnicoValor = c.dadosTecnicos?.tecnicoNome ?? (novo ? usuarioAtual?.nome || '' : '')
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${c.empresaId === e.id ? 'selected' : ''}>${e.nome} (${e.sigla})</option>`
  ).join('')

  const camposCabecalho = modelo.cabecalho.map(f => `
    <div><label>${f.rotulo}${f.obrigatorio ? ' *' : ''}</label>
      <input type="text" id="cert-${f.campo}" class="form-control" value="${escapeAttr(c[f.campo])}" ${dis}></div>
  `).join('')

  return `
    <div style="margin-top:20px; max-width:1100px;">
      <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="abrirPagina(event, 'certificados')">← Voltar</button>
        ${!novo ? `
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <a class="btn btn-secondary" href="${urlPdfCertificado(c.id)}" target="_blank">PDF</a>
            ${podeEmitirCertificado ? `
              ${!cancelado ? `<button class="btn btn-warning" onclick="cancelarCertificado(${c.id})">Cancelar</button>` : ''}
              <button class="btn btn-danger" onclick="excluirCertificado(${c.id})">Excluir</button>
            ` : ''}
          </div>
        ` : ''}
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
        <h3 style="margin:0;">${novo ? `Novo Certificado — ${modelo.nome}` : `Certificado ${c.numero}/${c.ano} — ${modelo.nome}`}</h3>
        ${!novo ? badgeStatus(c.status) : ''}
      </div>
      <p style="color:#999; font-size:13px; margin-bottom:20px;">${novo ? 'Preencha os dados e clique em Criar.' : ''}</p>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Identificação</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px;">
          <div><label>Empresa executante *</label><select id="cert-empresaId" class="form-control" ${dis}>${opcoesEmpresas}</select></div>
          ${camposCabecalho}
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-weight:700; color:var(--acento);">Itens</div>
          ${dis ? '' : `<button type="button" class="btn btn-sm btn-success" onclick="adicionarItemLista()">＋ Linha</button>`}
        </div>
        <p style="color:#999; font-size:12px; margin:0 0 10px;">A linha nova repete marca/modelo/etc. da linha de cima — só os campos de identificação (nº, série) vêm em branco.</p>
        <div class="table-scroll">
          <table class="table-certificados" style="min-width:${120 + modelo.colunas.length * 130}px;">
            <thead>
              <tr>
                <th style="width:50px;">Item</th>
                ${modelo.colunas.map(col => `<th>${col.rotulo}</th>`).join('')}
                ${dis ? '' : '<th style="width:50px;"></th>'}
              </tr>
            </thead>
            <tbody id="cert-itens-lista"></tbody>
          </table>
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">Emissão</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
          <div>
            <label>Data da Inspeção / Emissão *</label>
            <input type="date" id="cert-dataEmissao" class="form-control" onchange="atualizarValidadeLista()" value="${dataEmissaoValor}" ${dis}>
          </div>
          <div>
            <label>${modelo.validade.rotulo} *</label>
            <input type="text" id="cert-validade" class="form-control" placeholder="${modelo.validade.placeholder}" value="${escapeAttr(validadeValor)}" ${dis}>
          </div>
          <div>
            <label>Local</label>
            <input type="text" id="cert-localEmissao" class="form-control" placeholder="Ex: Natal" value="${escapeAttr(c.localEmissao)}" ${dis}>
          </div>
          <div>
            <label>Técnico responsável</label>
            <input type="text" id="cert-tecnicoNome" class="form-control" value="${escapeAttr(tecnicoValor)}" ${dis}>
          </div>
        </div>
        <div style="margin-top:16px;">
          <label>Observação (sai impressa no certificado)</label>
          <textarea id="cert-observacoes" class="form-control" rows="4" ${dis}>${escapeAttr(observacaoValor)}</textarea>
        </div>

        ${botoesCertificado(c, { criar: 'criarCertificadoLista', salvar: 'atualizarCertificadoLista', emitir: 'emitirCertificadoLista' })}
      </div>
    </div>
  `
}

window.atualizarValidadeLista = function () {
  const modelo = modelosLista[certificadoListaAtual.tipo]
  if (modelo.validade.padrao !== 'mesAnoSeguinte') return
  document.getElementById('cert-validade').value = validadePadraoLista(modelo, document.getElementById('cert-dataEmissao').value)
}

// A tabela é redesenhada a cada linha adicionada/removida — antes disso, o que
// foi digitado é lido de volta pra itensLista pra não se perder.
function renderizarItensLista() {
  const modelo = modelosLista[certificadoListaAtual.tipo]
  const c = certificadoListaAtual
  const dis = (!podeEditarCertificado || c.status === 'cancelado') ? 'disabled' : ''
  document.getElementById('cert-itens-lista').innerHTML = itensLista.map((item, i) => `
    <tr>
      <td>${String(i + 1).padStart(2, '0')}</td>
      ${modelo.colunas.map(col => `
        <td><input type="text" class="form-control cert-item" data-linha="${i}" data-campo="${col.campo}"
          placeholder="${col.placeholder || ''}" value="${escapeAttr(item[col.campo])}" ${dis}></td>
      `).join('')}
      ${dis ? '' : `<td><button type="button" class="btn btn-sm btn-danger" title="Remover linha" onclick="removerItemLista(${i})">✕</button></td>`}
    </tr>
  `).join('')
}

function lerItensLista() {
  document.querySelectorAll('#cert-itens-lista .cert-item').forEach(input => {
    itensLista[Number(input.dataset.linha)][input.dataset.campo] = input.value.trim()
  })
}

window.adicionarItemLista = function () {
  lerItensLista()
  const modelo = modelosLista[certificadoListaAtual.tipo]
  const anterior = itensLista[itensLista.length - 1]
  const nova = anterior
    ? Object.fromEntries(modelo.colunas.map(col => [col.campo, col.chave ? '' : (anterior[col.campo] || '')]))
    : linhaPadrao(modelo)
  itensLista.push(nova)
  renderizarItensLista()
}

window.removerItemLista = function (indice) {
  lerItensLista()
  itensLista.splice(indice, 1)
  renderizarItensLista()
}

function lerFormularioCertificadoLista() {
  const modelo = modelosLista[certificadoListaAtual.tipo]
  lerItensLista()
  const body = {
    tipo: certificadoListaAtual.tipo,
    empresaId: document.getElementById('cert-empresaId').value,
    dataEmissao: document.getElementById('cert-dataEmissao').value,
    validade: document.getElementById('cert-validade').value.trim(),
    localEmissao: document.getElementById('cert-localEmissao').value.trim(),
    observacoes: document.getElementById('cert-observacoes').value,
    // Linha toda em branco (ou só com os valores padrão) não é item de verdade
    itens: itensLista.filter(item => modelo.colunas.some(col => item[col.campo] && item[col.campo] !== (col.padrao || ''))),
    // Mesmo lugar onde o avulso de balsa guarda o técnico — a lista e o filtro
    // por técnico já leem dadosTecnicos.tecnicoNome.
    relatorio: { tecnicoNome: document.getElementById('cert-tecnicoNome').value.trim() }
  }
  for (const f of modelo.cabecalho) {
    body[f.campo] = document.getElementById(`cert-${f.campo}`).value.trim()
  }
  return body
}

function validarCertificadoLista(body, exigirEmissao) {
  const modelo = modelosLista[body.tipo]
  const rotuloNavio = modelo.cabecalho.find(f => f.campo === 'navio')?.rotulo || 'Navio'
  if (!body.empresaId || !body.navio) {
    alert(`Empresa e ${rotuloNavio} são obrigatórios.`)
    return false
  }
  if (exigirEmissao && (!body.dataEmissao || !body.validade)) {
    alert(`Data e ${modelo.validade.rotulo} são obrigatórias para emitir o certificado.`)
    return false
  }
  if (exigirEmissao && body.itens.length === 0) {
    alert('Adicione pelo menos um item antes de emitir.')
    return false
  }
  return true
}

window.criarCertificadoLista = async function () {
  const body = lerFormularioCertificadoLista()
  if (!validarCertificadoLista(body, false)) return

  const res = await apiJson(`${API}/certificados`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    const certificado = await res.json()
    alert('Certificado criado com sucesso!')
    window.abrirCertificado(certificado.id)
  } else {
    const err = await res.json()
    alert('Erro ao criar certificado: ' + (err.erro || 'falha'))
  }
}

window.atualizarCertificadoLista = async function (id) {
  const body = lerFormularioCertificadoLista()
  if (!validarCertificadoLista(body, false)) return

  const res = await apiJson(`${API}/certificados/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Certificado atualizado com sucesso!')
    window.abrirCertificado(id)
  } else {
    const err = await res.json()
    alert('Erro ao atualizar certificado: ' + (err.erro || 'falha'))
  }
}

window.emitirCertificadoLista = async function (id) {
  const body = lerFormularioCertificadoLista()
  if (!validarCertificadoLista(body, true)) return
  if (!confirm('Emitir este certificado?')) return

  const res = await apiJson(`${API}/certificados/${id}/emitir`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Certificado emitido com sucesso!')
    window.abrirCertificado(id)
  } else {
    const err = await res.json()
    alert('Erro ao emitir certificado: ' + (err.erro || 'falha'))
  }
}
