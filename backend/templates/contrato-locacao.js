import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// HTML do PDF do Contrato de Locação de Bens Móveis — recriação do modelo
// "Contrato de Locação Padrão" que a NS já usava (3 páginas: quadro do contrato +
// declaração + nota promissória, e depois as cláusulas). Só a logo do cabeçalho
// mudou; os textos são os do modelo, palavra por palavra — não "corrigir" redação
// aqui sem combinar, porque é o texto que o cliente assina.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_PATH = path.resolve(__dirname, '..', 'assets', 'Logo-NS.png')

// Dados fixos da locadora, iguais aos do modelo
const LOCADORA = {
  nome: 'Natal Safety',
  endereco: 'Rua Teotônio Freire, 248 - Ribeira - Natal/RN',
  cnpj: '58.419.959/0001-46',
  inscEstadual: '',
  contato: '(84) 3201-1240 - rental@natalsafety.com.br',
  cidade: 'Natal/RN'
}

const PERIODOS = { mensal: 'Mensal', unico: 'Único' }

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatarDocumento(doc) {
  if (!doc) return ''
  if (doc.length === 11) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (doc.length === 14) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

function moeda(valor) {
  return (valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// dataInicio/dataFim vêm de <input type="date"> e são gravadas à meia-noite UTC —
// formatar em UTC evita a data "voltar um dia" no fuso do servidor.
function dataBr(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''
}

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Número por extenso, de 0 a 9999 — só o que a data da nota promissória precisa
function extenso(n) {
  if (n < 20) return UNIDADES[n]
  if (n < 100) return DEZENAS[Math.floor(n / 10)] + (n % 10 ? ' e ' + UNIDADES[n % 10] : '')
  if (n === 100) return 'cem'
  if (n < 1000) return CENTENAS[Math.floor(n / 100)] + (n % 100 ? ' e ' + extenso(n % 100) : '')
  const milhar = Math.floor(n / 1000)
  const resto = n % 1000
  return (milhar === 1 ? 'mil' : extenso(milhar) + ' mil') + (resto ? ' e ' + extenso(resto) : '')
}

function dataPorExtenso(data) {
  const d = new Date(data)
  const dia = d.getUTCDate()
  return `${dia === 1 ? 'primeiro' : extenso(dia)} de ${MESES[d.getUTCMonth()]} de ${extenso(d.getUTCFullYear())}`
}

function descricaoBalsa(b) {
  return `${b.tipo} ${b.capacidade} PAX - ${b.fabricante} ${b.modelo} - Nº de série ${b.numeroSerie}`.toUpperCase()
}

// contrato: Contrato com cliente e balsas (com balsa) incluídos
export function htmlContratoLocacao(contrato) {
  const logoBase64 = fs.existsSync(LOGO_PATH)
    ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
    : ''

  const cliente = contrato.cliente
  const numero = `${contrato.numero}.${contrato.ano}`
  const nomeCliente = escapeHtml(cliente.nome)
  const docCliente = escapeHtml(formatarDocumento(cliente.cpfCnpj))
  const codigoCliente = String(cliente.id).padStart(6, '0')
  const dataContrato = new Date(contrato.criadoEm).toLocaleDateString('pt-BR')
  const inicio = dataBr(contrato.dataInicio)
  const periodo = PERIODOS[contrato.periodicidadePagamento] || contrato.periodicidadePagamento

  // O valor do contrato já inclui o frete (e o desconto) — no quadro o frete
  // aparece separado, então a locação por período é o valor sem ele.
  const frete = contrato.frete || 0
  const somaBalsas = contrato.balsas.reduce((acc, cb) => acc + (cb.valor || 0), 0)
  const valorLocacao = contrato.valor != null ? contrato.valor - frete : somaBalsas

  const enderecoCompleto = [cliente.endereco, cliente.cidade].filter(Boolean).map(escapeHtml).join(' - ')

  // O cadastro de balsa não tem valor do equipamento, então a nota promissória
  // sai zerada como no modelo (lá o valor também vem do "Valor do Equipamento").
  const valorEquipamentos = 0

  return `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 7mm 9mm 9mm 9mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 7.4pt; line-height: 1.18; color: #000; }

        .caixa { border: 1.3px solid #000; margin-bottom: 6pt; }

        .cabecalho { display: flex; align-items: center; height: 48pt; }
        .cabecalho .logo { width: 138pt; text-align: center; }
        .cabecalho .logo img { max-width: 118pt; max-height: 40pt; }
        .cabecalho .empresa { font-size: 8.8pt; line-height: 1.12; }

        h1 { font-size: 10.5pt; text-align: center; margin: 9pt 0 8pt; }

        .caixa-titulo { text-align: center; font-weight: bold; font-size: 7.8pt; border-bottom: 1px solid #000; line-height: 1.25; }

        .locatario { display: grid; grid-template-columns: 1fr 1fr; padding: 1pt 3pt 2pt 1pt; font-size: 7.8pt; line-height: 1.2; }

        table { width: 100%; border-collapse: collapse; }

        .condicoes td { border: 1px solid #000; text-align: center; height: 17.5pt; font-size: 7.8pt; }
        .condicoes tr:first-child td { border-top: none; }
        .condicoes td:first-child { border-left: none; }
        .condicoes td:last-child { border-right: none; }
        .condicoes td.observacoes { text-align: left; vertical-align: top; height: 36pt; padding: 3pt 4pt; border-bottom: none; font-size: 7pt; }

        .equipamentos { height: 180pt; }
        .equipamentos th { border: 1px solid #000; font-size: 7pt; padding: 1pt 0; line-height: 1.15; white-space: nowrap; }
        .equipamentos thead tr:first-child th { border-top: none; }
        .equipamentos th:first-child, .equipamentos td:first-child { border-left: none; }
        .equipamentos th:last-child, .equipamentos td:last-child { border-right: none; }
        .equipamentos td { border-left: 1px solid #000; border-right: 1px solid #000; padding: 1.5pt 3pt; font-size: 7pt; vertical-align: top; }
        .equipamentos tr.item td { height: 1px; }
        .equipamentos td.num { text-align: right; vertical-align: middle; }
        .equipamentos td.meio { text-align: center; vertical-align: middle; }
        .equipamentos td.patrimonio { vertical-align: middle; }

        .declaracao-texto { padding: 1pt 2pt 0; text-align: justify; font-size: 7.4pt; line-height: 1.12; }
        .assinaturas { padding: 0 6pt 3pt; font-size: 8pt; }
        .assinaturas .linha-dupla { display: grid; margin-top: 27pt; column-gap: 12pt; }
        .assinaturas .traco { border-top: 1px solid #000; padding-top: 4pt; }

        .promissoria { padding: 1pt 1pt 0; font-size: 7.8pt; line-height: 1.5; }
        .promissoria .topo { display: grid; grid-template-columns: 29.5% 35% 1fr; line-height: 1.25; }
        .promissoria .texto { text-align: justify; margin-top: 14pt; }
        .promissoria .rodape-np { display: grid; grid-template-columns: 64% 1fr; align-items: end; }
        .promissoria .avalista { border-top: 1px solid #000; border-left: 1px solid #000; padding: 2pt 3pt 1pt; line-height: 1.2; margin-right: -1pt; }

        .clausulas { page-break-before: always; font-size: 8.6pt; line-height: 9.3pt; padding: 12pt 4pt 0; }
        .clausulas p { margin-bottom: 9.3pt; }
        .quebra { page-break-before: always; padding-top: 12pt; }
      </style>
    </head>
    <body>

      <div class="caixa cabecalho">
        <div class="logo">${logoBase64 ? `<img src="${logoBase64}">` : ''}</div>
        <div class="empresa">
          ${LOCADORA.nome}<br>
          ${LOCADORA.endereco}<br>
          CNPJ: ${LOCADORA.cnpj} Insc. Estadual: ${LOCADORA.inscEstadual}<br>
          ${LOCADORA.contato}
        </div>
      </div>

      <h1>CONTRATO DE LOCAÇÃO DE BENS MÓVEIS - SEM OPERADOR - Nº: ${numero}</h1>

      <div class="caixa">
        <div class="caixa-titulo">LOCATÁRIO</div>
        <div class="locatario">
          <div>
            DATA: ${dataContrato}<br>
            Nome/Empresa: ${nomeCliente}<br>
            Endereço: ${escapeHtml(cliente.endereco)}<br>
            Cidade: ${escapeHtml(cliente.cidade)}<br>
            Entrega em:<br>
            Endereço da Entrega: , - /
          </div>
          <div>
            CPF/CNPJ: ${docCliente}<br>
            Código do Cliente: ${codigoCliente}<br>
            Telefones: ${escapeHtml(cliente.telefone)} /<br>
            CEP:<br>
            Vendedor:<br>
            Contato/Fone: -
          </div>
        </div>
      </div>

      <div class="caixa">
        <table class="condicoes">
          <tr>
            <td style="width:30.8%;">Início do contrato: ${inicio}</td>
            <td style="width:38.5%;">Nº contrato: ${numero}</td>
            <td>Previsão de término: ${contrato.dataFim ? dataBr(contrato.dataFim) : '&nbsp; / &nbsp;/'}</td>
          </tr>
          <tr>
            <td>Período de cobrança: <strong>${escapeHtml(periodo)}</strong></td>
            <td>Valor da locação por período (${escapeHtml(periodo)}): <strong>R$ ${moeda(valorLocacao)}</strong></td>
            <td>Valor frete: <strong>R$ ${moeda(frete)}</strong></td>
          </tr>
          <tr>
            <td colspan="3" class="observacoes">Observações: ${escapeHtml(contrato.observacoes)}</td>
          </tr>
        </table>
      </div>

      <div class="caixa">
        <table class="equipamentos">
          <thead>
            <tr>
              <th rowspan="2" style="width:6.2%;">Qtde</th>
              <th rowspan="2" style="width:11.6%;">Patrimônio</th>
              <th rowspan="2">Descrição dos Equipamentos</th>
              <th rowspan="2" style="width:5%;">Aditivo</th>
              <th colspan="2">Valor do Equipamento</th>
              <th colspan="2">Valor da Locação/Período</th>
            </tr>
            <tr>
              <th style="width:8.3%;">Unitário</th>
              <th style="width:5.9%;">Total</th>
              <th style="width:8.3%;">Unitário</th>
              <th style="width:7.4%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${contrato.balsas.map(cb => `
              <tr class="item">
                <td class="num">1</td>
                <td class="patrimonio">${escapeHtml(cb.balsa.patrimonio)}</td>
                <td>${escapeHtml(descricaoBalsa(cb.balsa))}</td>
                <td class="meio">${cb.aditivo || '-'}</td>
                <td class="num">0,00</td>
                <td class="num">0,00</td>
                <td class="num">${moeda(cb.valor)}</td>
                <td class="num">${moeda(cb.valor)}</td>
              </tr>
            `).join('')}
            <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
          </tbody>
        </table>
      </div>

      <div class="caixa">
        <div class="caixa-titulo">DECLARAÇÃO</div>
        <div class="declaracao-texto">
          A LOCATÁRIA recebe neste ato, ou na entrega, por si mesma ou seu preposto, o(s) bem(ns) móvel(is) referido(s) no presente instrumento, declarando tê-lo(s) testado(s) e aprovado(s) previamente e afirmado que o(s) mesmo(s) se acha(m) em perfeito estado de funcionamento, limpeza e segurança.<br>
          <strong>A LOCATÁRIA declara que:</strong><br>
          (I) Reconhece detalhadamente sua correta utilização e funcionamento, pelo que se obriga a devolvê-lo(s) em idênticas condições de funcionamento,<br>
          (II) Em caso de dano parcial ou total, bem como os itens sujeitos a desgaste(s) natural(is) irá imediatamente repor ou arcar com os reparos necessários e demais despesas decorrente do mesmo.<br>
          (III) Fará uso de todos os equipamentos de segurança (EPIs) necessários na utilização desse(s) bem(ns) móvel(is) alugado(s), bem como das normas de segurança pertinentes.<br>
          (IV) Recebeu o(s) bem(ns) móvel(is) listado(s) bem como manual de instruções de uso e segurança e se compromete a repassá-las a quem for utilizar o(s) mesmo(s).<br>
          (V) Tomou conhecimento prévio e concordou com as condições do Contrato de Locação de Bem(ns) Móvel(is) - Sem Operador entregue junto com este documento.
        </div>
        <div class="assinaturas">
          <div class="linha-dupla" style="grid-template-columns: 33% 32% 18%;">
            <div class="traco">LOCATÁRIA: ${nomeCliente}</div>
            <div class="traco">RECEBIDO POR:</div>
            <div class="traco" style="margin-left:-12pt; padding-left:12pt;">RG:</div>
          </div>
          <div class="linha-dupla" style="grid-template-columns: 33% 52%;">
            <div class="traco">LOCADORA: ${LOCADORA.nome}</div>
            <div class="traco">FUNCIONÁRIO(A):</div>
          </div>
        </div>
      </div>

      <div class="caixa promissoria" style="margin-bottom:0;">
        <div class="topo">
          <div><strong>NOTA PROMISSÓRIA</strong><br>Nº: ${numero}</div>
          <div>VENCIMENTO: ${inicio}</div>
          <div><strong>Nº: ${numero}</strong><br>Valor: R$ ${moeda(valorEquipamentos)}</div>
        </div>
        <div class="texto">
          No dia ${dataPorExtenso(contrato.dataInicio)} pagarei por essa Nota Promissória à ${LOCADORA.nome}, CNPJ: ${LOCADORA.cnpj} ou a sua ordem, a quantia de R$ ${moeda(valorEquipamentos)} () em moeda corrente deste país, pagavél em ${LOCADORA.cidade}.
        </div>
        <div class="rodape-np">
          <div>
            EMITENTE: ${nomeCliente}<br>
            CPF/CNPJ: ${docCliente}<br>
            ENDEREÇO: ${enderecoCompleto}
          </div>
          <div class="avalista">
            NOME: ${nomeCliente}<br>
            CPF/CNPJ: ${docCliente}
          </div>
        </div>
      </div>

      <div class="clausulas">
        <p>Pelo presente instrumento de Contrato de Locação de Bens Móveis, que entre si fazem de um lado a Natal Safety, Inscrita no CNPJ/MF sob o n. 58.419.959/0001-46, estabelecida na Rua Teotônio Freire, 248, Bairro Ribeira na cidade de Natal/RN,<br>
        CEP 59012-110, neste ato devidamente representado por seu representante legal abaixo assinado, daqui em diante denominada simplesmente LOCADORA, e de outro lado como LOCATÁRIO(A), a pessoa física ou jurídica descrita nesse contrato, têm justo e contratados o que se segue:</p>

        <p>1. DO OBJETO<br>
        1.1 Constitui objeto deste contrato a locação por parte da LOCADORA, de máquinas e equipamentos ao LOCATÁRIO(A).<br>
        1.2 As disposições deste contrato prevalecem sobre quaisquer outras avenças anteriores entre as partes.<br>
        1.3 É opcional ao LOCATÁRIO(A), no ato de assinatura deste instrumento, contratar garantias contra defeitos de funcionamento dos equipamentos. Em caso de defeito, o equipamento nunca deverá ser aberto ou rompido seu lacre, para que não cessem as garantias contratadas.<br>
        No caso de rompimento do lacre, os defeitos de funcionamento que por ventura se apresentarem serão de responsabilidade do LOCATÁRIO(A). Esta garantia não se aplica a queima de motores elétricos avulsos ou dos equipamentos.</p>

        <p>2. DO PRAZO<br>
        2.1 O presente contrato é celebrado pelo prazo definido no verso a contar desta data, podendo ser prorrogado por igual período, caso não haja manifestação do LOCATÁRIO(A) até a data de vencimento, desde que todas as prerrogativas deste contrato estejam sendo cumpridas integralmente.</p>

        <p>3. DO VALOR DA LOCAÇÃO<br>
        3.1 Pela locação deste contrato, o LOCATÁRIO(A) pagará à LOCADORA os preços estabelecidos na tabela do sistema do LOCATÁRIO(A), cuja tabela será diferenciada de acordo com o tipo de locação, com ou sem mão de obra.<br>
        3.2 A tabela será apresentada pela LOCADORA ao LOCATÁRIO(A) por ocasião da assinatura deste contrato e quando de suas alterações.<br>
        3.3 No ato da assinatura ficará estabelecido a quantidade de máquinas(s) e/ou equipamentos(s) que será(ão) colocado(s) à disposição do LOCATÁRIO(A), que poderá ser diário ou mensal, em comum acordo entre as partes.<br>
        3.4 O LOCATÁRIO autoriza a LOCADORA faça inclusão no biros de créditos SPC/SERASA em caso de atraso ou falta do pagamento.</p>

        <p>4. RELOCAÇÃO<br>
        4.1 A relocação de qualquer bem a que se refere este contrato será automática, desde que o LOCATÁRIO(A) não devolva o(s) bem(ns) locado(s) no final do período de locação.</p>

        <p>5. DAS FORMAS DE PAGAMENTO<br>
        5.1 Caso o LOCATÁRIO(A) permaneça de posse do bem locado depois de vencido o contrato, e não havendo relocação, bem como na hipótese de não efetuar o pagamento da locação até 10 (dez) dias após o vencimento do pagamento,<br>
        este contrato será rescindido de pleno direito, sem necessidade de notificação judicial e, neste caso, o LOCATÁRIO(A) devolverá de imediato e espontaneamente o equipamento e, caso seja de vontade da LOCADORA, a mesma poderá de imediato retirar o(s) equipamento(s) locado(s) onde quer que ele(s) esteja(m), independente de qualquer aviso, notificação ou interpelação, sem nenhuma formalidade.<br>
        5.2 O LOCATÁRIO(A) autoriza desde já as prerrogativas do item 5.1, sendo que, nos dias decorridos até a efetiva devolução serão pagos imediatamente pelo LOCATÁRIO(A), depois de vistoriados os equipamentos e assinado um termo de entrega.<br>
        Se não for realizada a entrega do bem à LOCADORA, esta poderá ajuizar ação judicial visando a retomada do bem locado, hipótese em que o LOCATÁRIO(A) arcará com todos os custos advindos da citada ação, inclusive honorários advocatícios.<br>
        5.3 Para efeito de cálculo de pagamento, contar-se-ão dias corridos, a partir da data de retirada do bem locado do depósito da LOCADORA, até a data de sua devolução no mesmo local de onde foi retirado.<br>
        5.4 O atraso no pagamento por período de até 3 (três) dias acarretará a atualização do débito de acordo com a taxa de juros de 1% (um por cento) ao mês, calculado de forma pró-rata e multa de 2% (dois por cento).</p>

        <p>6. DAS OBRIGAÇÕES E RESPONSABILIDADES DA LOCADORA<br>
        6.1 Obriga-se a LOCADORA a entregar todo o equipamento locado em perfeito estado de uso.<br>
        6.2 A LOCADORA obriga-se a testar o bem locado na frente do LOCATÁRIO(A), no ato da locação e da devolução do bem locado.<br>
        Neste mesmo ato o LOCATÁRIO(A) deverá ser instruído para usar o equipamento.<br>
        6.3 Toda e qualquer responsabilidade de manuseio do bem locado é inteiramente da alçada do LOCATÁRIO(A), não sendo da responsabilidade da LOCADORA qualquer eventual acidente decorrente do uso ou do manuseio do bem locado.<br>
        6.4 No caso de pane e/ou falha no funcionamento do equipamento locado, a LOCADORA ficará obrigada a substitui-lo por outro de igual modelo e/ou capacidade dentro do prazo máximo de 05 (cinco) horas, contados da efetiva e comprovada comunicação feita pelo LOCATÁRIO(A), sem possibilidade de qualquer indenização pecuniária em favor do LOCATÁRIO(A).</p>

        <p>7. DAS OBRIGAÇÕES E RESPONSABILIDADES DO LOCATÁRIO(A)<br>
        7.1 O LOCATÁRIO(A) obriga-se a usar o bem locado dentro das normas habituais para seu bom funcionamento e fazer toda manutenção necessária, assumindo, por força do presente contrato, toda responsabilidade pelos danos que o uso indevido ou a manutenção inadequada venham causar ao referido bem.<br>
        7.2 O LOCATÁRIO(A) executará os serviços de montagem e desmontagem dos equipamentos com pessoal próprio e despesas por conta própria, não tendo a LOCADORA nenhuma responsabilidade por esses processos. Conforme lei complementar 116 de 31 de julho de 2003, no seu art. 3o inciso II e XIII, o ISS (Imposto Sobre Serviços), seu recolhimento fica na responsabilidade de LOCATÁRIO(A).<br>
        7.3 O LOCATÁRIO(A), em caso de permanência do bem por período superior ao estabelecido no contrato, deverá comunicar à LOCADORA, até o vencimento previsto no presente contrato e, em caso de permanência por um período acima de 12 (doze) meses, o bem locado sofrerá um reajuste de acordo com o INPC.<br>
        7.4 Em caso de extravio, acidente ou outro motivo que venha a inutilizar o bem locado, compromete-se o LOCATÁRIO(A) a indenizar a LOCADORA com valores atualizados do mesmo, mediante apresentação de três cotações de preço do bem.<br>
        7.5 No ato da devolução, se o bem locado apresentar qualquer tipo de problema ou falta de peça que interfira no seu funcionamento ou design, a reposição será cobrada de imediato. Se o LOCATÁRIO(A) recusar-se, será cobrada a locação do bem até a solução legal do problema.<br>
        7.6 São de inteira responsabilidade do LOCATÁRIO(A) as despesas relativas a frete de entrega e/ou substituição do bem locado na obra e posterior devolução ao depósito da LOCADORA.</p>

        <p class="quebra">7.7 É expressamente proibido ao LOCATÁRIO(A) emprestar, arrendar ou sublocar o bem locado, ou de qualquer forma ceder seu uso a terceiros, bem como transferi-lo para outro local sem a autorização da LOCADORA.<br>
        7.8 O LOCATÁRIO(A) autoriza a LOCADORA a colocar sua placa identificadora em sua obra sem qualquer oneração para a LOCADORA.<br>
        7.9 O LOCATÁRIO(A) obriga-se a emitir um cheque ou fazer um adiantamento em espécie no valor de indenização do bem locado, no ato da locação, valor este que servirá de garantia para a LOCADORA em caso de extravio do bem ou inadimplemento por período superior a 15 dias, bem como danos causados ao bem ou quando o LOCATÁRIO(A) se recusar a restituir a LOCADORA. Os valores a maior da dívida e seus decorrentes serão devolvidos ao LOCATÁRIO(A). O cheque/dinheiro caução poderá ser depositado a critério da LOCADORA. No ato da entrega dos equipamentos, tendo sido comprovada sua perfeita ordem, o cheque/dinheiro caução será devolvido obrigatoriamente ao seu titular, mediante aviso com antecedência da entrega dos equipamentos com no mínimo 24 horas de antecedência por parte do LOCATÁRIO(A).<br>
        7.10 É de responsabilidade do LOCATÁRIO(A) a exigência de uso de EPI para seus funcionários no manuseio ou uso de qualquer bem locado, a LOCADORA não se responsabiliza por nenhum acidente que venha a ocorrer com funcionários do LOCATÁRIO(A).<br>
        7.11 Desde já fica a LOCADORA autorizada a efetuar débito no cartão de crédito do LOCATÁRIO(A) dos valores referentes à relocação e/ou indenização deste contrato nas condições e prazos aqui especificados, sempre que a condição de pagamento escolhida pelo LOCATÁRIO(A) for cartão de crédito.</p>

        <p>8. DA RESCISÃO<br>
        8.1 A rescisão deste contrato somente será feita mediante devolução dos equipamentos em poder do LOCATÁRIO(A), como também nas seguintes condições: Inadimplência por parte do LOCATÁRIO(A), danos ou perdas dos equipamentos com sua devida indenização.<br>
        8.2 A LOCADORA rescindirá o contrato quando o LOCATÁRIO(A) não estiver cumprindo, no todo ou em parte, as prerrogativas deste contrato.<br>
        8.3 Este contrato também poderá ser rescindido em comum acordo entre as partes.</p>

        <p>9. DAS DISPOSIÇÕES GERAIS<br>
        9.1 Fica convencionado e aceito pelo LOCATÁRIO(A) que nas notas fiscais emitidas referentes a relocação serão enviadas pelo correio, isentando totalmente a assinatura do canhoto das referidas notas fiscais, uma vez que o(s) objeto(s) deste contrato se encontra(m) em poder do LOCATÁRIO(A) desde a assinatura do mesmo.<br>
        9.2 A devolução do bem será acompanhada de nota de devolução emitida pelo LOCATÁRIO(A), que assumirá toda responsabilidade pelas infrações fiscais decorrentes de sua emissão.<br>
        9.3 Quando da devolução do bem locado, os dias excedentes limitados até 10 dias consecutivos, será cobrado proporcional ao valor da locação. Após 10 dias, o contrato será renovado automaticamente a contar do dia seguinte ao vencimento da primeira locação, considerando a locação mensal.</p>

        <p>10. DO FORO<br>
        10.1 As partes elegem o FORO de Natal/RN para dirimir as questões oriundas deste contrato, com renúncia a qualquer outro por mais privilegiado que seja.</p>

        <p>OBS.: DECLARO TER LIDO O PRESENTE CONTRATO E ACEITO TODAS AS CLÁUSULAS NELE CONTIDO.</p>

        <div style="margin-top:36pt; width:200pt; border-top:1px solid #000;">LOCATÁRIO - PROCURADOR(ES)</div>
        <div style="margin-top:9pt;">Nome:<br>Cargo:</div>
      </div>

    </body>
    </html>
  `
}
