// Certificados de "lista de itens iguais" — uma tabela com uma linha por
// cilindro/colete, mais o cabeçalho do navio. Os 4 modelos abaixo foram tirados
// dos documentos em papel (backend/migracao/Certificados & Relatórios/Certificados),
// mantendo os textos e rótulos PT/EN de cada um.
//
// O mesmo objeto MODELOS_LISTA é servido pro frontend (GET /certificados/modelos)
// — a tela monta formulário e colunas a partir daqui, então mudar uma coluna é
// mexer só neste arquivo.
//
// O PDF sai SEM cabeçalho/rodapé: os modelos são impressos em papel timbrado,
// por isso a margem de cima/baixo grande e em branco.

const TEXTO_CERTIFICA_EMERGENCIA = {
  pt: 'CERTIFICAMOS QUE OS EQUIPAMENTOS MENCIONADOS ABAIXO FORAM INSPECIONADOS NA PRESENTE DATA E ESTÃO EM CONDIÇÕES DE USO EM CASO DE EMERGÊNCIA',
  en: 'We certify that the equipment listed below has been inspected on this date and is in condition for use in an emergency'
}

const TEXTO_CERTIFICA_COLETE = {
  pt: 'O presente é para certificar que os Coletes Salva-Vidas Infláveis foram testados e inspecionados por técnico de serviço credenciado SOLAS 74/96 IMO MSC (81) abaixo assinado, de acordo com a regulamentação, compreendendo itens na lista de verificação descritos e numerados abaixo.',
  en: null
}

