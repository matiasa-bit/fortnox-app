This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

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

## Environment flags

- `NEXT_PUBLIC_INVOICE_ROWS_ARE_EX_VAT` (default: `true`)
	- `true`: Fakturarader från Fortnox (`Price`, `Total`) behandlas som redan exklusive moms.
	- `false`: UI räknar om fakturarader till exklusive moms med `belopp / 1.25`.
- `ALLOW_SHARED_VIEW_WITHOUT_LOGIN` (default: `false`)
	- `true`: Tillåter läsning av dashboard/byråvy utan individuell Fortnox-cookie (bra för tillfällig demo-delning).
	- `false`: Normal inloggning krävs.
- `APP_LOGIN_USERNAME` (default: `admin`)
	- Användarnamn för enkel app-inloggning innan Fortnox-login.
- `APP_LOGIN_PASSWORD` (default: `fortnox123`)
	- Lösenord för enkel app-inloggning innan Fortnox-login.

## Bolagsverket API (CRM)

Miljövariabler:

- `BOLAGSVERKET_API_BASE_URL`
	- Bas-URL till er Bolagsverket API-gateway.
- `BOLAGSVERKET_API_KEY` (eller `BOLAGSVERKET_SUBSCRIPTION_KEY`)
	- API-nyckel för anrop.
- `BOLAGSVERKET_BEARER_TOKEN` (valfri)
	- Om er gateway kräver bearer-token.
- `BOLAGSVERKET_COMPANY_PATH_TEMPLATE` (valfri, default: `/v1/companies/{orgNumber}`)
- `BOLAGSVERKET_BOARD_PATH_TEMPLATE` (valfri, default: `/v1/companies/{orgNumber}/board`)

Ny endpoint:

- `GET /api/admin/sync-bolagsverket?limit=25&offset=0`
	- Synkar bolagsdata + styrelse för ett batchurval av CRM-klienter.
- `GET /api/admin/sync-bolagsverket?clientId=123`
	- Synkar en specifik CRM-klient.
- `POST /api/admin/sync-bolagsverket`
	- JSON body: `{ "clientId": 123 }` eller `{ "organizationNumber": "556677-8899" }`.

SQL migration:

- Kör `scripts/migrate-crm-bolagsverket.sql` i Supabase för nya kolumner i `crm_clients`.

## Tillfällig delning

- Starta appen lokalt: `npm run dev`
- Starta publik tunnel: `npm run share`
- Dela URL:en som skrivs ut av `cloudflared`

## Vercel (stabil delning)

1. Deploy projektet till Vercel.
2. Sätt miljövariabler i Vercel:
	- `FORTNOX_CLIENT_ID`
	- `FORTNOX_CLIENT_SECRET`
	- `FORTNOX_REDIRECT_URI` = `https://DIN-DOMÄN/api/auth/callback`
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
	- `SUPABASE_SERVICE_ROLE_KEY`
	- `ALLOW_SHARED_VIEW_WITHOUT_LOGIN=false`
	- `APP_LOGIN_USERNAME`
	- `APP_LOGIN_PASSWORD`
3. Lägg exakt samma redirect URI i Fortnox Developer Portal.
4. Redeploy och testa loginflödet via Vercel-domänen.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
