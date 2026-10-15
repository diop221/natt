# Natt

La tontine sans trésorier : chaque membre cotise en Lightning, et quand tout le monde a payé, la cagnotte part automatiquement sur le Wave ou l'Orange Money du bénéficiaire, via l'API Bitnob.

## Démarrer

Il faut une base Postgres. En local, le plus simple est Docker :

```bash
docker run -d --name natt-postgres -e POSTGRES_PASSWORD=natt -e POSTGRES_DB=natt -p 127.0.0.1:54329:5432 postgres:16-alpine
```

Puis :

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev
```

Ouvrir http://localhost:3000.

## Base Supabase

1. Créer un projet sur https://supabase.com (région la plus proche : Europe, par exemple Francfort ou Paris).
2. Dans **Connect** (en haut du tableau de bord du projet), copier les deux chaînes de connexion dans `.env`, en remplaçant `[YOUR-PASSWORD]` par le mot de passe de la base :
   - `DATABASE_URL` : le **Transaction pooler** (port 6543), en ajoutant `?pgbouncer=true&connection_limit=1` à la fin ;
   - `DIRECT_URL` : le **Session pooler** (port 5432).
3. Créer les tables : `npx prisma migrate deploy`.
4. Relancer `npm run dev`.

L'application passe par le pooler ; les migrations passent par `DIRECT_URL`, car le pooler en mode transaction ne les supporte pas.

Par défaut, `PAYMENT_PROVIDER=mock` : les factures et les versements sont simulés. Le tableau de bord affiche alors un bouton « Simuler le paiement » pour chaque membre.

## Fonctionnalités

| Version | Fonctionnalité | Où |
|---|---|---|
| MVP | Tontine classique : factures Lightning, tableau de bord, versement automatique | `src/lib/tontine.ts` |
| V1 | Cotisation fixée en FCFA, convertie en sats au cours du moment | `src/lib/money.ts` |
| V1 | Commission Natt sur chaque versement (`NATT_FEE_BPS`) | `src/lib/money.ts` |
| V1 | Échéances, rappel la veille, rappel de retard, relance manuelle | `handleDeadlines`, `sendReminders` |
| V1 | Pénalités de retard définies par le groupe | `Charge` (PENALTY) |
| V1 | Tirage au sort vérifiable sur un bloc Bitcoin, avec page de preuve | `src/lib/chain.ts`, `/tontines/[id]/tirage` |
| V2 | Fonds de garantie : avance la cotisation d'un retardataire, qui la rembourse | `coverContribution` |
| V2 | Score de fiabilité par membre | `src/lib/score.ts`, `/score` |
| V2 | Épargne cumulative (Tabaski, rentrée…) | type `SAVINGS` |
| V2 | Parrainage diaspora : un proche cotise pour un membre et reçoit ses rappels | `Member.sponsorPhone` |
| V2 | Associations (GIE, dahiras) : plusieurs caisses, bureau, rapports et export CSV | `/organisations` |
| V2 | Bot WhatsApp (STATUT, PAYER, SCORE) | `/api/whatsapp`, `src/lib/assistant.ts` |
| V2 | Interface et messages en wolof | `src/lib/i18n/` |
| V3 | Tontine à enchères : la remise est partagée en crédit entre les autres | type `AUCTION` |
| V3 | Caisse de solidarité : demandes validées par l'organisateur ou le bureau | type `SOLIDARITY` |
| V3 | Menu USSD pour téléphones basiques | `/api/ussd` |
| V3 | Attestation de fiabilité à montrer à une microfinance | `/attestation/[token]` |
| Lot 1 | Vérification des numéros de versement : code WhatsApp (OTP) ou confirmation journalisée de l'organisateur ; versements bloqués tant que le numéro n'est pas vérifié | `src/lib/verification.ts`, `/verifier/[id]` |
| Lot 1 | Échange de tours : demande, accord du partenaire, validation de l'organisateur, calendrier mis à jour | `src/lib/swaps.ts` |
| Lot 1 | Journal horodaté des vérifications, changements de numéro et échanges | `AuditEntry` |
| Lot 2 | Demi-mains et doubles mains : cotisation selon la part, demi-main partagée versée sur les deux comptes, ordre des tours modifiable | `src/lib/hands.ts`, `Hand` |
| Lot 2 | Réserve de fin de cycle : % retenu sur chaque cagnotte, règle les dettes du membre à la fin, le reste lui est rendu | `Tontine.reserveBps`, `ReserveEntry` |
| Lot 2 | Situations exceptionnelles : contact d'urgence, ayant droit, suspension, justificatif constaté, transfert de la place | `src/lib/incidents.ts` |
| Lot 2 | Messages vocaux en wolof sur WhatsApp (synthèse vocale branchée par `VOICE_TTS_URL`), annonces de l'organisateur | `src/lib/voice.ts`, `tell` |
| Lot 3 | Natt Marchands : catalogue d'offres, tontine d'achat (le marchand est payé directement, commission prise chez lui), commandes et livraisons | `src/lib/merchants.ts`, `/marchands`, `/commandes/[token]` |
| Lot 3 | Attestation de régularité signée (Ed25519), payante, avec QR code et portail de vérification public | `src/lib/certificates.ts`, `/attestations/[id]`, `/v` |

## À valider avant la production (Lot 2)

- **Wolof** : les textes écrits et vocaux (`src/lib/i18n/wo.ts`, `src/lib/i18n/notifications.ts`) sont à faire relire et écouter par des locuteurs. Les montants sont lus en FCFA ; certains préfèrent compter en dërëm.
- **Messages vocaux** : Natt n'embarque pas de synthèse vocale. `VOICE_TTS_URL` doit pointer vers un service qui renvoie un fichier audio (ogg/opus de préférence) pour `{ text, language: "wol" }`. WhatsApp n'accepte les messages audio que dans les 24 h qui suivent un message du membre ; en dehors, l'envoi échoue et l'échec est enregistré.
- **Réserve de fin de cycle** : l'argent reste chez le fournisseur de paiement, comme le fonds de garantie. Qui détient la réserve, et comment elle est protégée, est à valider juridiquement avant de proposer l'option.
- **Ayants droit** : Natt ne stocke pas les justificatifs, l'organisateur indique seulement ce qu'il a vu. La procédure (qui peut décider, quels documents) est à valider avec un juriste.

## À valider avant la production (Lot 3)

- **Natt Marchands** : le marchand est payé à l'échéance du membre, avant la livraison. Les contrats marchands (délais, retours, litiges) et le modèle de commission sont à formaliser. L'équipe Natt est désignée par `NATT_ADMIN_PHONES` ; elle ajoute les marchands, vérifie leur numéro de paiement et publie les offres sur `/marchands/admin`.
- **Attestation** : générer la clé de signature (`openssl rand -base64 32`) dans `ATTESTATION_SIGNING_KEY` et ne jamais la changer sans garder l'ancienne, sinon les attestations déjà émises ne se vérifient plus. Le prix se règle avec `ATTESTATION_PRICE_XOF` (2 500 par défaut, 0 = gratuite). L'identité n'est vérifiée que par le numéro de téléphone : aucune pièce d'identité n'est contrôlée.
- Les anciens liens « attestation de fiabilité » (`/attestation/[token]`) restent consultables jusqu'à leur expiration, mais on n'en crée plus.

## Comptes et droits

- Connexion par numéro de téléphone et mot de passe (haché avec scrypt). La session est gardée 30 jours dans un cookie `httpOnly`, et la base ne stocke que l'empreinte du jeton.
- Une tontine est visible par son organisateur, ses membres, les proches qui cotisent pour eux et les membres de son association. Un membre est relié à un compte par son numéro.
- L'organisateur et le bureau de l'association gèrent : relances, avances du fonds, décisions sur les demandes, nouvel essai d'un versement.
- La page de paiement `/pay/[id]` reste publique, pour cotiser depuis le lien reçu sans créer de compte.

## Bitnob : intégration vérifiée

Vérifiée le 15/10/2026 contre la documentation Code & Chain (docs.codeandchain.xyz) et la sandbox :

- **Authentification** : HMAC-SHA256 de `CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD`, en-têtes `X-Auth-*` (`GET /api/whoami`).
- **Cotisations** : factures Lightning `POST /api/lightning/invoices` ; règlement confirmé par `GET /api/lightning/invoices/:id` (statut `paid` + preimage).
- **Versements** : `POST /api/payouts/quotes` → `/:quote_id/initialize` → `/:quote_id/finalize` (réponses dans `data.payout`). Corridor Sénégal : rail `mobile_money`, champ `network` (`wave`, `orange`, `free`, `expresso`), 100 à 200 000 XOF. Un versement finalisé reste « en cours » (`PROCESSING`) jusqu'à la confirmation `COMPLETED`.
- **Webhooks** : déclarer `<APP_URL>/api/webhooks/bitnob` dans le tableau de bord Bitnob et renseigner `BITNOB_WEBHOOK_SECRET` (signature `x-bitnob-signature`, HMAC SHA512). Événements traités : `transfer.success` (facture payée) et `payouts.*` (versement). Chaque événement déclenche une relecture auprès de l'API ; la tâche planifiée sert de filet si un webhook se perd. En local : `ngrok http 3000`.
- **Test d'intégration** : `RUN_BITNOB_SANDBOX=1 npx vitest run tests/bitnob.sandbox.test.ts` (clés sandbox de `.env`).

## Tâche planifiée

`GET /api/cron/tick` avec l'en-tête `Authorization: Bearer <CRON_SECRET>` synchronise toutes les tontines en cours : c'est elle qui envoie les rappels et applique les pénalités à l'heure, même quand personne n'a de page ouverte. Sur Vercel, la déclarer dans `vercel.json` (toutes les 15 minutes par exemple).

## Passer aux vrais services

Dans `.env` :

```
PAYMENT_PROVIDER=bitnob
BITNOB_BASE_URL=...          # URL de la sandbox Bitnob
BITNOB_CLIENT_ID=...
BITNOB_CLIENT_SECRET=...
NOTIFY_PROVIDER=whatsapp     # + WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET
```

À vérifier avant la production :
- les codes `network` et `bank_code` des opérateurs sénégalais dans `src/lib/payments/bitnob.ts`, à confirmer avec `GET /api/payouts/supported-countries` (voir `~/bitnob-sandbox-check/check.mjs`) ;
- WhatsApp n'accepte, hors de la fenêtre de 24 h après un message du membre, que des modèles de message approuvés par Meta : les rappels devront passer par des modèles ;
- les textes en wolof (`src/lib/i18n/wo.ts`, `src/lib/i18n/notifications.ts`), à faire relire par un locuteur.

## Tests

```bash
docker exec natt-postgres psql -U postgres -c "CREATE DATABASE natt_test;"   # une seule fois
npm run test:migrate
npm test
```

Les tests du moteur (`tests/engine.test.ts`) tournent sur une vraie base Postgres, avec paiements, blocs et messages simulés.

## Pas encore fait

- Vérification du numéro par code SMS : aujourd'hui, rien n'empêche de créer un compte avec le numéro de quelqu'un d'autre, et donc de voir ses tontines.
- Mot de passe oublié, et limitation du nombre d'essais de connexion.
- Webhooks Bitnob, qui remplaceront l'interrogation des factures.
- Messages vocaux en wolof, cagnotte gardée en USDT, carte virtuelle Bitnob, cotisation depuis Wave ou Orange Money : ces fonctionnalités dépendent d'API Bitnob ou de partenaires pas encore vérifiées.
- Abonnement payant pour les associations, partenariats microfinance : à construire côté commercial avant le code.
- Déploiement sur Vercel.
