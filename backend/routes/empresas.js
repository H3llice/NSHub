import { Router } from 'express'
import { prisma } from '../server.js'

const router = Router()

router.get('/', async (req, res) => {
  const empresas = await prisma.empresa.findMany()
  res.json(empresas)
})

export default router