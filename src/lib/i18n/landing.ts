// Textes de la page d'accueil (visiteurs). Le wolof est à faire relire par un locuteur.

const fr = {
  hero: {
    badge: "Propulsé par Bitcoin Lightning",
    title1: "La tontine",
    title2: "sans trésorier.",
    subtitle:
      "Chaque membre cotise en Lightning, depuis Dakar, Paris ou New York. Dès que tout le monde a payé, la cagnotte part toute seule sur le Wave ou l'Orange Money du bénéficiaire. Personne ne garde l'argent du groupe.",
    cta: "Créer ma tontine",
    cta2: "Comment ça marche",
    proofs: ["Cotisation confirmée en quelques secondes", "Aucun trésorier", "Versement sur Wave et Orange Money", "Tirage prouvé sur un bloc Bitcoin"],
  },
  mock: {
    tontine: "Tontine du quartier",
    round: "Tour 3/8 · pour Fatou",
    pot: "Cagnotte",
    paid: "payé",
    pending: "en attente",
    invoice: "Facture Lightning",
    toast: "Cagnotte versée sur Wave",
    seconds: "en 2 s",
  },
  rate: { label: "1 000 FCFA ≈ {sats} sats", live: "cours en direct", simulated: "cours simulé" },
  how: {
    eyebrow: "Comment ça marche",
    title: "Trois étapes, zéro trésorier",
    steps: [
      {
        title: "Créez le groupe",
        text: "Membres, montant, fréquence, ordre des tours ou tirage au sort vérifiable. Demi-mains et doubles mains comprises.",
      },
      {
        title: "Chacun cotise en Lightning",
        text: "Le lien de paiement arrive sur WhatsApp. On paie en quelques secondes avec n'importe quel wallet Lightning, ou un proche de la diaspora paie à sa place.",
      },
      {
        title: "La cagnotte part toute seule",
        text: "Quand le tour est complet, Natt envoie la cagnotte sur le Wave ou l'Orange Money du bénéficiaire. Sans retard, sans dispute.",
      },
    ],
  },
  why: {
    eyebrow: "Pourquoi Lightning",
    title: "La vitesse de Bitcoin, la simplicité du mobile money",
    items: [
      { title: "Instantané", text: "Une cotisation est confirmée en quelques secondes, de jour comme de nuit, même le dimanche." },
      { title: "Fait pour la diaspora", text: "Depuis la France, l'Italie ou les États-Unis, cotiser coûte quelques francs au lieu des frais de transfert habituels." },
      { title: "Sans trésorier", text: "L'argent ne passe par la poche de personne : le versement est automatique dès que tout le monde a payé." },
      { title: "Vérifiable par tous", text: "L'ordre de passage peut être tiré au sort sur un bloc Bitcoin que personne ne connaissait à l'avance. Chacun peut refaire le calcul." },
    ],
  },
  features: {
    eyebrow: "Pensé pour le Sénégal",
    title: "Toutes les tontines, telles qu'on les pratique",
    items: [
      { title: "Demi-mains et doubles mains", text: "Cotisez la moitié et partagez un tour, ou le double pour recevoir deux fois." },
      { title: "Échange de tours", text: "Besoin d'argent plus tôt ? Échangez votre tour avec l'accord de l'autre membre et de l'organisateur." },
      { title: "Messages vocaux en wolof", text: "Rappels, confirmations et annonces en notes vocales sur WhatsApp." },
      { title: "Numéros vérifiés", text: "Un code confirme chaque numéro Wave ou Orange Money avant le moindre versement." },
      { title: "Réserve de fin de cycle", text: "Une petite part de chaque cagnotte, rendue à la fin, pour que chacun cotise jusqu'au bout." },
      { title: "Situations exceptionnelles", text: "Hospitalisation, décès : suspension, ayant droit, justificatif. Rien n'est versé sans vérification." },
      { title: "Épargne Tabaski et rentrée", text: "Chacun met de côté et récupère tout à la date choisie." },
      { title: "Associations et dahiras", text: "Plusieurs caisses, un bureau, des rapports et une caisse de solidarité." },
      { title: "Sans internet", text: "Un menu USSD pour consulter et recevoir ses liens depuis un téléphone simple." },
    ],
  },
  merchants: {
    eyebrow: "Natt Marchands",
    title: "Votre tontine paie directement votre achat",
    text: "Mouton de Tabaski, sac de riz, frigo, kit solaire : quand c'est votre tour, Natt paie le marchand partenaire au prix négocié et vous verse le reste. Aucun frais Natt sur l'achat.",
    cta: "Voir les offres",
    natt: "Prix Natt",
  },
  certificate: {
    eyebrow: "Attestation de régularité",
    title: "Votre sérieux, enfin reconnu",
    text: "Une attestation signée numériquement récapitule vos cotisations. Son QR code permet à une microfinance de vérifier en un instant qu'elle est authentique.",
    cta: "Vérifier une attestation",
    sample: { number: "NATT-2026-7KQ4M2", status: "Attestation authentique et valide", onTime: "Cotisations à temps", score: "Score de fiabilité" },
  },
  trust: {
    eyebrow: "Confiance",
    title: "L'argent du groupe ne dort pas chez Natt",
    items: [
      "Natt orchestre, le prestataire de paiement détient et déplace l'argent.",
      "Chaque numéro de versement est vérifié par un code avant de recevoir quoi que ce soit.",
      "Chaque action est inscrite dans un journal visible par tous les membres.",
      "Les attestations sont signées : impossible de les modifier sans que ça se voie.",
    ],
  },
  faq: {
    eyebrow: "Questions fréquentes",
    title: "Vous vous demandez peut-être…",
    items: [
      {
        q: "Faut-il déjà avoir des bitcoins ?",
        a: "Non. Il suffit d'un wallet Lightning approvisionné (Wallet of Satoshi, Phoenix, Blink…), ou d'un proche qui paie pour vous depuis le lien reçu. Vous recevez toujours en FCFA, sur Wave ou Orange Money.",
      },
      {
        q: "Le montant change-t-il avec le cours du bitcoin ?",
        a: "Non. La cotisation est fixée en FCFA. Natt calcule l'équivalent en sats au moment où vous payez.",
      },
      {
        q: "Combien coûte Natt ?",
        a: "Une petite commission sur chaque versement ({fee} %), affichée avant de créer la tontine. Aucun frais sur les achats Natt Marchands.",
      },
      {
        q: "Et si quelqu'un ne paie pas ?",
        a: "Rappels automatiques, pénalités fixées par le groupe, fonds de garantie qui avance la cotisation et réserve de fin de cycle.",
      },
      {
        q: "Je suis plus à l'aise en wolof.",
        a: "Natt parle wolof : interface, messages WhatsApp et notes vocales. Le menu USSD marche aussi sans internet.",
      },
    ],
  },
  final: {
    title: "Lancez votre tontine en deux minutes",
    text: "Gratuit à créer. Vos membres reçoivent leur lien de paiement sur WhatsApp.",
    cta: "Créer ma tontine",
  },
};

