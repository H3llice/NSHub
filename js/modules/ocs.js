const API = 'https://override-steerable-professed.ngrok-free.dev'

// ─── Auth helper ──────────────────────────────────────────────────────────────
function apiFetch(url, options = {}) {
  const token = localStorage.getItem('ns_token')
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true'
    }
  })
}

function apiJson(url, options = {}) {
  const token = localStorage.getItem('ns_token')
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'ngrok-skip-browser-warning': 'true',
      ...(options.headers || {})
    }
  })
}

const usuarioAtual = JSON.parse(localStorage.getItem('ns_usuario') || 'null')
const perfil = usuarioAtual?.perfil || 'usuario'

// ─── Labels de status ─────────────────────────────────────────────────────────
const STATUS_LABEL = {
  aberta: { texto: 'Aberta', cor: '#6c757d' },
  aguardando_aprovacao: { texto: 'Ag. Aprovação', cor: '#fd7e14' },
  aguardando_autorizacao: { texto: 'Ag. Autorização', cor: '#0d6efd' },
  aprovada: { texto: 'Aprovada', cor: '#198754' },
  recusada: { texto: 'Recusada', cor: '#dc3545' },
  cancelada: { texto: 'Cancelada', cor: '#adb5bd' },
  migrada: { texto: 'Migrada', cor: '#6c757d' },
}

function badgeStatus(status) {
  const s = STATUS_LABEL[status] || { texto: status, cor: '#6c757d' }
  return `<span style="background:${s.cor}; color:white; padding:2px 8px; border-radius:12px; font-size:12px;">${s.texto}</span>`
}

// ===== RENDERIZA A PÁGINA DE OCs =====
export function inicializarOCs() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('ocs').classList.add('active')

  const container = document.getElementById('ocs')
  container.innerHTML = `
    <div class="tab">Ordens de Compra</div>
    <button class="btn btn-success" onclick="abrirFormularioOC()">+ Nova OC</button>

    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 8px; margin: 16px 0; align-items: end;">
      <div>
        <label>Buscar</label>
        <input type="text" id="filtro-busca" class="form-control" placeholder="Número ou fornecedor..." oninput="aplicarFiltros()">
      </div>
      <div>
        <label>Empresa</label>
        <select id="filtro-empresa" class="form-control" onchange="aplicarFiltros()">
          <option value="">Todas</option>
        </select>
      </div>
      <div>
        <label>Status</label>
        <select id="filtro-status" class="form-control" onchange="aplicarFiltros()">
          <option value="">Todos</option>
          <option value="aguardando_aprovacao">Ag. Aprovação</option>
          <option value="aguardando_autorizacao">Ag. Autorização</option>
          <option value="aprovada">Aprovada</option>
          <option value="recusada">Recusada</option>
          <option value="migrada">Migrada</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>
      <div>
        <label>Data início</label>
        <input type="date" id="filtro-data-inicio" class="form-control" onchange="aplicarFiltros()">
      </div>
      <div>
        <label>Data fim</label>
        <input type="date" id="filtro-data-fim" class="form-control" onchange="aplicarFiltros()">
      </div>
    </div>

    <div id="contador-ocs" style="color:#999; font-size:12px; margin-bottom: 8px;"></div>

    <table class="table-certificados">
      <thead>
        <tr>
          <th>Número</th>
          <th>Fornecedor</th>
          <th>Data</th>
          <th>Valor Total</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody id="tabela-ocs">
        <tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Carregando...</td></tr>
      </tbody>
    </table>
  `

  fetch(`${API}/empresas`, { headers: { 'ngrok-skip-browser-warning': 'true' } }).then(r => r.json()).then(empresas => {
    const select = document.getElementById('filtro-empresa')
    empresas.forEach(e => {
      select.innerHTML += `<option value="${e.id}">${e.sigla}</option>`
    })
  })

  carregarOCs()

  // Abre OC direto se vier do link do email
  const hash = window.location.hash
  if (hash.startsWith('#oc-')) {
    const id = parseInt(hash.replace('#oc-', ''))
    if (!isNaN(id)) {
      setTimeout(() => {
        verOC(id)
        history.replaceState(null, '', window.location.pathname)
      }, 800)
    }
  }
}

// ===== CARREGA OCs DO BACKEND =====
let paginaAtual = 1

