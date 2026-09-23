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
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}
function badgeStatusCertificado(status) {
  const s = STATUS_CERTIFICADO_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
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
      </select>
      <button class="btn btn-secondary" onclick="novoRelatorioTipoAtivo()">+ Novo Relatório</button>
    </div>

    <div class="table-scroll">
      <table class="table-certificados" style="margin-top:16px; table-layout:fixed;">
        <thead>
          <tr>
            <th style="width:90px;">Nº</th>
            <th style="width:180px;">Navio</th>
            <th style="width:160px;">Armador</th>
            <th style="width:100px;">Data</th>
            <th style="width:110px;">Status</th>
            <th class="col-acoes" style="width:260px;">Ações</th>
          </tr>
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

const LABEL_TIPO_RELATORIO = { balsa: 'balsa', baleeira: 'baleeira', turco: 'turco', colete: 'colete' }

// Cada tipo de equipamento (Balsa/Baleeira/Turco/Colete) tem sua própria
// tabela — o select #rel-tipo-ativo escolhe qual, igual à tela de Certificados.
window.trocarTipoRelatorio = function () {
  carregarRelatorios(1)
}

window.novoRelatorioTipoAtivo = async function () {
  const tipo = document.getElementById('rel-tipo-ativo')?.value || 'balsa'
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
        <td style="cursor:pointer;" onclick="editarRelatorio(${r.id})">${r.numero}/${r.ano}</td>
        <td style="cursor:pointer;" onclick="editarRelatorio(${r.id})">${r.navio || r.embarcacao?.nome || '-'}</td>
        <td>${r.armador || r.embarcacao?.armador?.nome || '-'}</td>
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
    armador: os.embarcacao?.armador?.nome || '',
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
                  <td style="width:150px;"><input type="text" class="form-control form-control-sm" placeholder="Ex: 05/2027" id="rel-kit-${item.key}-validade" value="${r?.[`${item.key}Validade`] || ''}" ${dis}></td>
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
          <div style="max-width:200px;"><label>Temperatura</label><input type="text" id="rel-temperatura" class="form-control" value="${r?.temperatura || ''}" ${dis}></div>
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
          <div><label>Cabo Interno (m)</label><input type="number" step="0.01" class="form-control" id="rel-caboInternoMetros" value="${r?.caboInternoMetros ?? ''}" ${dis}></div>
          <div><label>Cabo Externo (m)</label><input type="number" step="0.01" class="form-control" id="rel-caboExternoMetros" value="${r?.caboExternoMetros ?? ''}" ${dis}></div>
          <div><label>Altura Máx. de Estocagem (m)</label><input type="number" step="0.01" class="form-control" id="rel-alturaMaximaEstocagemMetros" value="${r?.alturaMaximaEstocagemMetros ?? ''}" ${dis}></div>
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
          <div><label>Nº Válvula de Liberação</label><input type="text" class="form-control" id="rel-casulo-valvulaNumero" value="${r?.casuloValvulaNumero || ''}" ${dis}></div>
          <div><label>Fabricante</label><input type="text" class="form-control" id="rel-casulo-valvulaFabricante" value="${r?.casuloValvulaFabricante || ''}" ${dis}></div>
          <div><label>Validade</label><input type="text" class="form-control" placeholder="Ex: 05/2027" id="rel-casulo-valvulaValidade" value="${r?.casuloValvulaValidade || ''}" ${dis}></div>
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
            <div>Sup. Início Temp<input type="text" class="form-control form-control-sm" id="imo-wpSupInicioTemp" value="${imo.wpSupInicioTemp || ''}" ${dis}></div>
            <div>Sup. Início mmHg<input type="number" class="form-control form-control-sm" id="imo-wpSupInicioPressao" value="${imo.wpSupInicioPressao ?? ''}" ${dis}></div>
            <div>Sup. Término Temp<input type="text" class="form-control form-control-sm" id="imo-wpSupTerminoTemp" value="${imo.wpSupTerminoTemp || ''}" ${dis}></div>
            <div>Sup. Término mmHg<input type="number" class="form-control form-control-sm" id="imo-wpSupTerminoPressao" value="${imo.wpSupTerminoPressao ?? ''}" ${dis}></div>
            <div>Sup. Diff<input type="number" class="form-control form-control-sm" id="imo-wpSupDiff" value="${imo.wpSupDiff ?? ''}" ${dis}></div>
            <div>Sup. Diff %<input type="number" class="form-control form-control-sm" id="imo-wpSupDiffPct" value="${imo.wpSupDiffPct ?? ''}" ${dis}></div>
            <div>Inf. Início Temp<input type="text" class="form-control form-control-sm" id="imo-wpInfInicioTemp" value="${imo.wpInfInicioTemp || ''}" ${dis}></div>
            <div>Inf. Início mmHg<input type="number" class="form-control form-control-sm" id="imo-wpInfInicioPressao" value="${imo.wpInfInicioPressao ?? ''}" ${dis}></div>
            <div>Inf. Término Temp<input type="text" class="form-control form-control-sm" id="imo-wpInfTerminoTemp" value="${imo.wpInfTerminoTemp || ''}" ${dis}></div>
            <div>Inf. Término mmHg<input type="number" class="form-control form-control-sm" id="imo-wpInfTerminoPressao" value="${imo.wpInfTerminoPressao ?? ''}" ${dis}></div>
            <div>Inf. Diff<input type="number" class="form-control form-control-sm" id="imo-wpInfDiff" value="${imo.wpInfDiff ?? ''}" ${dis}></div>
            <div>Inf. Diff %<input type="number" class="form-control form-control-sm" id="imo-wpInfDiffPct" value="${imo.wpInfDiffPct ?? ''}" ${dis}></div>
          </div>
        </div>

        <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:12px;">
          <strong>GI — Teste de Enchimento com Gás</strong>
          <div style="margin-top:8px;"><label><input type="checkbox" id="imo-giRealizado" ${imo.giRealizado ? 'checked' : ''} ${dis}> Realizado</label></div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; font-size:12px;">
            <div>Pressão Máx. Sup. (mmHg)<input type="number" class="form-control form-control-sm" id="imo-giPressaoMaxSuperior" value="${imo.giPressaoMaxSuperior ?? ''}" ${dis}></div>
            <div>Pressão Máx. Inf. (mmHg)<input type="number" class="form-control form-control-sm" id="imo-giPressaoMaxInferior" value="${imo.giPressaoMaxInferior ?? ''}" ${dis}></div>
            <div style="align-self:end;"><label><input type="checkbox" id="imo-giTuboSuperiorOk" ${imo.giTuboSuperiorOk ? 'checked' : ''} ${dis}> Tubo superior OK</label></div>
            <div style="align-self:end;"><label><input type="checkbox" id="imo-giTuboInferiorOk" ${imo.giTuboInferiorOk ? 'checked' : ''} ${dis}> Tubo inferior OK</label></div>
          </div>
        </div>

        <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:12px;">
          <strong>NAP — Pressão Adicional Necessária</strong>
          <div style="margin-top:8px;"><label><input type="checkbox" id="imo-napRealizado" ${imo.napRealizado ? 'checked' : ''} ${dis}> Realizado</label></div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; font-size:12px;">
            <div>Sup. Início<input type="number" class="form-control form-control-sm" id="imo-napSupInicio" value="${imo.napSupInicio ?? ''}" ${dis}></div>
            <div>Sup. Término<input type="number" class="form-control form-control-sm" id="imo-napSupTermino" value="${imo.napSupTermino ?? ''}" ${dis}></div>
            <div>Sup. Diff<input type="number" class="form-control form-control-sm" id="imo-napSupDiff" value="${imo.napSupDiff ?? ''}" ${dis}></div>
            <div>Sup. Diff %<input type="number" class="form-control form-control-sm" id="imo-napSupDiffPct" value="${imo.napSupDiffPct ?? ''}" ${dis}></div>
            <div>Inf. Início<input type="number" class="form-control form-control-sm" id="imo-napInfInicio" value="${imo.napInfInicio ?? ''}" ${dis}></div>
            <div>Inf. Término<input type="number" class="form-control form-control-sm" id="imo-napInfTermino" value="${imo.napInfTermino ?? ''}" ${dis}></div>
            <div>Inf. Diff<input type="number" class="form-control form-control-sm" id="imo-napInfDiff" value="${imo.napInfDiff ?? ''}" ${dis}></div>
            <div>Inf. Diff %<input type="number" class="form-control form-control-sm" id="imo-napInfDiffPct" value="${imo.napInfDiffPct ?? ''}" ${dis}></div>
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
          <div style="margin-top:8px;"><label>Observações</label><input type="text" class="form-control" id="imo-fsObservacoes" value="${imo.fsObservacoes || ''}" ${dis}></div>
        </div>

        <div style="border:1px solid #ddd; border-radius:6px; padding:12px; margin-bottom:12px;">
          <strong>OL — Teste de Sobrecarga (Davit)</strong>
          <div style="margin-top:8px;"><label><input type="checkbox" id="imo-olRealizado" ${imo.olRealizado ? 'checked' : ''} ${dis}> Realizado</label></div>
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:8px; font-size:12px;">
            <div>Nº Pessoas<input type="number" class="form-control form-control-sm" id="imo-olPessoasNr" value="${imo.olPessoasNr ?? ''}" ${dis}></div>
            <div>Peso Pessoas (kg)<input type="number" class="form-control form-control-sm" id="imo-olPesoPessoas" value="${imo.olPesoPessoas ?? ''}" ${dis}></div>
            <div>Peso Balsa (kg)<input type="number" class="form-control form-control-sm" id="imo-olPesoBalsa" value="${imo.olPesoBalsa ?? ''}" ${dis}></div>
            <div>Peso Total (kg)<input type="number" class="form-control form-control-sm" id="imo-olPesoTotal" value="${imo.olPesoTotal ?? ''}" ${dis}></div>
          </div>
          <div style="margin-top:8px;"><label>Observações</label><input type="text" class="form-control" id="imo-olObservacoes" value="${imo.olObservacoes || ''}" ${dis}></div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div><label>Técnico Natal Safety</label><input type="text" class="form-control" id="imo-tecnicoNome" value="${imo.tecnicoNome || ''}" ${dis}></div>
          <div><label>Controlado por</label><input type="text" class="form-control" id="imo-controladoPorNome" value="${imo.controladoPorNome || ''}" ${dis}></div>
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
          <textarea id="rel-servicosObservacoes" class="form-control" rows="3" ${dis}>${r?.servicosObservacoes || ''}</textarea>
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
            <input type="text" id="rel-tecnicoNome" class="form-control" value="${r?.tecnicoNome || nomeTecnicoDefault}" ${dis}>
          </div>
        </div>
        <div style="margin-top:16px;">
          <label>Observações</label>
          <textarea id="rel-observacoes" class="form-control" rows="3" ${dis}>${r?.observacoes || ''}</textarea>
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
    `<option value="${e.id}" ${r?.empresaId === e.id ? 'selected' : ''}>${e.nome} (${e.sigla})</option>`
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

      <input type="hidden" id="rel-ordemServicoId" value="${r?.ordemServicoId || ''}">

      ${secao('Identificação', `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div><label>Empresa executante *</label><select id="rel-empresaId" class="form-control" ${dis}>${opcoesEmpresas}</select></div>
          <div><label>Data *</label><input type="date" id="rel-data" class="form-control" value="${r?.data ? r.data.split('T')[0] : hojeISO()}" ${dis}></div>
          <div style="position:relative; grid-column: span 2;">
            <label>Embarcação (navio) * <small style="color:#999;">(busca por nome — autopreenche armador e porto; se não achar, digite livremente)</small></label>
            <input type="text" id="rel-embarcacao-busca" class="form-control" placeholder="Digite o nome do navio..."
              value="${r?.navio || r?.embarcacao?.nome || ''}" oninput="buscarEmbarcacaoRelatorio(this.value)" autocomplete="off" ${dis}>
            <div id="sugestoes-embarcacao" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
            <input type="hidden" id="rel-embarcacaoId" value="${r?.embarcacaoId || ''}">
          </div>
          <div><label>Armador</label><input type="text" id="rel-embarcacao-armador" class="form-control" value="${r?.armador || r?.embarcacao?.armador?.nome || ''}" ${dis}></div>
          <div><label>Porto de Registro</label><input type="text" id="rel-embarcacao-porto" class="form-control" value="${r?.portoRegistro || r?.embarcacao?.portoRegistro || ''}" ${dis}></div>
        </div>
      `)}

      ${secao('Equipamento (balsa atendida)', `
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          <div><label>Equipamento</label><input type="text" id="rel-equipTipo" class="form-control" value="${r?.equipTipo || 'BALSA INFLÁVEL'}" ${dis}></div>
          <div><label>Nº Série</label><input type="text" id="rel-equipNumeroSerie" class="form-control" value="${r?.equipNumeroSerie || ''}" ${dis}></div>
          <div><label>Ano Fabricação</label><input type="text" id="rel-equipAnoFabricacao" class="form-control" placeholder="Ex: 01/2010" value="${r?.equipAnoFabricacao || ''}" ${dis}></div>
          <div><label>Marca/Fabricante</label><input type="text" id="rel-equipFabricante" class="form-control" value="${r?.equipFabricante || ''}" ${dis}></div>
          <div><label>Modelo</label><input type="text" id="rel-equipModelo" class="form-control" value="${r?.equipModelo || ''}" ${dis}></div>
          <div><label>Classe</label><input type="text" id="rel-equipClasse" class="form-control" placeholder="Ex: Classe II Pack B" value="${r?.equipClasse || ''}" ${dis}></div>
          <div><label>Capacidade (pessoas)</label><input type="number" id="rel-equipCapacidade" class="form-control" value="${r?.equipCapacidade ?? ''}" ${novo ? 'onchange="atualizarQuantidadesPadraoRelatorio()"' : ''} ${dis}></div>
          <div><label>Nº Certificado de Revisão anterior</label><input type="text" id="rel-certRevisaoNumero" class="form-control" value="${r?.certRevisaoNumero || ''}" ${dis}></div>
          <div><label>Data de Expedição</label><input type="text" id="rel-certRevisaoDataExpedicao" class="form-control" value="${r?.certRevisaoDataExpedicao || ''}" ${dis}></div>
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
    <div onclick='selecionarEmbarcacaoRelatorio(${JSON.stringify(e).replace(/'/g, '&apos;')})'
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${e.nome}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${e.armador?.nome || ''}</span>
    </div>
  `).join('')
}

window.selecionarEmbarcacaoRelatorio = function (e) {
  document.getElementById('rel-embarcacao-busca').value = e.nome
  document.getElementById('rel-embarcacaoId').value = e.id
  document.getElementById('rel-embarcacao-armador').value = e.armador?.nome || ''
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
      <td><input type="text" class="form-control form-control-sm" id="cil-numero-${i}" value="${c.numero || ''}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-valvulaNumero-${i}" value="${c.valvulaNumero || ''}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-teste-${i}" value="${c.teste || ''}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-carga-${i}" value="${c.carga ?? ''}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-cargaCO2-${i}" value="${c.cargaCO2 ?? ''}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-cargaN2-${i}" value="${c.cargaN2 ?? ''}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-fabricante-${i}" value="${c.fabricante || ''}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-anoFabricacao-${i}" value="${c.anoFabricacao || ''}" ${dis}></td>
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

// Exposta em window para funcionar em onclick inline (ex: botão "← Voltar")
window.inicializarRelatorios = inicializarRelatorios
