// Importa serviços a partir de um CSV exportado do sistema antigo (exportar.csv —
// sem cabeçalho, 3 colunas: nome, custo (ignorado, sem campo equivalente no
// schema), valor). Separado por vírgula, em UTF-8.
//
// Uso: node scripts/importar-servicos.js [caminho-do-csv]
// Sem argumento, procura em %USERPROFILE%\Downloads\exportar.csv
//
// Regras de limpeza (arquivo bem mais bagunçado que o de produtos — 1033 linhas,
// mais da metade sem valor e ~250 duplicadas):
// - Linha cujo "nome" não tem nenhuma letra (só código tipo "70.000.159") não tem
//   informação nenhuma pra virar um serviço de verdade — descartada.
// - Nome duplicado (comparando sem acento de caixa/espaço/traço final) vira um
//   serviço só. Entre as duplicatas, fica a que tiver valor preenchido.
// - Serviço sem valor não é descartado só por isso — o nome sozinho já é
//   informação suficiente (ex: "10-YEARLY INSPECTION OF WATER MIST SYSTEM").
//   Fica com valor em branco, editável depois na tela de Produtos e Serviços.
// - Nome já cadastrado no banco (mesmo texto, ignorando caixa) é pulado —
//   idempotente, permite rodar de novo sem duplicar.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

// Parser de CSV simples — precisa lidar com campo entre aspas contendo vírgula
// (ex: "2.900,00") e com um caso específico do arquivo que escapa aspas com
// barra invertida (\") em vez do jeito padrão (""), tipo `"...PPER-1\"",,`.
function parseLinhaCsv(linha) {
  const campos = []
  let atual = ''
  let entreAspas = false

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (entreAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++ }
        else entreAspas = false
      } else if (c === '\\' && linha[i + 1] === '"') {
        atual += '"'; i++
      } else {
        atual += c
      }
    } else if (c === '"') {
      entreAspas = true
    } else if (c === ',') {
      campos.push(atual)
      atual = ''
    } else {
      atual += c
    }
  }
  campos.push(atual)
  return campos
}

function parseValorBR(s) {
  if (!s) return null
  const limpo = s.trim().replace(/\./g, '').replace(',', '.')
  if (!limpo) return null
  const n = parseFloat(limpo)
  return isNaN(n) ? null : n
}

// Chave de dedupe: ignora caixa, espaços repetidos e traço/ponto no final —
// não tenta casar nomes parecidos com palavras diferentes (arriscado demais
// pra fazer automático), só variação de formatação do mesmo texto.
function normalizar(nome) {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.\-–]+$/, '').trim()
}

function parsearCsv(caminho) {
  const linhas = fs.readFileSync(caminho, 'utf8').split(/\r?\n/).filter(l => l.trim())

  return linhas.map(linha => {
    const campos = parseLinhaCsv(linha)
    return {
      nome: (campos[0] || '').trim().replace(/^["']|["']$/g, ''),
      valor: parseValorBR(campos[2]),
    }
  })
}

async function importar(caminhoCsv) {
  const linhas = parsearCsv(caminhoCsv)
  console.log(`\n📁 Lidas ${linhas.length} linhas do CSV\n`)

  const semInformacao = linhas.filter(l => !l.nome || !/[a-zA-ZÀ-ÿ]/.test(l.nome))
  const validos = linhas.filter(l => l.nome && /[a-zA-ZÀ-ÿ]/.test(l.nome))

  const porNome = new Map()
  for (const l of validos) {
    const chave = normalizar(l.nome)
    const existente = porNome.get(chave)
    if (!existente || (l.valor != null && existente.valor == null)) {
      porNome.set(chave, l)
    }
  }

  const duplicados = validos.length - porNome.size
  console.log(`${porNome.size} serviços únicos (${duplicados} duplicados descartados)`)
  console.log(`${semInformacao.length} linhas sem nome informativo foram puladas`)

  let criados = 0
  let jaExistiam = 0

  for (const [, l] of porNome) {
    const jaExiste = await prisma.servico.findFirst({
      where: { nome: { equals: l.nome, mode: 'insensitive' } }
    })
    if (jaExiste) {
      jaExistiam++
      continue
    }

    await prisma.servico.create({
      data: { nome: l.nome, valor: l.valor }
    })
    criados++
  }

  console.log(`\n✅ ${criados} serviços criados`)
  console.log(`⚠️  ${jaExistiam} já existiam no banco (nome igual) — pulados`)
}

const caminhoCsv = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'exportar.csv')

if (!fs.existsSync(caminhoCsv)) {
  console.error(`Arquivo não encontrado: ${caminhoCsv}`)
  process.exit(1)
}

importar(caminhoCsv)
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