window.carregarOCs = async function (pagina = 1) {
  paginaAtual = pagina
  const busca = document.getElementById('filtro-busca')?.value || ''
  const empresa = document.getElementById('filtro-empresa')?.value || ''
  const status = document.getElementById('filtro-status')?.value || ''
  const dataInicio = document.getElementById('filtro-data-inicio')?.value || ''
  const dataFim = document.getElementById('filtro-data-fim')?.value || ''

  const params = new URLSearchParams()
  if (busca) params.append('busca', busca)
  if (empresa) params.append('empresa', empresa)
  if (status) params.append('status', status)
  if (dataInicio) params.append('dataInicio', dataInicio)
  if (dataFim) params.append('dataFim', dataFim)
  params.append('pagina', pagina)

  try {
    const res = await apiFetch(`${API}/ocs?${params}`)
    const { ocs, total, totalPaginas } = await res.json()
    renderizarTabela(ocs)

    const contador = document.getElementById('contador-ocs')
    if (contador) {
      contador.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${total} OCs encontradas</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="btn btn-sm btn-secondary" onclick="carregarOCs(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span>Página ${pagina} de ${totalPaginas}</span>
            <button class="btn btn-sm btn-secondary" onclick="carregarOCs(${pagina + 1})" ${pagina >= totalPaginas ? 'disabled' : ''}>Próxima →</button>
          </div>
        </div>
      `
    }
  } catch (err) {
    document.getElementById('tabela-ocs').innerHTML = `
      <tr><td colspan="6" style="text-align:center; color:red; padding:30px;">Erro ao conectar com o servidor</td></tr>
    `
  }
}

// ===== RENDERIZA A TABELA =====
function renderizarTabela(ocs) {
  const tabela = document.getElementById('tabela-ocs')

  if (ocs.length === 0) {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999; padding:30px;">Nenhuma OC cadastrada ainda</td></tr>`
    return
  }

  tabela.innerHTML = ocs.map(oc => {
    const total = oc.itens.reduce((acc, item) => acc + (item.valorTotal || 0), 0)
    const data = new Date(oc.dataPedido).toLocaleDateString('pt-BR')
    const numero = `OC ${oc.numero}.${oc.ano}-${oc.empresa?.sigla || ''}`
    const cancelada = oc.status === 'cancelada'

    const botoesAcao = cancelada
      ? `<button class="btn btn-sm btn-success" onclick="restaurarOC(${oc.id})">Restaurar</button>`
      : botoesParaPerfil(oc, numero)

    return `
      <tr style="${cancelada ? 'opacity:0.6; background:#fff5f5;' : ''}">
        <td><a href="#" onclick="verOC(${oc.id}); return false;" style="color:var(--verde); font-weight:600; text-decoration:none;">${numero}</a></td>
        <td><a href="#" onclick="verOC(${oc.id}); return false;" style="color:inherit; text-decoration:none;">${oc.fornecedor?.nome || '-'}</a></td>
        <td>${data}</td>
        <td>R$ ${total.toFixed(2)}</td>
        <td>${badgeStatus(oc.status)}</td>
        <td style="white-space:nowrap;">${botoesAcao}</td>
      </tr>
    `
  }).join('')
}

// ─── Botões por perfil e status ───────────────────────────────────────────────
function botoesParaPerfil(oc, numero) {
  const btns = []
  const s = oc.status

  const editavel = ['aberta', 'aguardando_aprovacao', 'recusada'].includes(s)
  if (editavel) {
    btns.push(`<button class="btn btn-sm btn-info" onclick="editarOC(${oc.id})">Editar</button>`)
  }

  btns.push(`<a class="btn btn-sm btn-secondary" href="${API}/pdf/${oc.id}" target="_blank">PDF</a>`)

  if ((perfil === 'gerente' || perfil === 'admin') && s === 'aguardando_aprovacao') {
    btns.push(`<button class="btn btn-sm btn-success" onclick="abrirModalAssinatura(${oc.id}, 'aprovar')">✓ Aprovar</button>`)
    btns.push(`<button class="btn btn-sm btn-danger" onclick="abrirModalRecusa(${oc.id})">✗ Recusar</button>`)
  }

  if ((perfil === 'financeiro' || perfil === 'admin') && s === 'aguardando_autorizacao') {
    btns.push(`<button class="btn btn-sm btn-success" onclick="abrirModalAssinatura(${oc.id}, 'autorizar')">✓ Autorizar</button>`)
    btns.push(`<button class="btn btn-sm btn-danger" onclick="abrirModalRecusa(${oc.id})">✗ Recusar</button>`)
  }

  if (!['aprovada'].includes(s)) {
    btns.push(`<button class="btn btn-sm btn-danger" onclick="deletarOC(${oc.id}, '${numero}')">Cancelar</button>`)
  }

  return btns.join(' ')
}

// ===== VISUALIZAÇÃO DA OC ====================================================
window.verOC = async function (id) {
  const oc = await apiFetch(`${API}/ocs/${id}`).then(r => r.json())

  const total = oc.itens.reduce((acc, item) => acc + (item.valorTotal || 0), 0)
  const numero = `OC ${oc.numero}.${oc.ano}-${oc.empresa?.sigla || ''}`
  const dataPedido = oc.dataPedido ? new Date(oc.dataPedido).toLocaleDateString('pt-BR') : '-'

  const asSolicitante = oc.assinaturas?.find(a => a.etapa === 'solicitante')
  const asAprovacao = oc.assinaturas?.find(a => a.etapa === 'aprovacao')
  const asAutorizacao = oc.assinaturas?.find(a => a.etapa === 'autorizacao')

  function blocoAssinatura(cargo, assinatura, acao) {
    const recusada = assinatura?.acao === 'recusada'
    const cor = recusada ? '#dc3545' : '#158815'

    // Solicitante: qualquer usuário logado pode assinar se ainda não foi assinado
    const podeAssinarSolicitante = acao === 'solicitante' && !assinatura

    // Gerente/financeiro: só quando for a vez deles
    const podeAssinarFluxo = acao && acao !== 'solicitante' && !assinatura && (
      (acao === 'aprovar' && (perfil === 'gerente' || perfil === 'admin') && oc.status === 'aguardando_aprovacao') ||
      (acao === 'autorizar' && (perfil === 'financeiro' || perfil === 'admin') && oc.status === 'aguardando_autorizacao')
    )

    const podeAssinar = podeAssinarSolicitante || podeAssinarFluxo

    const cursor = podeAssinar ? 'cursor:pointer;' : ''
    const hover = podeAssinar ? `onmouseover="this.style.background='#f0fff0'" onmouseout="this.style.background='white'"` : ''
    const click = podeAssinar ? `onclick="abrirModalAssinatura(${oc.id}, '${acao}')"` : ''
    const dica = podeAssinar ? `<div style="font-size:11px; color:#158815; margin-top:6px;">Clique para assinar</div>` : ''

    return `
      <div style="text-align:center; border:1px solid ${podeAssinar ? '#158815' : '#ddd'}; border-radius:6px; padding:16px; ${cursor}" ${hover} ${click}>
        <div style="font-weight:700; font-size:12px; color:#555; margin-bottom:8px;">${cargo}</div>
        ${assinatura?.assinaturaImg
        ? `<img src="${assinatura.assinaturaImg}" style="max-height:60px; max-width:160px; margin:0 auto 8px; display:block;">`
        : `<div style="height:60px; border-bottom:1px solid #ccc; margin-bottom:8px;"></div>`
      }
        <div style="font-size:12px; color:${cor}; font-weight:600;">
          ${assinatura
        ? `${assinatura.acao === 'aprovada' ? '✓' : '✗'} ${assinatura.usuario?.nome}`
        : `<span style="color:#999;">${podeAssinar ? '— Sua assinatura —' : 'Aguardando'}</span>`
      }
        </div>
        ${assinatura ? `<div style="font-size:11px; color:#999;">${new Date(assinatura.criadoEm).toLocaleDateString('pt-BR')}</div>` : ''}
        ${recusada && assinatura?.motivo ? `<div style="font-size:11px; color:#dc3545; margin-top:4px;">Motivo: ${assinatura.motivo}</div>` : ''}
        ${dica}
      </div>
    `
  }

  // Botões de ação dentro da visualização
  const botoesVer = []
  const s = oc.status
  if (['aberta', 'aguardando_aprovacao', 'recusada'].includes(s)) {
    botoesVer.push(`<button class="btn btn-info" onclick="editarOC(${oc.id})">✏️ Editar</button>`)
  }
  botoesVer.push(`<a class="btn btn-secondary" href="${API}/pdf/${oc.id}" target="_blank">📄 PDF</a>`)
  if ((perfil === 'gerente' || perfil === 'admin') && s === 'aguardando_aprovacao') {
    botoesVer.push(`<button class="btn btn-success" onclick="abrirModalAssinatura(${oc.id}, 'aprovar')">✓ Aprovar</button>`)
    botoesVer.push(`<button class="btn btn-danger" onclick="abrirModalRecusa(${oc.id})">✗ Recusar</button>`)
  }
  if ((perfil === 'financeiro' || perfil === 'admin') && s === 'aguardando_autorizacao') {
    botoesVer.push(`<button class="btn btn-success" onclick="abrirModalAssinatura(${oc.id}, 'autorizar')">✓ Autorizar</button>`)
    botoesVer.push(`<button class="btn btn-danger" onclick="abrirModalRecusa(${oc.id})">✗ Recusar</button>`)
  }
  if (!['aprovada'].includes(s) && s !== 'cancelada') {
    botoesVer.push(`<button class="btn btn-danger" onclick="deletarOC(${oc.id}, '${numero}')">Cancelar</button>`)
  }

  document.getElementById('ocs').innerHTML = `
    <div style="margin-top:20px; max-width:900px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <button class="btn btn-secondary" onclick="fecharFormularioOC()">← Voltar</button>
        <div style="display:flex; gap:8px;">${botoesVer.join('')}</div>
      </div>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <h3 style="margin:0;">${numero}</h3>
        ${badgeStatus(oc.status)}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="font-weight:700; color:#158815; margin-bottom:10px;">Fornecedor</div>
          <div><strong>${oc.fornecedor?.nome || '-'}</strong></div>
          ${oc.fornecedor?.documento ? `<div style="color:#666; font-size:13px;">CNPJ: ${oc.fornecedor.documento}</div>` : ''}
          ${oc.fornecedor?.endereco ? `<div style="color:#666; font-size:13px;">${oc.fornecedor.endereco}</div>` : ''}
          ${oc.fornecedor?.cidade ? `<div style="color:#666; font-size:13px;">${oc.fornecedor.cidade}</div>` : ''}
          ${oc.fornecedor?.telefone ? `<div style="color:#666; font-size:13px;">Tel: ${oc.fornecedor.telefone}</div>` : ''}
          ${oc.vendedor?.nome ? `<div style="color:#666; font-size:13px;">Vendedor: ${oc.vendedor.nome}</div>` : ''}
        </div>

        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <div style="font-weight:700; color:#158815; margin-bottom:10px;">Condições Comerciais</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:13px;">
            <div><span style="color:#999;">Data</span><br><strong>${dataPedido}</strong></div>
            <div><span style="color:#999;">Empresa</span><br><strong>${oc.empresa?.sigla || '-'}</strong></div>
            <div><span style="color:#999;">Cond. Pagto</span><br><strong>${oc.condicoesPagto || '-'}</strong></div>
            <div><span style="color:#999;">Forma Pagto</span><br><strong>${oc.formaPagto || '-'}</strong></div>
            <div><span style="color:#999;">Prazo Entrega</span><br><strong>${oc.prazoEntrega || '-'}</strong></div>
            <div><span style="color:#999;">Incoterms</span><br><strong>${oc.incoterms || '-'}</strong></div>
            <div><span style="color:#999;">Solicitante</span><br><strong>${oc.solicitante || '-'}</strong></div>
            <div><span style="color:#999;">Transportadora</span><br><strong>${oc.transportadora || '-'}</strong></div>
          </div>
        </div>
      </div>

      <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
        <div style="font-weight:700; color:#158815; margin-bottom:10px;">Itens</div>
        <table class="table-certificados">
          <thead><tr><th>Qtd</th><th>Unid</th><th>Descrição</th><th>Valor Unit</th><th>IPI</th><th>Total</th></tr></thead>
          <tbody>
            ${oc.itens.map(item => `
              <tr>
                <td>${item.quantidade}</td>
                <td>${item.unidade || '-'}</td>
                <td>${item.descricao}</td>
                <td>${item.valorUni ? 'R$ ' + item.valorUni.toFixed(2) : '-'}</td>
                <td>${item.ipi ? item.ipi + '%' : '-'}</td>
                <td>${item.valorTotal ? 'R$ ' + item.valorTotal.toFixed(2) : '-'}</td>
              </tr>
            `).join('')}
            <tr style="font-weight:700; background:#f9f9f9;">
              <td colspan="5" style="text-align:right;">TOTAL</td>
              <td>R$ ${total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${oc.instrucoes ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:#158815; margin-bottom:8px;">Instruções Especiais</div>
          <div style="font-size:13px; color:#444;">${oc.instrucoes}</div>
        </div>
      ` : ''}

      ${oc.anexos?.length > 0 ? `
        <div style="background:white; border-radius:6px; padding:16px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:16px;">
          <div style="font-weight:700; color:#158815; margin-bottom:8px;">Anexos</div>
          <ul style="list-style:none; padding:0; margin:0;">
            ${oc.anexos.map(a => `
              <li style="padding:6px 0; border-bottom:1px solid #eee; display:flex; justify-content:space-between; font-size:13px;">
                <span>📎 ${a.nomeOriginal} <small style="color:#999;">(${a.tipo})</small></span>
                <a href="${API}/uploads/${a.nomeArquivo}" target="_blank" style="color:#158815;">Ver</a>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <div style="background:white; border-radius:6px; padding:20px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
        <div style="font-weight:700; color:#158815; margin-bottom:16px;">Assinaturas</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;">
          ${blocoAssinatura('SOLICITANTE', asSolicitante || null, 'solicitante')}
          ${blocoAssinatura('AUTORIZADO', asAprovacao || null, 'aprovar')}
          ${blocoAssinatura('FINANCEIRO', asAutorizacao || null, 'autorizar')}
        </div>
      </div>

    </div>
  `
}

// ===== MODAL DE ASSINATURA (canvas) ==========================================
window.abrirModalAssinatura = function (ocId, acao) {
  const titulos = {
    solicitante: 'Assinar como Solicitante',
    aprovar: 'Aprovar OC',
    autorizar: 'Autorizar OC',
  }
  const labels = {
    solicitante: 'Confirmar Assinatura',
    aprovar: 'Confirmar Aprovação',
    autorizar: 'Confirmar Autorização',
  }
  const confirmacoes = {
    solicitante: 'Confirmo que sou o solicitante desta Ordem de Compra',
    aprovar: 'Confirmo que li e aprovo esta Ordem de Compra',
    autorizar: 'Confirmo que li e autorizo esta Ordem de Compra',
  }

  const titulo = titulos[acao] || 'Assinar OC'
  const btnLabel = labels[acao] || 'Confirmar'
  const textoChk = confirmacoes[acao] || 'Confirmo esta ação'

  const modal = document.createElement('div')
  modal.id = 'modal-assinatura'
  modal.style = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5);
    display:flex; align-items:center; justify-content:center; z-index:9999;
  `
  modal.innerHTML = `
    <div style="background:white; border-radius:8px; padding:28px; width:480px; max-width:95vw; box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <h4 style="margin:0 0 16px; color:#158815;">${titulo}</h4>

      <p style="font-size:13px; color:#555; margin-bottom:12px;">
        Desenhe sua assinatura abaixo (opcional):
      </p>

      <canvas id="canvas-assinatura" width="420" height="120"
        style="border:1px solid #ddd; border-radius:4px; cursor:crosshair; touch-action:none; width:100%;">
      </canvas>

      <div style="margin-top:8px; display:flex; gap:8px;">
        <button class="btn btn-sm btn-secondary" onclick="limparCanvas()">Limpar</button>
      </div>

      <div style="margin-top:16px; padding:12px; background:#f0fff0; border-radius:4px; font-size:13px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="checkbox-confirmar">
          ${textoChk}
        </label>
      </div>

      <div style="margin-top:20px; display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="fecharModalAssinatura()">Cancelar</button>
        <button class="btn btn-success" onclick="confirmarAssinatura(${ocId}, '${acao}')">
          ${btnLabel}
        </button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  iniciarCanvas()
}

window.fecharModalAssinatura = function () {
  document.getElementById('modal-assinatura')?.remove()
}

let canvasDesenhando = false

function iniciarCanvas() {
  const canvas = document.getElementById('canvas-assinatura')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  function pos(e) {
    const r = canvas.getBoundingClientRect()
    const scaleX = canvas.width / r.width
    const scaleY = canvas.height / r.height
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY }
  }

  canvas.addEventListener('mousedown', e => { canvasDesenhando = true; ctx.beginPath(); const p = pos(e); ctx.moveTo(p.x, p.y) })
  canvas.addEventListener('mousemove', e => { if (!canvasDesenhando) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke() })
  canvas.addEventListener('mouseup', () => canvasDesenhando = false)
  canvas.addEventListener('mouseleave', () => canvasDesenhando = false)
  canvas.addEventListener('touchstart', e => { e.preventDefault(); canvasDesenhando = true; ctx.beginPath(); const p = pos(e); ctx.moveTo(p.x, p.y) })
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!canvasDesenhando) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke() })
  canvas.addEventListener('touchend', () => canvasDesenhando = false)
}

window.limparCanvas = function () {
  const canvas = document.getElementById('canvas-assinatura')
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
}

window.confirmarAssinatura = async function (ocId, acao) {
  const checkbox = document.getElementById('checkbox-confirmar')
  if (!checkbox.checked) {
    alert('Marque a caixa de confirmação para continuar.')
    return
  }

  const canvas = document.getElementById('canvas-assinatura')
  const assinaturaImg = canvas ? canvas.toDataURL('image/png') : null

  // Mapeia ação para rota do backend
  const rotas = {
    solicitante: 'assinar-solicitante',
    aprovar: 'aprovar',
    autorizar: 'autorizar',
  }
  const rota = rotas[acao]

  const res = await apiJson(`${API}/ocs/${ocId}/${rota}`, {
    method: 'POST',
    body: JSON.stringify({ assinaturaImg })
  })

  if (res.ok) {
    fecharModalAssinatura()

    const msgs = {
      solicitante: 'Assinatura do solicitante registrada!',
      aprovar: 'OC aprovada com sucesso!',
      autorizar: 'OC autorizada com sucesso!',
    }
    alert(msgs[acao] || 'Ação realizada com sucesso!')

    // Se estiver na visualização, recarrega ela; senão recarrega a tabela
    if (document.getElementById('tabela-ocs')) {
      carregarOCs(paginaAtual)
    } else {
      verOC(ocId)
    }
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao processar'))
  }
}

// ===== MODAL DE RECUSA ========================================================
window.abrirModalRecusa = function (ocId) {
  const modal = document.createElement('div')
  modal.id = 'modal-recusa'
  modal.style = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5);
    display:flex; align-items:center; justify-content:center; z-index:9999;
  `
  modal.innerHTML = `
    <div style="background:white; border-radius:8px; padding:28px; width:440px; max-width:95vw; box-shadow:0 8px 32px rgba(0,0,0,0.2);">
      <h4 style="margin:0 0 16px; color:#dc3545;">Recusar OC</h4>

      <div style="margin-bottom:16px;">
        <label style="font-weight:600; font-size:13px;">Motivo da recusa *</label>
        <textarea id="motivo-recusa" class="form-control" rows="4"
          placeholder="Descreva o motivo da recusa..." style="margin-top:6px;"></textarea>
      </div>

      <div style="margin-top:20px; display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="fecharModalRecusa()">Cancelar</button>
        <button class="btn btn-danger" onclick="confirmarRecusa(${ocId})">Confirmar Recusa</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
}

window.fecharModalRecusa = function () {
  document.getElementById('modal-recusa')?.remove()
}

window.confirmarRecusa = async function (ocId) {
  const motivo = document.getElementById('motivo-recusa').value.trim()
  if (!motivo) {
    alert('O motivo é obrigatório.')
    return
  }

  const res = await apiJson(`${API}/ocs/${ocId}/recusar`, {
    method: 'POST',
    body: JSON.stringify({ motivo })
  })

  if (res.ok) {
    fecharModalRecusa()
    alert('OC recusada.')
    if (document.getElementById('tabela-ocs')) {
      carregarOCs(paginaAtual)
    } else {
      verOC(ocId)
    }
  } else {
    const err = await res.json()
    alert('Erro: ' + (err.erro || 'Falha ao recusar'))
  }
}

// ===== ABRE FORMULÁRIO NOVA OC ================================================
window.abrirFormularioOC = async function () {
  const empresas = await fetch(`${API}/empresas`, { headers: { 'ngrok-skip-browser-warning': 'true' } }).then(r => r.json())
  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}">${e.nome} (${e.sigla})</option>`
  ).join('')

  document.getElementById('ocs').innerHTML = `
    <div id="formulario-oc" style="margin-top: 20px;">
      <button class="btn btn-secondary" onclick="fecharFormularioOC()">← Voltar</button>
      <h3 style="margin: 20px 0;">Nova Ordem de Compra</h3>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label>Empresa *</label>
          <select id="oc-empresaId" class="form-control">
            <option value="">Selecione...</option>
            ${opcoesEmpresas}
          </select>
        </div>
        <div style="position:relative">
          <label>Fornecedor *</label>
          <input type="text" id="oc-fornecedor-nome" class="form-control"
            placeholder="Digite nome ou CNPJ..."
            oninput="buscarFornecedor(this.value)"
            autocomplete="off">
          <div id="sugestoes-fornecedor" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
          <input type="hidden" id="oc-fornecedorId">
        </div>
        <div><label>CNPJ/CPF</label><input type="text" id="oc-fornecedor-doc" class="form-control" placeholder="Somente números"></div>
        <div><label>Endereço</label><input type="text" id="oc-fornecedor-end" class="form-control"></div>
        <div><label>Cidade</label><input type="text" id="oc-fornecedor-cidade" class="form-control"></div>
        <div><label>Telefone</label><input type="text" id="oc-fornecedor-tel" class="form-control"></div>
        <div><label>Vendedor</label><input type="text" id="oc-vendedor-nome" class="form-control"></div>
        <div><label>Data do Pedido *</label><input type="date" id="oc-dataPedido" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
        <div><label>Condições de Pagamento</label><input type="text" id="oc-condicoesPagto" class="form-control" placeholder="Ex: 30/60/90 dias"></div>
        <div><label>Forma de Pagamento</label><input type="text" id="oc-formaPagto" class="form-control" placeholder="Ex: Boleto bancário"></div>
        <div><label>Prazo de Entrega</label><input type="text" id="oc-prazoEntrega" class="form-control" placeholder="Ex: 15 dias úteis"></div>
        <div><label>Incoterms</label><input type="text" id="oc-incoterms" class="form-control" placeholder="Ex: CIF, FOB"></div>
        <div><label>Transportadora</label><input type="text" id="oc-transportadora" class="form-control"></div>
        <div><label>Endereço Transportadora</label><input type="text" id="oc-enderecoTransp" class="form-control"></div>
        <div><label>Tel/Contato Transportadora</label><input type="text" id="oc-telefoneTransp" class="form-control"></div>
        <div><label>Solicitante</label><input type="text" id="oc-solicitante" class="form-control"></div>
      </div>

      <h5 style="margin: 24px 0 12px;">Itens</h5>
      <table class="table-certificados">
        <thead><tr><th>Qtd</th><th>Unid</th><th>Descrição</th><th>Valor Unit</th><th>IPI %</th><th>Total</th><th></th></tr></thead>
        <tbody id="itens-oc"></tbody>
      </table>
      <button class="btn btn-secondary" style="margin-top: 8px;" onclick="adicionarItemOC()">+ Item</button>

      <div style="margin-top: 20px;">
        <label>Instruções ou Condições Especiais</label>
        <textarea id="oc-instrucoes" class="form-control" rows="3"></textarea>
      </div>

      <div style="margin-top: 20px;">
        <h5>Anexos</h5>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <label>Tipo</label>
            <select id="anexo-tipo" class="form-control">
              <option value="boleto">Boleto</option>
              <option value="nota_fiscal">Nota Fiscal</option>
              <option value="comprovante">Comprovante de Pagamento</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <label>Arquivo</label>
            <input type="file" id="anexo-arquivo" class="form-control" onchange="adicionarAnexoPendente(event)">
          </div>
        </div>
        <ul id="lista-anexos-pendentes" style="margin-top: 12px; padding: 0; list-style: none;"></ul>
      </div>

      <button type="button" class="btn btn-success" style="margin-top: 20px;" onclick="salvarOC()">Salvar OC</button>
    </div>
  `

  adicionarItemOC()
  anexosPendentes = []
}

