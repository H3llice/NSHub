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
// ORDENS DE SERVIÇO (Serviços → Ordens de serviço) — precede o Relatório
// ══════════════════════════════════════════════════════════════════════════

const STATUS_LABEL = {
  aberta: { texto: 'Aberta', cor: '#6c757d' },
  concluida: { texto: 'Concluída', cor: '#198754' },
}

function badgeStatus(status) {
  const s = STATUS_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

export function inicializarOrdensServico() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('os').classList.add('active')

  document.getElementById('os').innerHTML = `
    <div class="tab">Ordens de Serviço</div>
    <button class="btn btn-success" onclick="abrirFormularioOS()">+ Nova OS</button>

    <table class="table-certificados" style="margin-top:16px;">
      <thead>
        <tr>
          <th>Nº</th>
          <th>Navio</th>
          <th>Cliente</th>
          <th>Emissão</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-os">
        <tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  carregarOrdensServico()
}

async function carregarOrdensServico() {
  try {
    const resp = await apiFetch(`${API}/ordens-servico`).then(r => r.json())
    const tabela = document.getElementById('tabela-os')

    if (resp.ordensServico.length === 0) {
      tabela.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Nenhuma OS cadastrada ainda</td></tr>`
      return
    }

    tabela.innerHTML = resp.ordensServico.map(os => `
      <tr>
        <td>${os.numero}/${os.ano}</td>
        <td>${os.embarcacao?.nome || '-'}</td>
        <td>${os.cliente?.nome || '-'}</td>
        <td>${new Date(os.dataEmissao).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
        <td>${badgeStatus(os.status)}</td>
        <td>
          <button class="btn btn-sm btn-info" onclick="editarOS(${os.id})">${os.status === 'aberta' ? 'Editar' : 'Ver'}</button>
          ${!os.relatorio ? `<button class="btn btn-sm btn-warning" onclick="gerarRelatorioDeOS(${os.id})">Gerar Relatório</button>` : `<button class="btn btn-sm btn-secondary" onclick="editarRelatorio(${os.relatorio.id})">Ver Relatório</button>`}
        </td>
      </tr>
    `).join('')
  } catch {
    document.getElementById('tabela-os').innerHTML = `
      <tr><td colspan="6" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

// ─── Formulário (criar / editar) ────────────────────────────────────────────────

window.abrirFormularioOS = async function () {
  const empresas = await apiFetch(`${API}/empresas`).then(r => r.json())
  document.getElementById('os').innerHTML = renderFormularioOS(null, empresas)
}

window.editarOS = async function (id) {
  const [os, empresas] = await Promise.all([
    apiFetch(`${API}/ordens-servico/${id}`).then(res => res.json()),
    apiFetch(`${API}/empresas`).then(res => res.json())
  ])
  document.getElementById('os').innerHTML = renderFormularioOS(os, empresas)
}

function renderFormularioOS(os, empresas) {
  const somenteLeitura = os?.status === 'concluida'
  const dis = somenteLeitura ? 'disabled' : ''
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${os?.empresaId === e.id ? 'selected' : ''}>${e.nome} (${e.sigla})</option>`
  ).join('')

  return `
    <div style="margin-top:20px; max-width:900px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="inicializarOrdensServico()">← Voltar</button>
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <h3 style="margin:0;">${os ? `Ordem de Serviço ${os.numero}/${os.ano}` : 'Nova Ordem de Serviço'}</h3>
        ${os ? badgeStatus(os.status) : ''}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px; display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div><label>Empresa executante *</label><select id="os-empresaId" class="form-control" ${dis}>${opcoesEmpresas}</select></div>
        <div><label>Aos cuidados de</label><input type="text" id="os-aosCuidadosDe" class="form-control" value="${os?.aosCuidadosDe || ''}" ${dis}></div>

        <div style="position:relative; grid-column: span 2;">
          <label>Embarcação (navio) * <small style="color:#999;">(busca por nome — sugere o armador como cliente)</small></label>
          <input type="text" id="os-embarcacao-busca" class="form-control" placeholder="Digite o nome do navio..."
            value="${os?.embarcacao?.nome || ''}" oninput="buscarEmbarcacaoOS(this.value)" autocomplete="off" ${dis}>
          <div id="sugestoes-embarcacao-os" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
          <input type="hidden" id="os-embarcacaoId" value="${os?.embarcacaoId || ''}">
        </div>
        <div><label>Porto de Registro</label><input type="text" id="os-embarcacao-porto" class="form-control" value="${os?.embarcacao?.portoRegistro || ''}" ${dis}></div>
        <div></div>

        <div style="position:relative;">
          <label>Cliente *</label>
          <input type="text" id="os-cliente-busca" class="form-control" placeholder="Digite nome ou CPF/CNPJ..."
            value="${os?.cliente?.nome || ''}" oninput="buscarClienteOS(this.value)" autocomplete="off" ${dis}>
          <div id="sugestoes-cliente-os" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
          <input type="hidden" id="os-clienteId" value="${os?.clienteId || ''}">
        </div>
        <div>
          <label>CPF/CNPJ do cliente <small style="color:#999;">(só p/ cadastrar cliente novo)</small></label>
          <input type="text" id="os-cliente-cpfCnpj" class="form-control" placeholder="Somente números" value="${os?.cliente?.cpfCnpj || ''}" ${dis}>
        </div>

        <div><label>Data de Início</label><input type="date" id="os-dataInicio" class="form-control" value="${os?.dataInicio ? os.dataInicio.split('T')[0] : ''}" ${dis}></div>
        <div><label>Previsão de Entrega</label><input type="date" id="os-previsaoEntrega" class="form-control" value="${os?.previsaoEntrega ? os.previsaoEntrega.split('T')[0] : ''}" ${dis}></div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Equipamento Recebido</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div style="grid-column: span 2;"><label>Equipamento</label><input type="text" id="os-equipamentoRecebido" class="form-control" placeholder="Ex: Balsa de resgate inflável salva vidas" value="${os?.equipamentoRecebido || ''}" ${dis}></div>
          <div><label>Nº de Série</label><input type="text" id="os-equipNumeroSerie" class="form-control" value="${os?.equipNumeroSerie || ''}" ${dis}></div>
          <div><label>Marca</label><input type="text" id="os-equipMarca" class="form-control" value="${os?.equipMarca || ''}" ${dis}></div>
          <div><label>Modelo</label><input type="text" id="os-equipModelo" class="form-control" value="${os?.equipModelo || ''}" ${dis}></div>
          <div><label>Vencimento da Certificação</label><input type="text" id="os-vencimentoCertificacao" class="form-control" placeholder="Ex: 05/2027" value="${os?.vencimentoCertificacao || ''}" ${dis}></div>
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="margin-bottom:16px;">
          <label>Problema ou defeito apresentado</label>
          <textarea id="os-problemaApresentado" class="form-control" rows="2" ${dis}>${os?.problemaApresentado || ''}</textarea>
        </div>
        <div style="margin-bottom:16px;">
          <label>Serviço que será prestado</label>
          <textarea id="os-servicoApresentado" class="form-control" rows="2" ${dis}>${os?.servicoApresentado || ''}</textarea>
        </div>
        <div>
          <label>Observações</label>
          <textarea id="os-observacoes" class="form-control" rows="3" ${dis}>${os?.observacoes || ''}</textarea>
        </div>
      </div>

      ${somenteLeitura ? '' : `
        <div style="margin-top:20px; display:flex; gap:12px;">
          <button type="button" class="btn btn-success" onclick="${os ? `atualizarOS(${os.id})` : 'salvarOS()'}">Salvar</button>
          ${os ? `<button type="button" class="btn btn-warning" onclick="concluirOS(${os.id})">Concluir OS (retirada do equipamento)</button>` : ''}
        </div>
      `}
    </div>
  `
}

