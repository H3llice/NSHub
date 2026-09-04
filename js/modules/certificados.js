import { renderSecoesTecnicasRelatorio, prepararCilindros, renderizarCilindros, lerCamposTecnicosRelatorio, hojeISO } from './relatorios.js'

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
const tokenAtual = localStorage.getItem('ns_token')

// ══════════════════════════════════════════════════════════════════════════
// CERTIFICADO DE BALSA — etapa final do fluxo OS → Relatório → Certificado
// Por enquanto só cobre balsa (único tipo com Relatório implementado); os
// demais tipos (baleeira/turco/colete) continuam no formulário avulso antigo,
// acessível em Serviços → Certificados.
// ══════════════════════════════════════════════════════════════════════════

const STATUS_LABEL = {
  pendente: { texto: 'Pendente', cor: '#fd7e14' },
  emitido: { texto: 'Emitido', cor: '#198754' },
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

// Usada pela aba "Certificados" (Serviços → Certificados, ver js/app.js) pra
// listar junto com os certificados avulsos antigos (baleeira/turco/colete).
export async function listarCertificadosBalsa() {
  try {
    const resp = await apiFetch(`${API}/certificados`).then(r => r.json())
    return resp.certificados || []
  } catch {
    return []
  }
}

window.abrirCertificado = async function (id) {
  const [certificado, empresas] = await Promise.all([
    apiFetch(`${API}/certificados/${id}`).then(r => r.json()),
    apiFetch(`${API}/empresas`).then(r => r.json())
  ])

  exibirCertificado(certificado, empresas)
}

function exibirCertificado(c, empresas) {
  prepararCilindros(c.relatorio?.cilindros, false)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')
  document.getElementById('relatorios').innerHTML = renderCertificado(c, empresas)
  renderizarCilindros()
}

// Certificado emitido é referência oficial (assinatura já registrada), mas ao
// contrário de OC/Solicitação/Relatório ele não trava para edição depois de
// emitido — gerente/admin pode corrigir dataEmissao/validade/observações a
// qualquer momento (usuário pediu explicitamente essa exceção).
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

// A maioria dos campos aqui (embarcação, empresa, dados do equipamento) não são
// "do certificado" de verdade — são denormalizados do Relatório e da Embarcação
// (ver campos em CAMPOS_CERTIFICADO no backend). Editar essa tela na prática
// edita o Relatório de origem por baixo dos panos (única exceção às travas de
// documento concluído — usuário pediu explicitamente essa exceção pro Certificado).
function renderCertificado(c, empresas) {
  const emitido = c.status === 'emitido'
  const r = c.relatorio
  const dis = !podeEmitirCertificado ? 'disabled' : ''
  const dataEmissaoValor = c.dataEmissao ? c.dataEmissao.split('T')[0] : hojeISO()
  const validadeValor = c.validade || validadePadrao(dataEmissaoValor)
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${c.empresaId === e.id ? 'selected' : ''}>${e.nome} (${e.sigla})</option>`
  ).join('')

  return `
    <div style="margin-top:20px; max-width:1000px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="abrirPagina(event, 'certificados')">← Voltar</button>
        <div style="display:flex; gap:8px;">
          <a class="btn btn-secondary" href="${API}/certificados/${c.id}/pdf?token=${encodeURIComponent(tokenAtual)}" target="_blank">PDF</a>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
        <h3 style="margin:0;">Certificado ${c.numero}/${c.ano}</h3>
        ${badgeStatus(c.status)}
      </div>
      <p style="color:#999; font-size:13px; margin-bottom:20px;">Gerado a partir do Relatório ${r ? `${r.numero}/${r.ano}` : '-'}</p>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Identificação</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div><label>Empresa executante *</label><select id="cert-empresaId" class="form-control" ${dis}>${opcoesEmpresas}</select></div>
          <div style="position:relative;">
            <label>Embarcação (navio) *</label>
            <input type="text" id="cert-navio-busca" class="form-control" placeholder="Digite o nome do navio..."
              value="${c.embarcacao?.nome || ''}" oninput="buscarEmbarcacaoCertificado(this.value)" autocomplete="off" ${dis}>
            <div id="cert-sugestoes-embarcacao" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
            <input type="hidden" id="cert-embarcacaoId" value="${c.embarcacaoId || ''}">
          </div>
          <div><label>Armador</label><input type="text" id="cert-armador" class="form-control" value="${c.armador || ''}" ${dis}></div>
          <div><label>Porto de Registro</label><input type="text" id="cert-portoRegistro" class="form-control" value="${c.portoRegistro || ''}" ${dis}></div>
          <div><label>Telefone</label><input type="text" id="cert-telefone" class="form-control" value="${c.telefone || ''}" ${dis}></div>
          <div><label>Email</label><input type="text" id="cert-email" class="form-control" value="${c.email || ''}" ${dis}></div>
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Equipamento</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          <div><label>Tipo</label><input type="text" id="cert-equipTipo" class="form-control" value="${r?.equipTipo || ''}" ${dis}></div>
          <div><label>Nº Série</label><input type="text" id="cert-equipNumeroSerie" class="form-control" value="${r?.equipNumeroSerie || ''}" ${dis}></div>
          <div><label>Ano Fabricação</label><input type="text" id="cert-equipAnoFabricacao" class="form-control" placeholder="Ex: 01/2010" value="${r?.equipAnoFabricacao || ''}" ${dis}></div>
          <div><label>Marca/Fabricante</label><input type="text" id="cert-equipFabricante" class="form-control" value="${r?.equipFabricante || ''}" ${dis}></div>
          <div><label>Modelo</label><input type="text" id="cert-equipModelo" class="form-control" value="${r?.equipModelo || ''}" ${dis}></div>
          <div><label>Classe</label><input type="text" id="cert-equipClasse" class="form-control" placeholder="Ex: Classe II Pack B" value="${r?.equipClasse || ''}" ${dis}></div>
          <div><label>Capacidade (pessoas)</label><input type="number" id="cert-equipCapacidade" class="form-control" value="${r?.equipCapacidade ?? ''}" ${dis}></div>
        </div>
      </div>

      ${renderSecoesTecnicasRelatorio(r, false)}

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Emissão</div>
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

        ${!podeEmitirCertificado ? `
          <p style="margin-top:16px; color:#999; font-size:13px;">${emitido ? 'Certificado emitido.' : 'Aguardando um gerente ou administrador revisar e emitir este certificado.'}</p>
        ` : `
          <div style="margin-top:16px; display:flex; gap:12px;">
            <button type="button" class="btn btn-secondary" onclick="atualizarCertificado(${c.id})">Salvar</button>
            ${!emitido ? `<button type="button" class="btn btn-success" onclick="emitirCertificado(${c.id})">Emitir Certificado</button>` : ''}
          </div>
        `}
      </div>
    </div>
  `
}

// ─── Autocomplete de Embarcação (dedicado ao Certificado — armador/porto/
// telefone/email aqui são campos PRÓPRIOS do certificado, editáveis livremente,
// só recebem um valor sugerido da Embarcacao ao trocar de navio) ───────────────

window.buscarEmbarcacaoCertificado = async function (q) {
  const div = document.getElementById('cert-sugestoes-embarcacao')
  document.getElementById('cert-embarcacaoId').value = ''

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
    <div onclick='selecionarEmbarcacaoCertificado(${JSON.stringify(e).replace(/'/g, '&apos;')})'
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${e.nome}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${e.armador?.nome || ''}</span>
    </div>
  `).join('')
}