// cabecalho: campos do topo, na ordem em que aparecem (2 por linha no PDF).
// Os nomes são colunas do Certificado — no colete de aeronave, navio/armador
// guardam Aeronave/Cliente.
// colunas: `chave` marca as colunas que identificam a peça (nº de série etc.)
// — a tela limpa só essas ao duplicar a linha de cima, o resto (marca, modelo,
// pressão) costuma se repetir em todas as linhas.
// validade: rótulo e texto padrão do campo `validade` (texto livre) — os
// modelos de respiração imprimem "Próxima inspeção mm/aaaa", os de colete
// imprimem um prazo fixo.
export const MODELOS_LISTA = {
  respiracao: {
    nome: 'Aparelho de Respiração Autônoma',
    titulo: 'APARELHO DE RESPIRAÇÃO AUTÔNOMA',
    tituloEn: 'Self-Contained Breathing Apparatus',
    textoCertifica: TEXTO_CERTIFICA_EMERGENCIA,
    cabecalho: [
      { campo: 'navio', rotulo: 'Navio', rotuloEn: 'Ship', obrigatorio: true },
      { campo: 'portoRegistro', rotulo: 'Porto de Registro', rotuloEn: 'Port Registry' },
      { campo: 'armador', rotulo: 'Armador', rotuloEn: 'Owners' },
      { campo: 'imo', rotulo: 'IMO', rotuloEn: null },
      { campo: 'classificadora', rotulo: 'Classificadora', rotuloEn: 'Class' },
      { campo: 'bandeira', rotulo: 'Bandeira', rotuloEn: 'Flag' }
    ],
    colunas: [
      { campo: 'cilindro', rotulo: 'Cilindro Número', rotuloEn: 'Cylinder Number', chave: true },
      { campo: 'mascara', rotulo: 'Máscara', rotuloEn: 'Mask', chave: true },
      { campo: 'marca', rotulo: 'Marca', rotuloEn: 'Make' },
      { campo: 'modelo', rotulo: 'Modelo', rotuloEn: 'Type' },
      { campo: 'pressao', rotulo: 'Pressão Trab.', rotuloEn: 'Work pressure', padrao: '300 BAR / 6 Lt' },
      { campo: 'resultado', rotulo: 'Obs. Técnico', rotuloEn: 'Result', padrao: 'APROVADO (Approved)' }
    ],
    observacaoPadrao: 'MÁSCARA FACIAL, UNIDADE REGULADORA DE PRESSÃO, ALARME, MANGUEIRA DE ALTA PRESSÃO, ETIQUETA DE IDENTIFICAÇÃO, VÁLVULA DE DEMANDA, VÁLVULA SEG. ESTÁGIO, TIRANTES DE AJUSTE, ESTRUTURA DO SUPORTE E TODOS OS ACESSÓRIOS FORAM INSPECIONADOS.\nTechnician\'s Note: Face mask, pressure-reducing unit, alarm, high-pressure hose, identification label, demand valve, second-stage valve, adjustment straps, backframe, and all accessories were inspected.',
    validade: { rotulo: 'Próxima inspeção', placeholder: 'Ex: 08/2027', padrao: 'mesAnoSeguinte' },
    rodape: 'inspecao'
  },

  cilindros_reserva: {
    nome: 'Cilindros de Ar Respirável Reserva',
    titulo: 'CILINDROS DE AR RESPIRÁVEL RESERVAS',
    tituloEn: 'Reserve Breathing Air Cylinder',
    textoCertifica: TEXTO_CERTIFICA_EMERGENCIA,
    cabecalho: [
      { campo: 'navio', rotulo: 'Navio', rotuloEn: 'Ship', obrigatorio: true },
      { campo: 'portoRegistro', rotulo: 'Porto de Registro', rotuloEn: 'Port Registry' },
      { campo: 'armador', rotulo: 'Armador', rotuloEn: 'Owners' },
      { campo: 'imo', rotulo: 'IMO', rotuloEn: null },
      { campo: 'classificadora', rotulo: 'Classificadora', rotuloEn: 'Class' },
      { campo: 'bandeira', rotulo: 'Bandeira', rotuloEn: 'Flag' }
    ],
    colunas: [
      { campo: 'cilindro', rotulo: 'Cilindro Número', rotuloEn: 'Cylinder Number', chave: true },
      { campo: 'th', rotulo: 'T.H.', rotuloEn: 'Hydrostatic test', placeholder: 'mm/aa', chave: true },
      { campo: 'marca', rotulo: 'Marca', rotuloEn: 'Make' },
      { campo: 'modelo', rotulo: 'Modelo', rotuloEn: 'Type' },
      { campo: 'pressao', rotulo: 'Pressão Trab.', rotuloEn: 'Work pressure', padrao: '300 BAR / 6 Lt' },
      { campo: 'resultado', rotulo: 'Obs. Técnico', rotuloEn: 'Result', padrao: 'APROVADO (Approved)' }
    ],
    observacaoPadrao: 'PRESSÃO, PINTURA, INTEGRIDADE, ETIQUETAS E VÁLVULAS FORAM INSPECIONADOS.\nTechnician\'s Note: Pressure, Paintwork, Integrity, Labels and Valves were inspected.',
    validade: { rotulo: 'Próxima inspeção', placeholder: 'Ex: 08/2027', padrao: 'mesAnoSeguinte' },
    rodape: 'inspecao'
  },

  colete: {
    nome: 'Coletes Salva-Vidas Infláveis',
    titulo: 'TESTE E INSPEÇÃO DE COLETES SALVA-VIDAS INFLÁVEIS',
    tituloEn: null,
    textoCertifica: TEXTO_CERTIFICA_COLETE,
    cabecalho: [
      { campo: 'navio', rotulo: 'Navio', rotuloEn: null, obrigatorio: true },
      { campo: 'imo', rotulo: 'IMO', rotuloEn: null },
      { campo: 'bandeira', rotulo: 'Bandeira', rotuloEn: null },
      { campo: 'classificadora', rotulo: 'Class', rotuloEn: null },
      { campo: 'tipoNavio', rotulo: 'Type of ship', rotuloEn: null },
      { campo: 'armador', rotulo: 'Name of owner', rotuloEn: null }
    ],
    colunas: [
      { campo: 'fabricante', rotulo: 'Fabricante', rotuloEn: null },
      { campo: 'modelo', rotulo: 'Modelo', rotuloEn: null },
      { campo: 'dataFabricacao', rotulo: 'Data de Fabricação', rotuloEn: null, placeholder: 'mm/aaaa', chave: true },
      { campo: 'numeroSerie', rotulo: 'Nº de Série', rotuloEn: null, chave: true },
      { campo: 'cilindro', rotulo: 'Cilindro', rotuloEn: null, padrao: 'OK' },
      { campo: 'led', rotulo: 'LED', rotuloEn: null, padrao: 'OK' },
      { campo: 'status', rotulo: 'Status', rotuloEn: null, padrao: 'OK' }
    ],
    textoAposTabela: 'Certifico que a carga de prova foi aplicada aos equipamentos listados acima e não mostrou qualquer deformação permanente ou fratura externa após o teste.',
    observacaoPadrao: 'Apto para o propósito na presente data.',
    validade: { rotulo: 'Validade', placeholder: 'Ex: 02 (Dois) ANOS', padrao: '02 (Dois) ANOS' },
    rodape: 'validade'
  },

  colete_aeronave: {
    nome: 'Coletes Salva-Vidas Infláveis (Aeronave)',
    titulo: 'TESTE E INSPEÇÃO DE COLETES SALVA-VIDAS INFLÁVEIS',
    tituloEn: null,
    textoCertifica: TEXTO_CERTIFICA_COLETE,
    cabecalho: [
      { campo: 'armador', rotulo: 'Cliente', rotuloEn: null },
      { campo: 'cnpj', rotulo: 'CNPJ', rotuloEn: null },
      { campo: 'navio', rotulo: 'Aeronave', rotuloEn: null, obrigatorio: true }
    ],
    colunas: [
      { campo: 'fabricante', rotulo: 'Fabricante', rotuloEn: null },
      { campo: 'modelo', rotulo: 'Modelo', rotuloEn: null },
      { campo: 'dataFabricacao', rotulo: 'Data de Fabricação', rotuloEn: null, placeholder: 'mm/aaaa', chave: true },
      { campo: 'numeroSerie', rotulo: 'Nº de Série', rotuloEn: null, chave: true },
      { campo: 'status', rotulo: 'Status', rotuloEn: null, padrao: 'OK' }
    ],
    observacaoPadrao: 'INSPECIONADO/TESTADO\nAPTO PARA O PROPÓSITO A QUE SE DESTINA.',
    validade: { rotulo: 'Validade', placeholder: 'Ex: 1 ANO', padrao: '1 ANO' },
    rodape: 'validade'
  },

  // Modelo_Certificado_Gatos_Preenchivel.pdf — nasce do Relatório técnico de
  // gatos (uma linha por gato, tirada dos blocos de equipamento do relatório),
  // mas também pode ser criado avulso. Layout próprio (rodape 'gatos'): tabela
  // do navio, norma, nº do relatório técnico, "NEXT INSPECTION BEFORE" e até
  // 3 assinaturas lado a lado.
  gatos: {
    nome: 'Hooks (Gatos) — Quinquenal',
    titulo: 'CERTIFICADO DE TESTE E INSPEÇÃO QUINQUENAL (GATOS)',
    tituloEn: 'CERTIFICATE OF TEST AND INSPECTION 5(Y) FIVE-YEARLY (HOOKS)',
    subtitulo: 'Dispositivo de liberação de balsas salva-vidas',
    subtituloEn: 'Release hook for liferaft',
    cabecalho: [
      { campo: 'navio', rotulo: 'Navio', rotuloEn: 'Ship', obrigatorio: true },
      { campo: 'imo', rotulo: 'IMO', rotuloEn: null },
      { campo: 'bandeira', rotulo: 'Bandeira', rotuloEn: 'Flag' },
      { campo: 'classificadora', rotulo: 'Class', rotuloEn: null },
      { campo: 'tipoNavio', rotulo: 'Tipo Navio', rotuloEn: null },
      { campo: 'armador', rotulo: 'Armador', rotuloEn: 'Owner' }
    ],
    colunas: [
      { campo: 'marca', rotulo: 'Marca', rotuloEn: 'Mark' },
      { campo: 'numeroSerie', rotulo: 'Número de série', rotuloEn: 'Serial Number', chave: true },
      { campo: 'modelo', rotulo: 'Modelo', rotuloEn: 'Model' },
      { campo: 'teste', rotulo: 'Teste ou Exame', rotuloEn: null, padrao: 'T & E' },
      { campo: 'swl', rotulo: 'Carga Trab', rotuloEn: 'S W L' },
      { campo: 'resultado', rotulo: 'Resultado', rotuloEn: 'Result', padrao: 'APROVADO' }
    ],
    // Guardados em dadosTecnicos (não têm coluna no Certificado).
    extras: [
      { campo: 'norma', rotulo: 'Norma aplicada', padrao: 'IMO MSC 554 (108)' },
      { campo: 'relatorioNumero', rotulo: 'Relatório técnico nº' }
    ],
    assinaturas: [
      { empresa: 'Natal Safety', nome: 'Augusto Gustavo', cargo: 'Mec Aut' },
      { empresa: 'Natal Safety', nome: 'Noel Cavalheiro', cargo: 'Eng Mec' },
      { empresa: 'Natal Safety', nome: 'Celso Moura', cargo: 'Surveyor' }
    ],
    observacaoPadrao: 'APTO PARA O USO NA PRESENTE DATA / FIT FOR PURPOSE',
    validade: { rotulo: 'Próxima inspeção (Next inspection before)', placeholder: 'Ex: 22 JUNE 2031', padrao: 'cincoAnos' },
    rodape: 'gatos'
  }
}

