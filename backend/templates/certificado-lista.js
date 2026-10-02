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
  }
}

export const TIPOS_LISTA = Object.keys(MODELOS_LISTA)

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
