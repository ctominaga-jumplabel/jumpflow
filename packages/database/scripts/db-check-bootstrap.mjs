// One-off read-only check of the bootstrap admin + pending invitation.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = "christopher.tominaga@jumplabel.com.br";

const user = await prisma.user.findUnique({
  where: { email },
  include: { roles: { include: { role: true } } },
});
const pending = await prisma.userInvitation.count({
  where: { email, status: "PENDING" },
});

console.log(
  JSON.stringify(
    {
      adminUser: user
        ? {
            id: user.id,
            name: user.name,
            roles: user.roles.map((r) => r.role.name),
            hasPassword: Boolean(user.passwordHash),
            status: user.status,
          }
        : null,
      pendingInvitations: pending,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