// ─── Autocomplete de Embarcação (autopreenche cliente sugerido = armador) ──────

window.buscarEmbarcacaoOS = async function (q) {
  const div = document.getElementById('sugestoes-embarcacao-os')
  document.getElementById('os-embarcacaoId').value = ''

  if (q.length < 2) {
    div.style.display = 'none'
    return
  }

  const results = await apiFetch(`${API}/embarcacoes/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())

  if (results.length === 0) {
    div.innerHTML = `<div style="padding:8px 12px; color:#999;">Nenhuma embarcação encontrada — será cadastrada automaticamente ao salvar a OS</div>`
    div.style.display = 'block'
    return
  }

  div.style.display = 'block'
  div.innerHTML = results.map(e => `
    <div onclick='selecionarEmbarcacaoOS(${JSON.stringify(e).replace(/'/g, '&apos;')})'
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${e.nome}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${e.armador?.nome || ''}</span>
    </div>
  `).join('')
}

window.selecionarEmbarcacaoOS = function (e) {
  document.getElementById('os-embarcacao-busca').value = e.nome
  document.getElementById('os-embarcacaoId').value = e.id
  document.getElementById('os-embarcacao-porto').value = e.portoRegistro || ''

  // Sugere o armador como cliente — continua editável/trocável (ver docstring do campo)
  if (e.armador) {
    document.getElementById('os-cliente-busca').value = e.armador.nome
    document.getElementById('os-clienteId').value = e.armador.id
    document.getElementById('os-cliente-cpfCnpj').value = e.armador.cpfCnpj || ''
  }

  document.getElementById('sugestoes-embarcacao-os').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const divEmb = document.getElementById('sugestoes-embarcacao-os')
  if (divEmb && !divEmb.contains(e.target) && e.target.id !== 'os-embarcacao-busca') {
    divEmb.style.display = 'none'
  }
  const divCli = document.getElementById('sugestoes-cliente-os')
  if (divCli && !divCli.contains(e.target) && e.target.id !== 'os-cliente-busca') {
    divCli.style.display = 'none'
  }
})

// ─── Autocomplete de Cliente ─────────────────────────────────────────────────────

window.buscarClienteOS = async function (q) {
  const div = document.getElementById('sugestoes-cliente-os')
  document.getElementById('os-clienteId').value = ''

  if (q.length < 2) {
    div.style.display = 'none'
    return
  }

  const results = await apiFetch(`${API}/clientes/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())

  if (results.length === 0) {
    div.innerHTML = `<div style="padding:8px 12px; color:#999;">Nenhum cliente encontrado — será cadastrado automaticamente ao salvar a OS (informe o CPF/CNPJ ao lado)</div>`
    div.style.display = 'block'
    return
  }

  div.style.display = 'block'
  div.innerHTML = results.map(c => `
    <div onclick='selecionarClienteOS(${JSON.stringify(c)})'
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${c.nome}</strong>
      <span style="color:#999; font-size:12px; margin-left:8px;">${c.cpfCnpj}</span>
    </div>
  `).join('')
}