export const TIPOS_LISTA = Object.keys(MODELOS_LISTA)

// Dados do certificado de gatos tirados de um Relatório técnico de gatos
// concluído (backend/templates/relatorio-tecnico.js): cada bloco da seção de
// equipamentos vira uma linha (acha a seção pelo rótulo dos hooks, não pela
// posição — o técnico pode ter reordenado as seções). Tudo continua editável
// no certificado depois.
export function certificadoGatosDeRelatorio(relatorio) {
  const c = relatorio.conteudo || {}
  const secoes = Array.isArray(c.secoes) ? c.secoes : []
  const valorDe = (grupo, ...rotulos) => {
    const alvo = rotulos.map(r => r.toLowerCase())
    return (grupo.find(f => alvo.includes((f.rotulo || '').trim().toLowerCase()))?.valor || '').trim()
  }
  const equipamentos = secoes.find(s => s.tipo === 'campos' &&
    (s.grupos || []).some(g => g.some(f => /hooks/i.test(f.rotulo || ''))))
  const solicitante = secoes.find(s => s.tipo === 'campos' &&
    (s.grupos || []).some(g => g.some(f => (f.rotulo || '').trim().toUpperCase() === 'EMPRESA')))
  const modelo = MODELOS_LISTA.gatos

  const itens = (equipamentos?.grupos || []).map(g => ({
    marca: valorDe(g, 'Fabricante dos Hooks (Gatos)'),
    numeroSerie: valorDe(g, 'Nº Série'),
    modelo: valorDe(g, 'Modelo / Tipo'),
    teste: 'T & E',
    swl: valorDe(g, 'Capacidade de carga (SWL)'),
    resultado: 'APROVADO'
  })).filter(i => i.marca || i.numeroSerie || i.modelo || i.swl)

  return {
    tipo: 'gatos',
    navio: relatorio.navio || null,
    imo: c.imo || null,
    armador: (solicitante ? valorDe(solicitante.grupos[0], 'EMPRESA') : '') || null,
    localEmissao: c.local || null,
    observacoes: modelo.observacaoPadrao,
    itens,
    dadosTecnicos: {
      tecnicoNome: (c.assinaturas || []).find(a => (a.nome || '').trim())?.nome || '',
      norma: modelo.extras[0].padrao,
      relatorioNumero: c.certificadoNumero || `${relatorio.numero}/${relatorio.ano}`,
      assinaturas: modelo.assinaturas
    }
  }
}

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// Quebras de linha digitadas na tela viram <br> (a observação padrão tem PT e
// EN em linhas separadas).
function comQuebras(valor) {
  return escapeHtml(valor).replaceAll('\n', '<br>')
}

