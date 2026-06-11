import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import ocsRouter from './routes/ocs.js'
import empresasRouter from './routes/empresas.js'
import fornecedoresRouter from './routes/fornecedores.js'
import anexosRouter from './routes/anexos.js'
import pdfRouter from './routes/pdf.js'
import authRouter from './routes/auth.js'

const app = express()
const prisma = new PrismaClient()

app.use(cors())
app.use(express.json())

app.use('/auth', authRouter)
app.use('/empresas', empresasRouter)
app.use('/fornecedores', fornecedoresRouter)
app.use('/anexos', anexosRouter)
app.use('/uploads', express.static('uploads'))
app.use('/pdf', pdfRouter)
app.use('/ocs', ocsRouter)

app.get('/', (req, res) => {
  res.json({ mensagem: 'API do Portal NS funcionando!' })
})

// Roda a cada 24h e deleta OCs canceladas há mais de 30 dias
setInterval(async () => {
  const limite = new Date()
  limite.setDate(limite.getDate() - 30)

  const antigas = await prisma.ordemCompra.findMany({
    where: { status: 'cancelada', canceladoEm: { lt: limite } },
    include: { anexos: true }
  })

  for (const oc of antigas) {
    await prisma.itemOC.deleteMany({ where: { ocId: oc.id } })
    await prisma.anexo.deleteMany({ where: { ocId: oc.id } })
    await prisma.ordemCompra.delete({ where: { id: oc.id } })
  }

  if (antigas.length > 0) {
    console.log(`🗑️ ${antigas.length} OCs canceladas deletadas permanentemente`)
  }
}, 24 * 60 * 60 * 1000)

const PORT = 3000
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})

export { prisma }