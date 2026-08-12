// scripts/criar-usuarios.js
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const usuarios = [
  { nome: 'Rafael', email: '', senha: 'RChave4321', perfil: 'tecnico' },
  
]

for (const u of usuarios) {
  const hash = await bcrypt.hash(u.senha, 10)
  await prisma.usuario.upsert({
    where: { email: u.email },
    update: {},
    create: { ...u, senha: hash }
  })
  console.log(`✅ ${u.perfil}: ${u.email} / senha: ${u.senha}`)
}

await prisma.$disconnect()