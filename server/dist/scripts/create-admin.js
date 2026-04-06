"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME ?? 'Admin';
    if (!email || !password) {
        console.error('❌ Faltan variables requeridas: ADMIN_EMAIL y ADMIN_PASSWORD');
        console.error('   Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:create-admin');
        process.exit(1);
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log(`⚠️  Ya existe un usuario con email ${email}`);
        process.exit(0);
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    const user = await prisma.user.create({
        data: { email, passwordHash, name, role: 'encargado' },
        select: { id: true, email: true, name: true, role: true },
    });
    console.log(`✅ Usuario encargado creado: ${user.email} (${user.name})`);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=create-admin.js.map