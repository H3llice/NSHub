import { esc } from './html.js'
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

// ══════════════════════════════════════════════════════════════════════════
// RELATÓRIOS DE SERVIÇO DE BALSAS (Serviços → Relatórios)
// ══════════════════════════════════════════════════════════════════════════

// Data de hoje no fuso do navegador — new Date().toISOString() usa UTC, então
// perto da meia-noite (fuso do Brasil, UTC-3) já viraria o dia seguinte.
export function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const tokenAtual = localStorage.getItem('ns_token')
const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
const perfil = usuarioAtual?.perfil || 'usuario'
// Cancelar/excluir é restrito a gerente/admin, mesma regra do Certificado
// (js/modules/certificados.js).
const podeCancelarOuExcluirRelatorio = perfil === 'admin' || perfil === 'gerente'

const STATUS_LABEL = {
  preenchendo: { texto: 'Preenchendo', cor: '#6c757d' },
  concluido: { texto: 'Concluído', cor: '#198754' },
  cancelado: { texto: 'Cancelado', cor: '#dc3545' },
}
const STATUS_CERTIFICADO_LABEL = {
  pendente: { texto: 'Certificado pendente', cor: '#fd7e14' },
  emitido: { texto: 'Certificado emitido', cor: '#198754' },
  migrado: { texto: 'Certificado migrado', cor: '#0d6efd' },
}

function badgeStatus(status) {
  const s = STATUS_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${esc(s.texto)}</span>`
}
function badgeStatusCertificado(status) {
  const s = STATUS_CERTIFICADO_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${esc(s.texto)}</span>`
}

// Itens do kit de sobrevivência (Lista de Verificação e Reparos) — cada um tem
// quantidade / substituído / validade; racoesSolidas e racoesLiquidas têm um
// campo extra (peso/volume). Mesma lista da aba "Relatorio de Serviço" do papel.
const KIT_ITENS = [
  { key: 'foguetes', label: 'Foguetes paraquedas' },
  { key: 'fachos', label: 'Fachos luminosos manuais' },
  { key: 'fumigeno', label: 'Fumígeno laranja flutuante' },
  { key: 'pilhas', label: 'Pilhas sobressalentes' },
  { key: 'racoesSolidas', label: 'Rações sólidas', extraKey: 'pesoGramas', extraLabel: 'Peso (g)' },
  { key: 'racoesLiquidas', label: 'Rações líquidas', extraKey: 'volumeMl', extraLabel: 'Volume (ml)' },
  { key: 'medicamentos', label: 'Estojo de medicamentos' },
  { key: 'pesca', label: 'Estojo de pesca' },
  { key: 'reparos', label: 'Estojo de reparos' },
  { key: 'enjoo', label: 'Comprimidos contra enjoo' },
  { key: 'bateriaResgate', label: 'Luz de Resgate' },
]

// Quantidades padrão do kit de sobrevivência, levantadas a partir dos
// certificados de balsa antigos (backend/migracao/certificados) — foguetes,
// fachos, fumígeno, pilhas e os 3 estojos+luz de resgate são fixos, não
// dependem da capacidade da balsa. Rações líquidas e comprimidos contra
// enjoo escalam 2x a capacidade (bateu em quase todos os certificados
// analisados); rações sólidas fica perto de capacidade/3, com variação maior
// entre os certificados reais. Só usado pra sugerir valor inicial num
// certificado novo — o técnico sempre pode corrigir.
const KIT_QTD_PADRAO_FIXO = {
  foguetes: 2, fachos: 3, fumigeno: 1, pilhas: 4,
  medicamentos: 1, pesca: 1, reparos: 1, bateriaResgate: 1,
}

export function calcularQuantidadesPadraoKit(capacidade) {
  const cap = parseInt(capacidade, 10)
  const porCapacidade = cap > 0 ? {
    racoesSolidas: Math.round(cap / 3),
    racoesLiquidas: cap * 2,
    enjoo: cap * 2,
  } : {}
  return { ...KIT_QTD_PADRAO_FIXO, ...porCapacidade }
}

// Preenche os campos de quantidade do kit já renderizados na tela — chamada
// ao abrir um certificado novo (do zero) e de novo sempre que a capacidade
// mudar. Só toca no campo de quantidade; substituído/validade continuam em
// branco pro técnico preencher à mão.
export function preencherQuantidadesPadraoKit(capacidade) {
  const padrao = calcularQuantidadesPadraoKit(capacidade)
  KIT_ITENS.forEach(item => {
    if (padrao[item.key] === undefined) return
    const el = document.getElementById(`rel-kit-${item.key}-qtd`)
    if (el) el.value = padrao[item.key]
  })
}

// Checklist de componentes — só verificado sim/não
const COMPONENTES = [
  ['ancoraFlutuante', 'Âncora flutuante sobressalente'],
  ['remos', 'Remos'],
  ['quadroSinais', 'Quadro de sinais'],
  ['facaCaboFlutuante', 'Faca com cabo flutuante'],
  ['espelhoSinalizacao', 'Espelho de sinalização'],
  ['copoGraduado', 'Copo graduado'],
  ['aroFlutuante', 'Aro flutuante'],
  ['jarrosAgua', "Jarros d'água"],
  ['documentacao', 'Documentação'],
  ['lanternaEstanque', 'Lanterna estanque'],
  ['apito', 'Apito'],
  ['protecaoTermica', 'Proteção térmica (regra 34)'],
  ['esponja', 'Esponja'],
  ['refletorRadar', 'Refletor radar'],
  ['abridorLatas', 'Abridor de latas'],
  ['foleManual', 'Fole manual'],
]

// Teste de flutuadores (resumo) — realizado sim/não + valor
const TESTES_FLUTUADOR = [
  ['nap', 'Pressão adicional necessária (NAP)'],
  ['wp', 'Pressão de trabalho (WP)'],
  ['gi', 'Enchimento com gás (GI)'],
  ['fs', 'Costuras, piso e flutuadores (FS)'],
  ['ol', 'Teste de sobrecarga / Davit (OL)'],
]

// Página 3 do PDF — checklist "RELATÓRIO DE SERVIÇO DE BALSAS" (documento
// avulso migrado, backend/migracao/RELATÓRIO DE SERVIÇOS DE BALSA.docx),
// mesma ordem e mesmas chaves do backend (routes/relatorios.js).
const SERVICOS_BALSA = [
  ['servRevisaoTesteBalsa', 'REVISÃO DE TESTE DE BALSA'],
  ['servLimpezaBalsa', 'LIMPEZA DE BALSA'],
  ['servTransporteManipulacao', 'TRANSPORTE C/ MANIPULAÇÃO DA BALSA'],
  ['servTratamentoSilicone', 'TRATAMENTO C/ SILICONE'],
  ['servEmissaoLogCard', 'EMISSÃO DE LOG CARD'],
  ['servEmissaoCertificadoBalsa', 'EMISSÃO DE CERTIFICADO DA BALSA'],
  ['servAparelhagemCasulo', 'APARELHAGEM DO CASULO'],
  ['servPinturaCasulo', 'PINTURA DO CASULO'],
  ['servReparoCasulo', 'REPARO DO CASULO'],
  ['servRevisaoValvulaHidrostatica', 'REVISÃO, TESTE E AJUSTAGEM DA VÁLVULA HIDROSTÁTICA'],
  ['servReparoValvula', 'REPARO DA VÁLVULA'],
  ['servPinturaValvulaHidrostatica', 'PINTURA DA VÁLVULA HIDROSTÁTICA'],
  ['servTestePressaoHidrostaticaCilindro', 'TESTE DE PRESSÃO HIDROSTÁTICA DO CILINDRO'],
  ['servPinturaCilindro', 'PINTURA DO CILINDRO'],
  ['servTesteCabecaDisparoCilindro', 'TESTE DA CABEÇA DO DISPARO DO CILINDRO'],
  ['servRecargaCilindro', 'RECARGA DO CILINDRO'],
  ['servIdContainer', 'ID CONTAINER'],
  ['servReparoBerco', 'REPARO NO BERÇO'],
  ['servPinturaBerco', 'PINTURA NO BERÇO'],
  ['servHorasExtras', 'HORAS EXTRAS'],
  ['servReparoBalsaPequeno', 'REPARO DE BALSA PEQUENO'],
  ['servReparoBalsaMedio', 'REPARO DE BALSA MÉDIO'],
  ['servReparoBalsaGrande', 'REPARO DE BALSA GRANDE'],
]

export function inicializarRelatorios() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')

  document.getElementById('relatorios').innerHTML = `
    <div class="tab">Relatórios de Serviço</div>
    <p style="color:#999; font-size:13px;">Todo relatório é gerado a partir de uma Ordem de Serviço — abra Serviços → Ordens de serviço.</p>

    <div style="display:flex; gap:8px; align-items:center; margin-bottom: 8px; flex-wrap:wrap;">
      <select id="rel-tipo-ativo" class="form-control" style="max-width:200px;" onchange="trocarTipoRelatorio()">
        <option value="balsa">Balsa</option>
        <option value="baleeira">Baleeira</option>
        <option value="turco">Turco</option>
        <option value="colete">Colete</option>
        <option value="tecnico">Relatório técnico (timbrado)</option>
      </select>
      <button class="btn btn-secondary" onclick="novoRelatorioTipoAtivo()">+ Novo Relatório</button>
    </div>

    <div class="table-scroll">
      <table class="table-certificados" style="margin-top:16px; table-layout:fixed;">
        <thead>
          <tr id="cabecalho-relatorios">${cabecalhoRelatorios('balsa')}</tr>
        </thead>
        <tbody id="tabela-relatorios">
          <tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
        </tbody>
      </table>
    </div>
    <div id="contador-relatorios" style="margin-top:12px;"></div>
  `

  carregarRelatorios()
}

let paginaAtualRelatorios = 1

const LABEL_TIPO_RELATORIO = { balsa: 'balsa', baleeira: 'baleeira', turco: 'turco', colete: 'colete', tecnico: 'relatório técnico' }

// Relatório timbrado não tem armador, e vários saem pra mesma plataforma — o
// que diferencia um do outro é o nº do certificado e o título.
function cabecalhoRelatorios(tipo) {
  const colunas = tipo === 'tecnico'
    ? [['Certificado Nº', 110], ['Plataforma', 120], ['Título', 300]]
    : [['Nº', 90], ['Navio', 180], ['Armador', 160]]
  return `
    ${colunas.map(([nome, largura]) => `<th style="width:${largura}px;">${nome}</th>`).join('')}
    <th style="width:100px;">Data</th>
    <th style="width:110px;">Status</th>
    <th class="col-acoes" style="width:260px;">Ações</th>
  `
}

function colunasIdentificacaoRelatorio(r, tipo) {
  const abrir = `style="cursor:pointer;" onclick="editarRelatorio(${r.id})"`
  if (tipo === 'tecnico') {
    return `
      <td ${abrir}>${esc(r.conteudo?.certificadoNumero || '-')}</td>
      <td ${abrir}>${esc(r.navio || '-')}</td>
      <td ${abrir}>${esc((r.conteudo?.titulo || '-').replace(/\s+/g, ' '))}</td>
    `
  }
  return `
    <td ${abrir}>${r.numero}/${r.ano}</td>
    <td ${abrir}>${esc(r.navio || r.embarcacao?.nome || '-')}</td>
    <td>${esc(r.armador || r.embarcacao?.armador?.nome || r.embarcacao?.armadorNome || '-')}</td>
  `
}

