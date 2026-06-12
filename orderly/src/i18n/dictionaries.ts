/**
 * Lightweight i18n. France-first: the default locale is French. English is
 * available via the language switcher (cookie `orderly_locale`). Server
 * components read the dictionary with getDict() (src/i18n/server.ts); client
 * components use useDict() (src/i18n/client.tsx).
 */

export type Locale = "fr" | "en";
export const LOCALES: Locale[] = ["fr", "en"];
export const DEFAULT_LOCALE: Locale = "fr";

export const en = {
  nav: { agents: "The agents", how: "How it works", security: "Security", pricing: "Pricing", signin: "Sign in", start: "Start free" },
  hero: {
    badge: "AI agents · for small & medium business",
    title1: "Put your business admin on",
    title2: "autopilot.",
    sub: "Orderly weaves AI agents through your business to handle the endless repetitive admin — invoicing, bookkeeping, documents and scheduling — and quietly puts your numbers, data and paperwork in perfect order. You focus on the work that matters.",
    ctaPrimary: "Start your instance free",
    ctaSecondary: "Meet the agents",
    note: "No card required · Your own isolated workspace · Every agent action is logged",
  },
  problem:
    "The average small business loses a full working day every week to invoicing, chasing payments, sorting receipts, filing paperwork and re-typing the same data. Orderly takes all of it off your plate.",
  agents: {
    title: "Four agents. Every repetitive task.",
    sub: "Each one is a specialist with its own tools, working only inside your business — and showing its work, every step of the way.",
    invoicing: { name: "Invoicing & Payments", line: "Issues invoices from a sentence, chases overdue ones, reconciles payments." },
    bookkeeping: { name: "Bookkeeping & Expenses", line: "Categorizes every transaction, keeps the ledger spotless, flags the odd one out." },
    documents: { name: "Documents & Email", line: "Reads, classifies, summarizes and files documents and inbox clutter for you." },
    scheduling: { name: "Scheduling & Clients", line: "Books, reminds and follows up — drafts the warm message, you just approve." },
  },
  how: {
    title: "From chaos to order in four steps.",
    s1t: "Spin up your instance", s1d: "Each business gets its own private, isolated workspace. Onboarding takes minutes, not weeks.",
    s2t: "Connect your tools", s2d: "Email, bank feed, calendar, storage. Orderly reads the mess so your team doesn't have to.",
    s3t: "Agents go to work", s3d: "The four agents handle the repetitive admin continuously — every action logged for you to review.",
    s4t: "You see order", s4d: "Clean books, sent invoices, filed documents, a calendar that runs itself. You focus on the work.",
  },
  security: {
    title: "Your business, walled off by design.",
    body: "Every client runs in an isolated instance. Data is separated at the database row with strict row-level security, so one company can never see another's numbers. Agents act only for your organization, and every outbound message is drafted for your approval — never sent silently.",
    f1: "EU data residency · GDPR-aligned",
    f2: "French TVA, EU reverse charge & compliant invoices built in",
    f3: "Per-tenant isolation with row-level security",
    f4: "Full audit trail of every agent action",
    f5: "Human-in-the-loop on all client communication",
  },
  pricing: {
    title: "Simple pricing. One instance per business.",
    sub: "Start free. Upgrade when the agents have already paid for themselves.",
    popular: "Most popular", perMonth: "/mo · excl. VAT", cta: "Get started",
  },
  cta: { title: "Let your business run itself in the background.", sub: "Spin up your Orderly instance today and watch the admin disappear.", button: "Start free — no card required" },
  footer: { tagline: "Admin, handled.", privacy: "Privacy", terms: "Terms", contact: "Contact" },
  auth: {
    signupTitle: "Create your account", loginTitle: "Welcome back",
    email: "you@business.com", password: "Password",
    create: "Create account", signin: "Sign in",
    haveAccount: "Already have an account?", noAccount: "New to Orderly?", createOne: "Create one",
  },
  onboarding: { title: "Name your business", sub: "We'll spin up a private, isolated instance just for it. You can invite your team later.", placeholder: "e.g. Acme Studio", create: "Create my workspace", creating: "Creating…" },
  appNav: { overview: "Overview", agents: "Agents", approvals: "Approvals", invoices: "Invoices", bookkeeping: "Bookkeeping", documents: "Documents", scheduling: "Scheduling", settings: "Settings" },
  dashboard: { hello: "Good to see you 👋", sub: "Here's what your agents have been keeping in order.", collected: "Collected", openInvoices: "Open invoices", docsToProcess: "Docs to process", recent: "Recent agent activity", runAgent: "Run an agent →", noRuns: "No agent runs yet. Head to Agents to put one to work." },
  agentsPage: { title: "Agents", sub: "Put a specialist to work in plain language. Each agent acts only within your business and records every step, so you always know exactly what was done.", trace: "Run trace", tracePlaceholder: "The agent's reasoning and every tool it calls will appear here, fully auditable.", summary: "Summary", run: "Run agent", working: "Working…", tip: "Tip: leave blank to run the example task." },
  approvals: { title: "Approvals", sub: "Everything your agents prepared, waiting on you. Outbound messages are held here for review by default — they only send automatically for actions you've switched to auto in Settings.", empty: "Nothing waiting for review. When an agent prepares a message, it lands here for your approval.", discard: "Discard", approve: "Approve & send" },
  invoices: { title: "Invoices", newViaAgent: "New via agent", number: "Number", client: "Client", issued: "Issued", vat: "VAT", total: "Total incl. VAT", status: "Status", pdf: "Factur-X", empty: "No invoices yet — ask the invoicing agent to create one." },
  bookkeeping: { title: "Bookkeeping", income: "Income", expenses: "Expenses", net: "Net", date: "Date", description: "Description", category: "Category", confidence: "Confidence", amount: "Amount", empty: "No transactions yet — the bookkeeping agent will fill this in." },
  documents: { title: "Documents", sub: "Everything read, classified and filed by the documents agent.", empty: "No documents yet. Upload files or connect your inbox, then let the documents agent process them.", upload: "Upload & scan", uploading: "Scanning…", uploadHint: "PDF or image — Orderly reads it (OCR) and files it." },
  scheduling: { title: "Scheduling", sub: "Upcoming appointments and the reminders the agent is handling.", empty: "No appointments yet — connect your calendar and the scheduling agent takes it from here.", reminded: "Reminded", pending: "Reminder pending" },
  settings: {
    title: "Settings",
    org: "Organization", name: "Name", workspace: "Workspace", plan: "Plan", subscription: "Subscription",
    tax: "Tax & legal profile", taxSub: "Your seller identity for compliant French/EU invoices — SIREN/SIRET, TVA number, and default VAT rate. The invoicing agent uses these on every invoice.",
    connections: "Connections", connectionsSub: "Connect your tools so the agents have data to work with. Orderly only ever reads what it needs.",
    automation: "Automation", automationSub: "By default Orderly prepares actions for your review. Turn on auto for anything you trust the agents to do on their own.",
    billing: "Billing", billingSub: "Manage your plan and payment method. Each business is billed for its own instance.", current: "current",
  },
  common: { connect: "Connect", syncNow: "Sync now", syncing: "Syncing…", save: "Save", saving: "Saving…", connected: "Connected" },
};

