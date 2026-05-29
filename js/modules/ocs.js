const API = 'http://localhost:3000'

// ===== RENDERIZA A PÁGINA DE OCs =====
export function inicializarOCs() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('ocs').classList.add('active')

  const container = document.getElementById('ocs')
  container.innerHTML = `
    <div class="tab">Ordens de Compra</div>
    <button class="btn btn-success" onclick="abrirFormularioOC()">+ Nova OC</button>

    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 8px; margin: 16px 0; align-items: end;">
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
          <option value="aberta">Aberta</option>
          <option value="migrada">Migrada</option>
          <option value="aprovada">Aprovada</option>
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
        <tr>
          <td colspan="6" style="text-align:center; color:#999; padding:30px;">
            Carregando...
          </td>
        </tr>
      </tbody>
    </table>
  `

  // Popula select de empresas
  fetch(`${API}/empresas`).then(r => r.json()).then(empresas => {
    const select = document.getElementById('filtro-empresa')
    empresas.forEach(e => {
      select.innerHTML += `<option value="${e.id}">${e.sigla}</option>`
    })
  })

  carregarOCs()
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
    const res = await fetch(`${API}/ocs?${params}`)
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
      <tr>
        <td colspan="6" style="text-align:center; color:red; padding:30px;">
          Erro ao conectar com o servidor
        </td>
      </tr>
    `
  }
}

// ===== RENDERIZA A TABELA =====
function renderizarTabela(ocs) {
  const tabela = document.getElementById('tabela-ocs')

  if (ocs.length === 0) {
    tabela.innerHTML = `
            <tr>
              <td colspan="6" style="text-align:center; color:#999; padding:30px;">
                Nenhuma OC cadastrada ainda
              </td>
            </tr>
          `
    return
  }

  tabela.innerHTML = ocs.map(oc => {
    const total = oc.itens.reduce((acc, item) => acc + (item.valorTotal || 0), 0)
    const data = new Date(oc.dataPedido).toLocaleDateString('pt-BR')
    const numero = `OC ${oc.numero}.${oc.ano}-${oc.empresa?.sigla || ''}`
    const cancelada = oc.status === 'cancelada'

    return `
      <tr style="${cancelada ? 'opacity:0.6; background:#fff5f5;' : ''}">
        <td>${numero}</td>
        <td>${oc.fornecedor?.nome || '-'}</td>
        <td>${data}</td>
        <td>R$ ${total.toFixed(2)}</td>
        <td>${oc.status}</td>
        <td>
          ${cancelada ? `
            <button class="btn btn-sm btn-success" onclick="restaurarOC(${oc.id})">Restaurar</button>
          ` : `
            <button class="btn btn-sm btn-info" onclick="editarOC(${oc.id})">Editar</button>
            <a class="btn btn-sm btn-secondary" href="${API}/pdf/${oc.id}" target="_blank">PDF</a>
            <button class="btn btn-sm btn-danger" onclick="deletarOC(${oc.id}, '${numero}')">Cancelar</button>
          `}
        </td>
      </tr>
    `
  }).join('')
}

// ===== ABRE FORMULÁRIO =====
window.abrirFormularioOC = async function () {
  // Busca empresas e fornecedores para popular os selects
  const empresas = await fetch(`${API}/empresas`).then(r => r.json())

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
      <div id="sugestoes-fornecedor" style="
        position:absolute; background:white; border:1px solid #ccc; 
        border-radius:4px; width:100%; z-index:999; display:none; top:100%;
      "></div>
      <input type="hidden" id="oc-fornecedorId">
    </div>
      <div>
        <label>CNPJ/CPF</label>
        <input type="text" id="oc-fornecedor-doc" class="form-control" placeholder="Somente números">
      </div>

      <div>
        <label>Endereço</label>
        <input type="text" id="oc-fornecedor-end" class="form-control">
      </div>

      <div>
        <label>Cidade</label>
        <input type="text" id="oc-fornecedor-cidade" class="form-control">
      </div>

      <div>
        <label>Telefone</label>
        <input type="text" id="oc-fornecedor-tel" class="form-control">
      </div>

      <div>
        <label>Vendedor</label>
        <input type="text" id="oc-vendedor-nome" class="form-control">
      </div>


              <div>
                <label>Data do Pedido *</label>
                <input type="date" id="oc-dataPedido" class="form-control" value="${new Date().toISOString().split('T')[0]}">
              </div>

              <div>
                <label>Condições de Pagamento</label>
                <input type="text" id="oc-condicoesPagto" class="form-control" placeholder="Ex: 30/60/90 dias">
              </div>

              <div>
                <label>Forma de Pagamento</label>
                <input type="text" id="oc-formaPagto" class="form-control" placeholder="Ex: Boleto bancário">
              </div>

              <div>
                <label>Prazo de Entrega</label>
                <input type="text" id="oc-prazoEntrega" class="form-control" placeholder="Ex: 15 dias úteis">
              </div>

              <div>
                <label>Incoterms</label>
                <input type="text" id="oc-incoterms" class="form-control" placeholder="Ex: CIF, FOB">
              </div>

              <div>
                <label>Transportadora</label>
                <input type="text" id="oc-transportadora" class="form-control">
              </div>

              <div>
                <label>Endereço Transportadora</label>
                <input type="text" id="oc-enderecoTransp" class="form-control">
              </div>

              <div>
                <label>Tel/Contato Transportadora</label>
                <input type="text" id="oc-telefoneTransp" class="form-control">
              </div>

              <div>
                <label>Solicitante</label>
                <input type="text" id="oc-solicitante" class="form-control">
              </div>

            </div>

            <h5 style="margin: 24px 0 12px;">Itens</h5>
            <table class="table-certificados">
              <thead>
                <tr>
                  <th>Qtd</th>
                  <th>Unid</th>
                  <th>Descrição</th>
                  <th>Valor Unit</th>
                  <th>IPI %</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
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

  // Se não selecionou um existente, cadastra novo
  if (!fornecedorId) {
    const novoFornecedor = await fetch(`${API}/fornecedores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    empresaId,
    fornecedorId,
    vendedorId: null,
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

  const res = await fetch(`${API}/ocs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (res.ok) {
    const oc = await res.json()

    try {
      const uploads = anexosPendentes
        .filter(a => a !== null)
        .map(a => {
          const formData = new FormData()
          formData.append('arquivo', a.arquivo)
          formData.append('tipo', a.tipo)
          return fetch(`${API}/anexos/${oc.id}`, {
            method: 'POST',
            body: formData
          })
        })

      await Promise.all(uploads)
      anexosPendentes = []
    } catch (err) {
      console.error('Erro no upload dos anexos:', err)
    }

    alert('OC salva com sucesso!')
    inicializarOCs()
  } else {
    alert('Erro ao salvar OC')
  }
}

window.fecharFormularioOC = function () {
  inicializarOCs()
}

window.editarOC = async function (id) {
  const [oc, empresas] = await Promise.all([
    fetch(`${API}/ocs/${id}`).then(r => r.json()),
    fetch(`${API}/empresas`).then(r => r.json()),
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

  document.getElementById('ocs').innerHTML = `
        <div id="formulario-oc" style="margin-top: 20px;">
          <button class="btn btn-secondary" onclick="fecharFormularioOC()">← Voltar</button>
          <h3 style="margin: 20px 0;">Editar OC ${oc.numero}.${oc.ano}-${oc.empresa?.sigla || ''}</h3>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">

            <div>
              <label>Empresa *</label>
              <select id="oc-empresaId" class="form-control">
                ${opcoesEmpresas}
              </select>
            </div>

            <div style="position:relative">
              <label>Fornecedor *</label>
              <input type="text" id="oc-fornecedor-nome" class="form-control"
                placeholder="Digite nome ou CNPJ..."
                oninput="buscarFornecedor(this.value)"
                autocomplete="off"
                value="${oc.fornecedor?.nome || ''}">
              <div id="sugestoes-fornecedor" style="
                position:absolute; background:white; border:1px solid #ccc;
                border-radius:4px; width:100%; z-index:999; display:none; top:100%;
              "></div>
              <input type="hidden" id="oc-fornecedorId" value="${oc.fornecedorId}">
            </div>

            <div>
              <label>CNPJ/CPF</label>
              <input type="text" id="oc-fornecedor-doc" class="form-control" value="${oc.fornecedor?.documento || ''}">
            </div>

            <div>
              <label>Endereço</label>
              <input type="text" id="oc-fornecedor-end" class="form-control" value="${oc.fornecedor?.endereco || ''}">
            </div>

            <div>
              <label>Cidade</label>
              <input type="text" id="oc-fornecedor-cidade" class="form-control" value="${oc.fornecedor?.cidade || ''}">
            </div>

            <div>
              <label>Telefone</label>
              <input type="text" id="oc-fornecedor-tel" class="form-control" value="${oc.fornecedor?.telefone || ''}">
            </div>

            <div>
              <label>Vendedor</label>
              <input type="text" id="oc-vendedor-nome" class="form-control" value="${oc.vendedor?.nome || ''}">
            </div>

            <div>
              <label>Data do Pedido *</label>
              <input type="date" id="oc-dataPedido" class="form-control" value="${oc.dataPedido?.split('T')[0] || ''}">
            </div>

            <div>
              <label>Condições de Pagamento</label>
              <input type="text" id="oc-condicoesPagto" class="form-control" value="${oc.condicoesPagto || ''}">
            </div>

            <div>
              <label>Forma de Pagamento</label>
              <input type="text" id="oc-formaPagto" class="form-control" value="${oc.formaPagto || ''}">
            </div>

            <div>
              <label>Prazo de Entrega</label>
              <input type="text" id="oc-prazoEntrega" class="form-control" value="${oc.prazoEntrega || ''}">
            </div>

            <div>
              <label>Incoterms</label>
              <input type="text" id="oc-incoterms" class="form-control" value="${oc.incoterms || ''}">
            </div>

            <div>
              <label>Transportadora</label>
              <input type="text" id="oc-transportadora" class="form-control" value="${oc.transportadora || ''}">
            </div>

            <div>
              <label>Endereço Transportadora</label>
              <input type="text" id="oc-enderecoTransp" class="form-control" value="${oc.enderecoTransp || ''}">
            </div>

            <div>
              <label>Tel/Contato Transportadora</label>
              <input type="text" id="oc-telefoneTransp" class="form-control" value="${oc.telefoneTransp || ''}">
            </div>

            <div>
              <label>Solicitante</label>
              <input type="text" id="oc-solicitante" class="form-control" value="${oc.solicitante || ''}">
            </div>

          </div>

          <h5 style="margin: 24px 0 12px;">Itens</h5>
          <table class="table-certificados">
            <thead>
              <tr>
                <th>Qtd</th>
                <th>Unid</th>
                <th>Descrição</th>
                <th>Valor Unit</th>
                <th>IPI %</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="itens-oc">
              ${oc.itens.map((item, i) => `
                <tr>
                  <td><input type="number" class="form-control" id="item-qtd-${i}" value="${item.quantidade}" oninput="calcularTotal(${i})"></td>
                  <td><input type="text" class="form-control" id="item-unid-${i}" value="${item.unidade || ''}"></td>
                  <td><input type="text" class="form-control" id="item-desc-${i}" value="${item.descricao}"></td>
                  <td><input type="number" class="form-control" id="item-vuni-${i}" value="${item.valorUni || ''}" oninput="calcularTotal(${i})"></td>
                  <td><input type="number" class="form-control" id="item-ipi-${i}" value="${item.ipi || ''}" oninput="calcularTotal(${i})"></td>
                  <td><input type="number" class="form-control" id="item-vtotal-${i}" value="${item.valorTotal || ''}" readonly></td>
                  <td><button class="btn btn-sm btn-danger" onclick="this.closest('tr').remove()">✕</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <button class="btn btn-secondary" style="margin-top: 8px;" onclick="adicionarItemOC()">+ Item</button>

          <div style="margin-top: 20px;">
            <label>Instruções ou Condições Especiais</label>
            <textarea id="oc-instrucoes" class="form-control" rows="3">${oc.instrucoes || ''}</textarea>
          </div>

          <div style="margin-top: 20px;">
            <h5>Anexos</h5>
            <ul id="lista-anexos-salvos" style="padding: 0; list-style: none; margin-bottom: 12px;">
              ${anexosHtml}
            </ul>
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

          <button type="button" class="btn btn-success" style="margin-top: 20px;" onclick="atualizarOC(${oc.id})">Salvar Alterações</button>

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

  const results = await fetch(`${API}/fornecedores/buscar?q=${encodeURIComponent(q)}`).then(r => r.json())

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

// Fecha sugestões ao clicar fora
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
  const total = qtd * vuni * (1 + ipi / 100)
  document.getElementById(`item-vtotal-${index}`).value = total.toFixed(2)
}

// Anexos pendentes antes de salvar a OC
let anexosPendentes = []

window.adicionarAnexoPendente = function (event) {
  if (event) event.preventDefault()
  const input = document.getElementById('anexo-arquivo')
  const tipo = document.getElementById('anexo-tipo').value

  if (!input.files[0]) {
    alert('Selecione um arquivo!')
    return
  }

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

  // Limpa o input
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

  if (!empresaId || !fornecedorNome) {
    alert('Empresa e Fornecedor são obrigatórios!')
    return
  }

  if (!fornecedorId) {
    const novoFornecedor = await fetch(`${API}/fornecedores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    empresaId,
    fornecedorId,
    vendedorId: null,
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

  const res = await fetch(`${API}/ocs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (res.ok) {
    // Upload de novos anexos
    const uploads = anexosPendentes
      .filter(a => a !== null)
      .map(a => {
        const formData = new FormData()
        formData.append('arquivo', a.arquivo)
        formData.append('tipo', a.tipo)
        return fetch(`${API}/anexos/${id}`, {
          method: 'POST',
          body: formData
        })
      })
    await Promise.all(uploads)
    anexosPendentes = []

    alert('OC atualizada com sucesso!')
    inicializarOCs()
  } else {
    alert('Erro ao atualizar OC')
  }
}

window.deletarAnexo = async function (id, btn) {
  if (!confirm('Remover este anexo?')) return
  await fetch(`${API}/anexos/${id}`, { method: 'DELETE' })
  btn.closest('li').remove()
}

window.deletarOC = async function (id, numero) {
  if (!confirm(`Tem certeza que deseja cancelar a ${numero}?\n\nEla ficará disponível por 30 dias antes de ser deletada permanentemente.`)) return

  const res = await fetch(`${API}/ocs/${id}`, { method: 'DELETE' })
  if (res.ok) {
    inicializarOCs()
  } else {
    alert('Erro ao cancelar OC')
  }
}

window.aplicarFiltros = function () {
  carregarOCs(1)
}

window.restaurarOC = async function (id) {
  if (!confirm('Restaurar esta OC? Ela receberá um novo número.')) return

  const res = await fetch(`${API}/ocs/${id}/restaurar`, { method: 'POST' })
  if (res.ok) {
    inicializarOCs()
  } else {
    alert('Erro ao restaurar OC')
  }
}