// Cada tipo de equipamento (Balsa/Baleeira/Turco/Colete) tem sua própria
// tabela — o select #rel-tipo-ativo escolhe qual, igual à tela de Certificados.
window.trocarTipoRelatorio = function () {
  carregarRelatorios(1)
}

window.novoRelatorioTipoAtivo = async function () {
  const tipo = document.getElementById('rel-tipo-ativo')?.value || 'balsa'
  if (tipo === 'tecnico') return novoRelatorioTecnico()
  if (tipo !== 'balsa') {
    alert(`Formulário de Relatório de ${LABEL_TIPO_RELATORIO[tipo]} ainda não implementado.`)
    return
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')

  cilindrosEstado = [{}]
  cilindrosSomenteLeitura = false
  const empresas = await apiFetch(`${API}/empresas`).then(r => r.json())

  document.getElementById('relatorios').innerHTML = renderFormularioRelatorio(null, empresas)
  renderizarCilindros()
  preencherQuantidadesPadraoKit(undefined)
}

window.carregarRelatorios = async function (pagina = 1) {
  paginaAtualRelatorios = pagina
  const tipo = document.getElementById('rel-tipo-ativo')?.value || 'balsa'
  document.getElementById('cabecalho-relatorios').innerHTML = cabecalhoRelatorios(tipo)
  try {
    const resp = await apiFetch(`${API}/relatorios?pagina=${pagina}&tipo=${tipo}`).then(r => r.json())
    const tabela = document.getElementById('tabela-relatorios')

    const contador = document.getElementById('contador-relatorios')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${resp.total || 0} relatórios encontrados</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarRelatorios(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${resp.totalPaginas || 1}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarRelatorios(${pagina + 1})" ${pagina >= (resp.totalPaginas || 1) ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }

    if (resp.relatorios.length === 0) {
      tabela.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Nenhum relatório de ${LABEL_TIPO_RELATORIO[tipo]} encontrado</td></tr>`
      return
    }

    tabela.innerHTML = resp.relatorios.map(r => `
      <tr>
        ${colunasIdentificacaoRelatorio(r, tipo)}
        <td>${new Date(r.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
        <td>${badgeStatus(r.status)}</td>
        <td class="col-acoes">
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <button class="btn btn-sm btn-info" onclick="editarRelatorio(${r.id})">${r.status === 'preenchendo' ? 'Editar' : 'Ver'}</button>
            <a class="btn btn-sm btn-secondary" href="${API}/relatorios/${r.id}/pdf?token=${encodeURIComponent(tokenAtual)}" target="_blank">PDF</a>
            ${podeCancelarOuExcluirRelatorio && !r.certificado ? `
              ${r.status !== 'cancelado' ? `<button class="btn btn-sm btn-warning" onclick="cancelarRelatorio(${r.id})">Cancelar</button>` : ''}
              <button class="btn btn-sm btn-danger" onclick="excluirRelatorio(${r.id})">Excluir</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('')
  } catch {
    document.getElementById('tabela-relatorios').innerHTML = `
      <tr><td colspan="6" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

// ─── Formulário (criar / editar) ────────────────────────────────────────────────

let cilindrosEstado = []
let cilindrosSomenteLeitura = false

// Relatório sempre nasce de uma OS — gera o form já preenchido com os dados dela
// (embarcação + equipamento), que o técnico pode ajustar antes de salvar.
window.gerarRelatorioDeOS = async function (ordemServicoId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')

  cilindrosEstado = [{}]
  cilindrosSomenteLeitura = false
  const [os, empresas] = await Promise.all([
    apiFetch(`${API}/ordens-servico/${ordemServicoId}`).then(r => r.json()),
    apiFetch(`${API}/empresas`).then(r => r.json())
  ])

  if (os.relatorio) {
    alert('Essa Ordem de Serviço já tem um relatório gerado.')
    editarRelatorio(os.relatorio.id)
    return
  }

  const preenchido = {
    ordemServicoId: os.id,
    empresaId: os.empresaId,
    embarcacaoId: os.embarcacaoId,
    embarcacao: os.embarcacao,
    navio: os.embarcacao?.nome || '',
    armador: os.embarcacao?.armador?.nome || os.embarcacao?.armadorNome || '',
    portoRegistro: os.embarcacao?.portoRegistro || '',
    equipTipo: os.equipModelo || '',
    equipNumeroSerie: os.equipNumeroSerie || '',
    equipFabricante: os.equipMarca || '',
  }

  document.getElementById('relatorios').innerHTML = renderFormularioRelatorio(preenchido, empresas)
  renderizarCilindros()
  // Relatório do zero — sugere as quantidades padrão do kit (mesma lógica do Certificado).
  preencherQuantidadesPadraoKit(preenchido.equipCapacidade)
}

window.atualizarQuantidadesPadraoRelatorio = function () {
  preencherQuantidadesPadraoKit(document.getElementById('rel-equipCapacidade').value)
}

window.editarRelatorio = async function (id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')

  const [r, empresas] = await Promise.all([
    apiFetch(`${API}/relatorios/${id}`).then(res => res.json()),
    apiFetch(`${API}/empresas`).then(res => res.json())
  ])
  if (r.modelo) return abrirFormularioRelatorioTecnico(r, empresas)

  cilindrosEstado = r.cilindros.length ? r.cilindros : [{}]
  cilindrosSomenteLeitura = r.status === 'concluido'
  document.getElementById('relatorios').innerHTML = renderFormularioRelatorio(r, empresas)
  renderizarCilindros()
}

function secao(titulo, conteudoHtml) {
  return `
    <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
      <div style="font-weight:700; color:var(--acento); margin-bottom:10px;">${titulo}</div>
      ${conteudoHtml}
    </div>
  `
}

// Seções técnicas do relatório (o que vira a "segunda página" do PDF do
// Certificado) — extraídas pra serem reaproveitadas também na tela de edição
// do Certificado (js/modules/certificados.js), que edita o Relatório de
// origem por baixo dos panos.
export function renderSecoesTecnicasRelatorio(r, somenteLeitura, opcoes = {}) {
  const { incluirTesteImo = true, incluirServicosBalsa = true, nomeTecnicoDefault = '' } = opcoes
  const dis = somenteLeitura ? 'disabled' : ''
  const imo = r?.testeImo || {}

  // Mesmo agrupamento em 3 colunas (6/6/4) do PDF (COMPONENTES_COLUNAS no
  // backend) — a lista já nasce nessa ordem, só a exibição em grid de 4
  // colunas "por linha" que espalhava âncora/remos em linhas diferentes.
  const COMPONENTES_COLUNAS_UI = [COMPONENTES.slice(0, 6), COMPONENTES.slice(6, 12), COMPONENTES.slice(12, 16)]

  // O papel só tem UM campo de valor de teste (ex: 130mmHg), ao lado da
  // temperatura — não um por teste. O PDF já lê só o primeiro valor
  // preenchido entre os 5; aqui replicamos isso pra edição.
  const valorTesteFlutuador = TESTES_FLUTUADOR.map(([key]) => r?.[`${key}Valor`]).find(v => v !== null && v !== undefined && v !== '')

  return `
      ${secao('Lista de Verificação e Reparos', `
        <div class="table-scroll">
          <table class="table-certificados">
            <thead><tr><th>Item</th><th>Qtd</th><th>Extra</th><th>Substituído</th><th>Validade</th></tr></thead>
            <tbody>
              ${KIT_ITENS.map(item => `
                <tr>
                  <td>${item.label}</td>
                  <td style="width:80px;"><input type="number" min="0" class="form-control form-control-sm" id="rel-kit-${item.key}-qtd" value="${r?.[`${item.key}Qtd`] ?? ''}" ${dis}></td>
                  <td style="width:120px;">${item.extraKey ? `<input type="number" min="0" step="0.01" class="form-control form-control-sm" placeholder="${item.extraLabel}" id="rel-kit-${item.key}-extra" value="${r?.[`${item.key}${item.extraKey.charAt(0).toUpperCase()}${item.extraKey.slice(1)}`] ?? ''}" ${dis}>` : ''}</td>
                  <td style="width:60px; text-align:center;"><input type="checkbox" id="rel-kit-${item.key}-substituido" ${r?.[`${item.key}Substituido`] ? 'checked' : ''} ${dis}></td>
                  <td style="width:150px;"><input type="text" class="form-control form-control-sm" placeholder="Ex: 05/2027" id="rel-kit-${item.key}-validade" value="${esc(r?.[`${item.key}Validade`] || '')}" ${dis}></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `)}

      ${secao('Checklist de Componentes', `
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
          ${COMPONENTES_COLUNAS_UI.map(coluna => `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${coluna.map(([key, label]) => `
                <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
                  <input type="checkbox" id="rel-check-${key}" ${r?.[key] ? 'checked' : ''} ${dis}>
                  ${label}
                </label>
              `).join('')}
            </div>
          `).join('')}
        </div>
      `)}

      ${secao('Teste de Flutuadores', `
        <div class="table-scroll">
          <table class="table-certificados" style="min-width:0;">
            <thead><tr><th>Teste</th><th>Realizado</th></tr></thead>
            <tbody>
              ${TESTES_FLUTUADOR.map(([key, label]) => `
                <tr>
                  <td>${label}</td>
                  <td style="width:80px; text-align:center;"><input type="checkbox" id="rel-teste-${key}-realizado" ${r?.[`${key}Realizado`] ? 'checked' : ''} ${dis}></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:flex; gap:16px; margin-top:8px;">
          <div style="max-width:200px;"><label>Valor</label><input type="number" step="0.01" class="form-control" id="rel-teste-valor" value="${valorTesteFlutuador ?? ''}" ${dis}></div>
          <div style="max-width:200px;"><label>Temperatura</label><input type="text" id="rel-temperatura" class="form-control" value="${esc(r?.temperatura || '')}" ${dis}></div>
        </div>
      `)}

      ${secao('Cilindros', `
        <div class="table-scroll">
          <table class="table-certificados">
            <thead><tr><th>Nº</th><th>Nº Válvula</th><th>Teste</th><th>Carga (kg)</th><th>Carga CO2 (kg)</th><th>Carga N2 (kg)</th><th>Fabricante</th><th>Ano Fab.</th>${somenteLeitura ? '' : '<th></th>'}</tr></thead>
            <tbody id="lista-cilindros"></tbody>
          </table>
        </div>
        ${somenteLeitura ? '' : '<button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="adicionarCilindro()">+ Cilindro</button>'}
      `)}

      ${secao('Cabo de Disparo', `
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
          <div><label>Cabo Interno (m)</label><input type="number" step="0.01" class="form-control" id="rel-caboInternoMetros" value="${esc(r?.caboInternoMetros ?? '')}" ${dis}></div>
          <div><label>Cabo Externo (m)</label><input type="number" step="0.01" class="form-control" id="rel-caboExternoMetros" value="${esc(r?.caboExternoMetros ?? '')}" ${dis}></div>
          <div><label>Altura Máx. de Estocagem (m)</label><input type="number" step="0.01" class="form-control" id="rel-alturaMaximaEstocagemMetros" value="${esc(r?.alturaMaximaEstocagemMetros ?? '')}" ${dis}></div>
        </div>
      `)}

      ${secao('Casulo (Reparo / Pintura)', `
        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:16px; margin-bottom:12px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
            <input type="checkbox" id="rel-casulo-reparo" ${r?.casuloReparo ? 'checked' : ''} ${dis}>
            Reparo de fibra
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
            <input type="checkbox" id="rel-casulo-pintura" ${r?.casuloPintura ? 'checked' : ''} ${dis}>
            Pintura
          </label>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
          <div><label>Nº Válvula de Liberação</label><input type="text" class="form-control" id="rel-casulo-valvulaNumero" value="${esc(r?.casuloValvulaNumero || '')}" ${dis}></div>
          <div><label>Fabricante</label><input type="text" class="form-control" id="rel-casulo-valvulaFabricante" value="${esc(r?.casuloValvulaFabricante || '')}" ${dis}></div>
          <div><label>Validade</label><input type="text" class="form-control" placeholder="Ex: 05/2027" id="rel-casulo-valvulaValidade" value="${esc(r?.casuloValvulaValidade || '')}" ${dis}></div>
        </div>
      `)}

      ${!incluirTesteImo ? '' : secao('Testes IMO — Resolução A.761(18)', `
        <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:12px;">
          <strong>WP — Teste de Pressão de Trabalho</strong>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:8px;">
            <label><input type="checkbox" id="imo-wpRealizado" ${imo.wpRealizado ? 'checked' : ''} ${dis}> Realizado</label>
            <label><input type="checkbox" id="imo-wpAnual" ${imo.wpAnual ? 'checked' : ''} ${dis}> Teste anual</label>
          </div>
          <div style="display:grid; grid-template-columns:repeat(6,1fr); gap:8px; margin-top:8px; font-size:12px;">
            <div>Sup. Início Temp<input type="text" class="form-control form-control-sm" id="imo-wpSupInicioTemp" value="${esc(imo.wpSupInicioTemp || '')}" ${dis}></div>
            <div>Sup. Início mmHg<input type="number" class="form-control form-control-sm" id="imo-wpSupInicioPressao" value="${esc(imo.wpSupInicioPressao ?? '')}" ${dis}></div>
            <div>Sup. Término Temp<input type="text" class="form-control form-control-sm" id="imo-wpSupTerminoTemp" value="${esc(imo.wpSupTerminoTemp || '')}" ${dis}></div>
            <div>Sup. Término mmHg<input type="number" class="form-control form-control-sm" id="imo-wpSupTerminoPressao" value="${esc(imo.wpSupTerminoPressao ?? '')}" ${dis}></div>
            <div>Sup. Diff<input type="number" class="form-control form-control-sm" id="imo-wpSupDiff" value="${esc(imo.wpSupDiff ?? '')}" ${dis}></div>
            <div>Sup. Diff %<input type="number" class="form-control form-control-sm" id="imo-wpSupDiffPct" value="${esc(imo.wpSupDiffPct ?? '')}" ${dis}></div>
            <div>Inf. Início Temp<input type="text" class="form-control form-control-sm" id="imo-wpInfInicioTemp" value="${esc(imo.wpInfInicioTemp || '')}" ${dis}></div>
            <div>Inf. Início mmHg<input type="number" class="form-control form-control-sm" id="imo-wpInfInicioPressao" value="${esc(imo.wpInfInicioPressao ?? '')}" ${dis}></div>
            <div>Inf. Término Temp<input type="text" class="form-control form-control-sm" id="imo-wpInfTerminoTemp" value="${esc(imo.wpInfTerminoTemp || '')}" ${dis}></div>
            <div>Inf. Término mmHg<input type="number" class="form-control form-control-sm" id="imo-wpInfTerminoPressao" value="${esc(imo.wpInfTerminoPressao ?? '')}" ${dis}></div>
            <div>Inf. Diff<input type="number" class="form-control form-control-sm" id="imo-wpInfDiff" value="${esc(imo.wpInfDiff ?? '')}" ${dis}></div>
            <div>Inf. Diff %<input type="number" class="form-control form-control-sm" id="imo-wpInfDiffPct" value="${esc(imo.wpInfDiffPct ?? '')}" ${dis}></div>
          </div>
        </div>

        <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:12px;">
          <strong>GI — Teste de Enchimento com Gás</strong>
          <div style="margin-top:8px;"><label><input type="checkbox" id="imo-giRealizado" ${imo.giRealizado ? 'checked' : ''} ${dis}> Realizado</label></div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; font-size:12px;">
            <div>Pressão Máx. Sup. (mmHg)<input type="number" class="form-control form-control-sm" id="imo-giPressaoMaxSuperior" value="${esc(imo.giPressaoMaxSuperior ?? '')}" ${dis}></div>
            <div>Pressão Máx. Inf. (mmHg)<input type="number" class="form-control form-control-sm" id="imo-giPressaoMaxInferior" value="${esc(imo.giPressaoMaxInferior ?? '')}" ${dis}></div>
            <div style="align-self:end;"><label><input type="checkbox" id="imo-giTuboSuperiorOk" ${imo.giTuboSuperiorOk ? 'checked' : ''} ${dis}> Tubo superior OK</label></div>
            <div style="align-self:end;"><label><input type="checkbox" id="imo-giTuboInferiorOk" ${imo.giTuboInferiorOk ? 'checked' : ''} ${dis}> Tubo inferior OK</label></div>
          </div>
        </div>

        <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:12px;">
          <strong>NAP — Pressão Adicional Necessária</strong>
          <div style="margin-top:8px;"><label><input type="checkbox" id="imo-napRealizado" ${imo.napRealizado ? 'checked' : ''} ${dis}> Realizado</label></div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; font-size:12px;">
            <div>Sup. Início<input type="number" class="form-control form-control-sm" id="imo-napSupInicio" value="${esc(imo.napSupInicio ?? '')}" ${dis}></div>
            <div>Sup. Término<input type="number" class="form-control form-control-sm" id="imo-napSupTermino" value="${esc(imo.napSupTermino ?? '')}" ${dis}></div>
            <div>Sup. Diff<input type="number" class="form-control form-control-sm" id="imo-napSupDiff" value="${esc(imo.napSupDiff ?? '')}" ${dis}></div>
            <div>Sup. Diff %<input type="number" class="form-control form-control-sm" id="imo-napSupDiffPct" value="${esc(imo.napSupDiffPct ?? '')}" ${dis}></div>
            <div>Inf. Início<input type="number" class="form-control form-control-sm" id="imo-napInfInicio" value="${esc(imo.napInfInicio ?? '')}" ${dis}></div>
            <div>Inf. Término<input type="number" class="form-control form-control-sm" id="imo-napInfTermino" value="${esc(imo.napInfTermino ?? '')}" ${dis}></div>
            <div>Inf. Diff<input type="number" class="form-control form-control-sm" id="imo-napInfDiff" value="${esc(imo.napInfDiff ?? '')}" ${dis}></div>
            <div>Inf. Diff %<input type="number" class="form-control form-control-sm" id="imo-napInfDiffPct" value="${esc(imo.napInfDiffPct ?? '')}" ${dis}></div>
          </div>
          <div style="display:flex; gap:16px; margin-top:8px;">
            <label><input type="checkbox" id="imo-napRachaduras" ${imo.napRachaduras ? 'checked' : ''} ${dis}> Rachaduras</label>
            <label><input type="checkbox" id="imo-napAberturaCostura" ${imo.napAberturaCostura ? 'checked' : ''} ${dis}> Abertura de costura</label>
          </div>
        </div>

        <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:12px;">
          <strong>FS — Teste de Piso e Costura</strong>
          <div style="display:flex; gap:16px; align-items:center; margin-top:8px;">
            <label><input type="checkbox" id="imo-fsRealizado" ${imo.fsRealizado ? 'checked' : ''} ${dis}> Realizado</label>
            <label><input type="checkbox" id="imo-fsResultadoOk" ${imo.fsResultadoOk ? 'checked' : ''} ${dis}> Resultado satisfatório</label>
          </div>
          <div style="margin-top:8px;"><label>Observações</label><input type="text" class="form-control" id="imo-fsObservacoes" value="${esc(imo.fsObservacoes || '')}" ${dis}></div>
        </div>

        <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:12px;">
          <strong>OL — Teste de Sobrecarga (Davit)</strong>
          <div style="margin-top:8px;"><label><input type="checkbox" id="imo-olRealizado" ${imo.olRealizado ? 'checked' : ''} ${dis}> Realizado</label></div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; font-size:12px;">
            <div>Nº Pessoas<input type="number" class="form-control form-control-sm" id="imo-olPessoasNr" value="${esc(imo.olPessoasNr ?? '')}" ${dis}></div>
            <div>Peso Pessoas (kg)<input type="number" class="form-control form-control-sm" id="imo-olPesoPessoas" value="${esc(imo.olPesoPessoas ?? '')}" ${dis}></div>
            <div>Peso Balsa (kg)<input type="number" class="form-control form-control-sm" id="imo-olPesoBalsa" value="${esc(imo.olPesoBalsa ?? '')}" ${dis}></div>
            <div>Peso Total (kg)<input type="number" class="form-control form-control-sm" id="imo-olPesoTotal" value="${esc(imo.olPesoTotal ?? '')}" ${dis}></div>
          </div>
          <div style="margin-top:8px;"><label>Observações</label><input type="text" class="form-control" id="imo-olObservacoes" value="${esc(imo.olObservacoes || '')}" ${dis}></div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div><label>Técnico Natal Safety</label><input type="text" class="form-control" id="imo-tecnicoNome" value="${esc(imo.tecnicoNome || '')}" ${dis}></div>
          <div><label>Controlado por</label><input type="text" class="form-control" id="imo-controladoPorNome" value="${esc(imo.controladoPorNome || '')}" ${dis}></div>
        </div>
      `)}

      ${!incluirServicosBalsa ? '' : secao('Serviços Realizados (Relatório de Serviço de Balsas)', `
        <table class="table-certificados">
          <thead><tr><th style="width:50px; text-align:center;">Item</th><th>Descrição</th><th style="width:70px; text-align:center;">Sim</th></tr></thead>
          <tbody>
            ${SERVICOS_BALSA.map(([chave, label], i) => `
              <tr>
                <td style="text-align:center;">${i + 1}</td>
                <td>${label}</td>
                <td style="text-align:center;"><input type="checkbox" id="rel-serv-${chave}" ${r?.[chave] ? 'checked' : ''} ${dis}></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top:12px;">
          <label>Observações</label>
          <textarea id="rel-servicosObservacoes" class="form-control" rows="3" ${dis}>${esc(r?.servicosObservacoes || '')}</textarea>
        </div>
      `)}

      ${secao('Revisão Anual e Observações', `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div>
            <label>Revisão Anual</label>
            <div style="display:flex; gap:16px; margin-top:8px;">
              <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="rel-revisaoAnual-ok" ${r?.revisaoAnualOk === true ? 'checked' : ''} ${dis}> OK</label>
              <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="rel-revisaoAnual-sim" ${r?.revisaoAnualOk === true ? 'checked' : ''} ${dis}> SIM</label>
              <label style="display:flex; align-items:center; gap:6px; font-size:13px;"><input type="checkbox" id="rel-revisaoAnual-nao" ${r?.revisaoAnualOk === false ? 'checked' : ''} ${dis}> NÃO</label>
            </div>
          </div>
          <div>
            <label>Técnico responsável <small style="color:#999;">(impresso no rodapé da 2ª página)</small></label>
            <input type="text" id="rel-tecnicoNome" class="form-control" value="${esc(r?.tecnicoNome || nomeTecnicoDefault)}" ${dis}>
          </div>
        </div>
        <div style="margin-top:16px;">
          <label>Observações</label>
          <textarea id="rel-observacoes" class="form-control" rows="3" ${dis}>${esc(r?.observacoes || '')}</textarea>
        </div>
      `)}
  `
}

function renderFormularioRelatorio(r, empresas) {
  const cancelado = r?.status === 'cancelado'
  const concluido = r?.status === 'concluido'
  const somenteLeitura = concluido || cancelado
  const dis = somenteLeitura ? 'disabled' : ''
  const novo = !r?.id
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${r?.empresaId === e.id ? 'selected' : ''}>${esc(e.nome)} (${esc(e.sigla)})</option>`
  ).join('')

  return `
    <div style="margin-top:20px; max-width:1000px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="inicializarRelatorios()">← Voltar</button>
        <div style="display:flex; gap:8px;">
          ${r?.id ? `<a class="btn btn-secondary" href="${API}/relatorios/${r.id}/pdf?token=${encodeURIComponent(tokenAtual)}" target="_blank">PDF</a>` : ''}
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <h3 style="margin:0;">${r?.id ? `Relatório ${r.numero}/${r.ano}` : 'Novo Relatório de Serviço'}</h3>
        ${r?.id ? badgeStatus(r.status) : ''}
      </div>

      <input type="hidden" id="rel-ordemServicoId" value="${esc(r?.ordemServicoId || '')}">

      ${secao('Identificação', `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div><label>Empresa executante *</label><select id="rel-empresaId" class="form-control" ${dis}>${opcoesEmpresas}</select></div>
          <div><label>Data *</label><input type="date" id="rel-data" class="form-control" value="${esc(r?.data ? r.data.split('T')[0] : hojeISO())}" ${dis}></div>
          <div style="position:relative; grid-column: span 2;">
            <label>Embarcação (navio) * <small style="color:#999;">(busca por nome — autopreenche armador e porto; se não achar, digite livremente)</small></label>
            <input type="text" id="rel-embarcacao-busca" class="form-control" placeholder="Digite o nome do navio..."
              value="${esc(r?.navio || r?.embarcacao?.nome || '')}" oninput="buscarEmbarcacaoRelatorio(this.value)" autocomplete="off" ${dis}>
            <div id="sugestoes-embarcacao" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
            <input type="hidden" id="rel-embarcacaoId" value="${esc(r?.embarcacaoId || '')}">
          </div>
          <div><label>Armador</label><input type="text" id="rel-embarcacao-armador" class="form-control" value="${esc(r?.armador || r?.embarcacao?.armador?.nome || r?.embarcacao?.armadorNome || '')}" ${dis}></div>
          <div><label>Porto de Registro</label><input type="text" id="rel-embarcacao-porto" class="form-control" value="${esc(r?.portoRegistro || r?.embarcacao?.portoRegistro || '')}" ${dis}></div>
        </div>
      `)}

      ${secao('Equipamento (balsa atendida)', `
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          <div><label>Equipamento</label><input type="text" id="rel-equipTipo" class="form-control" value="${esc(r?.equipTipo || 'BALSA INFLÁVEL')}" ${dis}></div>
          <div><label>Nº Série</label><input type="text" id="rel-equipNumeroSerie" class="form-control" value="${esc(r?.equipNumeroSerie || '')}" ${dis}></div>
          <div><label>Ano Fabricação</label><input type="text" id="rel-equipAnoFabricacao" class="form-control" placeholder="Ex: 01/2010" value="${esc(r?.equipAnoFabricacao || '')}" ${dis}></div>
          <div><label>Marca/Fabricante</label><input type="text" id="rel-equipFabricante" class="form-control" value="${esc(r?.equipFabricante || '')}" ${dis}></div>
          <div><label>Modelo</label><input type="text" id="rel-equipModelo" class="form-control" value="${esc(r?.equipModelo || '')}" ${dis}></div>
          <div><label>Classe</label><input type="text" id="rel-equipClasse" class="form-control" placeholder="Ex: Classe II Pack B" value="${esc(r?.equipClasse || '')}" ${dis}></div>
          <div><label>Capacidade (pessoas)</label><input type="number" id="rel-equipCapacidade" class="form-control" value="${esc(r?.equipCapacidade ?? '')}" ${novo ? 'onchange="atualizarQuantidadesPadraoRelatorio()"' : ''} ${dis}></div>
          <div><label>Nº Certificado de Revisão anterior</label><input type="text" id="rel-certRevisaoNumero" class="form-control" value="${esc(r?.certRevisaoNumero || '')}" ${dis}></div>
          <div><label>Data de Expedição</label><input type="text" id="rel-certRevisaoDataExpedicao" class="form-control" value="${esc(r?.certRevisaoDataExpedicao || '')}" ${dis}></div>
        </div>
      `)}

      ${renderSecoesTecnicasRelatorio(r, somenteLeitura, { nomeTecnicoDefault: r?.criadoPor?.nome || usuarioAtual?.nome || '' })}

      ${somenteLeitura ? '' : `
        <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div style="display:flex; gap:12px;">
            <button type="button" class="btn btn-success" onclick="${r?.id ? `atualizarRelatorio(${r.id})` : 'salvarRelatorio()'}">Salvar</button>
            ${r?.id ? `<button type="button" class="btn btn-warning" onclick="concluirRelatorio(${r.id})">Concluir e Assinar</button>` : ''}
          </div>
          ${r?.id && podeCancelarOuExcluirRelatorio ? `
            <div style="display:flex; gap:12px;">
              <button type="button" class="btn btn-warning" onclick="cancelarRelatorio(${r.id})">Cancelar Relatório</button>
              <button type="button" class="btn btn-danger" onclick="excluirRelatorio(${r.id})">Excluir Relatório</button>
            </div>
          ` : ''}
        </div>
      `}

      ${cancelado ? `
        <p style="margin-bottom:16px; color:#dc3545; font-size:13px; font-weight:600;">Relatório cancelado.</p>
        ${podeCancelarOuExcluirRelatorio ? `<button type="button" class="btn btn-danger" onclick="excluirRelatorio(${r.id})">Excluir Relatório</button>` : ''}
      ` : concluido ? `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            ${!r.certificado
              ? `<button type="button" class="btn btn-warning" onclick="gerarCertificadoDeRelatorio(${r.id})">Gerar Certificado</button>`
              : `<button type="button" class="btn btn-secondary" onclick="abrirCertificado(${r.certificado.id})">Ver Certificado</button> ${badgeStatusCertificado(r.certificado.status)}`
            }
          </div>
          ${podeCancelarOuExcluirRelatorio && !r.certificado ? `
            <div style="display:flex; gap:12px;">
              <button type="button" class="btn btn-warning" onclick="cancelarRelatorio(${r.id})">Cancelar Relatório</button>
              <button type="button" class="btn btn-danger" onclick="excluirRelatorio(${r.id})">Excluir Relatório</button>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `
}

// ─── Autocomplete de Embarcação ─────────────────────────────────────────────────

window.buscarEmbarcacaoRelatorio = async function (q) {
  const div = document.getElementById('sugestoes-embarcacao')
  document.getElementById('rel-embarcacaoId').value = ''

  if (q.length < 2) {
    div.style.display = 'none'
    return
  }

  const results = await apiFetch(`${API}/embarcacoes/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())

  if (results.length === 0) {
    div.innerHTML = `<div style="padding:8px 12px; color:#999;">Nenhuma embarcação encontrada — pode digitar livremente (armador e porto ficam como texto do relatório)</div>`
    div.style.display = 'block'
    return
  }

  div.style.display = 'block'
  div.innerHTML = results.map(e => `
    <div onclick="selecionarEmbarcacaoRelatorio(${esc(JSON.stringify(e))})"
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${esc(e.nome)}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${esc(e.armador?.nome || e.armadorNome || '')}</span>
    </div>
  `).join('')
}

window.selecionarEmbarcacaoRelatorio = function (e) {
  document.getElementById('rel-embarcacao-busca').value = e.nome
  document.getElementById('rel-embarcacaoId').value = e.id
  document.getElementById('rel-embarcacao-armador').value = e.armador?.nome || e.armadorNome || ''
  document.getElementById('rel-embarcacao-porto').value = e.portoRegistro || ''
  document.getElementById('sugestoes-embarcacao').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('sugestoes-embarcacao')
  if (div && !div.contains(e.target) && e.target.id !== 'rel-embarcacao-busca') {
    div.style.display = 'none'
  }
})

// ─── Cilindros (tabela dinâmica) ────────────────────────────────────────────────

// Reaproveitada pela tela do Certificado pra preparar o estado da tabela de
// cilindros antes de renderizar a seção técnica embutida (ver
// renderSecoesTecnicasRelatorio em js/modules/certificados.js).
export function prepararCilindros(lista, somenteLeitura = false) {
  cilindrosEstado = lista && lista.length ? lista : [{}]
  cilindrosSomenteLeitura = somenteLeitura
}

export function renderizarCilindros() {
  const tbody = document.getElementById('lista-cilindros')
  if (!tbody) return
  const dis = cilindrosSomenteLeitura ? 'disabled' : ''

  tbody.innerHTML = cilindrosEstado.map((c, i) => `
    <tr>
      <td><input type="text" class="form-control form-control-sm" id="cil-numero-${i}" value="${esc(c.numero || '')}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-valvulaNumero-${i}" value="${esc(c.valvulaNumero || '')}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-teste-${i}" value="${esc(c.teste || '')}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-carga-${i}" value="${esc(c.carga ?? '')}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-cargaCO2-${i}" value="${esc(c.cargaCO2 ?? '')}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-cargaN2-${i}" value="${esc(c.cargaN2 ?? '')}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-fabricante-${i}" value="${esc(c.fabricante || '')}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-anoFabricacao-${i}" value="${esc(c.anoFabricacao || '')}" ${dis}></td>
      ${cilindrosSomenteLeitura ? '' : `<td><button class="btn btn-sm btn-danger" onclick="removerCilindro(${i})">✕</button></td>`}
    </tr>
  `).join('')
}

window.adicionarCilindro = function () {
  cilindrosEstado = lerCilindrosDoForm()
  cilindrosEstado.push({})
  renderizarCilindros()
}

window.removerCilindro = function (i) {
  cilindrosEstado = lerCilindrosDoForm()
  cilindrosEstado.splice(i, 1)
  renderizarCilindros()
}

function lerCilindrosDoForm() {
  const campos = ['numero', 'valvulaNumero', 'teste', 'carga', 'cargaCO2', 'cargaN2', 'fabricante', 'anoFabricacao']
  const numericos = ['carga', 'cargaCO2', 'cargaN2']

  return cilindrosEstado.map((_, i) => {
    const c = {}
    campos.forEach(campo => {
      const el = document.getElementById(`cil-${campo}-${i}`)
      if (!el) return
      const valor = el.value
      c[campo] = valor === '' ? null : (numericos.includes(campo) ? parseFloat(valor) : valor)
    })
    return c
  })
}

// ─── Leitura do formulário ──────────────────────────────────────────────────────

// Lê as seções técnicas (kit, componentes, testes de flutuador, cilindros,
// testes IMO, revisão anual + observações do relatório) — reaproveitado tanto
// pelo formulário do Relatório quanto pela tela do Certificado, que edita
// essas mesmas seções ("segunda página" do PDF) por baixo dos panos.
export function lerCamposTecnicosRelatorio() {
  const body = {
    temperatura: document.getElementById('rel-temperatura').value,
    observacoes: document.getElementById('rel-observacoes').value,
    tecnicoNome: document.getElementById('rel-tecnicoNome').value,
  }

  // 3 checkboxes independentes (pode marcar mais de um, igual no papel) —
  // OK e SIM marcam o mesmo estado no banco (aprovado), NÃO marca reprovado;
  // sem nenhum marcado fica sem informar.
  const revisaoOk = document.getElementById('rel-revisaoAnual-ok').checked
  const revisaoSim = document.getElementById('rel-revisaoAnual-sim').checked
  const revisaoNao = document.getElementById('rel-revisaoAnual-nao').checked
  body.revisaoAnualOk = revisaoNao ? false : ((revisaoOk || revisaoSim) ? true : null)

  KIT_ITENS.forEach(item => {
    body[`${item.key}Qtd`] = document.getElementById(`rel-kit-${item.key}-qtd`).value
    body[`${item.key}Substituido`] = document.getElementById(`rel-kit-${item.key}-substituido`).checked
    body[`${item.key}Validade`] = document.getElementById(`rel-kit-${item.key}-validade`).value
    if (item.extraKey) {
      const chave = `${item.key}${item.extraKey.charAt(0).toUpperCase()}${item.extraKey.slice(1)}`
      body[chave] = document.getElementById(`rel-kit-${item.key}-extra`).value
    }
  })

  COMPONENTES.forEach(([key]) => {
    body[key] = document.getElementById(`rel-check-${key}`).checked
  })

  // Um único campo de valor no papel (ex: 130mmHg), ao lado da temperatura —
  // aplicado nos 5 campos xxxValor do banco (o PDF só lê o primeiro
  // preenchido de qualquer forma, ver TEST_VALOR_POS no backend).
  const valorTesteFlutuador = document.getElementById('rel-teste-valor')?.value
  TESTES_FLUTUADOR.forEach(([key]) => {
    body[`${key}Realizado`] = document.getElementById(`rel-teste-${key}-realizado`).checked
    body[`${key}Valor`] = valorTesteFlutuador
  })

  body.cilindros = lerCilindrosDoForm()

  // Cabo de Disparo — um valor só por relatório, não por cilindro (conversão
  // pra Float fica a cargo do extrair() no backend, como os demais campos).
  body.caboInternoMetros = document.getElementById('rel-caboInternoMetros').value
  body.caboExternoMetros = document.getElementById('rel-caboExternoMetros').value
  body.alturaMaximaEstocagemMetros = document.getElementById('rel-alturaMaximaEstocagemMetros').value

  body.casuloReparo = document.getElementById('rel-casulo-reparo').checked
  body.casuloPintura = document.getElementById('rel-casulo-pintura').checked
  body.casuloValvulaNumero = document.getElementById('rel-casulo-valvulaNumero').value
  body.casuloValvulaFabricante = document.getElementById('rel-casulo-valvulaFabricante').value
  body.casuloValvulaValidade = document.getElementById('rel-casulo-valvulaValidade').value

  // Serviços Realizados não existe na tela do Certificado
  // (renderSecoesTecnicasRelatorio com incluirServicosBalsa:false).
  if (document.getElementById('rel-servicosObservacoes')) {
    SERVICOS_BALSA.forEach(([chave]) => {
      body[chave] = document.getElementById(`rel-serv-${chave}`).checked
    })
    body.servicosObservacoes = document.getElementById('rel-servicosObservacoes').value
  }

  // Testes IMO não existem na tela do Certificado (renderSecoesTecnicasRelatorio
  // com incluirTesteImo:false) — sem os elementos no DOM, nem tenta ler.
  if (!document.getElementById('imo-wpRealizado')) return body

  const camposImoBooleanos = ['wpRealizado', 'wpAnual', 'giRealizado', 'giTuboSuperiorOk', 'giTuboInferiorOk',
    'napRealizado', 'napRachaduras', 'napAberturaCostura', 'fsRealizado', 'fsResultadoOk', 'olRealizado']
  const camposImoTexto = ['wpSupInicioTemp', 'wpSupTerminoTemp', 'wpInfInicioTemp', 'wpInfTerminoTemp',
    'fsObservacoes', 'olObservacoes', 'tecnicoNome', 'controladoPorNome']
  const camposImoNumericos = ['wpSupInicioPressao', 'wpSupTerminoPressao', 'wpSupDiff', 'wpSupDiffPct',
    'wpInfInicioPressao', 'wpInfTerminoPressao', 'wpInfDiff', 'wpInfDiffPct',
    'giPressaoMaxSuperior', 'giPressaoMaxInferior',
    'napSupInicio', 'napSupTermino', 'napSupDiff', 'napSupDiffPct',
    'napInfInicio', 'napInfTermino', 'napInfDiff', 'napInfDiffPct',
    'olPessoasNr', 'olPesoPessoas', 'olPesoBalsa', 'olPesoTotal']

  const testeImo = {}
  camposImoBooleanos.forEach(c => { testeImo[c] = document.getElementById(`imo-${c}`).checked })
  camposImoTexto.forEach(c => { testeImo[c] = document.getElementById(`imo-${c}`).value })
  camposImoNumericos.forEach(c => { testeImo[c] = document.getElementById(`imo-${c}`).value })
  body.testeImo = testeImo

  return body
}

function lerFormularioRelatorio() {
  const body = {
    ordemServicoId: document.getElementById('rel-ordemServicoId').value,
    empresaId: document.getElementById('rel-empresaId').value,
    embarcacaoId: document.getElementById('rel-embarcacaoId').value,
    navio: document.getElementById('rel-embarcacao-busca').value.trim(),
    armador: document.getElementById('rel-embarcacao-armador').value.trim(),
    portoRegistro: document.getElementById('rel-embarcacao-porto').value.trim(),
    data: document.getElementById('rel-data').value,
    equipTipo: document.getElementById('rel-equipTipo').value,
    equipNumeroSerie: document.getElementById('rel-equipNumeroSerie').value,
    equipAnoFabricacao: document.getElementById('rel-equipAnoFabricacao').value,
    equipFabricante: document.getElementById('rel-equipFabricante').value,
    equipModelo: document.getElementById('rel-equipModelo').value,
    equipClasse: document.getElementById('rel-equipClasse').value,
    equipCapacidade: document.getElementById('rel-equipCapacidade').value,
    certRevisaoNumero: document.getElementById('rel-certRevisaoNumero').value,
    certRevisaoDataExpedicao: document.getElementById('rel-certRevisaoDataExpedicao').value,
  }

  return Object.assign(body, lerCamposTecnicosRelatorio())
}

window.salvarRelatorio = async function () {
  const body = lerFormularioRelatorio()
  if (!body.empresaId || !body.navio) {
    alert('Empresa e Embarcação (navio) são obrigatórios!')
    return
  }

  const res = await apiJson(`${API}/relatorios`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    const r = await res.json()
    alert('Relatório criado com sucesso!')
    editarRelatorio(r.id)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao criar'))
  }
}

window.atualizarRelatorio = async function (id) {
  const body = lerFormularioRelatorio()
  if (!body.empresaId || !body.navio) {
    alert('Empresa e Embarcação (navio) são obrigatórios!')
    return
  }

  const res = await apiJson(`${API}/relatorios/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Relatório atualizado com sucesso!')
    editarRelatorio(id)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao atualizar'))
  }
}

window.concluirRelatorio = async function (id) {
  if (!confirm('Concluir o relatório? Depois de concluído ele não pode mais ser editado.')) return

  const res = await apiJson(`${API}/relatorios/${id}/concluir`, { method: 'POST', body: JSON.stringify({}) })
  if (res.ok) {
    alert('Relatório concluído!')
    editarRelatorio(id)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao concluir'))
  }
}

// Cancelar: fica no banco com status "cancelado", NÃO libera o número —
// mesma lógica do Certificado (js/modules/certificados.js).
window.cancelarRelatorio = async function (id) {
  if (!confirm('Cancelar este relatório? Ele continua no sistema (marcado como Cancelado), mas não pode mais ser editado, concluído ou virar Certificado — e o número não é reaproveitado.')) return

  const res = await apiJson(`${API}/relatorios/${id}/cancelar`, { method: 'POST' })

  if (res.ok) {
    alert('Relatório cancelado.')
    // Chamado tanto da lista (tabela-relatorios visível) quanto de dentro do
    // relatório aberto — atualiza o que estiver na tela em vez de sempre
    // pular pra dentro do relatório.
    if (document.getElementById('tabela-relatorios')) carregarRelatorios(paginaAtualRelatorios)
    else editarRelatorio(id)
  } else {
    const err = await res.json()
    alert('Erro ao cancelar relatório: ' + (err.erro || 'falha'))
  }
}

// Excluir: some do banco de vez (cilindros/teste IMO/assinaturas em cascata) —
// libera a Ordem de Serviço de origem pra gerar um relatório novo e o número
// volta a ficar disponível.
window.excluirRelatorio = async function (id) {
  if (!confirm('Excluir este relatório permanentemente? Essa ação não pode ser desfeita, libera a Ordem de Serviço de origem pra um novo relatório, e o número volta a ficar disponível.')) return

  const res = await apiJson(`${API}/relatorios/${id}`, { method: 'DELETE' })

  if (res.ok) {
    alert('Relatório excluído.')
    inicializarRelatorios()
  } else {
    const err = await res.json()
    alert('Erro ao excluir relatório: ' + (err.erro || 'falha'))
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RELATÓRIO TÉCNICO (papel timbrado — gatos, fibra, P78...)
// ══════════════════════════════════════════════════════════════════════════
// Capa + seções livres + assinaturas, tudo em Relatorio.conteudo (ver
// backend/templates/relatorio-tecnico.js). O modelo só dá o ponto de partida;
// o técnico edita títulos, textos, campos e a ordem das seções.

let modelosTecnico = null
let tecnicoEstado = null
let tecnicoSomenteLeitura = false
// Técnicos de manutenção do cadastro de Colaboradores (com SISPAT) — sugeridos
// no nome das assinaturas. Recarregado a cada abertura do formulário, pra
// pegar técnico cadastrado ou SISPAT corrigido no meio do caminho.
let tecnicosCadastrados = []
// Id do relatório aberto (null enquanto não foi salvo — foto só sobe depois
// do primeiro Salvar, porque a pasta das fotos é por relatório).
let tecnicoRelatorioId = null
// Envios de foto ou anexo em andamento — Salvar espera, senão a limpeza de
// arquivos não usados do backend apagaria o que ainda está chegando.
let fotosEnviando = 0
// Miniaturas já baixadas (arquivo → blob URL). A foto vem por apiFetch (com
// token e o header do ngrok) em vez de <img src> direto.
const miniaturasFotos = new Map()

async function carregarTecnicosCadastrados() {
  try {
    const res = await apiFetch(`${API}/colaboradores/tecnicos`)
    tecnicosCadastrados = res.ok ? await res.json() : []
  } catch {
    // Sem a lista o campo continua livre — não impede de abrir o relatório.
    tecnicosCadastrados = []
  }
}

async function carregarModelosTecnico() {
  if (!modelosTecnico) {
    const res = await apiFetch(`${API}/relatorios/modelos`)
    if (!res.ok) throw new Error(`o servidor respondeu ${res.status} ao buscar os modelos`)
    modelosTecnico = await res.json()
  }
  return modelosTecnico
}

async function novoRelatorioTecnico() {
  let modelos, empresas
  // Sempre busca de novo: pode ter nascido modelo de um relatório concluído
  modelosTecnico = null
  try {
    [modelos, empresas] = await Promise.all([
      carregarModelosTecnico(),
      apiFetch(`${API}/empresas`).then(r => r.json())
    ])
  } catch (e) {
    // Chamado de onclick — sem isso a falha some no console e o botão
    // simplesmente "não faz nada".
    alert(`Não foi possível abrir o Relatório técnico: ${e.message}. Se o servidor ainda não recebeu a atualização (deploy), é isso.`)
    return
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')
  const chave = Object.keys(modelos)[0]
  abrirFormularioRelatorioTecnico({ modelo: chave, conteudo: structuredClone(modelos[chave].conteudo) }, empresas, modelos)
}

async function abrirFormularioRelatorioTecnico(r, empresas, modelos) {
  modelos = modelos || await carregarModelosTecnico()
  tecnicoSomenteLeitura = r.status === 'concluido' || r.status === 'cancelado'
  if (!tecnicoSomenteLeitura) await carregarTecnicosCadastrados()
  tecnicoRelatorioId = r.id || null
  fotosEnviando = 0
  tecnicoEstado = structuredClone(r.conteudo || {})
  tecnicoEstado.secoes = tecnicoEstado.secoes || []
  tecnicoEstado.assinaturas = tecnicoEstado.assinaturas || []
  tecnicoEstado.anexos = tecnicoEstado.anexos || []

  document.getElementById('relatorios').innerHTML = renderFormularioRelatorioTecnico(r, empresas, modelos)
  renderizarSecoesTecnico()
  renderizarAssinaturasTecnico()
  renderizarAnexosTecnico()
}

function renderFormularioRelatorioTecnico(r, empresas, modelos) {
  const cancelado = r.status === 'cancelado'
  const concluido = r.status === 'concluido'
  const dis = tecnicoSomenteLeitura ? 'disabled' : ''
  const c = tecnicoEstado
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${r.empresaId === e.id ? 'selected' : ''}>${esc(e.nome)} (${esc(e.sigla)})</option>`
  ).join('')

  return `
    <div style="margin-top:20px; max-width:1000px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="inicializarRelatorios()">← Voltar</button>
        ${r.id ? `<a class="btn btn-secondary" href="${API}/relatorios/${r.id}/pdf?token=${encodeURIComponent(tokenAtual)}" target="_blank">PDF</a>` : ''}
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <h3 style="margin:0;">${r.id ? `Relatório ${r.numero}/${r.ano}` : 'Novo Relatório Técnico'}</h3>
        ${r.id ? badgeStatus(r.status) : ''}
      </div>

      ${secao('Capa', `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          ${r.id ? '' : `
            <div style="grid-column: span 2;">
              <label>Modelo <small style="color:#999;">(trocar recomeça as seções com o texto padrão do modelo)</small></label>
              <select id="rel-tec-modelo" class="form-control" onchange="trocarModeloRelatorioTecnico()">
                ${Object.entries(modelos).map(([chave, m]) => `<option value="${esc(chave)}" ${chave === r.modelo ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
              </select>
            </div>
          `}
          <div style="grid-column: span 2;">
            <label>Título *</label>
            <textarea id="rel-tec-titulo" class="form-control" rows="2" ${dis}>${esc(c.titulo || '')}</textarea>
          </div>
          <div><label>Empresa executante *</label><select id="rel-empresaId" class="form-control" ${dis}>${opcoesEmpresas}</select></div>
          <div><label>Data * <small style="color:#999;">(mês/ano impresso na capa)</small></label><input type="date" id="rel-data" class="form-control" value="${esc(r.data ? r.data.split('T')[0] : hojeISO())}" ${dis}></div>
          <div><label>Unidade marítima / Embarcação *</label><input type="text" id="rel-tec-navio" class="form-control" placeholder="Ex: P-77" value="${esc(r.navio || '')}" ${dis}></div>
          <div><label>IMO</label><input type="text" id="rel-tec-imo" class="form-control" value="${esc(c.imo || '')}" ${dis}></div>
          <div><label>Certificado Nº</label><input type="text" id="rel-tec-certificadoNumero" class="form-control" placeholder="Ex: 1320" value="${esc(c.certificadoNumero || '')}" ${dis}></div>
          <div><label>Local</label><input type="text" id="rel-tec-local" class="form-control" placeholder="Ex: RIO DE JANEIRO-RJ" value="${esc(c.local || '')}" ${dis}></div>
        </div>
      `)}

      <div id="rel-tec-secoes"></div>

      ${tecnicoSomenteLeitura ? '' : `
        <div style="display:flex; gap:8px; margin-bottom:16px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="tecAdicionarSecao('texto')">+ Seção de texto</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="tecAdicionarSecao('campos')">+ Seção de campos</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="tecAdicionarSecao('fotos')">+ Seção de fotos</button>
        </div>
      `}

      ${secao('Assinaturas', `
        ${tecnicoSomenteLeitura ? '' : `
          <p style="color:#999; font-size:12px; margin:0 0 8px;">Digite o nome para escolher um técnico de manutenção cadastrado — cargo e SISPAT são preenchidos sozinhos.</p>
          <datalist id="tec-lista-tecnicos">
            ${tecnicosCadastrados.map(t => `<option value="${esc(t.nome)}">${esc(t.sispat ? `SISPAT ${t.sispat}` : 'sem SISPAT cadastrado')}</option>`).join('')}
          </datalist>
        `}
        <div id="rel-tec-assinaturas"></div>
        ${tecnicoSomenteLeitura ? '' : '<button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="tecAdicionarAssinatura()">+ Assinatura</button>'}
      `)}

      ${secao('Anexos', '<div id="rel-tec-anexos"></div>')}

      ${tecnicoSomenteLeitura ? '' : `
        <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div style="display:flex; gap:12px;">
            <button type="button" class="btn btn-success" onclick="salvarRelatorioTecnico(${r.id || 'null'})">Salvar</button>
            ${r.id ? `<button type="button" class="btn btn-warning" onclick="concluirRelatorio(${r.id})">Concluir e Assinar</button>` : ''}
          </div>
          ${r.id && podeCancelarOuExcluirRelatorio ? `
            <div style="display:flex; gap:12px;">
              <button type="button" class="btn btn-warning" onclick="cancelarRelatorio(${r.id})">Cancelar Relatório</button>
              <button type="button" class="btn btn-danger" onclick="excluirRelatorio(${r.id})">Excluir Relatório</button>
            </div>
          ` : ''}
        </div>
      `}

      ${cancelado ? `<p style="margin-bottom:16px; color:#dc3545; font-size:13px; font-weight:600;">Relatório cancelado.</p>` : ''}
      ${concluido || ((cancelado || concluido) && podeCancelarOuExcluirRelatorio) ? `
        <div style="display:flex; gap:12px; justify-content:space-between; align-items:center; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:12px;">
            ${!concluido ? '' : r.certificado
              ? `<button type="button" class="btn btn-secondary" onclick="abrirCertificado(${r.certificado.id})">Ver Certificado</button> ${badgeStatusCertificado(r.certificado.status)}`
              // Todo relatório gera certificado, mas só alguns modelos já têm
              // o modelo de certificado pronto (MODELOS_RELATORIO_TECNICO[...].certificado).
              : modelos[r.modelo]?.certificado
                ? `<button type="button" class="btn btn-warning" onclick="gerarCertificadoDeRelatorio(${r.id})">Gerar Certificado</button>`
                : `<span style="background:#fd7e14; color:white; padding:4px 10px; border-radius:12px; font-size:12px;">Certificado: modelo pendente</span>`}
          </div>
          ${podeCancelarOuExcluirRelatorio && !r.certificado ? `
            <div style="display:flex; gap:12px;">
              ${concluido ? `<button type="button" class="btn btn-warning" onclick="cancelarRelatorio(${r.id})">Cancelar Relatório</button>` : ''}
              <button type="button" class="btn btn-danger" onclick="excluirRelatorio(${r.id})">Excluir Relatório</button>
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `
}

// Mesma numeração do PDF (numerarSecoes em backend/templates/relatorio-tecnico.js):
// seção sem título não conta; subseção vira 4.1, 4.2... da última principal.
function numerosSecoesTecnico() {
  let principal = 0
  let sub = 0
  const secoes = tecnicoEstado.secoes
  const aposAssinaturas = i => secoes[i].tipo === 'fotos' && secoes[i].aposAssinaturas
  // Mesma ordem do PDF: fotos depois das assinaturas numeram por último
  const indices = [...secoes.keys()]
  const ordem = [...indices.filter(i => !aposAssinaturas(i)), ...indices.filter(aposAssinaturas)]
  const numeros = []
  for (const i of ordem) {
    if (!(secoes[i].titulo || '').trim()) continue
    if (secoes[i].sub && principal) {
      numeros[i] = `${principal}.${++sub}`
    } else {
      sub = 0
      numeros[i] = `${++principal}.`
    }
  }
  return numeros
}

function renderizarSecoesTecnico() {
  const div = document.getElementById('rel-tec-secoes')
  if (!div) return
  const dis = tecnicoSomenteLeitura ? 'disabled' : ''
  const ro = tecnicoSomenteLeitura
  const numeros = numerosSecoesTecnico()
  const total = tecnicoEstado.secoes.length

  div.innerHTML = tecnicoEstado.secoes.map((s, i) => {
    const corpo = s.tipo === 'fotos' ? renderCorpoFotos(s, i)
      : s.tipo === 'campos'
      ? (s.grupos || []).map((g, gi) => `
          <div style="border:1px solid #ddd; border-radius:6px; padding:10px; margin-bottom:10px;">
            ${g.map((f, fi) => `
              <div style="display:grid; grid-template-columns:${ro ? '1fr 2fr' : '1fr 2fr 36px'}; gap:8px; margin-bottom:6px;">
                <input type="text" class="form-control form-control-sm" id="tec-s${i}-g${gi}-f${fi}-rot" placeholder="Rótulo" value="${esc(f.rotulo || '')}" ${dis}>
                <input type="text" class="form-control form-control-sm" id="tec-s${i}-g${gi}-f${fi}-val" placeholder="Valor" value="${esc(f.valor || '')}" ${dis}>
                ${ro ? '' : `<button type="button" class="btn btn-sm btn-danger" title="Remover campo" onclick="tecRemoverCampo(${i}, ${gi}, ${fi})">✕</button>`}
              </div>
            `).join('')}
            ${ro ? '' : `
              <div style="display:flex; gap:8px; margin-top:6px;">
                <button type="button" class="btn btn-sm btn-secondary" onclick="tecAdicionarCampo(${i}, ${gi})">+ Campo</button>
                <button type="button" class="btn btn-sm btn-secondary" onclick="tecDuplicarGrupo(${i}, ${gi})">Duplicar bloco</button>
                <button type="button" class="btn btn-sm btn-danger" onclick="tecRemoverGrupo(${i}, ${gi})">Remover bloco</button>
              </div>
            `}
          </div>
        `).join('') + (ro ? '' : `<button type="button" class="btn btn-sm btn-secondary" onclick="tecAdicionarGrupo(${i})">+ Bloco em branco</button>`)
      : `<textarea class="form-control" id="tec-s${i}-texto" rows="${Math.max(3, (s.texto || '').split('\n').length + 1)}" ${dis}>${esc(s.texto || '')}</textarea>`

    return `
      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
          <span style="font-weight:700; color:var(--acento); min-width:32px; ${s.sub ? 'padding-left:12px;' : ''}">${numeros[i] || ''}</span>
          <input type="text" class="form-control" style="font-weight:600;" id="tec-s${i}-titulo" placeholder="${s.tipo === 'fotos' ? 'Título da seção (opcional — sem título não ganha número)' : 'Título da seção'}" value="${esc(s.titulo || '')}" ${dis}>
          <label style="display:flex; align-items:center; gap:4px; font-size:12px; white-space:nowrap;" title="Numera como 4.1, 4.2... da seção de cima">
            <input type="checkbox" id="tec-s${i}-sub" ${s.sub ? 'checked' : ''} onchange="tecAtualizarNumeracao()" ${dis}> Subseção
          </label>
          ${ro ? '' : `
            <button type="button" class="btn btn-sm btn-secondary" title="Subir" onclick="tecMoverSecao(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-sm btn-secondary" title="Descer" onclick="tecMoverSecao(${i}, 1)" ${i === total - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-sm btn-danger" title="Remover seção" onclick="tecRemoverSecao(${i})">✕</button>
          `}
        </div>
        ${corpo}
      </div>
    `
  }).join('')
  carregarMiniaturasFotos()
}

function renderCorpoFotos(s, i) {
  const ro = tecnicoSomenteLeitura
  const dis = ro ? 'disabled' : ''
  const lista = s.fotos || []
  return `
    <input type="text" class="form-control form-control-sm" style="margin-bottom:10px;" id="tec-s${i}-descricao" placeholder="Texto acima das fotos (ex: FOTOS DE ANTES DO REPARO)" value="${esc(s.descricao || '')}" ${dis}>
    <label style="display:flex; align-items:center; gap:4px; font-size:12px; margin-bottom:10px;">
      <input type="checkbox" id="tec-s${i}-apos" ${s.aposAssinaturas ? 'checked' : ''} onchange="tecAtualizarNumeracao()" ${dis}> Colocar depois das assinaturas
    </label>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px;">
      ${lista.map((f, k) => `
        <div style="border:1px solid #ddd; border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:6px;">
          <div style="height:140px; display:flex; align-items:center; justify-content:center; background:#f5f5f5; border-radius:4px; overflow:hidden;">
            <img data-foto="${esc(f.arquivo)}" alt="" style="max-width:100%; max-height:140px;">
          </div>
          <input type="text" class="form-control form-control-sm" id="tec-s${i}-f${k}-legenda" placeholder="Legenda (opcional)" value="${esc(f.legenda || '')}" ${dis}>
          ${ro ? '' : `
            <div style="display:flex; gap:6px; justify-content:space-between;">
              <div style="display:flex; gap:6px;">
                <button type="button" class="btn btn-sm btn-secondary" title="Mover pra trás" onclick="tecMoverFoto(${i}, ${k}, -1)" ${k === 0 ? 'disabled' : ''}>←</button>
                <button type="button" class="btn btn-sm btn-secondary" title="Mover pra frente" onclick="tecMoverFoto(${i}, ${k}, 1)" ${k === lista.length - 1 ? 'disabled' : ''}>→</button>
              </div>
              <button type="button" class="btn btn-sm btn-danger" title="Remover foto" onclick="tecRemoverFoto(${i}, ${k})">✕</button>
            </div>
          `}
        </div>
      `).join('')}
    </div>
    ${!lista.length && ro ? '<p style="color:#999; font-size:13px; margin:0;">Nenhuma foto.</p>' : ''}
    ${ro ? '' : tecnicoRelatorioId ? `
      <label class="btn btn-sm btn-secondary" style="margin-top:10px; margin-bottom:0;">
        + Adicionar fotos
        <input type="file" accept="image/jpeg,image/png" multiple style="display:none;" onchange="tecEnviarFotos(${i}, this)">
      </label>
      <span id="tec-s${i}-envio" style="margin-left:8px; font-size:12px; color:#999;"></span>
    ` : '<p style="color:#999; font-size:12px; margin:10px 0 0;">Salve o relatório uma vez para poder adicionar fotos.</p>'}
  `
}

async function carregarMiniaturasFotos() {
  for (const img of document.querySelectorAll('#rel-tec-secoes img[data-foto]')) {
    const arquivo = img.dataset.foto
    if (!miniaturasFotos.has(arquivo)) {
      try {
        const res = await apiFetch(`${API}/uploads/relatorios/${tecnicoRelatorioId}/${encodeURIComponent(arquivo)}`)
        if (!res.ok) continue
        miniaturasFotos.set(arquivo, URL.createObjectURL(await res.blob()))
      } catch {
        continue
      }
    }
    img.src = miniaturasFotos.get(arquivo)
  }
}

// Reduz a foto no navegador antes de mandar (lado maior até 1600px, JPEG) —
// foto de celular tem 3–8 MB e o PDF com 20 delas ficaria enorme.
const LADO_MAXIMO_FOTO = 1600
async function reduzirFoto(arquivo) {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('falha ao converter a foto')), 'image/jpeg', 0.85))
}

window.tecEnviarFotos = async function (i, input) {
  const arquivos = [...input.files]
  input.value = ''
  if (!arquivos.length) return
  const status = document.getElementById(`tec-s${i}-envio`)
  const falhas = []
  fotosEnviando++
  try {
    for (const [n, arquivo] of arquivos.entries()) {
      if (status) status.textContent = `Enviando ${n + 1} de ${arquivos.length}...`
      try {
        const corpo = new FormData()
        corpo.append('foto', await reduzirFoto(arquivo), 'foto.jpg')
        const res = await apiFetch(`${API}/relatorios/${tecnicoRelatorioId}/fotos`, { method: 'POST', body: corpo })
        const dados = await res.json()
        if (!res.ok) throw new Error(dados.erro || 'falha no envio')
        // Entra na seção onde o botão foi clicado (índice i). Se no meio do
        // envio o técnico moveu/removeu seções e ali não é mais seção de
        // fotos, avisa em vez de perder a foto calada.
        sincronizarTecnicoDoForm()
        if (tecnicoEstado.secoes[i]?.tipo !== 'fotos') throw new Error('a seção mudou de lugar durante o envio — envie de novo')
        tecnicoEstado.secoes[i].fotos = [...(tecnicoEstado.secoes[i].fotos || []), { arquivo: dados.arquivo, legenda: '' }]
        renderizarSecoesTecnico()
      } catch (e) {
        falhas.push(`${arquivo.name}: ${e.message}`)
      }
    }
  } finally {
    fotosEnviando--
  }
  const statusAtual = document.getElementById(`tec-s${i}-envio`)
  if (statusAtual) statusAtual.textContent = 'Fotos adicionadas — clique em Salvar para guardar.'
  if (falhas.length) alert('Algumas fotos não foram enviadas:\n' + falhas.join('\n'))
}

window.tecMoverFoto = function (i, k, direcao) {
  alterarSecoesTecnico(secoes => {
    const [f] = secoes[i].fotos.splice(k, 1)
    secoes[i].fotos.splice(k + direcao, 0, f)
  })
}

window.tecRemoverFoto = function (i, k) {
  if (!confirm('Remover esta foto do relatório?')) return
  alterarSecoesTecnico(secoes => secoes[i].fotos.splice(k, 1))
}

function renderizarAnexosTecnico() {
  const div = document.getElementById('rel-tec-anexos')
  if (!div) return
  const ro = tecnicoSomenteLeitura
  const lista = tecnicoEstado.anexos
  const url = a => `${API}/uploads/relatorios/${tecnicoRelatorioId}/${encodeURIComponent(a.arquivo)}?token=${encodeURIComponent(tokenAtual)}`
  div.innerHTML = `
    ${lista.length ? '<p style="color:#999; font-size:12px; margin:0 0 8px;">Entram no fim do PDF, nesta ordem, sem o papel timbrado.</p>' : ''}
    ${lista.map((a, i) => `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <a href="${esc(url(a))}" target="_blank" style="flex:1; overflow-wrap:anywhere;">${esc(a.nome || 'anexo.pdf')}</a>
        ${ro ? '' : `
          <button type="button" class="btn btn-sm btn-secondary" title="Subir" onclick="tecMoverAnexo(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn btn-sm btn-secondary" title="Descer" onclick="tecMoverAnexo(${i}, 1)" ${i === lista.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn btn-sm btn-danger" title="Remover anexo" onclick="tecRemoverAnexo(${i})">✕</button>
        `}
      </div>
    `).join('')}
    ${!lista.length && ro ? '<p style="color:#999; font-size:13px; margin:0;">Nenhum anexo.</p>' : ''}
    ${ro ? '' : tecnicoRelatorioId ? `
      <label class="btn btn-sm btn-secondary" style="margin-top:8px; margin-bottom:0;">
        + Adicionar PDF
        <input type="file" accept="application/pdf" multiple style="display:none;" onchange="tecEnviarAnexos(this)">
      </label>
      <span id="tec-anexos-envio" style="margin-left:8px; font-size:12px; color:#999;"></span>
    ` : '<p style="color:#999; font-size:12px; margin:0;">Salve o relatório uma vez para poder adicionar anexos.</p>'}
  `
}

window.tecEnviarAnexos = async function (input) {
  const arquivos = [...input.files]
  input.value = ''
  if (!arquivos.length) return
  const falhas = []
  let enviados = 0
  fotosEnviando++
  try {
    for (const [n, arquivo] of arquivos.entries()) {
      const status = document.getElementById('tec-anexos-envio')
      if (status) status.textContent = `Enviando ${n + 1} de ${arquivos.length}...`
      try {
        const corpo = new FormData()
        corpo.append('anexo', arquivo)
        const res = await apiFetch(`${API}/relatorios/${tecnicoRelatorioId}/anexos`, { method: 'POST', body: corpo })
        const dados = await res.json()
        if (!res.ok) throw new Error(dados.erro || 'falha no envio')
        tecnicoEstado.anexos.push({ arquivo: dados.arquivo, nome: dados.nome })
        enviados++
        renderizarAnexosTecnico()
      } catch (e) {
        falhas.push(`${arquivo.name}: ${e.message}`)
      }
    }
  } finally {
    fotosEnviando--
  }
  const status = document.getElementById('tec-anexos-envio')
  if (status) status.textContent = enviados ? 'Anexos adicionados — clique em Salvar para guardar.' : ''
  if (falhas.length) alert('Alguns anexos não foram enviados:\n' + falhas.join('\n'))
}

window.tecMoverAnexo = function (i, direcao) {
  const [a] = tecnicoEstado.anexos.splice(i, 1)
  tecnicoEstado.anexos.splice(i + direcao, 0, a)
  renderizarAnexosTecnico()
}

window.tecRemoverAnexo = function (i) {
  if (!confirm('Remover este anexo do relatório?')) return
  tecnicoEstado.anexos.splice(i, 1)
  renderizarAnexosTecnico()
}

function renderizarAssinaturasTecnico() {
  const div = document.getElementById('rel-tec-assinaturas')
  if (!div) return
  const dis = tecnicoSomenteLeitura ? 'disabled' : ''
  div.innerHTML = tecnicoEstado.assinaturas.map((a, i) => `
    <div style="display:grid; grid-template-columns:${tecnicoSomenteLeitura ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr 36px'}; gap:8px; margin-bottom:8px; align-items:start;">
      <input type="text" class="form-control form-control-sm" id="tec-a${i}-empresa" placeholder="Empresa (vazio = executante)" value="${esc(a.empresa || '')}" ${dis}>
      <input type="text" class="form-control form-control-sm" id="tec-a${i}-nome" placeholder="Nome" list="tec-lista-tecnicos" autocomplete="off" onchange="tecSelecionarTecnico(${i})" value="${esc(a.nome || '')}" ${dis}>
      <input type="text" class="form-control form-control-sm" id="tec-a${i}-cargo" placeholder="Cargo (ex: ENG MECÂNICO)" value="${esc(a.cargo || '')}" ${dis}>
      <textarea class="form-control form-control-sm" id="tec-a${i}-registro" rows="2" placeholder="Registro (CREA, CRT, SISPAT...)" ${dis}>${esc(a.registro || '')}</textarea>
      ${tecnicoSomenteLeitura ? '' : `<button type="button" class="btn btn-sm btn-danger" title="Remover assinatura" onclick="tecRemoverAssinatura(${i})">✕</button>`}
    </div>
  `).join('') || '<p style="color:#999; font-size:13px; margin:0;">Nenhuma assinatura.</p>'
}

// Copia o que está digitado na tela de volta pro estado — chamada antes de
// qualquer mudança de estrutura (mover/adicionar/remover), senão o
// re-render apagaria o que foi digitado.
function sincronizarTecnicoDoForm() {
  const valor = id => document.getElementById(id)?.value ?? ''
  const marcado = id => !!document.getElementById(id)?.checked
  tecnicoEstado.titulo = valor('rel-tec-titulo')
  tecnicoEstado.imo = valor('rel-tec-imo')
  tecnicoEstado.certificadoNumero = valor('rel-tec-certificadoNumero')
  tecnicoEstado.local = valor('rel-tec-local')
  tecnicoEstado.secoes = tecnicoEstado.secoes.map((s, i) => s.tipo === 'fotos'
    ? {
        tipo: 'fotos',
        titulo: valor(`tec-s${i}-titulo`),
        sub: marcado(`tec-s${i}-sub`),
        aposAssinaturas: marcado(`tec-s${i}-apos`),
        descricao: valor(`tec-s${i}-descricao`),
        fotos: (s.fotos || []).map((f, k) => ({ arquivo: f.arquivo, legenda: valor(`tec-s${i}-f${k}-legenda`) }))
      }
    : s.tipo === 'campos'
    ? {
        tipo: 'campos',
        titulo: valor(`tec-s${i}-titulo`),
        sub: marcado(`tec-s${i}-sub`),
        grupos: (s.grupos || []).map((g, gi) => g.map((_, fi) => ({
          rotulo: valor(`tec-s${i}-g${gi}-f${fi}-rot`),
          valor: valor(`tec-s${i}-g${gi}-f${fi}-val`)
        })))
      }
    : { tipo: 'texto', titulo: valor(`tec-s${i}-titulo`), texto: valor(`tec-s${i}-texto`), sub: marcado(`tec-s${i}-sub`) })
  tecnicoEstado.assinaturas = tecnicoEstado.assinaturas.map((_, i) => ({
    empresa: valor(`tec-a${i}-empresa`),
    nome: valor(`tec-a${i}-nome`),
    cargo: valor(`tec-a${i}-cargo`),
    registro: valor(`tec-a${i}-registro`)
  }))
}

function alterarSecoesTecnico(mudanca) {
  sincronizarTecnicoDoForm()
  mudanca(tecnicoEstado.secoes)
  renderizarSecoesTecnico()
}

window.tecAtualizarNumeracao = function () {
  alterarSecoesTecnico(() => { })
}

window.tecMoverSecao = function (i, direcao) {
  alterarSecoesTecnico(secoes => {
    const [s] = secoes.splice(i, 1)
    secoes.splice(i + direcao, 0, s)
  })
}

window.tecRemoverSecao = function (i) {
  const titulo = document.getElementById(`tec-s${i}-titulo`)?.value || 'sem título'
  if (!confirm(`Remover a seção "${titulo}"?`)) return
  alterarSecoesTecnico(secoes => secoes.splice(i, 1))
}

window.tecAdicionarSecao = function (tipo) {
  alterarSecoesTecnico(secoes => secoes.push(
    tipo === 'campos' ? { tipo: 'campos', titulo: '', grupos: [[{ rotulo: '', valor: '' }]] }
      : tipo === 'fotos' ? { tipo: 'fotos', titulo: '', descricao: '', fotos: [] }
      : { tipo: 'texto', titulo: '', texto: '' }))
}

window.tecAdicionarCampo = function (i, gi) {
  alterarSecoesTecnico(secoes => secoes[i].grupos[gi].push({ rotulo: '', valor: '' }))
}

window.tecRemoverCampo = function (i, gi, fi) {
  alterarSecoesTecnico(secoes => secoes[i].grupos[gi].splice(fi, 1))
}

// Duplica com os valores — no relatório de gatos os blocos dos turcos só
// diferem em local, identificação e nº de série; o resto se repete.
window.tecDuplicarGrupo = function (i, gi) {
  alterarSecoesTecnico(secoes => secoes[i].grupos.splice(gi + 1, 0, structuredClone(secoes[i].grupos[gi])))
}

// Bloco em branco com os mesmos rótulos do primeiro (ou um campo vazio).
window.tecAdicionarGrupo = function (i) {
  alterarSecoesTecnico(secoes => {
    const base = secoes[i].grupos[0]
    secoes[i].grupos.push(base ? base.map(f => ({ rotulo: f.rotulo, valor: '' })) : [{ rotulo: '', valor: '' }])
  })
}

window.tecRemoverGrupo = function (i, gi) {
  if (!confirm('Remover este bloco?')) return
  alterarSecoesTecnico(secoes => secoes[i].grupos.splice(gi, 1))
}

// Nome igual ao de um técnico cadastrado → preenche cargo e SISPAT (a
// assinatura é da Natal Safety, então limpa a "Empresa" de fora). Nome
// digitado livre não mexe em nada.
window.tecSelecionarTecnico = function (i) {
  const nome = document.getElementById(`tec-a${i}-nome`).value.trim().toUpperCase()
  const tecnico = tecnicosCadastrados.find(t => t.nome.trim().toUpperCase() === nome)
  if (!tecnico) return
  document.getElementById(`tec-a${i}-nome`).value = tecnico.nome.toUpperCase()
  document.getElementById(`tec-a${i}-empresa`).value = ''
  document.getElementById(`tec-a${i}-cargo`).value = 'TÉCNICO DE MANUTENÇÃO'
  document.getElementById(`tec-a${i}-registro`).value = tecnico.sispat ? `SISPAT: ${tecnico.sispat}` : ''
  if (!tecnico.sispat) alert(`${tecnico.nome} não tem SISPAT no cadastro de Colaboradores — preencha o registro à mão ou atualize o cadastro.`)
}

window.tecAdicionarAssinatura = function () {
  sincronizarTecnicoDoForm()
  tecnicoEstado.assinaturas.push({ empresa: '', nome: '', cargo: '', registro: '' })
  renderizarAssinaturasTecnico()
}

window.tecRemoverAssinatura = function (i) {
  sincronizarTecnicoDoForm()
  tecnicoEstado.assinaturas.splice(i, 1)
  renderizarAssinaturasTecnico()
}

window.trocarModeloRelatorioTecnico = async function () {
  const select = document.getElementById('rel-tec-modelo')
  const anterior = select.dataset.atual || Object.keys(modelosTecnico)[0]
  if (!confirm('Trocar o modelo apaga as seções e assinaturas digitadas e recomeça com as do novo modelo. Continuar?')) {
    select.value = anterior
    return
  }
  select.dataset.atual = select.value
  // Mantém o que é da identificação (empresa, data, unidade, IMO, certificado);
  // o resto vem do modelo novo.
  sincronizarTecnicoDoForm()
  const novo = structuredClone(modelosTecnico[select.value].conteudo)
  tecnicoEstado = { ...novo, imo: tecnicoEstado.imo, certificadoNumero: tecnicoEstado.certificadoNumero }
  document.getElementById('rel-tec-titulo').value = novo.titulo
  document.getElementById('rel-tec-local').value = novo.local
  renderizarSecoesTecnico()
  renderizarAssinaturasTecnico()
}

window.salvarRelatorioTecnico = async function (id) {
  if (fotosEnviando) {
    alert('Ainda tem foto ou anexo sendo enviado — espere terminar e clique em Salvar de novo.')
    return
  }
  sincronizarTecnicoDoForm()
  const body = {
    empresaId: document.getElementById('rel-empresaId').value,
    data: document.getElementById('rel-data').value,
    navio: document.getElementById('rel-tec-navio').value.trim(),
    conteudo: tecnicoEstado
  }
  if (!body.empresaId || !body.navio || !tecnicoEstado.titulo.trim()) {
    alert('Título, Empresa e Unidade/Embarcação são obrigatórios!')
    return
  }
  if (!id) body.modelo = document.getElementById('rel-tec-modelo').value

  const res = await apiJson(`${API}/relatorios${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    const r = await res.json()
    alert(id ? 'Relatório atualizado com sucesso!' : 'Relatório criado com sucesso!')
    editarRelatorio(r.id)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao salvar'))
  }
}

// Exposta em window para funcionar em onclick inline (ex: botão "← Voltar")
window.inicializarRelatorios = inicializarRelatorios
