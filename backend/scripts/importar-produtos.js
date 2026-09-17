// Importa produtos do Almoxarifado a partir de um CSV exportado do sistema antigo
// (products.csv — cabeçalho: Código;EAN;Nome do Produto;Valor de Venda;Qt. Estoque;
// Qt. Mínima;Qt. Máxima;Observação). Separado por ; e em Latin-1 (ISO-8859-1).
//
// Uso: node scripts/importar-produtos.js [caminho-do-csv]
// Sem argumento, procura em %USERPROFILE%\Downloads\products.csv
//
// Regras:
// - codigo é @unique no schema e já vem único no CSV — usado direto como chave.
//   Produto cujo código já existe no banco é pulado (idempotente).
// - Qt. Estoque do CSV está quase toda negativa (230 das 284 linhas) — claramente
//   não é uma contagem física de estoque de verdade, é sobra de outro controle do
//   sistema antigo. Importar isso geraria estoque "esquisito" (negativo) igual pro
//   catálogo inteiro. Em vez de arrastar esse lixo, todo produto entra com
//   quantidade 0 — quem for usar o produto reconta e ajusta na tela de Almoxarifado.
// - Qt. Mínima do CSV é sempre 0 em todas as linhas, então quantidadeCritica nasce
//   0 (sem alerta) de qualquer forma — mas o mapeamento fica pronto pro dia que
//   o CSV vier com esse dado preenchido.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

function parseValorBR(s) {
  if (!s) return null
  const limpo = s.replace(/R\$\s*/i, '').trim().replace(/\./g, '').replace(',', '.')
  if (!limpo) return null
  const n = parseFloat(limpo)
  return isNaN(n) ? null : n
}

function parsearCsv(caminho) {
  const texto = fs.readFileSync(caminho).toString('latin1')
  const linhas = texto.split(/\r?\n/).filter(l => l.trim())
  const [, ...dados] = linhas // descarta o cabeçalho

  return dados.map(linha => {
    const c = linha.split(';')
    return {
      codigo: (c[0] || '').trim(),
      nome: (c[2] || '').trim(),
      valor: parseValorBR(c[3]),
      quantidadeCritica: parseValorBR(c[5]) || 0,
    }
  })
}

async function importar(caminhoCsv) {
  const linhas = parsearCsv(caminhoCsv)
  console.log(`\n📁 Lidas ${linhas.length} linhas do CSV\n`)

  const semDados = linhas.filter(l => !l.codigo || !l.nome)
  const validos = linhas.filter(l => l.codigo && l.nome)

  // codigo já é único no arquivo, mas por segurança colapsa por chave também aqui
  const porCodigo = new Map()
  for (const l of validos) {
    if (!porCodigo.has(l.codigo)) porCodigo.set(l.codigo, l)
  }

  console.log(`${porCodigo.size} produtos únicos por código (${validos.length - porCodigo.size} duplicados no CSV)`)
  console.log(`${semDados.length} linhas sem código ou nome foram puladas`)

  let criados = 0
  let jaExistiam = 0

  for (const [codigo, l] of porCodigo) {
    const jaExiste = await prisma.produto.findUnique({ where: { codigo } })
    if (jaExiste) {
      jaExistiam++
      continue
    }

    await prisma.produto.create({
      data: {
        codigo,
        nome: l.nome,
        unidade: 'unidade',
        valor: l.valor,
        quantidade: 0,
        quantidadeCritica: l.quantidadeCritica,
      }
    })
    criados++
  }

  console.log(`\n✅ ${criados} produtos criados`)
  console.log(`⚠️  ${jaExistiam} já existiam no banco (código igual) — pulados`)
}

const caminhoCsv = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Downloads', 'products.csv')

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