window.selecionarClienteOS = function (c) {
  document.getElementById('os-cliente-busca').value = c.nome
  document.getElementById('os-clienteId').value = c.id
  document.getElementById('os-cliente-cpfCnpj').value = c.cpfCnpj || ''
  document.getElementById('sugestoes-cliente-os').style.display = 'none'
}

// ─── Garante cliente/embarcação antes de salvar a OS ───────────────────────────
// Mesmo padrão do fornecedor na OC: se o campo de busca não resultou numa seleção
// (id vazio), cadastra na hora com o que foi digitado, em vez de bloquear o salvar.
// Cliente primeiro — embarcação exige um armador (Cliente) já existente.
async function garantirClienteEEmbarcacaoOS() {
  let clienteId = document.getElementById('os-clienteId').value
  const clienteNome = document.getElementById('os-cliente-busca').value.trim()

  if (!clienteId) {
    if (!clienteNome) {
      alert('Informe o cliente')
      return null
    }

    const cpfCnpj = document.getElementById('os-cliente-cpfCnpj').value.replace(/\D/g, '')
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
      alert(`Cliente "${clienteNome}" não encontrado — informe o CPF (11 dígitos) ou CNPJ (14 dígitos) dele no campo "CPF/CNPJ do cliente" para cadastrá-lo automaticamente ao salvar`)
      return null
    }
    const tipoPessoa = cpfCnpj.length === 11 ? 'fisica' : 'juridica'

    const res = await apiJson(`${API}/clientes`, {
      method: 'POST',
      body: JSON.stringify({ tipoPessoa, cpfCnpj, nome: clienteNome })
    })
    const data = await res.json()

    if (res.ok) {
      clienteId = data.id
    } else if (data.cliente) {
      // Já existe cliente com esse CPF/CNPJ — aproveita em vez de travar o usuário
      clienteId = data.cliente.id
    } else {
      alert('Erro ao cadastrar cliente: ' + (data.erro || 'falha'))
      return null
    }
    document.getElementById('os-clienteId').value = clienteId
  }

  let embarcacaoId = document.getElementById('os-embarcacaoId').value
  const embarcacaoNome = document.getElementById('os-embarcacao-busca').value.trim()

  if (!embarcacaoId) {
    if (!embarcacaoNome) {
      alert('Informe a embarcação')
      return null
    }

    const portoRegistro = document.getElementById('os-embarcacao-porto').value.trim()
    const res = await apiJson(`${API}/embarcacoes`, {
      method: 'POST',
      body: JSON.stringify({ nome: embarcacaoNome, armadorId: clienteId, portoRegistro })
    })
    const data = await res.json()

    if (!res.ok) {
      alert('Erro ao cadastrar embarcação: ' + (data.erro || 'falha'))
      return null
    }
    embarcacaoId = data.id
    document.getElementById('os-embarcacaoId').value = embarcacaoId
  }

  return { clienteId, embarcacaoId }
}

