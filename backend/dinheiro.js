import { Prisma } from '@prisma/client'

// Valores em R$ ficam em colunas Float (double). O certo seria Decimal, mas trocar
// o tipo de coluna com dados faz o `prisma db push` do deploy exigir
// --accept-data-loss. Em vez disso, todo valor monetário é arredondado a 4 casas
// ANTES de gravar — o mesmo que uma coluna Decimal(16,4) faria — pra que o ruído
// de ponto flutuante (0.1 + 0.2 = 0.30000000000000004) nunca chegue ao banco nem
// se acumule de uma gravação pra outra.
const CAMPOS_DINHEIRO = new Set([
  'valor', 'valorTotal', 'valorUni', 'valorUnitario', 'frete', 'comissao',
  'descontoValor', 'ipi', 'salario', 'descontoPlanoSaude', 'valorAuxilioMoradia',
  'auxilioMoradia', 'coparticipacaoPlanoSaude', 'ajudaCusto', 'provisaoAjudaCusto', 'premio'
])

const OPERACOES_ESCRITA = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert'])

export function arredondarDinheiro(valor) {
  return Math.round((valor + Number.EPSILON) * 10000) / 10000
}

// Percorre o `data` (inclusive escritas aninhadas: itens: { create: [...] }) e
// arredonda só campos monetários que sejam número — `auxilioMoradia`, por
// exemplo, é Boolean em Colaborador e R$ em ItemFolhaPagamento.
function arredondarCampos(dados) {
  if (Array.isArray(dados)) return dados.map(arredondarCampos)
  // Só objeto literal: Date, Buffer e sentinelas do Prisma (Prisma.JsonNull,
  // Prisma.DbNull) são instâncias de classe e têm que passar intactos.
  if (!dados || typeof dados !== 'object' || Object.getPrototypeOf(dados) !== Object.prototype) return dados

  const saida = {}
  for (const [chave, valor] of Object.entries(dados)) {
    if (typeof valor === 'number' && CAMPOS_DINHEIRO.has(chave)) saida[chave] = arredondarDinheiro(valor)
    else saida[chave] = arredondarCampos(valor)
  }
  return saida
}

export const extensaoDinheiro = Prisma.defineExtension({
  name: 'arredonda-dinheiro',
  query: {
    $allModels: {
      $allOperations({ operation, args, query }) {
        if (!OPERACOES_ESCRITA.has(operation)) return query(args)

        const novo = { ...args }
        if (novo.data) novo.data = arredondarCampos(novo.data)
        if (novo.create) novo.create = arredondarCampos(novo.create)
        if (novo.update) novo.update = arredondarCampos(novo.update)
        return query(novo)
      }
    }
  }
})
