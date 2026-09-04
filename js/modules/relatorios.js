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

const tokenAtual = localStorage.getItem('ns_token')

const STATUS_LABEL = {
  preenchendo: { texto: 'Preenchendo', cor: '#6c757d' },
  concluido: { texto: 'Concluído', cor: '#198754' },
}
const STATUS_CERTIFICADO_LABEL = {
  pendente: { texto: 'Certificado pendente', cor: '#fd7e14' },
  emitido: { texto: 'Certificado emitido', cor: '#198754' },
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

export function inicializarRelatorios() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')

  document.getElementById('relatorios').innerHTML = `
    <div class="tab">Relatórios de Serviço</div>
    <p style="color:#999; font-size:13px;">Todo relatório é gerado a partir de uma Ordem de Serviço — abra Serviços → Ordens de serviço.</p>

    <table class="table-certificados" style="margin-top:16px;">
      <thead>
        <tr>
          <th>Nº</th>
          <th>Navio</th>
          <th>Armador</th>
          <th>Data</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-relatorios">
        <tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarRelatorios()
}

async function carregarRelatorios() {
  try {
    const resp = await apiFetch(`${API}/relatorios`).then(r => r.json())
    const tabela = document.getElementById('tabela-relatorios')

    if (resp.relatorios.length === 0) {
      tabela.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Nenhum relatório cadastrado ainda</td></tr>`
      return
    }

    tabela.innerHTML = resp.relatorios.map(r => `
      <tr>
        <td>${r.numero}/${r.ano}</td>
        <td>${r.embarcacao?.nome || '-'}</td>
        <td>${r.embarcacao?.armador?.nome || '-'}</td>
        <td>${new Date(r.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
        <td>${badgeStatus(r.status)}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm btn-info" onclick="editarRelatorio(${r.id})">${r.status === 'concluido' ? 'Ver' : 'Editar'}</button>
          <a class="btn btn-sm btn-secondary" href="${API}/relatorios/${r.id}/pdf?token=${encodeURIComponent(tokenAtual)}" target="_blank">PDF</a>
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
    equipTipo: os.equipModelo || '',
    equipNumeroSerie: os.equipNumeroSerie || '',
    equipFabricante: os.equipMarca || '',
  }

  document.getElementById('relatorios').innerHTML = renderFormularioRelatorio(preenchido, empresas)
  renderizarCilindros()
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

function renderFormularioRelatorio(r, empresas) {
  const somenteLeitura = r?.status === 'concluido'
  const dis = somenteLeitura ? 'disabled' : ''
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${r?.empresaId === e.id ? 'selected' : ''}>${e.nome} (${e.sigla})</option>`
  ).join('')
  const imo = r?.testeImo || {}

  const secao = (titulo, conteudoHtml) => `
    <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
      <div style="font-weight:700; color:#158815; margin-bottom:10px;">${titulo}</div>
      ${conteudoHtml}
    </div>
  `

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
          <div><label>Data *</label><input type="date" id="rel-data" class="form-control" value="${r?.data ? r.data.split('T')[0] : new Date().toISOString().split('T')[0]}" ${dis}></div>
          <div style="position:relative; grid-column: span 2;">
            <label>Embarcação (navio) * <small style="color:#999;">(busca por nome — autopreenche armador e porto)</small></label>
            <input type="text" id="rel-embarcacao-busca" class="form-control" placeholder="Digite o nome do navio..."
              value="${r?.embarcacao?.nome || ''}" oninput="buscarEmbarcacaoRelatorio(this.value)" autocomplete="off" ${dis}>
            <div id="sugestoes-embarcacao" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
            <input type="hidden" id="rel-embarcacaoId" value="${r?.embarcacaoId || ''}">
          </div>
          <div><label>Armador</label><input type="text" id="rel-embarcacao-armador" class="form-control" value="${r?.embarcacao?.armador?.nome || ''}" disabled></div>
          <div><label>Porto de Registro</label><input type="text" id="rel-embarcacao-porto" class="form-control" value="${r?.embarcacao?.portoRegistro || ''}" disabled></div>
        </div>
      `)}

      ${secao('Equipamento (balsa atendida)', `
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          <div><label>Tipo</label><input type="text" id="rel-equipTipo" class="form-control" value="${r?.equipTipo || 'BALSA INFLÁVEL'}" ${dis}></div>
          <div><label>Nº Série</label><input type="text" id="rel-equipNumeroSerie" class="form-control" value="${r?.equipNumeroSerie || ''}" ${dis}></div>
          <div><label>Ano Fabricação</label><input type="text" id="rel-equipAnoFabricacao" class="form-control" placeholder="Ex: 01/2010" value="${r?.equipAnoFabricacao || ''}" ${dis}></div>
          <div><label>Marca/Fabricante</label><input type="text" id="rel-equipFabricante" class="form-control" value="${r?.equipFabricante || ''}" ${dis}></div>
          <div><label>Modelo</label><input type="text" id="rel-equipModelo" class="form-control" value="${r?.equipModelo || ''}" ${dis}></div>
          <div><label>Classe</label><input type="text" id="rel-equipClasse" class="form-control" placeholder="Ex: Classe II Pack B" value="${r?.equipClasse || ''}" ${dis}></div>
          <div><label>Capacidade (pessoas)</label><input type="number" id="rel-equipCapacidade" class="form-control" value="${r?.equipCapacidade ?? ''}" ${dis}></div>
          <div></div>
          <div><label>Nº Certificado de Revisão anterior</label><input type="text" id="rel-certRevisaoNumero" class="form-control" value="${r?.certRevisaoNumero || ''}" ${dis}></div>
          <div><label>Data de Expedição</label><input type="text" id="rel-certRevisaoDataExpedicao" class="form-control" value="${r?.certRevisaoDataExpedicao || ''}" ${dis}></div>
        </div>
      `)}

      ${secao('Lista de Verificação e Reparos', `
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
      `)}

      ${secao('Checklist de Componentes', `
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
          ${COMPONENTES.map(([key, label]) => `
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
              <input type="checkbox" id="rel-check-${key}" ${r?.[key] ? 'checked' : ''} ${dis}>
              ${label}
            </label>
          `).join('')}
        </div>
      `)}

      ${secao('Teste de Flutuadores', `
        <table class="table-certificados">
          <thead><tr><th>Teste</th><th>Realizado</th><th>Valor</th></tr></thead>
          <tbody>
            ${TESTES_FLUTUADOR.map(([key, label]) => `
              <tr>
                <td>${label}</td>
                <td style="width:80px; text-align:center;"><input type="checkbox" id="rel-teste-${key}-realizado" ${r?.[`${key}Realizado`] ? 'checked' : ''} ${dis}></td>
                <td style="width:120px;"><input type="number" step="0.01" class="form-control form-control-sm" id="rel-teste-${key}-valor" value="${r?.[`${key}Valor`] ?? ''}" ${dis}></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="max-width:200px; margin-top:8px;"><label>Temperatura</label><input type="text" id="rel-temperatura" class="form-control" value="${r?.temperatura || ''}" ${dis}></div>
      `)}

      ${secao('Cilindros', `
        <div style="overflow-x:auto;">
          <table class="table-certificados" style="min-width:1400px;">
            <thead><tr><th>Nº</th><th>Nº Válvula</th><th>Teste</th><th>Carga (kg)</th><th>Carga CO2 (kg)</th><th>Carga N2 (kg)</th><th>Fabricante</th><th>Ano Fab.</th><th>Val. Hidrostática</th><th>Cabo Int. (m)</th><th>Cabo Ext. (m)</th><th>Altura Máx. (m)</th><th>Classe</th>${somenteLeitura ? '' : '<th></th>'}</tr></thead>
            <tbody id="lista-cilindros"></tbody>
          </table>
        </div>
        ${somenteLeitura ? '' : '<button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="adicionarCilindro()">+ Cilindro</button>'}
      `)}

      ${secao('Testes IMO — Resolução A.761(18)', `
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

      ${secao('Revisão Anual e Observações', `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div>
            <label>Revisão Anual OK?</label>
            <select id="rel-revisaoAnualOk" class="form-control" ${dis}>
              <option value="">Não informado</option>
              <option value="true" ${r?.revisaoAnualOk === true ? 'selected' : ''}>Sim</option>
              <option value="false" ${r?.revisaoAnualOk === false ? 'selected' : ''}>Não</option>
            </select>
          </div>
        </div>
        <div style="margin-top:16px;">
          <label>Observações</label>
          <textarea id="rel-observacoes" class="form-control" rows="3" ${dis}>${r?.observacoes || ''}</textarea>
        </div>
      `)}

      ${somenteLeitura ? '' : `
        <div style="margin-bottom:16px; display:flex; gap:12px;">
          <button type="button" class="btn btn-success" onclick="${r?.id ? `atualizarRelatorio(${r.id})` : 'salvarRelatorio()'}">Salvar</button>
          ${r?.id ? `<button type="button" class="btn btn-warning" onclick="concluirRelatorio(${r.id})">Concluir e Assinar</button>` : ''}
        </div>
      `}

      ${somenteLeitura ? `
        <div style="display:flex; align-items:center; gap:12px;">
          ${!r.certificado
            ? `<button type="button" class="btn btn-warning" onclick="gerarCertificadoDeRelatorio(${r.id})">Gerar Certificado</button>`
            : `<button type="button" class="btn btn-secondary" onclick="abrirCertificado(${r.certificado.id})">Ver Certificado</button> ${badgeStatusCertificado(r.certificado.status)}`
          }
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
    div.innerHTML = `<div style="padding:8px 12px; color:#999;">Nenhuma embarcação encontrada — cadastre em Cadastros → Embarcações primeiro</div>`
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

function renderizarCilindros() {
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
      <td><input type="text" class="form-control form-control-sm" id="cil-validadeHidrostatica-${i}" value="${c.validadeHidrostatica || ''}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-caboInternoMetros-${i}" value="${c.caboInternoMetros ?? ''}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-caboExternoMetros-${i}" value="${c.caboExternoMetros ?? ''}" ${dis}></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm" id="cil-alturaMaximaEstocagemMetros-${i}" value="${c.alturaMaximaEstocagemMetros ?? ''}" ${dis}></td>
      <td><input type="text" class="form-control form-control-sm" id="cil-classe-${i}" value="${c.classe || ''}" ${dis}></td>
      ${cilindrosSomenteLeitura ? '' : `<td><button class="btn btn-sm btn-danger" onclick="removerCilindro(${i})">✕</button></td>`}
    </tr>
  `).join('')
}

window.adicionarCilindro = function () {
  cilindrosEstado.push({})
  renderizarCilindros()
}

window.removerCilindro = function (i) {
  cilindrosEstado.splice(i, 1)
  renderizarCilindros()
}

function lerCilindrosDoForm() {
  const campos = ['numero', 'valvulaNumero', 'teste', 'carga', 'cargaCO2', 'cargaN2', 'fabricante', 'anoFabricacao',
    'validadeHidrostatica', 'caboInternoMetros', 'caboExternoMetros', 'alturaMaximaEstocagemMetros', 'classe']
  const numericos = ['carga', 'cargaCO2', 'cargaN2', 'caboInternoMetros', 'caboExternoMetros', 'alturaMaximaEstocagemMetros']

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

function lerFormularioRelatorio() {
  const body = {
    ordemServicoId: document.getElementById('rel-ordemServicoId').value,
    empresaId: document.getElementById('rel-empresaId').value,
    embarcacaoId: document.getElementById('rel-embarcacaoId').value,
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
    temperatura: document.getElementById('rel-temperatura').value,
    observacoes: document.getElementById('rel-observacoes').value,
  }

  const revisao = document.getElementById('rel-revisaoAnualOk').value
  body.revisaoAnualOk = revisao === '' ? null : revisao === 'true'

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

  TESTES_FLUTUADOR.forEach(([key]) => {
    body[`${key}Realizado`] = document.getElementById(`rel-teste-${key}-realizado`).checked
    body[`${key}Valor`] = document.getElementById(`rel-teste-${key}-valor`).value
  })

  body.cilindros = lerCilindrosDoForm()

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

window.salvarRelatorio = async function () {
  const body = lerFormularioRelatorio()
  if (!body.ordemServicoId) {
    alert('Relatório precisa ser gerado a partir de uma Ordem de Serviço.')
    return
  }
  if (!body.empresaId || !body.embarcacaoId) {
    alert('Empresa e Embarcação são obrigatórios! Selecione a embarcação na lista de sugestões.')
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
  if (!body.empresaId || !body.embarcacaoId) {
    alert('Empresa e Embarcação são obrigatórios! Selecione a embarcação na lista de sugestões.')
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

// Exposta em window para funcionar em onclick inline (ex: botão "← Voltar")
window.inicializarRelatorios = inicializarRelatorios
