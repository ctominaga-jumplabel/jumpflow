This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

O JumpFlow e publicado no **Railway**, plataforma unica de deploy desde o ADR17
(ver `docs/arquitetura.md`). A configuracao vive em `railway.json` na raiz do
repositorio e o deploy dispara no push para a `main`:

- build: `npm run db:generate && npm run build`
- start: `npm run db:deploy && npm run start -w @jumpflow/web` — ou seja,
  `prisma migrate deploy` roda antes de o app servir trafego.

Dominio de producao: <https://flow.jump.tec.br>.