window.adicionarItemOC = function () {
  const tbody = document.getElementById('itens-oc')
  const index = tbody.children.length
  const tr = document.createElement('tr')
  tr.innerHTML = `
    <td><input type="number" class="form-control" id="item-qtd-${index}" min="0" step="0.01" oninput="calcularTotal(${index})"></td>
    <td><input type="text" class="form-control" id="item-unid-${index}" placeholder="UN"></td>
    <td><input type="text" class="form-control" id="item-desc-${index}"></td>
    <td><input type="number" class="form-control" id="item-vuni-${index}" min="0" step="0.01" oninput="calcularTotal(${index})"></td>
    <td><input type="number" class="form-control" id="item-ipi-${index}" min="0" step="0.01" oninput="calcularTotal(${index})"></td>
    <td><input type="number" class="form-control" id="item-vtotal-${index}" readonly></td>
    <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">✕</button></td>
  `
  tbody.appendChild(tr)
}

window.salvarOC = async function () {
  const empresaId = parseInt(document.getElementById('oc-empresaId').value)
  const fornecedorNome = document.getElementById('oc-fornecedor-nome').value.trim()
  let fornecedorId = parseInt(document.getElementById('oc-fornecedorId').value)

  if (!empresaId || !fornecedorNome) {
    alert('Empresa e Fornecedor são obrigatórios!')
    return
  }

  if (!fornecedorId) {
    const novoFornecedor = await apiJson(`${API}/fornecedores`, {
      method: 'POST',
      body: JSON.stringify({
        nome: fornecedorNome,
        documento: document.getElementById('oc-fornecedor-doc').value,
        endereco: document.getElementById('oc-fornecedor-end').value,
        cidade: document.getElementById('oc-fornecedor-cidade').value,
        telefone: document.getElementById('oc-fornecedor-tel').value,
      })
    }).then(r => r.json())
    fornecedorId = novoFornecedor.id
  }

  const tbody = document.getElementById('itens-oc')
  const itens = Array.from(tbody.children).map((tr, i) => ({
    quantidade: parseFloat(document.getElementById(`item-qtd-${i}`)?.value) || 0,
    unidade: document.getElementById(`item-unid-${i}`)?.value || '',
    descricao: document.getElementById(`item-desc-${i}`)?.value || '',
    valorUni: parseFloat(document.getElementById(`item-vuni-${i}`)?.value) || 0,
    ipi: parseFloat(document.getElementById(`item-ipi-${i}`)?.value) || 0,
    valorTotal: parseFloat(document.getElementById(`item-vtotal-${i}`)?.value) || 0,
  }))

  const body = {
    empresaId, fornecedorId, vendedorId: null,
    // Campos do fornecedor — se já existia, o backend atualiza os dados dele
    fornecedorNome: document.getElementById('oc-fornecedor-nome').value.trim(),
    fornecedorDocumento: document.getElementById('oc-fornecedor-doc').value,
    fornecedorEndereco: document.getElementById('oc-fornecedor-end').value,
    fornecedorCidade: document.getElementById('oc-fornecedor-cidade').value,
    fornecedorTelefone: document.getElementById('oc-fornecedor-tel').value,
    dataPedido: document.getElementById('oc-dataPedido').value,
    condicoesPagto: document.getElementById('oc-condicoesPagto').value,
    formaPagto: document.getElementById('oc-formaPagto').value,
    prazoEntrega: document.getElementById('oc-prazoEntrega').value,
    incoterms: document.getElementById('oc-incoterms').value,
    transportadora: document.getElementById('oc-transportadora').value,
    enderecoTransp: document.getElementById('oc-enderecoTransp').value,
    telefoneTransp: document.getElementById('oc-telefoneTransp').value,
    solicitante: document.getElementById('oc-solicitante').value,
    instrucoes: document.getElementById('oc-instrucoes').value,
    itens,
  }

  const res = await apiJson(`${API}/ocs`, {
    method: 'POST',
    body: JSON.stringify(body)
  })

  if (res.ok) {
    const oc = await res.json()

    // Faz upload dos anexos pendentes
    try {
      const uploads = anexosPendentes.filter(a => a !== null).map(a => {
        const formData = new FormData()
        formData.append('arquivo', a.arquivo)
        formData.append('tipo', a.tipo)
        return apiFetch(`${API}/anexos/${oc.id}`, { method: 'POST', body: formData })
      })
      await Promise.all(uploads)
      anexosPendentes = []
    } catch (err) {
      console.error('Erro no upload dos anexos:', err)
    }

    // Abre modal de assinatura do solicitante automaticamente
    abrirModalAssinatura(oc.id, 'solicitante')

  } else {
    const err = await res.json()
    alert('Erro ao salvar OC: ' + (err.erro || ''))
  }
}

