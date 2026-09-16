import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'

const router = Router()

// ─── Listar contas a pagar avulsas (sem vínculo com OC) ───────────────────────
router.get('/', autenticar, async (req, res) => {
  const contas = await prisma.contaPagar.findMany({
    orderBy: [{ status: 'asc' }, { dataVencimento: 'asc' }]
  })
  res.json(contas)
})

// ─── Criar conta a pagar avulsa (só admin e financeiro) ────────────────────────
router.post('/', autenticar, exigirPerfil('admin', 'financeiro'), async (req, res) => {
  const { fornecedorNome, descricao, valor, dataVencimento, referencia } = req.body

  if (!valor || !dataVencimento) {
    return res.status(400).json({ erro: 'Valor e data de vencimento são obrigatórios' })
  }

  const conta = await prisma.contaPagar.create({
    data: {
      fornecedorNome: fornecedorNome || null,
      descricao: descricao || null,
      valor: parseFloat(valor),
      dataVencimento: new Date(dataVencimento).toISOString(),
      referencia: referencia || null
    }
  })

  res.json(conta)
})

// ─── Marcar conta a pagar avulsa como paga (só admin e financeiro) ────────────
router.post('/:id/marcar-pago', autenticar, exigirPerfil('admin', 'financeiro'), async (req, res) => {
  const id = Number(req.params.id)
  const { dataPagamento } = req.body

  const conta = await prisma.contaPagar.findUnique({ where: { id } })
  if (!conta) return res.status(404).json({ erro: 'Conta a pagar não encontrada' })

  const atualizada = await prisma.contaPagar.update({
    where: { id },
    data: {
      status: 'pago',
      dataPagamento: dataPagamento ? new Date(dataPagamento).toISOString() : new Date().toISOString()
    }
  })

  res.json(atualizada)
})

// ─── Reverter pagamento pra pendente (caso tenha marcado errado) ──────────────
router.post('/:id/reverter', autenticar, exigirPerfil('admin', 'financeiro'), async (req, res) => {
  const id = Number(req.params.id)

  const atualizada = await prisma.contaPagar.update({
    where: { id },
    data: { status: 'pendente', dataPagamento: null }
  })

  res.json(atualizada)
})

export default router