window.selecionarEmbarcacaoCertificado = function (e) {
  document.getElementById('cert-navio-busca').value = e.nome
  document.getElementById('cert-embarcacaoId').value = e.id
  document.getElementById('cert-armador').value = e.armador?.nome || ''
  document.getElementById('cert-portoRegistro').value = e.portoRegistro || ''
  document.getElementById('cert-telefone').value = e.armador?.telefone || ''
  document.getElementById('cert-email').value = e.armador?.email || ''
  document.getElementById('cert-sugestoes-embarcacao').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('cert-sugestoes-embarcacao')
  if (div && !div.contains(e.target) && e.target.id !== 'cert-navio-busca') {
    div.style.display = 'none'
  }
})

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

  return {
    empresaId: document.getElementById('cert-empresaId').value,
    embarcacaoId: document.getElementById('cert-embarcacaoId').value,
    armador: document.getElementById('cert-armador').value,
    portoRegistro: document.getElementById('cert-portoRegistro').value,
    telefone: document.getElementById('cert-telefone').value,
    email: document.getElementById('cert-email').value,
    dataEmissao: document.getElementById('cert-dataEmissao').value,
    validade: document.getElementById('cert-validade').value.trim(),
    observacoes: document.getElementById('cert-observacoes').value,
    relatorio: {
      empresaId: document.getElementById('cert-empresaId').value,
      embarcacaoId: document.getElementById('cert-embarcacaoId').value,
      ...equip,
      ...lerCamposTecnicosRelatorio()
    }
  }
}

window.atualizarCertificado = async function (id) {
  const body = lerFormularioCertificado()

  if (!body.embarcacaoId || !body.empresaId) {
    alert('Empresa e Embarcação são obrigatórias! Selecione a embarcação na lista de sugestões.')
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

  if (!body.embarcacaoId || !body.empresaId) {
    alert('Empresa e Embarcação são obrigatórias! Selecione a embarcação na lista de sugestões.')
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