// ─── Leitura do formulário / salvar ─────────────────────────────────────────────

function lerFormularioOS() {
  return {
    empresaId: document.getElementById('os-empresaId').value,
    aosCuidadosDe: document.getElementById('os-aosCuidadosDe').value,
    embarcacaoId: document.getElementById('os-embarcacaoId').value,
    clienteId: document.getElementById('os-clienteId').value,
    dataInicio: document.getElementById('os-dataInicio').value,
    previsaoEntrega: document.getElementById('os-previsaoEntrega').value,
    equipamentoRecebido: document.getElementById('os-equipamentoRecebido').value,
    equipNumeroSerie: document.getElementById('os-equipNumeroSerie').value,
    equipMarca: document.getElementById('os-equipMarca').value,
    equipModelo: document.getElementById('os-equipModelo').value,
    vencimentoCertificacao: document.getElementById('os-vencimentoCertificacao').value,
    problemaApresentado: document.getElementById('os-problemaApresentado').value,
    servicoApresentado: document.getElementById('os-servicoApresentado').value,
    observacoes: document.getElementById('os-observacoes').value,
  }
}

window.salvarOS = async function () {
  if (!document.getElementById('os-empresaId').value) {
    alert('Empresa executante é obrigatória!')
    return
  }

  const ids = await garantirClienteEEmbarcacaoOS()
  if (!ids) return

  const body = { ...lerFormularioOS(), clienteId: ids.clienteId, embarcacaoId: ids.embarcacaoId }

  const res = await apiJson(`${API}/ordens-servico`, { method: 'POST', body: JSON.stringify(body) })
  if (res.ok) {
    const os = await res.json()
    alert('Ordem de Serviço criada com sucesso!')
    editarOS(os.id)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao criar'))
  }
}

window.atualizarOS = async function (id) {
  if (!document.getElementById('os-empresaId').value) {
    alert('Empresa executante é obrigatória!')
    return
  }

  const ids = await garantirClienteEEmbarcacaoOS()
  if (!ids) return

  const body = { ...lerFormularioOS(), clienteId: ids.clienteId, embarcacaoId: ids.embarcacaoId }

  const res = await apiJson(`${API}/ordens-servico/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  if (res.ok) {
    alert('Ordem de Serviço atualizada com sucesso!')
    editarOS(id)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao atualizar'))
  }
}

window.concluirOS = async function (id) {
  if (!confirm('Concluir a OS (retirada do equipamento)? Depois de concluída ela não pode mais ser editada.')) return
  const horaEntrada = prompt('Hora de entrada (opcional):') || ''
  const horaSaida = prompt('Hora de saída (opcional):') || ''

  const res = await apiJson(`${API}/ordens-servico/${id}/concluir`, {
    method: 'POST',
    body: JSON.stringify({ horaEntrada, horaSaida })
  })
  if (res.ok) {
    alert('Ordem de Serviço concluída!')
    editarOS(id)
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao concluir'))
  }
}

// Exposta em window para funcionar em onclick inline (ex: botão "← Voltar")
window.inicializarOrdensServico = inicializarOrdensServico
