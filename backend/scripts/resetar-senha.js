// scripts/resetar-senha.js
// Uso: node scripts/resetar-senha.js email@natalsafety.com.br
// Reseta a senha do usuário para uma senha temporária e força troca no próximo login.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const prisma = new PrismaClient()

const email = process.argv[2]

if (!email) {
    console.error('❌ Uso: node scripts/resetar-senha.js email@natalsafety.com.br')
    process.exit(1)
}

const usuario = await prisma.usuario.findUnique({ where: { email } })

if (!usuario) {
    console.error(`❌ Nenhum usuário encontrado com o email: ${email}`)
    await prisma.$disconnect()
    process.exit(1)
}

// Gera uma senha temporária curta e legível (ex: "a1b2c3d4")
const senhaTemporaria = crypto.randomBytes(4).toString('hex')

const hash = await bcrypt.hash(senhaTemporaria, 10)

await prisma.usuario.update({
    where: { email },
    data: {
        senha: hash,
        primeiroLogin: true,
        resetToken: null,
        resetTokenExpira: null
    }
})

console.log(`✅ Senha resetada para ${usuario.nome} (${email})`)
console.log(`🔑 Senha temporária: ${senhaTemporaria}`)
console.log(`⚠️  O usuário será obrigado a trocar a senha no próximo login.`)

await prisma.$disconnect()