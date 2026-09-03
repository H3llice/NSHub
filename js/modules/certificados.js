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
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
    document.getElementById('relatorios').classList.add('active')
    document.getElementById('relatorios').innerHTML = renderCertificado(certificado)
  } else {
    const err = await res.json()
    alert('Erro ao gerar certificado: ' + (err.erro || 'falha'))
  }
}

window.abrirCertificado = async function (id) {
  const certificado = await apiFetch(`${API}/certificados/${id}`).then(r => r.json())

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('relatorios').classList.add('active')
  document.getElementById('relatorios').innerHTML = renderCertificado(certificado)
}

function renderCertificado(c) {
  const emitido = c.status === 'emitido'
  const r = c.relatorio

  return `
    <div style="margin-top:20px; max-width:900px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="inicializarRelatorios()">← Voltar</button>
        <div style="display:flex; gap:8px;">
          <a class="btn btn-secondary" href="${API}/certificados/${c.id}/pdf?token=${encodeURIComponent(tokenAtual)}" target="_blank">PDF</a>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <h3 style="margin:0;">Certificado ${c.numero}/${c.ano}</h3>
        ${badgeStatus(c.status)}
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Dados do Relatório de origem</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div><label>Navio</label><input type="text" class="form-control" value="${c.embarcacao?.nome || ''}" disabled></div>
          <div><label>Armador</label><input type="text" class="form-control" value="${c.embarcacao?.armador?.nome || ''}" disabled></div>
          <div><label>Empresa executante</label><input type="text" class="form-control" value="${c.empresa?.nome || ''}" disabled></div>
          <div><label>Relatório de origem</label><input type="text" class="form-control" value="${r ? `${r.numero}/${r.ano}` : '-'}" disabled></div>
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Emissão</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div>
            <label>Data de Emissão ${emitido ? '' : '*'}</label>
            <input type="date" id="cert-dataEmissao" class="form-control"
              value="${c.dataEmissao ? c.dataEmissao.split('T')[0] : new Date().toISOString().split('T')[0]}"
              ${emitido || !podeEmitirCertificado ? 'disabled' : ''}>
          </div>
          <div>
            <label>Validade ${emitido ? '' : '*'} <small style="color:#999;">(ex: 05/2027)</small></label>
            <input type="text" id="cert-validade" class="form-control" placeholder="Ex: 05/2027" value="${c.validade || ''}"
              ${emitido || !podeEmitirCertificado ? 'disabled' : ''}>
          </div>
        </div>
        <div style="margin-top:16px;">
          <label>Observações</label>
          <textarea id="cert-observacoes" class="form-control" rows="3" ${emitido || !podeEmitirCertificado ? 'disabled' : ''}>${c.observacoes || ''}</textarea>
        </div>

        ${!emitido && !podeEmitirCertificado ? `
          <p style="margin-top:16px; color:#999; font-size:13px;">Aguardando um gerente ou administrador revisar e emitir este certificado.</p>
        ` : ''}

        ${!emitido && podeEmitirCertificado ? `
          <div style="margin-top:16px;">
            <button type="button" class="btn btn-success" onclick="emitirCertificado(${c.id})">Emitir Certificado</button>
          </div>
        ` : ''}
      </div>
    </div>
  `
}

window.emitirCertificado = async function (id) {
  const dataEmissao = document.getElementById('cert-dataEmissao').value
  const validade = document.getElementById('cert-validade').value.trim()
  const observacoes = document.getElementById('cert-observacoes').value

  if (!dataEmissao || !validade) {
    alert('Data de emissão e validade são obrigatórias para emitir o certificado')
    return
  }
  if (!confirm('Emitir este certificado? Depois de emitido ele não pode mais ser editado.')) return

  const res = await apiJson(`${API}/certificados/${id}/emitir`, {
    method: 'POST',
    body: JSON.stringify({ dataEmissao, validade, observacoes })
  })

  if (res.ok) {
    alert('Certificado emitido com sucesso!')
    window.abrirCertificado(id)
  } else {
    const err = await res.json()
    alert('Erro ao emitir certificado: ' + (err.erro || 'falha'))
  }
}