export type Dictionary = typeof en;

export const fr: Dictionary = {
  nav: { agents: "Les agents", how: "Comment ça marche", security: "Sécurité", pricing: "Tarifs", signin: "Se connecter", start: "Essai gratuit" },
  hero: {
    badge: "Agents IA · pour TPE & PME",
    title1: "Mettez votre administratif en",
    title2: "pilote automatique.",
    sub: "Orderly intègre des agents IA dans votre entreprise pour prendre en charge tout l'administratif répétitif — facturation, comptabilité, documents et agenda — et met de l'ordre, en silence, dans vos chiffres, vos données et vos papiers. Vous vous concentrez sur l'essentiel.",
    ctaPrimary: "Lancer mon instance gratuitement",
    ctaSecondary: "Découvrir les agents",
    note: "Sans carte bancaire · Votre espace isolé · Chaque action d'agent est tracée",
  },
  problem:
    "Une petite entreprise perd en moyenne une journée de travail entière chaque semaine à facturer, relancer les paiements, trier les reçus, classer les papiers et ressaisir les mêmes données. Orderly s'occupe de tout cela à votre place.",
  agents: {
    title: "Quatre agents. Toutes les tâches répétitives.",
    sub: "Chacun est un spécialiste avec ses propres outils, agissant uniquement dans votre entreprise — et montrant son travail à chaque étape.",
    invoicing: { name: "Facturation & Paiements", line: "Émet les factures à partir d'une phrase, relance les impayés, rapproche les paiements." },
    bookkeeping: { name: "Comptabilité & Dépenses", line: "Catégorise chaque transaction, garde le grand livre impeccable, repère l'anomalie." },
    documents: { name: "Documents & Email", line: "Lit, classe, résume et range vos documents et le désordre de votre boîte mail." },
    scheduling: { name: "Agenda & Clients", line: "Planifie, rappelle et relance — rédige le message, vous n'avez qu'à approuver." },
  },
  how: {
    title: "Du chaos à l'ordre en quatre étapes.",
    s1t: "Lancez votre instance", s1d: "Chaque entreprise a son espace privé et isolé. L'onboarding prend quelques minutes, pas des semaines.",
    s2t: "Connectez vos outils", s2d: "Email, flux bancaire, agenda, stockage. Orderly lit le désordre pour que votre équipe n'ait plus à le faire.",
    s3t: "Les agents se mettent au travail", s3d: "Les quatre agents traitent l'administratif répétitif en continu — chaque action tracée pour votre revue.",
    s4t: "Vous voyez de l'ordre", s4d: "Comptes propres, factures envoyées, documents classés, un agenda qui se gère seul. Vous vous concentrez sur le métier.",
  },
  security: {
    title: "Votre entreprise, cloisonnée par conception.",
    body: "Chaque client tourne dans une instance isolée. Les données sont séparées au niveau de la ligne en base avec une sécurité stricte (RLS) : une entreprise ne peut jamais voir les chiffres d'une autre. Les agents n'agissent que pour votre organisation, et chaque message sortant est préparé pour votre approbation — jamais envoyé en silence.",
    f1: "Hébergement des données en UE · conforme RGPD",
    f2: "TVA française, autoliquidation UE & factures conformes intégrées",
    f3: "Isolation par locataire avec sécurité au niveau ligne (RLS)",
    f4: "Journal d'audit complet de chaque action d'agent",
    f5: "Validation humaine sur toute communication client",
  },
  pricing: {
    title: "Tarifs simples. Une instance par entreprise.",
    sub: "Commencez gratuitement. Évoluez quand les agents se sont déjà rentabilisés.",
    popular: "Le plus populaire", perMonth: "/mois · HT", cta: "Commencer",
  },
  cta: { title: "Laissez votre entreprise tourner toute seule en arrière-plan.", sub: "Lancez votre instance Orderly aujourd'hui et regardez l'administratif disparaître.", button: "Essai gratuit — sans carte bancaire" },
  footer: { tagline: "L'administratif, géré.", privacy: "Confidentialité", terms: "CGU", contact: "Contact" },
  auth: {
    signupTitle: "Créez votre compte", loginTitle: "Bon retour",
    email: "vous@entreprise.com", password: "Mot de passe",
    create: "Créer le compte", signin: "Se connecter",
    haveAccount: "Vous avez déjà un compte ?", noAccount: "Nouveau sur Orderly ?", createOne: "Créez-en un",
  },
  onboarding: { title: "Nommez votre entreprise", sub: "Nous créons une instance privée et isolée rien que pour elle. Vous pourrez inviter votre équipe plus tard.", placeholder: "ex. Acme Studio", create: "Créer mon espace", creating: "Création…" },
  appNav: { overview: "Vue d'ensemble", agents: "Agents", approvals: "Approbations", invoices: "Factures", bookkeeping: "Comptabilité", documents: "Documents", scheduling: "Agenda", settings: "Paramètres" },
  dashboard: { hello: "Ravi de vous voir 👋", sub: "Voici ce que vos agents ont gardé en ordre.", collected: "Encaissé", openInvoices: "Factures en cours", docsToProcess: "Docs à traiter", recent: "Activité récente des agents", runAgent: "Lancer un agent →", noRuns: "Aucune exécution pour l'instant. Allez dans Agents pour en lancer un." },
  agentsPage: { title: "Agents", sub: "Confiez une tâche à un spécialiste en langage courant. Chaque agent agit uniquement dans votre entreprise et enregistre chaque étape : vous savez toujours exactement ce qui a été fait.", trace: "Trace d'exécution", tracePlaceholder: "Le raisonnement de l'agent et chaque outil appelé apparaîtront ici, entièrement auditables.", summary: "Résumé", run: "Lancer l'agent", working: "En cours…", tip: "Astuce : laissez vide pour exécuter l'exemple." },
  approvals: { title: "Approbations", sub: "Tout ce que vos agents ont préparé, en attente de vous. Par défaut, les messages sortants sont retenus ici pour revue — ils ne partent automatiquement que pour les actions passées en auto dans les Paramètres.", empty: "Rien à valider. Quand un agent prépare un message, il atterrit ici pour votre approbation.", discard: "Rejeter", approve: "Approuver & envoyer" },
  invoices: { title: "Factures", newViaAgent: "Nouvelle via agent", number: "Numéro", client: "Client", issued: "Émise", vat: "TVA", total: "Total TTC", status: "Statut", pdf: "Factur-X", empty: "Aucune facture — demandez à l'agent de facturation d'en créer une." },
  bookkeeping: { title: "Comptabilité", income: "Recettes", expenses: "Dépenses", net: "Net", date: "Date", description: "Description", category: "Catégorie", confidence: "Confiance", amount: "Montant", empty: "Aucune transaction — l'agent comptable la remplira." },
  documents: { title: "Documents", sub: "Tout ce qui a été lu, classé et rangé par l'agent documents.", empty: "Aucun document. Importez des fichiers ou connectez votre boîte mail, puis laissez l'agent documents les traiter.", upload: "Importer & scanner", uploading: "Analyse…", uploadHint: "PDF ou image — Orderly le lit (OCR) et le classe." },
  scheduling: { title: "Agenda", sub: "Rendez-vous à venir et rappels gérés par l'agent.", empty: "Aucun rendez-vous — connectez votre agenda et l'agent prend le relais.", reminded: "Rappelé", pending: "Rappel en attente" },
  settings: {
    title: "Paramètres",
    org: "Organisation", name: "Nom", workspace: "Espace", plan: "Forfait", subscription: "Abonnement",
    tax: "Profil fiscal & légal", taxSub: "Votre identité vendeur pour des factures conformes France/UE — SIREN/SIRET, n° de TVA et taux de TVA par défaut. L'agent de facturation s'en sert sur chaque facture.",
    connections: "Connexions", connectionsSub: "Connectez vos outils pour donner de la matière aux agents. Orderly ne lit que ce dont il a besoin.",
    automation: "Automatisation", automationSub: "Par défaut, Orderly prépare les actions pour votre revue. Activez l'auto pour ce que vous confiez aux agents en toute confiance.",
    billing: "Facturation", billingSub: "Gérez votre forfait et votre moyen de paiement. Chaque entreprise est facturée pour sa propre instance.", current: "actuel",
  },
  common: { connect: "Connecter", syncNow: "Synchroniser", syncing: "Synchronisation…", save: "Enregistrer", saving: "Enregistrement…", connected: "Connecté" },
};

export const dictionaries: Record<Locale, Dictionary> = { fr, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? fr;
}