window.fecharFormularioOC = function () {
  inicializarOCs()
}

window.editarOC = async function (id) {
  const [oc, empresas] = await Promise.all([
    apiFetch(`${API}/ocs/${id}`).then(r => r.json()),
    fetch(`${API}/empresas`, { headers: { 'ngrok-skip-browser-warning': 'true' } }).then(r => r.json()),
  ])

  const opcoesEmpresas = empresas.map(e =>
    `<option value="${e.id}" ${e.id === oc.empresaId ? 'selected' : ''}>${e.nome} (${e.sigla})</option>`
  ).join('')

  const anexosHtml = oc.anexos?.length > 0
    ? oc.anexos.map(a => `
        <li style="padding: 6px 0; border-bottom: 1px solid #eee; display:flex; justify-content:space-between;">
          <span>📎 ${a.nomeOriginal} <small style="color:#999">(${a.tipo})</small></span>
          <button class="btn btn-sm btn-danger" onclick="deletarAnexo(${a.id}, this)">✕</button>
        </li>
      `).join('')
    : '<li style="color:#999; padding: 6px 0;">Nenhum anexo</li>'

  const assinaturasHtml = oc.assinaturas?.length > 0
    ? `<div style="margin-top:20px;">
        <h5>Histórico de Aprovações</h5>
        <ul style="list-style:none; padding:0;">
          ${oc.assinaturas.map(a => `
            <li style="padding:8px 0; border-bottom:1px solid #eee; font-size:13px;">
              ${a.acao === 'aprovada' ? '✅' : '❌'}
              <strong>${a.etapa === 'aprovacao' ? 'Aprovação' : a.etapa === 'autorizacao' ? 'Autorização' : 'Solicitante'}</strong>
              — ${a.acao} por <strong>${a.usuario?.nome}</strong>
              em ${new Date(a.criadoEm).toLocaleDateString('pt-BR')}
              ${a.motivo ? `<br><span style="color:#dc3545;">Motivo: ${a.motivo}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>`
    : ''

  const somenteLeitura = ['aprovada', 'aguardando_autorizacao'].includes(oc.status)

  document.getElementById('ocs').innerHTML = `
    <div id="formulario-oc" style="margin-top: 20px;">
      <button class="btn btn-secondary" onclick="fecharFormularioOC()">← Voltar</button>
      <h3 style="margin: 20px 0;">
        Editar OC ${oc.numero}.${oc.ano}-${oc.empresa?.sigla || ''}
        ${badgeStatus(oc.status)}
      </h3>

      ${somenteLeitura ? `<div style="background:#fff3cd; border:1px solid #ffc107; padding:10px 14px; border-radius:4px; margin-bottom:16px; font-size:13px;">
        ⚠️ Esta OC está em processo de aprovação e não pode ser editada.
      </div>` : ''}

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label>Empresa *</label>
          <select id="oc-empresaId" class="form-control" ${somenteLeitura ? 'disabled' : ''}>${opcoesEmpresas}</select>
        </div>
        <div style="position:relative">
          <label>Fornecedor *</label>
          <input type="text" id="oc-fornecedor-nome" class="form-control"
            placeholder="Digite nome ou CNPJ..."
            oninput="buscarFornecedor(this.value)"
            autocomplete="off"
            value="${oc.fornecedor?.nome || ''}"
            ${somenteLeitura ? 'disabled' : ''}>
          <div id="sugestoes-fornecedor" style="position:absolute; background:white; border:1px solid #ccc; border-radius:4px; width:100%; z-index:999; display:none; top:100%;"></div>
          <input type="hidden" id="oc-fornecedorId" value="${oc.fornecedorId}">
        </div>
        <div><label>CNPJ/CPF</label><input type="text" id="oc-fornecedor-doc" class="form-control" value="${oc.fornecedor?.documento || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Endereço</label><input type="text" id="oc-fornecedor-end" class="form-control" value="${oc.fornecedor?.endereco || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Cidade</label><input type="text" id="oc-fornecedor-cidade" class="form-control" value="${oc.fornecedor?.cidade || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Telefone</label><input type="text" id="oc-fornecedor-tel" class="form-control" value="${oc.fornecedor?.telefone || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Vendedor</label><input type="text" id="oc-vendedor-nome" class="form-control" value="${oc.vendedor?.nome || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Data do Pedido *</label><input type="date" id="oc-dataPedido" class="form-control" value="${oc.dataPedido?.split('T')[0] || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Condições de Pagamento</label><input type="text" id="oc-condicoesPagto" class="form-control" value="${oc.condicoesPagto || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Forma de Pagamento</label><input type="text" id="oc-formaPagto" class="form-control" value="${oc.formaPagto || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Prazo de Entrega</label><input type="text" id="oc-prazoEntrega" class="form-control" value="${oc.prazoEntrega || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Incoterms</label><input type="text" id="oc-incoterms" class="form-control" value="${oc.incoterms || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Transportadora</label><input type="text" id="oc-transportadora" class="form-control" value="${oc.transportadora || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Endereço Transportadora</label><input type="text" id="oc-enderecoTransp" class="form-control" value="${oc.enderecoTransp || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Tel/Contato Transportadora</label><input type="text" id="oc-telefoneTransp" class="form-control" value="${oc.telefoneTransp || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
        <div><label>Solicitante</label><input type="text" id="oc-solicitante" class="form-control" value="${oc.solicitante || ''}" ${somenteLeitura ? 'disabled' : ''}></div>
      </div>

      <h5 style="margin: 24px 0 12px;">Itens</h5>
      <table class="table-certificados">
        <thead><tr><th>Qtd</th><th>Unid</th><th>Descrição</th><th>Valor Unit</th><th>IPI %</th><th>Total</th>${somenteLeitura ? '' : '<th></th>'}</tr></thead>
        <tbody id="itens-oc">
          ${oc.itens.map((item, i) => `
            <tr>
              <td><input type="number" class="form-control" id="item-qtd-${i}" value="${item.quantidade}" oninput="calcularTotal(${i})" ${somenteLeitura ? 'disabled' : ''}></td>
              <td><input type="text" class="form-control" id="item-unid-${i}" value="${item.unidade || ''}" ${somenteLeitura ? 'disabled' : ''}></td>
              <td><input type="text" class="form-control" id="item-desc-${i}" value="${item.descricao}" ${somenteLeitura ? 'disabled' : ''}></td>
              <td><input type="number" class="form-control" id="item-vuni-${i}" value="${item.valorUni || ''}" oninput="calcularTotal(${i})" ${somenteLeitura ? 'disabled' : ''}></td>
              <td><input type="number" class="form-control" id="item-ipi-${i}" value="${item.ipi || ''}" oninput="calcularTotal(${i})" ${somenteLeitura ? 'disabled' : ''}></td>
              <td><input type="number" class="form-control" id="item-vtotal-${i}" value="${item.valorTotal || ''}" readonly></td>
              ${somenteLeitura ? '' : `<td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">✕</button></td>`}
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${somenteLeitura ? '' : `<button class="btn btn-secondary" style="margin-top: 8px;" onclick="adicionarItemOC()">+ Item</button>`}

      <div style="margin-top: 20px;">
        <label>Instruções ou Condições Especiais</label>
        <textarea id="oc-instrucoes" class="form-control" rows="3" ${somenteLeitura ? 'disabled' : ''}>${oc.instrucoes || ''}</textarea>
      </div>

      <div style="margin-top: 20px;">
        <h5>Anexos</h5>
        <ul id="lista-anexos-salvos" style="padding: 0; list-style: none; margin-bottom: 12px;">${anexosHtml}</ul>
        ${somenteLeitura ? '' : `
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label>Tipo</label>
              <select id="anexo-tipo" class="form-control">
                <option value="boleto">Boleto</option>
                <option value="nota_fiscal">Nota Fiscal</option>
                <option value="comprovante">Comprovante de Pagamento</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label>Arquivo</label>
              <input type="file" id="anexo-arquivo" class="form-control" onchange="adicionarAnexoPendente(event)">
            </div>
          </div>
          <ul id="lista-anexos-pendentes" style="margin-top: 12px; padding: 0; list-style: none;"></ul>
        `}
      </div>

      ${assinaturasHtml}

      ${somenteLeitura ? '' : `<button type="button" class="btn btn-success" style="margin-top: 20px;" onclick="atualizarOC(${oc.id})">Salvar Alterações</button>`}
    </div>
  `
}

window.buscarFornecedor = async function (q) {
  const div = document.getElementById('sugestoes-fornecedor')
  if (q.length < 2) {
    div.style.display = 'none'
    document.getElementById('oc-fornecedorId').value = ''
    return
  }

  const results = await fetch(`${API}/fornecedores/buscar?q=${encodeURIComponent(q)}`, { headers: { 'ngrok-skip-browser-warning': 'true' } }).then(r => r.json())

  if (results.length === 0) {
    div.style.display = 'none'
    document.getElementById('oc-fornecedorId').value = ''
    return
  }

  div.style.display = 'block'
  div.innerHTML = results.map(f => `
    <div onclick="selecionarFornecedor(${JSON.stringify(f).replace(/"/g, '&quot;')})"
      style="padding: 8px 12px; cursor:pointer; border-bottom: 1px solid #eee;"
      onmouseover="this.style.background='#f5f5f5'"
      onmouseout="this.style.background='white'">
      <strong>${f.nome}</strong>
      ${f.documento ? `<span style="color:#999; font-size:12px; margin-left:8px;">${f.documento}</span>` : ''}
    </div>
  `).join('')
}

window.selecionarFornecedor = function (f) {
  document.getElementById('oc-fornecedor-nome').value = f.nome
  document.getElementById('oc-fornecedorId').value = f.id
  document.getElementById('oc-fornecedor-doc').value = f.documento || ''
  document.getElementById('oc-fornecedor-end').value = f.endereco || ''
  document.getElementById('oc-fornecedor-cidade').value = f.cidade || ''
  document.getElementById('oc-fornecedor-tel').value = f.telefone || ''
  document.getElementById('sugestoes-fornecedor').style.display = 'none'
}

document.addEventListener('click', (e) => {
  const div = document.getElementById('sugestoes-fornecedor')
  if (div && !div.contains(e.target) && e.target.id !== 'oc-fornecedor-nome') {
    div.style.display = 'none'
  }
})

window.calcularTotal = function (index) {
  const qtd = parseFloat(document.getElementById(`item-qtd-${index}`)?.value) || 0
  const vuni = parseFloat(document.getElementById(`item-vuni-${index}`)?.value) || 0
  const ipi = parseFloat(document.getElementById(`item-ipi-${index}`)?.value) || 0
  document.getElementById(`item-vtotal-${index}`).value = (qtd * vuni * (1 + ipi / 100)).toFixed(2)
}

let anexosPendentes = []

window.adicionarAnexoPendente = function (event) {
  if (event) event.preventDefault()
  const input = document.getElementById('anexo-arquivo')
  const tipo = document.getElementById('anexo-tipo').value
  if (!input.files[0]) { alert('Selecione um arquivo!'); return }

  const arquivo = input.files[0]
  anexosPendentes.push({ arquivo, tipo })

  const lista = document.getElementById('lista-anexos-pendentes')
  const li = document.createElement('li')
  li.style = 'padding: 6px 0; border-bottom: 1px solid #eee; display:flex; justify-content:space-between;'
  li.innerHTML = `
    <span>📎 ${arquivo.name} <small style="color:#999">(${tipo})</small></span>
    <button class="btn btn-sm btn-danger" onclick="removerAnexoPendente(${anexosPendentes.length - 1}, this)">✕</button>
  `
  lista.appendChild(li)
  input.value = ''
}

window.removerAnexoPendente = function (index, btn) {
  anexosPendentes[index] = null
  btn.closest('li').remove()
}

window.atualizarOC = async function (id) {
  const empresaId = parseInt(document.getElementById('oc-empresaId').value)
  const fornecedorNome = document.getElementById('oc-fornecedor-nome').value.trim()
  let fornecedorId = parseInt(document.getElementById('oc-fornecedorId').value)

  if (!empresaId || !fornecedorNome) { alert('Empresa e Fornecedor são obrigatórios!'); return }

  if (!fornecedorId) {
    const novoFornecedor = await apiJson(`${API}/fornecedores`, {
      method: 'POST',
      body: JSON.stringify({
        nome: fornecedorNome,
        documento: document.getElementById('oc-fornecedor-doc').value,
        endereco: document.getElementById('oc-fornecedor-end').value,
        cidade: document.getElementById('oc-fornecedor-cidade').value,
        telefone: document.getElementById('oc-fornecedor-tel').value,
      })
    }).then(r => r.json())
    fornecedorId = novoFornecedor.id
  }

  const tbody = document.getElementById('itens-oc')
  const itens = Array.from(tbody.children).map((tr, i) => ({
    quantidade: parseFloat(document.getElementById(`item-qtd-${i}`)?.value) || 0,
    unidade: document.getElementById(`item-unid-${i}`)?.value || '',
    descricao: document.getElementById(`item-desc-${i}`)?.value || '',
    valorUni: parseFloat(document.getElementById(`item-vuni-${i}`)?.value) || 0,
    ipi: parseFloat(document.getElementById(`item-ipi-${i}`)?.value) || 0,
    valorTotal: parseFloat(document.getElementById(`item-vtotal-${i}`)?.value) || 0,
  }))

  const body = {
    empresaId, fornecedorId, vendedorId: null,
    // Campos do fornecedor — se já existia, o backend atualiza os dados dele
    fornecedorNome: document.getElementById('oc-fornecedor-nome').value.trim(),
    fornecedorDocumento: document.getElementById('oc-fornecedor-doc').value,
    fornecedorEndereco: document.getElementById('oc-fornecedor-end').value,
    fornecedorCidade: document.getElementById('oc-fornecedor-cidade').value,
    fornecedorTelefone: document.getElementById('oc-fornecedor-tel').value,
    dataPedido: document.getElementById('oc-dataPedido').value,
    condicoesPagto: document.getElementById('oc-condicoesPagto').value,
    formaPagto: document.getElementById('oc-formaPagto').value,
    prazoEntrega: document.getElementById('oc-prazoEntrega').value,
    incoterms: document.getElementById('oc-incoterms').value,
    transportadora: document.getElementById('oc-transportadora').value,
    enderecoTransp: document.getElementById('oc-enderecoTransp').value,
    telefoneTransp: document.getElementById('oc-telefoneTransp').value,
    solicitante: document.getElementById('oc-solicitante').value,
    instrucoes: document.getElementById('oc-instrucoes').value,
    itens,
  }

  const res = await apiJson(`${API}/ocs/${id}`, { method: 'PUT', body: JSON.stringify(body) })

  if (res.ok) {
    const uploads = anexosPendentes.filter(a => a !== null).map(a => {
      const formData = new FormData()
      formData.append('arquivo', a.arquivo)
      formData.append('tipo', a.tipo)
      return apiFetch(`${API}/anexos/${id}`, { method: 'POST', body: formData })
    })
    await Promise.all(uploads)
    anexosPendentes = []
    alert('OC atualizada com sucesso!')
    inicializarOCs()
  } else {
    const err = await res.json()
    alert('Erro ao atualizar OC: ' + (err.erro || ''))
  }
}

window.deletarAnexo = async function (id, btn) {
  if (!confirm('Remover este anexo?')) return
  await apiFetch(`${API}/anexos/${id}`, { method: 'DELETE' })
  btn.closest('li').remove()
}

window.deletarOC = async function (id, numero) {
  if (!confirm(`Tem certeza que deseja cancelar a ${numero}?\n\nEla ficará disponível por 30 dias antes de ser deletada permanentemente.`)) return
  const res = await apiFetch(`${API}/ocs/${id}`, { method: 'DELETE' })
  if (res.ok) { inicializarOCs() } else { alert('Erro ao cancelar OC') }
}

window.aplicarFiltros = function () { carregarOCs(1) }

window.restaurarOC = async function (id) {
  if (!confirm('Restaurar esta OC? Ela receberá um novo número.')) return
  const res = await apiFetch(`${API}/ocs/${id}/restaurar`, { method: 'POST' })
  if (res.ok) { inicializarOCs() } else { alert('Erro ao restaurar OC') }
}