function rotuloBilingue(pt, en) {
  return `${escapeHtml(pt)}${en ? ` <span class="en">(${escapeHtml(en)})</span>` : ''}`
}

// dataEmissao é gravada como meia-noite UTC — ler em UTC pra não voltar um dia.
function datas(dataEmissao) {
  if (!dataEmissao) return { pt: '', en: '' }
  const d = new Date(dataEmissao)
  const dia = String(d.getUTCDate()).padStart(2, '0')
  return {
    pt: `${dia} de ${MESES_PT[d.getUTCMonth()]} de ${d.getUTCFullYear()}`,
    en: `${MESES_EN[d.getUTCMonth()]} ${dia}, ${d.getUTCFullYear()}`
  }
}

export function htmlCertificadoLista(c) {
  const modelo = MODELOS_LISTA[c.tipo]
  if (modelo.rodape === 'gatos') return htmlCertificadoGatos(c, modelo)
  const itens = Array.isArray(c.itens) ? c.itens : []
  const data = datas(c.dataEmissao)
  const tecnico = c.dadosTecnicos?.tecnicoNome || ''

  const camposCabecalho = modelo.cabecalho.map(f => `
    <div class="campo">
      <span class="rotulo">${rotuloBilingue(f.rotulo, f.rotuloEn)}:</span>
      <span class="valor">${escapeHtml(c[f.campo]) || '—'}</span>
    </div>
  `).join('')

  const linhas = itens.map((item, i) => `
    <tr>
      <td>${String(i + 1).padStart(2, '0')}</td>
      ${modelo.colunas.map(col => `<td>${escapeHtml(item[col.campo])}</td>`).join('')}
    </tr>
  `).join('')

  // Respiração/cilindros: caixa de "Próxima inspeção" + data da inspeção
  // bilíngue. Coletes: local e data numa linha, e a caixa grande de VALIDADE.
  const rodape = modelo.rodape === 'inspecao' ? `
    <div class="caixa-destaque">
      PRÓXIMA INSPEÇÃO: ${escapeHtml(c.validade)}
      <div class="en">(Next Inspection: ${escapeHtml(c.validade)})</div>
    </div>
    <div class="data-inspecao">
      <strong>DATA DA INSPEÇÃO: ${escapeHtml(data.pt)}</strong>
      <div class="en">Date of inspection: ${escapeHtml(data.en)}</div>
      ${c.localEmissao ? `<div>${escapeHtml(c.localEmissao)}</div>` : ''}
    </div>
  ` : `
    <div class="data-inspecao">${escapeHtml([c.localEmissao, data.pt].filter(Boolean).join(', '))}</div>
    <div class="caixa-validade">VALIDADE ${escapeHtml(c.validade)}</div>
  `

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 45mm 18mm 30mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; margin: 0; }
  .en { font-weight: normal; font-size: 8pt; }
  .numero { text-align: right; font-size: 9pt; margin-bottom: 3mm; }
  .cabecalho { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm 8mm; margin-bottom: 5mm; }
  .campo .rotulo { font-weight: bold; text-transform: uppercase; }
  .campo .valor { font-weight: bold; text-transform: uppercase; }
  .certifica { text-align: center; margin-bottom: 4mm; }
  .certifica .pt { font-weight: bold; font-size: 9pt; }
  .certifica.justificado { text-align: justify; }
  h1 { text-align: center; font-size: 12pt; margin: 0 0 1mm; text-decoration: underline; }
  .subtitulo { text-align: center; font-weight: bold; font-size: 10pt; margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  th, td { border: 1px solid #333; padding: 1.2mm 1.5mm; text-align: center; font-size: 9pt; }
  th { font-size: 8pt; background: #f2f2f2; }
  tr { page-break-inside: avoid; }
  .texto-apos { margin-bottom: 4mm; }
  .observacao { border: 1px solid #333; padding: 2mm 3mm; margin-bottom: 4mm; font-size: 8.5pt; }
  .observacao strong { text-decoration: underline; }
  .caixa-destaque { border: 1px solid #999; background: #eee; text-align: center; font-weight: bold; font-size: 11pt; padding: 1.5mm; margin-bottom: 4mm; }
  .data-inspecao { margin-bottom: 6mm; }
  .caixa-validade { display: inline-block; border: 2px solid #000; font-weight: bold; font-size: 16pt; padding: 1mm 4mm; }
  .assinatura { width: 85mm; margin: 12mm auto 0; text-align: center; border-top: 1px solid #333; padding-top: 1.5mm; font-size: 8.5pt; page-break-inside: avoid; }
</style>
</head>
<body>
  <div class="numero">Nº ${escapeHtml(c.numero)}/${escapeHtml(c.ano)}</div>

  ${modelo.rodape === 'validade' ? `<h1>${escapeHtml(modelo.titulo)}</h1>` : ''}

  <div class="certifica ${modelo.rodape === 'validade' ? 'justificado' : ''}">
    ${modelo.rodape === 'validade' ? escapeHtml(modelo.textoCertifica.pt) : ''}
  </div>

  <div class="cabecalho">${camposCabecalho}</div>

  ${modelo.rodape === 'inspecao' ? `
    <div class="certifica">
      <div class="pt">${escapeHtml(modelo.textoCertifica.pt)}</div>
      <div class="en">${escapeHtml(modelo.textoCertifica.en)}</div>
    </div>
    <h1>${escapeHtml(modelo.titulo)}</h1>
    <div class="subtitulo">(${escapeHtml(modelo.tituloEn)})</div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th>${modelo.rodape === 'inspecao' ? 'ITEM' : 'ID'}</th>
        ${modelo.colunas.map(col => `<th>${escapeHtml(col.rotulo.toUpperCase())}${col.rotuloEn ? `<br><span class="en">(${escapeHtml(col.rotuloEn)})</span>` : ''}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>

  ${modelo.textoAposTabela ? `<div class="texto-apos">${escapeHtml(modelo.textoAposTabela)}</div>` : ''}

  ${c.observacoes ? `
    <div class="observacao">
      ${modelo.rodape === 'inspecao' ? '<strong>OBSERVAÇÃO DO TÉCNICO:</strong> ' : '<strong>Obs.:</strong><br>'}${comQuebras(c.observacoes)}
    </div>
  ` : ''}

  ${rodape}

  <div class="assinatura">
    ${tecnico ? `<div><strong>${escapeHtml(tecnico)}</strong></div>` : ''}
    <div>Responsável Técnico – Carimbo e Assinatura</div>
    <div class="en">TECHNICAL LEAD – Stamp &amp; Sign</div>
    ${c.empresa?.nome ? `<div>${escapeHtml(c.empresa.nome)}</div>` : ''}
  </div>
</body>
</html>`
}

// Layout do Modelo_Certificado_Gatos_Preenchivel.pdf. Também sai em papel
// timbrado (mesmas margens dos outros de lista).
function htmlCertificadoGatos(c, modelo) {
  const itens = Array.isArray(c.itens) ? c.itens : []
  const extras = c.dadosTecnicos || {}
  const assinaturas = (Array.isArray(extras.assinaturas) ? extras.assinaturas : [])
    .filter(a => (a.empresa || a.nome || a.cargo || '').trim())
  const d = c.dataEmissao ? new Date(c.dataEmissao) : null
  const dataCurta = d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : ''
  const campo = nome => escapeHtml(c[nome]) || '&nbsp;'
  const rot = f => `${escapeHtml(f.rotulo)}${f.rotuloEn ? ` / ${escapeHtml(f.rotuloEn)}` : ''}`
  const [navio, imo, bandeira, classe, tipoNavio, armador] = modelo.cabecalho

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 45mm 18mm 30mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; margin: 0; }
  .numero { text-align: right; font-size: 9pt; margin-bottom: 3mm; }
  .titulo { text-align: center; margin-bottom: 5mm; }
  .titulo .pt { font-weight: bold; font-size: 12pt; }
  .titulo .en { font-size: 10.5pt; }
  .titulo .sub { font-weight: bold; font-size: 10.5pt; margin-top: 4mm; }
  table { width: 100%; border-collapse: collapse; }
  .navio td { border: 1px solid #333; padding: 1mm 2mm; text-align: center; font-size: 9pt; }
  .navio td.rot { font-weight: bold; width: 22%; }
  .norma { border: 1px solid #333; margin-top: 4mm; padding: 1mm 2mm; font-weight: bold; text-align: center; }
  .norma span { margin-left: 12mm; }
  .relatorio { text-align: center; font-weight: bold; margin: 1mm 0 4mm; }
  .itens { border: 1px solid #333; }
  .itens th { border-bottom: 2px solid #333; border-right: 1px solid #333; padding: 1.5mm; font-size: 9pt; }
  .itens th:last-child { border-right: 0; }
  .itens td { padding: 3mm 1.5mm; text-align: center; font-weight: bold; }
  .itens tr { page-break-inside: avoid; }
  .remarks { border: 1px solid #333; padding: 1.5mm 2mm; min-height: 15mm; margin-top: 3mm; white-space: pre-line; }
  .rodape { display: flex; justify-content: space-between; gap: 6mm; margin-top: 7mm; }
  .proxima { flex: 1; border: 1.5px solid #333; padding: 1.5mm 2mm; font-weight: bold; font-size: 11pt; }
  .local { width: 62mm; border: 1px solid #333; padding: 1.5mm 2mm; }
  .assinaturas { display: flex; justify-content: space-around; margin-top: 25mm; border-top: 1px dotted #333; padding-top: 2mm; text-align: center; font-size: 9pt; page-break-inside: avoid; }
  .assinaturas div { flex: 1; }
</style>
</head>
<body>
  <div class="numero">Nº ${escapeHtml(c.numero)}/${escapeHtml(c.ano)}</div>

  <div class="titulo">
    <div class="pt">${escapeHtml(modelo.titulo)}</div>
    <div class="en">${escapeHtml(modelo.tituloEn)}</div>
    <div class="sub">${escapeHtml(modelo.subtitulo)}</div>
    <div class="en">${escapeHtml(modelo.subtituloEn)}</div>
  </div>

  <table class="navio">
    <tr><td class="rot">${rot(navio)}</td><td>${campo('navio')}</td><td class="rot">${rot(imo)}</td><td>${campo('imo')}</td></tr>
    <tr><td class="rot">${rot(bandeira)}</td><td>${campo('bandeira')}</td><td class="rot">${rot(classe)}</td><td>${campo('classificadora')}</td></tr>
    <tr><td class="rot">${rot(tipoNavio)}</td><td>${campo('tipoNavio')}</td><td class="rot">${rot(armador)}</td><td>${campo('armador')}</td></tr>
  </table>

  <div class="norma">Norma Aplicada / Relevant Standard <span>${escapeHtml(extras.norma)}</span></div>
  <div class="relatorio">Relatório Técnico nr ${escapeHtml(extras.relatorioNumero)}</div>

  <table class="itens">
    <thead>
      <tr>${modelo.colunas.map(col => `<th>${escapeHtml(col.rotulo)}${col.rotuloEn ? `<br>${escapeHtml(col.rotuloEn)}` : ''}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${itens.map(item => `<tr>${modelo.colunas.map(col => `<td>${escapeHtml(item[col.campo])}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>

  <div class="remarks">Remarks: ${escapeHtml(c.observacoes)}</div>

  <div class="rodape">
    <div class="proxima">NEXT INSPECTION BEFORE ${escapeHtml(c.validade)}</div>
    <div class="local">${escapeHtml([c.localEmissao, dataCurta].filter(Boolean).join(' '))}</div>
  </div>

  ${assinaturas.length ? `
    <div class="assinaturas">
      ${assinaturas.map(a => `<div>${escapeHtml(a.empresa)}<br>${escapeHtml(a.nome)}<br>${escapeHtml(a.cargo)}</div>`).join('')}
    </div>
  ` : ''}
</body>
</html>`
}
