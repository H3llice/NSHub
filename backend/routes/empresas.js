import { Router } from 'express'
import { prisma } from '../server.js'
import { autenticar } from '../middleware/auth.js'

const router = Router()

router.get('/', autenticar, async (req, res) => {
  const empresas = await prisma.empresa.findMany()
  res.json(empresas)
})

export default router