export type LandingDict = typeof fr;

const wo: LandingDict = {
  hero: {
    badge: "Ak Bitcoin Lightning",
    title1: "Natt bi",
    title2: "amul tresorier.",
    subtitle:
      "Ku nekk dafay fey ak Lightning, fu mu mënti nekk : Ndakaaru, Pari walla New York. Bu ñépp feyee, xaalis bi dafay dem ci boppam ci Wave walla Orange Money bu ki ko jot. Kenn du denc xaalisu mbootaay bi.",
    cta: "Sos sama natt",
    cta2: "Naka lay doxe",
    proofs: ["Fey bi dafay dëggu ci ay saa", "Amul tresorier", "Yónnee ci Wave ak Orange Money", "Tirage bu ñu mën a seet ci bloc Bitcoin"],
  },
  mock: {
    tontine: "Natt bu gox bi",
    round: "Tour 3/8 · ngir Fatou",
    pot: "Xaalis bi",
    paid: "fey na",
    pending: "ñu ngi xaar",
    invoice: "Facture Lightning",
    toast: "Xaalis bi dem na ci Wave",
    seconds: "ci 2 saa",
  },
  rate: { label: "1 000 FCFA ≈ {sats} sats", live: "njëg ci saa si", simulated: "njëg bu ñu defar" },
  how: {
    eyebrow: "Naka lay doxe",
    title: "Ñett yoon, amul tresorier",
    steps: [
      { title: "Sos mbootaay bi", text: "Ñu bokk, xaalis bi, diir bi, ndeyu tour yi walla tirage bu ñu mën a seet. Genn-wàllu loxo ak ñaari loxo am nañu." },
      { title: "Ku nekk fey ak Lightning", text: "Lien bu fey dafay agsi ci WhatsApp. Ñuy fey ci ay saa ak benn wallet Lightning, walla mbokk bu nekk bitim-réew fey ci sa bopp." },
      { title: "Xaalis bi dem ci boppam", text: "Bu tour bi matee, Natt dafay yónne xaalis bi ci Wave walla Orange Money bu ki ko jot. Du yeex, amul xuloo." },
    ],
  },
  why: {
    eyebrow: "Lu tax Lightning",
    title: "Gaawaayu Bitcoin, yombaayu mobile money",
    items: [
      { title: "Ci saa si", text: "Fey bi dafay dëggu ci ay saa, bëccëg ak guddi, ba dibéer." },
      { title: "Ngir ñi nekk bitim-réew", text: "Bu nga nekkee Faraas, Itali walla Amerik, fey dafay jar ay dërëm rekk." },
      { title: "Amul tresorier", text: "Xaalis bi du jaar ci kenn : yónnee bi dafay am bu ñépp feyee." },
      { title: "Ñépp mën nañu ko seet", text: "Ndeyu tour yi mën nañu ko tànn ak bloc Bitcoin bu kenn xamul. Ku nekk mën na waat ko seet." },
    ],
  },
  features: {
    eyebrow: "Ngir Senegaal",
    title: "Natt yépp, ni ñu ko defe",
    items: [
      { title: "Genn-wàllu loxo ak ñaari loxo", text: "Fey genn-wàll bi te bokk benn tour, walla fey ñaari yoon ngir jot ñaari yoon." },
      { title: "Weccante tour", text: "Soxla nga xaalis bu gaaw ? Weccanteel sa tour ak keneen, bu mu nangoo te organisateur bi dëggal ko." },
      { title: "Kàddu ci wolof", text: "Fàttali, dëggal ak xibaar ci kàddu ci WhatsApp." },
      { title: "Lim yu ñu dëggal", text: "Code dafay dëggal lim Wave walla Orange Money balaa xaalis dem." },
      { title: "Dencukaay bu mujj", text: "Tuuti ci xaalis bu nekk, ñuy delloo ci mujj, ngir ku nekk fey ba mujj." },
      { title: "Xew-xew yu am solo", text: "Opital, dee : taxawal, ki wàcc ndono, kayit. Dara du dem te seetuñu." },
      { title: "Dencukaay Tabaski", text: "Ku nekk dafay denc te jot lépp ci bés bi mu tànn." },
      { title: "Mbootaay ak dahira", text: "Ay kees, benn bureau, rapport yi ak kees bu ndimbal." },
      { title: "Te amul internet", text: "Menu USSD ngir seet ak jot say lien ak telefon bu yomb." },
    ],
  },
  merchants: {
    eyebrow: "Natt Marchands",
    title: "Sa natt dafay fey sa njënd",
    text: "Xar Tabaski, sàkku ceeb, frigo, kit solaire : bu sa tour agsee, Natt dafay fey jaaykat bi ci njëg bi ñu waxaale te yónne la li ci des. Natt du jël dara ci njënd bi.",
    cta: "Xool offre yi",
    natt: "Njëgu Natt",
  },
  certificate: {
    eyebrow: "Seede bu natt",
    title: "Sa jàmm-jàmm, ñu xam ko",
    text: "Seede bu ñu xaatim ci numérique dafay wone say natt. QR code bi dafay may microfinance seet ci saa si ne dëgg la.",
    cta: "Seet seede",
    sample: { number: "NATT-2026-7KQ4M2", status: "Seede bu dëgg te baax", onTime: "Natt yu ci waxtu", score: "Jàmm-jàmm" },
  },
  trust: {
    eyebrow: "Kóolute",
    title: "Xaalisu mbootaay bi du nelaw ci Natt",
    items: [
      "Natt dafay saytu, ki fey dafay denc te yónne xaalis bi.",
      "Lim bu nekk dañu koy dëggal ak code balaa mu jot dara.",
      "Lépp lu ñu def dañu koy bind ci journal bu ñépp gis.",
      "Seede yi dañu leen xaatim : kenn mënu leen soppi te ñu gisul ko.",
    ],
  },
  faq: {
    eyebrow: "Laaj yi",
    title: "Xëy-na dangay laaj…",
    items: [
      { q: "Ndax war naa am bitcoin ?", a: "Déedéet. Wallet Lightning (Wallet of Satoshi, Phoenix, Blink…) rekk, walla mbokk bu fey ci sa bopp ak lien bi. Danga jot FCFA rekk, ci Wave walla Orange Money." },
      { q: "Ndax xaalis bi dafay soppiku ak njëgu bitcoin ?", a: "Déedéet. Natt bi ci FCFA la. Natt dafay waññi sats yi ci saa si ngay fey." },
      { q: "Natt ñaata lay jar ?", a: "Commission bu tuuti ci yónnee bu nekk ({fee} %), ñu wone ko balaa ngay sos natt bi. Dara ci njënd Natt Marchands." },
      { q: "Su kenn feyul nag ?", a: "Fàttali ci boppam, pénalité yu mbootaay bi tànn, fonds bu ñuy avancer ak dencukaay bu mujj." },
      { q: "Wolof laa gëna xam.", a: "Natt dafay wax wolof : xët yi, bataaxal WhatsApp ak kàddu. Menu USSD bi dafay dox te amul internet." },
    ],
  },
  final: {
    title: "Tàmbalil sa natt ci ñaari minit",
    text: "Sos ko amul njëg. Ñi bokk dinañu jot seen lien bu fey ci WhatsApp.",
    cta: "Sos sama natt",
  },
};

export const landingDict = (locale: string): LandingDict => (locale === "wo" ? wo : fr);
