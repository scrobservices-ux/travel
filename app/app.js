/* Kola — Njangi / Tontine / Trouble Fund ledger. ("Break kola. Build trust.")
 * Offline-first: all data lives in localStorage on the treasurer's phone.
 * Works for small groups (5 members) and big ones (200+): bulk import,
 * search filters, and bulk actions everywhere a list can grow.
 * The transaction log is append-only: mistakes are fixed with reversal
 * entries, never by editing history. That is the trust guarantee.
 *
 * i18n: the whole UI speaks English, French and Pidgin via t(key).
 * Billing: three tiers (Start free / Standard / Elite), renewed yearly at
 * the share-out. Books are NEVER locked when a plan lapses — only premium
 * features pause; reading and export stay free forever.
 */
"use strict";

const STORE_KEY = "kola_v1";
const LEGACY_KEY = "tamarun_v1"; // pre-rename data is migrated silently

let state = load();
// Transient UI state (not persisted)
let ui = { tab: "dashboard", sittingId: null, levyId: null, newType: "family" };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupted store: start fresh, user can Restore from backup */ }
  return { groups: [], activeGroupId: null, lang: "en" };
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

/* ============================================================
 * i18n — English (en), French (fr), Cameroonian Pidgin (pcm)
 * t(key, vars) → string; falls back to English, then to the key.
 * ============================================================ */

const I18N = {
  en: {
    tagline: "Break kola · Build trust",
    lang_en: "English", lang_fr: "Français", lang_pcm: "Pidgin",
    your_houses: "Your houses", new: "New", backup: "Backup", restore: "Restore",
    no_houses: "No houses yet", members_short: "members",

    // nav
    nav_dashboard: "Dashboard", nav_members: "Members", nav_sittings: "Sittings & Pot",
    nav_trouble: "Trouble Fund", nav_ledger: "Ledger", nav_plan: "Plan", nav_settings: "Settings",

    // landing
    hero_badge: "Njangi · Tontine · Trouble Fund",
    hero_title1: "Your njangi house,", hero_title2: "without the palaver.",
    hero_sub: "Kola is the digital book for Cameroon's oldest financial institution. The meeting, the food and the handshake stay — the disputes, lost notebooks and missing money go.",
    create_house: "Create your house", restore_backup: "Restore a backup",
    stat_50: "of Cameroonians save in njangis", stat_48: "trouble fund payout target",
    stat_3: "receipt languages — EN · FR · Pidgin",
    types_title: "Every kind of njangi. One book.",
    types_lead: "Pick the house that looks like yours — Kola shapes itself around your constitution, not the other way round.",
    why_title: "Why houses don't break on Kola",
    why_lead: "Everything here exists because a real njangi somewhere broke without it.",
    quote: "“Who brings kola brings life.”",
    quote_sub: "The nut is broken and shared — that is how trust is made. Kola does the same with your books.",

    // features
    feat1_h: "A book nobody can cook", feat1_p: "Every franc is written in an append-only ledger. Corrections are visible reversals — history can never be silently edited.",
    feat2_h: "Receipts in 3 languages", feat2_p: "One tap copies a receipt in English, French or Pidgin straight into WhatsApp or SMS. Every member, every payment.",
    feat3_h: "Trouble fund, 48-hour promise", feat3_p: "When grief comes, launch a levy in one tap, tick members off as they pay, and pay the family fast — not in three weeks.",
    feat4_h: "5 members or 200", feat4_p: "Bulk-paste a whole member list, search anyone instantly, mark everyone paid in one tap. Family njangi or big association — same tool.",
    feat5_h: "Works offline, on any phone", feat5_p: "No install, no account, no data plan after first load. The books live on the treasurer's phone, with one-tap backup.",
    feat6_h: "Fair rotation, in the open", feat6_p: "Fixed order or a ballot draw shuffled in front of everyone. The pot goes where the book says it goes.",

    // types
    t_family: "Family Njangi", t_family_d: "Brothers, sisters, cousins — keep family money clean and quarrels out.",
    t_market: "Market & Traders", t_market_d: "Buyam-sellam circles — daily or weekly collections, right at the stall.",
    t_cultural: "Cultural Association", t_cultural_d: "Village development unions and ethnic meetings — even 200 members strong.",
    t_professional: "Professional Circle", t_professional_d: "Teachers, drivers, colleagues — same office, same syndicate, same pot.",
    t_trouble: "Trouble / Funeral Fund", t_trouble_d: "Stand together when grief comes — fast levies, payout in 48 hours.",

    // dashboard
    main_fund: "Main fund", trouble_fund: "Trouble fund", active_members: "Active members",
    next_pot: "Next pot goes to", recent_activity: "Recent activity",
    no_tx: "No transactions yet. Open a sitting to start collecting.",
    date: "Date", member: "Member", type: "Type", amount: "Amount", method: "Method", note: "Note", status: "Status",

    // members
    add_one: "Add one member", name: "Name", phone: "Phone (MoMo/OM, optional)",
    add_member: "Add member", bulk_add: "Bulk add — for big houses",
    bulk_hint: "Paste one member per line: Name, phone (phone optional). 200 members paste in seconds.",
    add_all: "Add all", member_list: "Member list", search_name: "Search name or phone…",
    paid_year: "Paid this year", deactivate: "Deactivate", reactivate: "Reactivate", left: "left",

    // sittings
    open_sitting: "Open a new sitting", label_opt: "Label (optional)",
    open_sitting_btn: "Open sitting", sitting: "Sitting", no_sittings: "No sittings yet.",
    collected: "Collected this sitting", paid_up: "Paid up", pot_beneficiary: "Pot beneficiary",
    contributions: "Contributions", each: "each", search_member: "Search member…",
    mark_all_paid: "Mark ALL unpaid as paid (cash)", fine_all: "Fine all unpaid",
    paid: "Paid", unpaid: "Unpaid", part: "Part", cash: "Cash", momo: "MoMo",
    reverse: "Reverse", receipt: "Receipt", closed: "Closed",
    close_disburse: "Close & disburse", pot_for: "Pot for this sitting",
    goes_to: "goes to", disburse_btn: "Disburse pot & close sitting",
    close_no_payout: "Close without payout (savings round)", this_closed: "This sitting is closed.",
    pot_paid_to: "pot paid to",

    // trouble
    trouble_balance: "Trouble fund balance", raise_levy: "Raise an emergency levy",
    levy_hint: "A death or emergency: every member owes a fixed amount, right now. This is the 48-hour promise.",
    reason: "Reason", amount_per: "Amount per member", launch_levy: "Launch levy",
    payout_from: "Pay out from trouble fund", beneficiary: "Beneficiary member",
    record_payout: "Record payout", levy: "Levy", no_levies: "No levies yet.",
    per_member: "per member", owing: "Owing",

    // ledger
    full_ledger: "Full ledger — append-only", ledger_hint: "Nobody can edit or delete history; corrections appear as reversal entries. That is the point.",
    export_csv: "Export CSV", filter_ledger: "Filter by member or type…", entries: "entries",

    // settings
    house_settings: "House settings", house_name: "House name",
    contribution_per: "Contribution per sitting", frequency: "Frequency", late_fine: "Late fine",
    weekly: "weekly", biweekly: "bi-weekly", monthly: "monthly",
    save_settings: "Save settings", kind_house: "Kind of house",
    rotation_order: "Rotation order — who chops the pot next",
    rotation_hint: "Highlighted row = next beneficiary. Use the ballot draw to shuffle fairly in front of everyone.",
    ballot_draw: "Ballot draw (shuffle)", data: "Data",
    export_house: "Export this house (JSON)", delete_house: "Delete house",
    data_hint: "Houses can always leave with their full books. Back up after every sitting.",

    // plan / billing
    plan_title: "Kola plan", your_plan: "Your plan",
    plan_status_free: "Free — Kola Start", plan_status_active: "Active",
    plan_status_lapsed: "Renewal due", plan_renews: "Valid until",
    plan_pay_at_shareout: "Renewed each year at your share-out — the day the whole house is together.",
    choose_plan: "Choose a plan", current: "Current plan",
    upgrade: "Upgrade", renew: "Renew this year", switch_to: "Switch to this plan",
    plan_start: "Kola Start", plan_start_tag: "Free forever",
    plan_standard: "Kola Standard", plan_standard_tag: "The everyday njangi",
    plan_elite: "Kola Elite", plan_elite_tag: "High-value houses",
    per_year: "/ year", free: "Free",
    feat_core_ledger: "Core ledger & receipts", feat_upto15: "Up to 15 members",
    feat_one_house: "1 house", feat_trouble: "Trouble fund & levies",
    feat_unlimited: "Unlimited members", feat_reports: "Reports & CSV export",
    feat_priority: "Priority support", feat_advanced: "Advanced exports & analytics",
    feat_elite_badge: "Elite badge & diaspora-ready", feat_multi: "Multiple funds per house",
    suggested: "Suggested for this house", suggested_why: "This house moves big money — Elite handles it with priority.",
    pay_momo: "Pay with MoMo / OM", pay_title: "Pay for", pay_to: "Pay to this Kola number",
    pay_steps: "1. Send the amount to the number above by MoMo or OM. 2. Enter the transaction ID below. 3. Tap Activate.",
    tx_id: "MoMo/OM transaction ID", activate: "Activate",
    pay_recorded: "Payment recorded — your house is active for one year. Thank you!",
    renew_free_btn: "Renew free for another year", renewed_free: "Renewed — free for another year.",
    locked_feature: "This is a premium feature", locked_msg: "Your house is on Kola Start. Upgrade to Standard or Elite to unlock it — your books always stay free to read and export.",
    limit_members: "Kola Start holds up to 15 members. Upgrade to add the whole big house.",
    see_plans: "See plans", later: "Later",
    lapsed_banner: "Your Kola year is complete. Renew at your share-out to keep premium features — your books stay open meanwhile.",

    // new house modal
    new_house: "New house", what_kind: "What kind of njangi is this?",
    contribution_fcfa: "Contribution per sitting (FCFA)", late_fine_fcfa: "Late fine (FCFA, 0 = none)",
    create_house_btn: "Create house",

    // receipt
    copy_whatsapp: "Copy for WhatsApp/SMS", close: "Close",
    copied: "Copied! Paste it in WhatsApp or SMS.",

    // misc alerts
    give_name: "Give the house a name.", enter_name: "Enter a name.",
    paste_line: "Paste at least one line.", everyone_paid: "Everyone has paid.",
    set_fine_first: "Set a late fine amount in Settings first.",
    nobody_fine: "Everyone has paid — nobody to fine.", enter_amount: "Enter an amount.",
    enter_reason_amount: "Enter a reason and an amount per member.",
    welcome: "Welcome to Kola", welcome_sub: "The digital book for your njangi house — small family njangi or big association, same tool.",
  },

  fr: {
    tagline: "Casse la cola · Bâtis la confiance",
    lang_en: "English", lang_fr: "Français", lang_pcm: "Pidgin",
    your_houses: "Vos maisons", new: "Nouveau", backup: "Sauvegarde", restore: "Restaurer",
    no_houses: "Aucune maison", members_short: "membres",

    nav_dashboard: "Tableau", nav_members: "Membres", nav_sittings: "Séances & Cagnotte",
    nav_trouble: "Fonds de secours", nav_ledger: "Registre", nav_plan: "Forfait", nav_settings: "Réglages",

    hero_badge: "Njangi · Tontine · Fonds de secours",
    hero_title1: "Votre tontine,", hero_title2: "sans la palabre.",
    hero_sub: "Kola est le carnet numérique de la plus ancienne institution financière du Cameroun. La réunion, le repas et la poignée de main restent — les disputes, les carnets perdus et l'argent disparu s'en vont.",
    create_house: "Créer votre maison", restore_backup: "Restaurer une sauvegarde",
    stat_50: "des Camerounais épargnent en njangi", stat_48: "délai de paiement du fonds de secours",
    stat_3: "langues des reçus — EN · FR · Pidgin",
    types_title: "Chaque type de njangi. Un seul carnet.",
    types_lead: "Choisissez la maison qui vous ressemble — Kola s'adapte à votre constitution, et non l'inverse.",
    why_title: "Pourquoi les maisons ne cassent pas sur Kola",
    why_lead: "Tout ici existe parce qu'un vrai njangi a cassé quelque part sans cela.",
    quote: "« Qui apporte la cola apporte la vie. »",
    quote_sub: "La noix est cassée et partagée — c'est ainsi que naît la confiance. Kola fait pareil avec vos comptes.",

    feat1_h: "Un carnet infalsifiable", feat1_p: "Chaque franc est inscrit dans un registre en ajout seul. Les corrections sont des contre-écritures visibles — l'historique ne peut jamais être modifié en cachette.",
    feat2_h: "Reçus en 3 langues", feat2_p: "Un appui copie un reçu en anglais, français ou pidgin directement dans WhatsApp ou SMS. Chaque membre, chaque paiement.",
    feat3_h: "Fonds de secours, promesse 48h", feat3_p: "Quand le deuil arrive, lancez une levée en un appui, cochez les membres qui paient, et payez la famille vite — pas en trois semaines.",
    feat4_h: "5 membres ou 200", feat4_p: "Collez toute une liste de membres, cherchez n'importe qui en un instant, marquez tout le monde payé d'un appui. Njangi familial ou grande association — même outil.",
    feat5_h: "Marche hors-ligne, sur tout téléphone", feat5_p: "Aucune installation, aucun compte, aucun forfait data après le premier chargement. Les comptes vivent sur le téléphone du trésorier, sauvegarde en un appui.",
    feat6_h: "Rotation juste, au grand jour", feat6_p: "Ordre fixe ou tirage au sort mélangé devant tout le monde. La cagnotte va là où le carnet le dit.",

    t_family: "Njangi familial", t_family_d: "Frères, sœurs, cousins — gardez l'argent de la famille propre et sans querelles.",
    t_market: "Marché & Commerçants", t_market_d: "Cercles buyam-sellam — collectes quotidiennes ou hebdo, directement au comptoir.",
    t_cultural: "Association culturelle", t_cultural_d: "Unions de développement et réunions ethniques — même à 200 membres.",
    t_professional: "Cercle professionnel", t_professional_d: "Enseignants, chauffeurs, collègues — même bureau, même syndicat, même cagnotte.",
    t_trouble: "Fonds de secours / décès", t_trouble_d: "Unis dans le deuil — levées rapides, paiement en 48 heures.",

    main_fund: "Fonds principal", trouble_fund: "Fonds de secours", active_members: "Membres actifs",
    next_pot: "Prochaine cagnotte pour", recent_activity: "Activité récente",
    no_tx: "Aucune opération. Ouvrez une séance pour commencer la collecte.",
    date: "Date", member: "Membre", type: "Type", amount: "Montant", method: "Moyen", note: "Note", status: "Statut",

    add_one: "Ajouter un membre", name: "Nom", phone: "Téléphone (MoMo/OM, optionnel)",
    add_member: "Ajouter le membre", bulk_add: "Ajout groupé — pour les grandes maisons",
    bulk_hint: "Collez un membre par ligne : Nom, téléphone (téléphone optionnel). 200 membres en quelques secondes.",
    add_all: "Tout ajouter", member_list: "Liste des membres", search_name: "Chercher nom ou téléphone…",
    paid_year: "Payé cette année", deactivate: "Désactiver", reactivate: "Réactiver", left: "parti",

    open_sitting: "Ouvrir une nouvelle séance", label_opt: "Libellé (optionnel)",
    open_sitting_btn: "Ouvrir la séance", sitting: "Séance", no_sittings: "Aucune séance.",
    collected: "Collecté cette séance", paid_up: "À jour", pot_beneficiary: "Bénéficiaire de la cagnotte",
    contributions: "Cotisations", each: "chacun", search_member: "Chercher un membre…",
    mark_all_paid: "Marquer TOUS payés (espèces)", fine_all: "Pénaliser tous les impayés",
    paid: "Payé", unpaid: "Impayé", part: "Partiel", cash: "Espèces", momo: "MoMo",
    reverse: "Annuler", receipt: "Reçu", closed: "Clôturée",
    close_disburse: "Clôturer & verser", pot_for: "Cagnotte de cette séance",
    goes_to: "va à", disburse_btn: "Verser la cagnotte & clôturer",
    close_no_payout: "Clôturer sans versement (tour d'épargne)", this_closed: "Cette séance est clôturée.",
    pot_paid_to: "cagnotte versée à",

    trouble_balance: "Solde du fonds de secours", raise_levy: "Lancer une levée d'urgence",
    levy_hint: "Un décès ou une urgence : chaque membre doit un montant fixe, tout de suite. C'est la promesse 48h.",
    reason: "Motif", amount_per: "Montant par membre", launch_levy: "Lancer la levée",
    payout_from: "Verser depuis le fonds de secours", beneficiary: "Membre bénéficiaire",
    record_payout: "Enregistrer le versement", levy: "Levée", no_levies: "Aucune levée.",
    per_member: "par membre", owing: "Doit",

    full_ledger: "Registre complet — ajout seul", ledger_hint: "Personne ne peut modifier ou supprimer l'historique ; les corrections sont des contre-écritures. C'est tout l'intérêt.",
    export_csv: "Exporter CSV", filter_ledger: "Filtrer par membre ou type…", entries: "écritures",

    house_settings: "Réglages de la maison", house_name: "Nom de la maison",
    contribution_per: "Cotisation par séance", frequency: "Fréquence", late_fine: "Pénalité de retard",
    weekly: "hebdomadaire", biweekly: "quinzaine", monthly: "mensuel",
    save_settings: "Enregistrer", kind_house: "Type de maison",
    rotation_order: "Ordre de rotation — qui mange la cagnotte ensuite",
    rotation_hint: "Ligne surlignée = prochain bénéficiaire. Utilisez le tirage au sort devant tout le monde.",
    ballot_draw: "Tirage au sort (mélanger)", data: "Données",
    export_house: "Exporter cette maison (JSON)", delete_house: "Supprimer la maison",
    data_hint: "Les maisons partent toujours avec leurs comptes. Sauvegardez après chaque séance.",

    plan_title: "Forfait Kola", your_plan: "Votre forfait",
    plan_status_free: "Gratuit — Kola Start", plan_status_active: "Actif",
    plan_status_lapsed: "Renouvellement dû", plan_renews: "Valable jusqu'au",
    plan_pay_at_shareout: "Renouvelé chaque année au partage — le jour où toute la maison est réunie.",
    choose_plan: "Choisir un forfait", current: "Forfait actuel",
    upgrade: "Passer à", renew: "Renouveler cette année", switch_to: "Choisir ce forfait",
    plan_start: "Kola Start", plan_start_tag: "Gratuit pour toujours",
    plan_standard: "Kola Standard", plan_standard_tag: "Le njangi de tous les jours",
    plan_elite: "Kola Elite", plan_elite_tag: "Maisons de grande valeur",
    per_year: "/ an", free: "Gratuit",
    feat_core_ledger: "Registre & reçus de base", feat_upto15: "Jusqu'à 15 membres",
    feat_one_house: "1 maison", feat_trouble: "Fonds de secours & levées",
    feat_unlimited: "Membres illimités", feat_reports: "Rapports & export CSV",
    feat_priority: "Support prioritaire", feat_advanced: "Exports & analyses avancés",
    feat_elite_badge: "Badge Elite & prêt diaspora", feat_multi: "Plusieurs fonds par maison",
    suggested: "Suggéré pour cette maison", suggested_why: "Cette maison brasse beaucoup d'argent — Elite le gère en priorité.",
    pay_momo: "Payer par MoMo / OM", pay_title: "Payer pour", pay_to: "Payez à ce numéro Kola",
    pay_steps: "1. Envoyez le montant au numéro ci-dessus par MoMo ou OM. 2. Saisissez l'ID de transaction. 3. Appuyez sur Activer.",
    tx_id: "ID de transaction MoMo/OM", activate: "Activer",
    pay_recorded: "Paiement enregistré — votre maison est active pour un an. Merci !",
    renew_free_btn: "Renouveler gratuitement un an", renewed_free: "Renouvelé — gratuit pour un an de plus.",
    locked_feature: "Fonction premium", locked_msg: "Votre maison est sur Kola Start. Passez à Standard ou Elite pour la débloquer — vos comptes restent toujours gratuits à lire et exporter.",
    limit_members: "Kola Start contient jusqu'à 15 membres. Passez à un forfait supérieur pour ajouter toute la grande maison.",
    see_plans: "Voir les forfaits", later: "Plus tard",
    lapsed_banner: "Votre année Kola est terminée. Renouvelez au partage pour garder les fonctions premium — vos comptes restent ouverts entre-temps.",

    new_house: "Nouvelle maison", what_kind: "Quel type de njangi ?",
    contribution_fcfa: "Cotisation par séance (FCFA)", late_fine_fcfa: "Pénalité de retard (FCFA, 0 = aucune)",
    create_house_btn: "Créer la maison",

    copy_whatsapp: "Copier pour WhatsApp/SMS", close: "Fermer",
    copied: "Copié ! Collez-le dans WhatsApp ou SMS.",

    give_name: "Donnez un nom à la maison.", enter_name: "Entrez un nom.",
    paste_line: "Collez au moins une ligne.", everyone_paid: "Tout le monde a payé.",
    set_fine_first: "Définissez d'abord une pénalité dans les Réglages.",
    nobody_fine: "Tout le monde a payé — personne à pénaliser.", enter_amount: "Entrez un montant.",
    enter_reason_amount: "Entrez un motif et un montant par membre.",
    welcome: "Bienvenue sur Kola", welcome_sub: "Le carnet numérique de votre njangi — petit njangi familial ou grande association, même outil.",
  },

  pcm: {
    tagline: "Break kola · Build trust",
    lang_en: "English", lang_fr: "Français", lang_pcm: "Pidgin",
    your_houses: "Ya njangi dem", new: "New", backup: "Backup", restore: "Bring back",
    no_houses: "No njangi dey yet", members_short: "pipo",

    nav_dashboard: "Dashboard", nav_members: "Pipo", nav_sittings: "Sitting & Pot",
    nav_trouble: "Trouble Fund", nav_ledger: "Book", nav_plan: "Plan", nav_settings: "Settings",

    hero_badge: "Njangi · Tontine · Trouble Fund",
    hero_title1: "Ya njangi house,", hero_title2: "without palaver.",
    hero_sub: "Kola na di digital book for Cameroon oldest money institution. Di meeting, di chop and di handshake remain — na di palaver, lost book and money weh e di loss go comot.",
    create_house: "Create ya njangi", restore_backup: "Bring back backup",
    stat_50: "Cameroonians di save for njangi", stat_48: "trouble fund payout target",
    stat_3: "receipt languages — EN · FR · Pidgin",
    types_title: "Any kana njangi. One book.",
    types_lead: "Pick di njangi weh e resemble ya own — Kola di shape e self for ya constitution, no be di other way.",
    why_title: "Why njangi no di break for Kola",
    why_lead: "Everytin for here dey because some real njangi don break some place without am.",
    quote: "“Weh bring kola, bring life.”",
    quote_sub: "Dem di break di nut share am — na so trust di born. Kola di do same tin with ya book.",

    feat1_h: "Book weh nobody fit cook", feat1_p: "Every franc dey for book weh you fit only add — you no fit comot. Correction na open reversal — nobody fit change history for hide.",
    feat2_h: "Receipt for 3 language", feat2_p: "One touch di copy receipt for English, French or Pidgin straight for WhatsApp or SMS. Every member, every pay.",
    feat3_h: "Trouble fund, 48-hour promise", feat3_p: "Weh cry com, launch levy for one touch, tick pipo weh dem don pay, pay di family quick — no be for three week.",
    feat4_h: "5 pipo or 200", feat4_p: "Paste whole member list, find anybody quick-quick, mark everybody don pay for one touch. Family njangi or big association — same tool.",
    feat5_h: "E di work offline, for any phone", feat5_p: "No install, no account, no data after first time. Di book di stay for treasurer e phone, backup for one touch.",
    feat6_h: "Fair rotation, for open", feat6_p: "Fix order or ballot draw weh dem shake for front of everybody. Di pot di go where di book talk.",

    t_family: "Family Njangi", t_family_d: "Brother, sister, cousin — keep family money clean, palaver comot.",
    t_market: "Market & Buyam-Sellam", t_market_d: "Buyam-sellam circle — collect every day or every week, for di stall.",
    t_cultural: "Cultural Meeting", t_cultural_d: "Village development union and tribe meeting — even 200 pipo strong.",
    t_professional: "Work Circle", t_professional_d: "Teacher, driver, colleague — same office, same syndicate, same pot.",
    t_trouble: "Trouble / Cry-die Fund", t_trouble_d: "Stand together weh cry com — quick levy, payout for 48 hour.",

    main_fund: "Main fund", trouble_fund: "Trouble fund", active_members: "Active pipo",
    next_pot: "Next pot go for", recent_activity: "Wetin happen now-now",
    no_tx: "No transaction yet. Open sitting make collection start.",
    date: "Date", member: "Member", type: "Type", amount: "Amount", method: "How", note: "Note", status: "Status",

    add_one: "Add one member", name: "Name", phone: "Phone (MoMo/OM, if e dey)",
    add_member: "Add member", bulk_add: "Add plenty — for big njangi",
    bulk_hint: "Paste one member for one line: Name, phone (phone optional). 200 pipo di enter for seconds.",
    add_all: "Add all", member_list: "Member list", search_name: "Find name or phone…",
    paid_year: "Don pay dis year", deactivate: "Comot", reactivate: "Bring back", left: "don go",

    open_sitting: "Open new sitting", label_opt: "Label (if e dey)",
    open_sitting_btn: "Open sitting", sitting: "Sitting", no_sittings: "No sitting yet.",
    collected: "Weh dem collect dis sitting", paid_up: "Don pay", pot_beneficiary: "Pot beneficiary",
    contributions: "Contribution", each: "each", search_member: "Find member…",
    mark_all_paid: "Mark ALL weh never pay say dem pay (cash)", fine_all: "Fine all weh never pay",
    paid: "Don pay", unpaid: "Never pay", part: "Small", cash: "Cash", momo: "MoMo",
    reverse: "Cancel", receipt: "Receipt", closed: "Don close",
    close_disburse: "Close & share", pot_for: "Pot for dis sitting",
    goes_to: "go for", disburse_btn: "Share di pot & close sitting",
    close_no_payout: "Close without share (savings round)", this_closed: "Dis sitting don close.",
    pot_paid_to: "pot don go for",

    trouble_balance: "Trouble fund balance", raise_levy: "Launch emergency levy",
    levy_hint: "Cry-die or emergency: every member owe fix amount, now-now. Na di 48-hour promise.",
    reason: "Reason", amount_per: "Amount per member", launch_levy: "Launch levy",
    payout_from: "Pay comot from trouble fund", beneficiary: "Beneficiary member",
    record_payout: "Record payout", levy: "Levy", no_levies: "No levy yet.",
    per_member: "per member", owing: "Still owe",

    full_ledger: "Full book — you fit only add", ledger_hint: "Nobody fit change or comot history; correction di show as reversal. Na di whole point.",
    export_csv: "Comot CSV", filter_ledger: "Filter by member or type…", entries: "entries",

    house_settings: "Njangi settings", house_name: "Njangi name",
    contribution_per: "Contribution per sitting", frequency: "How e di happen", late_fine: "Late fine",
    weekly: "every week", biweekly: "every two week", monthly: "every month",
    save_settings: "Save settings", kind_house: "Kana njangi",
    rotation_order: "Rotation order — weh go chop pot next",
    rotation_hint: "Light row = next beneficiary. Use ballot draw make e shake fair for front of everybody.",
    ballot_draw: "Ballot draw (shake)", data: "Data",
    export_house: "Comot dis njangi (JSON)", delete_house: "Delete njangi",
    data_hint: "Njangi fit always go with all dem book. Backup after every sitting.",

    plan_title: "Kola plan", your_plan: "Ya plan",
    plan_status_free: "Free — Kola Start", plan_status_active: "Active",
    plan_status_lapsed: "Renew don reach", plan_renews: "Good reach",
    plan_pay_at_shareout: "Dem di renew am every year for ya share-out — di day weh whole njangi gather.",
    choose_plan: "Choose plan", current: "Ya plan now",
    upgrade: "Move go", renew: "Renew dis year", switch_to: "Take dis plan",
    plan_start: "Kola Start", plan_start_tag: "Free forever",
    plan_standard: "Kola Standard", plan_standard_tag: "Di everyday njangi",
    plan_elite: "Kola Elite", plan_elite_tag: "Big-money njangi",
    per_year: "/ year", free: "Free",
    feat_core_ledger: "Main book & receipt", feat_upto15: "Reach 15 pipo",
    feat_one_house: "1 njangi", feat_trouble: "Trouble fund & levy",
    feat_unlimited: "Pipo no get limit", feat_reports: "Report & CSV",
    feat_priority: "Priority help", feat_advanced: "Advanced comot & analytics",
    feat_elite_badge: "Elite badge & diaspora-ready", feat_multi: "Plenty fund for one njangi",
    suggested: "We suggest am for dis njangi", suggested_why: "Dis njangi di move big money — Elite di handle am with priority.",
    pay_momo: "Pay with MoMo / OM", pay_title: "Pay for", pay_to: "Pay for dis Kola number",
    pay_steps: "1. Send di money go di number up by MoMo or OM. 2. Put di transaction ID for down. 3. Touch Activate.",
    tx_id: "MoMo/OM transaction ID", activate: "Activate",
    pay_recorded: "Payment don record — ya njangi active for one year. Tank you!",
    renew_free_btn: "Renew free for another year", renewed_free: "Don renew — free for another year.",
    locked_feature: "Na premium feature dis", locked_msg: "Ya njangi dey for Kola Start. Move go Standard or Elite make e open — ya book di always stay free for read and comot.",
    limit_members: "Kola Start di hold reach 15 pipo. Move go higher plan make you add di whole big njangi.",
    see_plans: "See plan dem", later: "Later",
    lapsed_banner: "Ya Kola year don complete. Renew for ya share-out make premium feature remain — ya book di stay open meanwhile.",

    new_house: "New njangi", what_kind: "Na kana njangi?",
    contribution_fcfa: "Contribution per sitting (FCFA)", late_fine_fcfa: "Late fine (FCFA, 0 = none)",
    create_house_btn: "Create njangi",

    copy_whatsapp: "Copy for WhatsApp/SMS", close: "Close",
    copied: "Don copy! Paste am for WhatsApp or SMS.",

    give_name: "Give di njangi name.", enter_name: "Put name.",
    paste_line: "Paste at least one line.", everyone_paid: "Everybody don pay.",
    set_fine_first: "Set late fine for Settings first.",
    nobody_fine: "Everybody don pay — nobody for fine.", enter_amount: "Put amount.",
    enter_reason_amount: "Put reason and amount per member.",
    welcome: "Welcome for Kola", welcome_sub: "Di digital book for ya njangi — small family njangi or big association, same tool.",
  },
};

function lang() { return state.lang || "en"; }
function t(key, vars) {
  const L = I18N[lang()] || I18N.en;
  let s = (L[key] != null ? L[key] : (I18N.en[key] != null ? I18N.en[key] : key));
  if (vars) for (const k in vars) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
  return s;
}

/* ============================================================
 * Billing — three tiers, annual, renewed at the share-out.
 * ============================================================ */

const KOLA_MOMO = "6 7X XX XX XX"; // placeholder Kola collection number (set before launch)

const PLANS = {
  start:    { key: "start",    price: 0,      maxMembers: 15,       premium: false },
  standard: { key: "standard", price: 24000,  maxMembers: Infinity, premium: true },
  elite:    { key: "elite",    price: 100000, maxMembers: Infinity, premium: true },
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Status of a house's subscription.
function planStatus(g) {
  const plan = PLANS[g.plan] || PLANS.start;
  const validUntil = g.validUntil ? new Date(g.validUntil).getTime() : null;
  const now = Date.now();
  const daysLeft = validUntil ? Math.ceil((validUntil - now) / (24 * 60 * 60 * 1000)) : null;
  let status;
  if (!validUntil) status = plan.premium ? "lapsed" : "free";
  else if (validUntil < now) status = "lapsed";
  else status = plan.premium ? "active" : "free";
  // A lapsed premium house silently falls back to Start limits, but never loses data.
  const effective = (status === "lapsed" && plan.premium) ? PLANS.start : plan;
  return { plan, effective, status, validUntil, daysLeft };
}

// Suggest Elite when serious money flows through the house.
function suggestElite(g) {
  if (g.contribution >= 50000) return true;
  const bigLevy = (g.levies || []).some(l => l.amount >= 100000);
  if (bigLevy) return true;
  // big standing trouble fund
  if (troubleBalance(g) >= 1000000) return true;
  return false;
}

// Gate a premium feature. Returns true if allowed, otherwise shows paywall.
function requirePremium(g) {
  const ps = planStatus(g);
  if (ps.effective.premium) return true;
  App.showPaywall("locked");
  return false;
}

/* ---------- group types: real imagery per kind of njangi ---------- */

const IMG = id => `https://unsplash.com/photos/${id}/download?w=1600`;

const TYPES = {
  family:       { tkey: "family",       img: IMG("0do79eYjGTc"), icon: "home" },
  market:       { tkey: "market",       img: IMG("kmbytzhJWjg"), icon: "basket" },
  cultural:     { tkey: "cultural",     img: IMG("RCAUud6Wcmo"), icon: "drum" },
  professional: { tkey: "professional", img: IMG("gqpd_DWMBgM"), icon: "briefcase" },
  trouble:      { tkey: "trouble",      img: IMG("Ja4ar0or7TE"), icon: "candle" },
};
function typeLabel(key) { return t("t_" + key); }
function typeDesc(key) { return t("t_" + key + "_d"); }

const HERO_IMG = IMG("l-0yLU7ImzM"); // friends stacking hands together in a circle

function typeOf(g) { return TYPES[g.type] || TYPES.family; }

/* ---------- inline SVG icons (stroke style, zero bandwidth) ---------- */

function icon(name, size) {
  const s = size || 18;
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
    basket: '<path d="M4 10h16l-1.5 10h-13L4 10z"/><path d="M8 10l4-7 4 7"/><path d="M9 14v3M12 14v3M15 14v3"/>',
    drum: '<ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    candle: '<path d="M12 3c1.2 1.5 2 2.6 2 4a2 2 0 1 1-4 0c0-1.4.8-2.5 2-4z"/><path d="M9 11h6v9H9z"/><path d="M5 20h14"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.8.3 5 2.4 5 5.5"/>',
    coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 5.5a6 6 0 1 1-8 8"/><path d="M9 6.5v5M6.8 9h4.4"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4.5"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17.5a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 19.5v-15z"/><path d="M4 17h14M8 6h8M8 9.5h5"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.3 7l2.6 1.5M17.1 15.5l2.6 1.5M2.5 12h3M18.5 12h3M4.3 17l2.6-1.5M17.1 8.5L19.7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/>',
    receipt: '<path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22V2z"/><path d="M9.5 7h5M9.5 11h5M9.5 15h3"/>',
    download: '<path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    heart: '<path d="M12 20.5C7 16.5 3.5 13.3 3.5 9.6 3.5 7 5.5 5 8 5c1.6 0 3.1.8 4 2.1C12.9 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 3.7-3.5 6.9-8.5 10.9z"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    spark: '<path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"/>',
    crown: '<path d="M3 7l4 4 5-6 5 6 4-4-1.5 12H4.5L3 7z"/><path d="M4.5 19h15"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  };
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
}

/* ---------- helpers ---------- */

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);

function fmt(n) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(lang() === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch (e) { return iso; }
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function photo(src, cls) {
  return `<img src="${esc(src)}" class="${cls || ""}" alt="" loading="lazy" onerror="this.classList.add('imgfail')">`;
}

function activeGroup() {
  return state.groups.find(g => g.id === state.activeGroupId) || null;
}
function member(g, id) { return g.members.find(m => m.id === id); }
function memberName(g, id) { const m = member(g, id); return m ? m.name : "(removed member)"; }

/* ---------- derived figures ---------- */

function paidForSitting(g, sittingId, memberId) {
  return g.transactions
    .filter(t => t.sittingId === sittingId && t.memberId === memberId &&
                 (t.type === "contribution" || t.type === "reversal-contribution"))
    .reduce((s, t) => s + t.amount, 0);
}
function sittingTotal(g, sittingId) {
  return g.transactions
    .filter(t => t.sittingId === sittingId &&
                 (t.type === "contribution" || t.type === "reversal-contribution" || t.type === "fine"))
    .reduce((s, t) => s + t.amount, 0);
}
function mainFundBalance(g) {
  return g.transactions
    .filter(t => ["contribution", "reversal-contribution", "fine", "payout"].includes(t.type))
    .reduce((s, t) => s + t.amount, 0);
}
function troubleBalance(g) {
  return g.transactions
    .filter(t => ["levy-payment", "reversal-levy", "trouble-payout"].includes(t.type))
    .reduce((s, t) => s + t.amount, 0);
}
function levyPaid(g, levyId, memberId) {
  return g.transactions
    .filter(t => t.levyId === levyId && t.memberId === memberId &&
                 (t.type === "levy-payment" || t.type === "reversal-levy"))
    .reduce((s, t) => s + t.amount, 0);
}
function memberYearTotal(g, memberId) {
  const year = new Date().getFullYear();
  return g.transactions
    .filter(t => t.memberId === memberId && t.date.startsWith(String(year)) &&
                 ["contribution", "reversal-contribution", "levy-payment", "reversal-levy"].includes(t.type))
    .reduce((s, t) => s + t.amount, 0);
}
function activeMembers(g) { return g.members.filter(m => m.active); }
function currentBeneficiary(g) {
  const order = g.rotation.filter(id => { const m = member(g, id); return m && m.active; });
  if (!order.length) return null;
  return member(g, order[g.rotationIndex % order.length]);
}

/* ---------- transactions (append-only) ---------- */

function addTx(g, tx) {
  g.transactions.push(Object.assign({ id: uid(), date: todayISO(), ts: Date.now() }, tx));
  save();
}

/* ---------- receipts ---------- */

const RECEIPTS = {
  en: (p) => `KOLA RECEIPT — ${p.group}\n${p.name} paid ${p.amount} (${p.method}) for ${p.what} on ${p.date}.\nTotal paid this year: ${p.yearTotal}.\nThank you!`,
  fr: (p) => `REÇU KOLA — ${p.group}\n${p.name} a payé ${p.amount} (${p.method}) pour ${p.what} le ${p.date}.\nTotal payé cette année : ${p.yearTotal}.\nMerci !`,
  pcm: (p) => `KOLA RECEIPT — ${p.group}\n${p.name} don pay ${p.amount} (${p.method}) for ${p.what} on ${p.date}.\nTotal weh you don pay dis year na: ${p.yearTotal}.\nTank you plenty!`,
};
function receiptText(g, tx) {
  const what =
    tx.type === "levy-payment" ? (lang() === "fr" ? "levée du fonds de secours" : lang() === "pcm" ? "trouble fund levy" : "trouble fund levy") :
    tx.sittingId ? (lang() === "fr" ? "la séance" : "the sitting") :
    (lang() === "fr" ? "cotisation" : "contribution");
  return RECEIPTS[lang()]({
    group: g.name, name: memberName(g, tx.memberId), amount: fmt(tx.amount),
    method: tx.method || "cash", what, date: tx.date, yearTotal: fmt(memberYearTotal(g, tx.memberId)),
  });
}

/* ============================================================
 * rendering
 * ============================================================ */

function render() {
  renderSidebar();
  const g = activeGroup();
  const main = document.getElementById("main");
  document.body.classList.toggle("landing-mode", !g);
  if (!g) { main.innerHTML = viewLanding(); return; }

  const ps = planStatus(g);
  const tabs = [
    ["dashboard", t("nav_dashboard"), "grid"],
    ["members", `${t("nav_members")} · ${activeMembers(g).length}`, "users"],
    ["sittings", t("nav_sittings"), "coins"],
    ["trouble", t("nav_trouble"), "shield"],
    ["ledger", t("nav_ledger"), "book"],
    ["plan", t("nav_plan"), "crown"],
    ["settings", t("nav_settings"), "gear"],
  ];
  let html = `<div class="tabs">` + tabs.map(([id, label, ic]) =>
    `<button class="${ui.tab === id ? "active" : ""}" onclick="App.tab('${id}')">${icon(ic, 15)}${label}</button>`
  ).join("") + `</div>`;

  if (ps.status === "lapsed") {
    html += `<div class="lapsed-banner">${icon("crown", 17)}<span>${t("lapsed_banner")}</span><button class="btn small light" onclick="App.tab('plan')">${t("see_plans")}</button></div>`;
  }

  if (ui.tab === "dashboard") html += viewDashboard(g);
  else if (ui.tab === "members") html += viewMembers(g);
  else if (ui.tab === "sittings") html += viewSittings(g);
  else if (ui.tab === "trouble") html += viewTrouble(g);
  else if (ui.tab === "ledger") html += viewLedger(g);
  else if (ui.tab === "plan") html += viewPlan(g);
  else if (ui.tab === "settings") html += viewSettings(g);

  main.innerHTML = html;
}

function renderSidebar() {
  const ul = document.getElementById("groupList");
  ul.innerHTML = state.groups.map(g => {
    const ty = typeOf(g);
    const ps = planStatus(g);
    const badge = (g.plan === "elite") ? `<span class="plan-dot elite" title="Elite">${icon("crown", 11)}</span>`
                : (g.plan === "standard" && ps.status === "active") ? `<span class="plan-dot std" title="Standard">${icon("check", 11)}</span>` : "";
    return `
    <li class="${g.id === state.activeGroupId ? "active" : ""}" onclick="App.selectGroup('${g.id}')">
      <span class="gthumb">${photo(ty.img)}${icon(ty.icon, 17)}</span>
      <span>
        <span class="gname">${esc(g.name)} ${badge}</span>
        <span class="gmeta">${activeMembers(g).length} ${t("members_short")} · ${fmt(g.contribution)}/${t(freqKey(g.frequency))}</span>
      </span>
    </li>`;
  }).join("") || `<li class="muted" style="cursor:default;border:none;background:none">${t("no_houses")}</li>`;

  // language + sidebar labels
  const sel = document.getElementById("langSelect");
  sel.innerHTML = `<option value="en">${t("lang_en")}</option><option value="fr">${t("lang_fr")}</option><option value="pcm">${t("lang_pcm")}</option>`;
  sel.value = lang();
  document.querySelector(".sidebar-head h2").textContent = t("your_houses");
  document.querySelector(".sidebar-head .btn").textContent = "+ " + t("new");
  document.querySelector(".brand p").textContent = t("tagline");
  const foot = document.querySelector(".sidebar-foot");
  foot.querySelector("button").textContent = t("backup");
  foot.querySelector("label").childNodes[0].textContent = t("restore") + " ";
}

function freqKey(f) {
  return f === "weekly" ? "weekly" : f === "bi-weekly" ? "biweekly" : "monthly";
}

/* ----- landing ----- */

function viewLanding() {
  const typeCards = Object.keys(TYPES).map(key => {
    const ty = TYPES[key];
    return `
    <div class="type-card" onclick="App.showNewGroup('${key}')">
      ${photo(ty.img)}
      <div class="tc-body">
        <div class="tc-icon">${icon(ty.icon, 19)}</div>
        <h3>${typeLabel(key)}</h3>
        <p>${typeDesc(key)}</p>
      </div>
    </div>`;
  }).join("");

  const features = [
    ["book", t("feat1_h"), t("feat1_p")],
    ["receipt", t("feat2_h"), t("feat2_p")],
    ["shield", t("feat3_h"), t("feat3_p")],
    ["users", t("feat4_h"), t("feat4_p")],
    ["phone", t("feat5_h"), t("feat5_p")],
    ["dice", t("feat6_h"), t("feat6_p")],
  ].map(([ic, h, p], i) => `
    <div class="feature" style="animation-delay:${i * 0.06}s">
      <div class="f-icon">${icon(ic, 21)}</div>
      <h3>${h}</h3>
      <p>${p}</p>
    </div>`).join("");

  return `
  <section class="hero">
    ${photo(HERO_IMG, "hero-img")}
    <div class="hero-inner">
      <span class="badge">${icon("spark", 14)} ${t("hero_badge")}</span>
      <h1>${t("hero_title1")}<br><em>${t("hero_title2")}</em></h1>
      <p class="sub">${t("hero_sub")}</p>
      <div class="hero-cta">
        <button class="btn big light" onclick="App.showNewGroup()">${icon("plus", 17)} ${t("create_house")}</button>
        <label class="btn big ghost file-btn" style="color:#fff;border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.08)">${t("restore_backup")}
          <input type="file" accept="application/json" onchange="App.importAll(this)">
        </label>
      </div>
      <div class="stats-strip">
        <div><div class="n">50%</div><div class="l">${t("stat_50")}</div></div>
        <div><div class="n">48 h</div><div class="l">${t("stat_48")}</div></div>
        <div><div class="n">3</div><div class="l">${t("stat_3")}</div></div>
      </div>
    </div>
  </section>

  <section class="section">
    <h2>${t("types_title")}</h2>
    <p class="lead">${t("types_lead")}</p>
    <div class="type-grid">${typeCards}</div>
  </section>

  <section class="section" style="padding-top:0">
    <h2>${t("why_title")}</h2>
    <p class="lead">${t("why_lead")}</p>
    <div class="feature-grid">${features}</div>
  </section>

  <div class="quote-band">
    <p class="q">${t("quote")}</p>
    <p class="a">${t("quote_sub")}</p>
  </div>`;
}

/* ----- dashboard ----- */

function viewDashboard(g) {
  const ty = typeOf(g);
  const ben = currentBeneficiary(g);
  const lastTx = g.transactions.slice(-8).reverse();
  return `
  <div class="banner">
    ${photo(ty.img)}
    <div class="b-body">
      <div class="tc-icon" style="width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center">${icon(ty.icon, 20)}</div>
      <div>
        <h2>${esc(g.name)}</h2>
        <span class="b-sub">${typeLabel(g.type)} · ${fmt(g.contribution)} ${t(freqKey(g.frequency))}</span>
      </div>
    </div>
  </div>
  <div class="statgrid">
    <div class="stat green"><div class="s-icon">${icon("coins", 20)}</div><div><div class="label">${t("main_fund")}</div><div class="value">${fmt(mainFundBalance(g))}</div></div></div>
    <div class="stat gold"><div class="s-icon">${icon("shield", 20)}</div><div><div class="label">${t("trouble_fund")}</div><div class="value">${fmt(troubleBalance(g))}</div></div></div>
    <div class="stat blue"><div class="s-icon">${icon("users", 20)}</div><div><div class="label">${t("active_members")}</div><div class="value">${activeMembers(g).length}</div></div></div>
    <div class="stat terra"><div class="s-icon">${icon("heart", 20)}</div><div><div class="label">${t("next_pot")}</div><div class="value">${ben ? esc(ben.name) : "—"}</div></div></div>
  </div>
  <div class="card mt">
    <h3>${icon("book", 17)} ${t("recent_activity")}</h3>
    ${lastTx.length ? `<table><thead><tr><th>${t("date")}</th><th>${t("member")}</th><th>${t("type")}</th><th class="num">${t("amount")}</th></tr></thead><tbody>` +
      lastTx.map(tx => `<tr><td>${tx.date}</td><td>${esc(memberName(g, tx.memberId))}</td><td>${esc(txLabel(tx))}</td><td class="num">${fmt(tx.amount)}</td></tr>`).join("") +
      `</tbody></table>` : `<p class="muted">${t("no_tx")}</p>`}
  </div>`;
}

function txLabel(t) {
  return {
    "contribution": "Contribution", "reversal-contribution": "Reversal",
    "fine": "Fine", "payout": "Pot payout", "levy-payment": "Trouble levy",
    "reversal-levy": "Reversal (levy)", "trouble-payout": "Trouble payout",
    "subscription": "Kola plan",
  }[t.type] || t.type;
}

function searchBox(placeholder) {
  return `<div class="searchbar">${icon("search", 16)}<input type="text" placeholder="${placeholder}" oninput="App.filterRows(this)"></div>`;
}

/* ----- members ----- */

function viewMembers(g) {
  const rows = g.members.map(m => `
    <tr data-search="${esc(m.name.toLowerCase())} ${esc(m.phone || "")}">
      <td>${esc(m.name)} ${m.active ? "" : `<span class="pill grey">${t("left")}</span>`}</td>
      <td>${esc(m.phone || "—")}</td>
      <td class="num">${fmt(memberYearTotal(g, m.id))}</td>
      <td class="right row-actions">
        <button class="btn small ghost" onclick="App.toggleMember('${m.id}')">${m.active ? t("deactivate") : t("reactivate")}</button>
      </td>
    </tr>`).join("");

  return `
  <div class="card">
    <h3>${icon("plus", 17)} ${t("add_one")}</h3>
    <div class="formrow">
      <label class="field"><span>${t("name")}</span><input type="text" id="mName" placeholder="e.g. Ngwa Divine"></label>
      <label class="field"><span>${t("phone")}</span><input type="tel" id="mPhone" placeholder="6 7X XX XX XX"></label>
    </div>
    <button class="btn" onclick="App.addMember()">${t("add_member")}</button>
  </div>
  <div class="card">
    <h3>${icon("users", 17)} ${t("bulk_add")}</h3>
    <p class="muted">${t("bulk_hint")}</p>
    <textarea id="mBulk" placeholder="Mary Fon, 677000001&#10;Tabi Roland, 699000002&#10;Che Emmanuella"></textarea>
    <button class="btn mt" onclick="App.bulkAddMembers()">${t("add_all")}</button>
  </div>
  <div class="card">
    <h3>${icon("book", 17)} ${t("member_list")} (${g.members.length})</h3>
    ${searchBox(t("search_name"))}
    <div class="scrollwrap">
      <table><thead><tr><th>${t("name")}</th><th>${t("phone").split(" ")[0]}</th><th class="num">${t("paid_year")}</th><th></th></tr></thead>
      <tbody>${rows || ""}</tbody></table>
    </div>
  </div>`;
}

/* ----- sittings ----- */

function viewSittings(g) {
  const sittings = g.sittings.slice().reverse();
  const sel = g.sittings.find(s => s.id === ui.sittingId) || sittings[0] || null;
  if (sel) ui.sittingId = sel.id;

  let html = `
  <div class="card">
    <h3>${icon("plus", 17)} ${t("open_sitting")}</h3>
    <div class="formrow">
      <label class="field"><span>${t("date")}</span><input type="date" id="sitDate" value="${todayISO()}"></label>
      <label class="field"><span>${t("label_opt")}</span><input type="text" id="sitLabel" placeholder=""></label>
    </div>
    <button class="btn" onclick="App.addSitting()">${t("open_sitting_btn")}</button>
  </div>`;

  if (!sel) return html + `<div class="card"><p class="muted">${t("no_sittings")}</p></div>`;

  html += `<div class="card"><h3>${icon("coins", 17)} ${t("sitting")}</h3>
    <select onchange="App.selectSitting(this.value)">` +
    sittings.map(s => `<option value="${s.id}" ${s.id === sel.id ? "selected" : ""}>${s.date} ${esc(s.label || "")} ${s.closed ? "(" + t("closed") + ")" : ""}</option>`).join("") +
    `</select></div>`;

  const ben = currentBeneficiary(g);
  const members = activeMembers(g);
  const paidCount = members.filter(m => paidForSitting(g, sel.id, m.id) >= g.contribution).length;

  const rows = members.map(m => {
    const paid = paidForSitting(g, sel.id, m.id);
    const done = paid >= g.contribution;
    return `
    <tr class="${done ? "paid" : ""}" data-search="${esc(m.name.toLowerCase())}">
      <td>${esc(m.name)}</td>
      <td>${done ? `<span class="pill green">${t("paid")}</span>` : (paid > 0 ? `<span class="pill gold">${t("part")}: ${fmt(paid)}</span>` : `<span class="pill red">${t("unpaid")}</span>`)}</td>
      <td class="right row-actions">
        ${sel.closed ? "" : `
          <button class="btn small" ${done ? "disabled" : ""} onclick="App.pay('${sel.id}','${m.id}','cash')">${t("cash")}</button>
          <button class="btn small gold" ${done ? "disabled" : ""} onclick="App.pay('${sel.id}','${m.id}','MoMo/OM')">${t("momo")}</button>
          ${paid > 0 ? `<button class="btn small warn" onclick="App.reverse('${sel.id}','${m.id}')">${t("reverse")}</button>` : ""}`}
        ${paid > 0 ? `<button class="btn small blue" onclick="App.receiptFor('${sel.id}','${m.id}')">${icon("receipt", 13)} ${t("receipt")}</button>` : ""}
      </td>
    </tr>`;
  }).join("");

  html += `
  <div class="statgrid">
    <div class="stat green"><div class="s-icon">${icon("coins", 20)}</div><div><div class="label">${t("collected")}</div><div class="value">${fmt(sittingTotal(g, sel.id))}</div></div></div>
    <div class="stat blue"><div class="s-icon">${icon("users", 20)}</div><div><div class="label">${t("paid_up")}</div><div class="value">${paidCount} / ${members.length}</div></div></div>
    <div class="stat gold"><div class="s-icon">${icon("heart", 20)}</div><div><div class="label">${t("pot_beneficiary")}</div><div class="value">${ben ? esc(ben.name) : "—"}</div></div></div>
  </div>
  <div class="card mt">
    <h3>${icon("coins", 17)} ${t("contributions")} — ${fmt(g.contribution)} ${t("each")}</h3>
    ${searchBox(t("search_member"))}
    ${sel.closed ? `<p class="muted">${t("this_closed")}</p>` : `
    <div class="row-actions" style="justify-content:flex-start;margin-bottom:12px">
      <button class="btn ghost small" onclick="App.payAllUnpaid('${sel.id}','cash')">${t("mark_all_paid")}</button>
      <button class="btn ghost small" onclick="App.fineUnpaid('${sel.id}')">${t("fine_all")} (${fmt(g.fineLate || 0)})</button>
    </div>`}
    <div class="scrollwrap">
      <table><thead><tr><th>${t("member")}</th><th>${t("status")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>
  <div class="card">
    <h3>${icon("heart", 17)} ${t("close_disburse")}</h3>
    <p class="muted">${t("pot_for")}: <b>${fmt(sittingTotal(g, sel.id))}</b> → ${t("goes_to")} <b>${ben ? esc(ben.name) : "—"}</b>.</p>
    ${sel.closed
      ? `<span class="pill grey">${t("closed")}${sel.disbursedTo ? " — " + t("pot_paid_to") + " " + esc(memberName(g, sel.disbursedTo)) : ""}</span>`
      : `<div class="row-actions" style="justify-content:flex-start">
           <button class="btn" ${ben ? "" : "disabled"} onclick="App.disburse('${sel.id}')">${t("disburse_btn")}</button>
           <button class="btn ghost" onclick="App.closeSittingOnly('${sel.id}')">${t("close_no_payout")}</button>
         </div>`}
  </div>`;
  return html;
}

/* ----- trouble fund ----- */

function viewTrouble(g) {
  const levies = g.levies.slice().reverse();
  const sel = g.levies.find(l => l.id === ui.levyId) || levies[0] || null;
  if (sel) ui.levyId = sel.id;

  let html = `
  <div class="statgrid">
    <div class="stat gold"><div class="s-icon">${icon("shield", 20)}</div><div><div class="label">${t("trouble_balance")}</div><div class="value">${fmt(troubleBalance(g))}</div></div></div>
  </div>
  <div class="card mt">
    <h3>${icon("shield", 17)} ${t("raise_levy")}</h3>
    <p class="muted">${t("levy_hint")}</p>
    <div class="formrow">
      <label class="field"><span>${t("reason")}</span><input type="text" id="levyReason" placeholder=""></label>
      <label class="field"><span>${t("amount_per")}</span><input type="number" id="levyAmount" placeholder="5000"></label>
    </div>
    <button class="btn warn" onclick="App.addLevy()">${t("launch_levy")}</button>
  </div>
  <div class="card">
    <h3>${icon("heart", 17)} ${t("payout_from")}</h3>
    <div class="formrow">
      <label class="field"><span>${t("beneficiary")}</span>
        <select id="tpMember">${activeMembers(g).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select>
      </label>
      <label class="field"><span>${t("amount")}</span><input type="number" id="tpAmount" placeholder="150000"></label>
      <label class="field"><span>${t("reason")}</span><input type="text" id="tpReason" placeholder=""></label>
    </div>
    <button class="btn gold" onclick="App.troublePayout()">${t("record_payout")}</button>
  </div>`;

  if (!sel) return html + `<div class="card"><p class="muted">${t("no_levies")}</p></div>`;

  html += `<div class="card"><h3>${icon("shield", 17)} ${t("levy")}</h3>
    <select onchange="App.selectLevy(this.value)">` +
    levies.map(l => `<option value="${l.id}" ${l.id === sel.id ? "selected" : ""}>${l.date} — ${esc(l.reason)} (${fmt(l.amount)}/${t("per_member")})</option>`).join("") +
    `</select></div>`;

  const members = activeMembers(g);
  const paidCount = members.filter(m => levyPaid(g, sel.id, m.id) >= sel.amount).length;
  const collected = g.transactions
    .filter(tx => tx.levyId === sel.id && (tx.type === "levy-payment" || tx.type === "reversal-levy"))
    .reduce((s, tx) => s + tx.amount, 0);

  const rows = members.map(m => {
    const paid = levyPaid(g, sel.id, m.id);
    const done = paid >= sel.amount;
    return `
    <tr class="${done ? "paid" : ""}" data-search="${esc(m.name.toLowerCase())}">
      <td>${esc(m.name)}</td>
      <td>${done ? `<span class="pill green">${t("paid")}</span>` : `<span class="pill red">${t("owing")}</span>`}</td>
      <td class="right row-actions">
        ${done
          ? `<button class="btn small blue" onclick="App.levyReceiptFor('${sel.id}','${m.id}')">${icon("receipt", 13)} ${t("receipt")}</button>`
          : `<button class="btn small" onclick="App.payLevy('${sel.id}','${m.id}','cash')">${t("cash")}</button>
             <button class="btn small gold" onclick="App.payLevy('${sel.id}','${m.id}','MoMo/OM')">${t("momo")}</button>`}
      </td>
    </tr>`;
  }).join("");

  html += `
  <div class="card">
    <h3>${icon("candle", 17)} ${esc(sel.reason)} — ${fmt(sel.amount)} ${t("per_member")}</h3>
    <p class="muted">${t("collected")}: <b>${fmt(collected)}</b> · ${paidCount}/${members.length}</p>
    ${searchBox(t("search_member"))}
    <div class="scrollwrap">
      <table><thead><tr><th>${t("member")}</th><th>${t("status")}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>`;
  return html;
}

/* ----- ledger ----- */

function viewLedger(g) {
  const txs = g.transactions.slice().reverse();
  const rows = txs.map(tx => `
    <tr data-search="${esc(memberName(g, tx.memberId).toLowerCase())} ${esc(txLabel(tx).toLowerCase())}">
      <td>${tx.date}</td>
      <td>${esc(memberName(g, tx.memberId))}</td>
      <td>${esc(txLabel(tx))}</td>
      <td>${esc(tx.method || "")}</td>
      <td>${esc(tx.note || "")}</td>
      <td class="num">${fmt(tx.amount)}</td>
    </tr>`).join("");
  return `
  <div class="card">
    <h3>${icon("book", 17)} ${t("full_ledger")} (${txs.length} ${t("entries")})</h3>
    <p class="muted">${t("ledger_hint")}</p>
    <div class="row-actions" style="justify-content:flex-start;margin-bottom:12px">
      <button class="btn ghost small" onclick="App.exportCSV()">${icon("download", 13)} ${t("export_csv")}</button>
    </div>
    ${searchBox(t("filter_ledger"))}
    <div class="scrollwrap">
      <table><thead><tr><th>${t("date")}</th><th>${t("member")}</th><th>${t("type")}</th><th>${t("method")}</th><th>${t("note")}</th><th class="num">${t("amount")}</th></tr></thead>
      <tbody>${rows || ""}</tbody></table>
    </div>
  </div>`;
}

/* ----- plan / billing ----- */

function planCard(g, key) {
  const p = PLANS[key];
  const ps = planStatus(g);
  const isCurrent = g.plan === key && (key === "start" ? true : ps.status === "active");
  const featList = {
    start: ["feat_core_ledger", "feat_upto15", "feat_one_house", "feat_trouble"],
    standard: ["feat_unlimited", "feat_trouble", "feat_reports", "feat_priority"],
    elite: ["feat_unlimited", "feat_multi", "feat_advanced", "feat_priority", "feat_elite_badge"],
  }[key];
  const price = p.price === 0 ? t("free") : fmt(p.price) + " " + t("per_year");
  const suggested = key === "elite" && suggestElite(g) && g.plan !== "elite";
  let btn;
  if (isCurrent) btn = `<div class="plan-current">${icon("check", 15)} ${t("current")}</div>`;
  else if (key === "start") btn = `<button class="btn ghost" onclick="App.switchPlan('start')">${t("switch_to")}</button>`;
  else btn = `<button class="btn ${key === "elite" ? "gold" : ""}" onclick="App.startPay('${key}')">${icon(key === "elite" ? "crown" : "coins", 15)} ${t("upgrade")}</button>`;

  return `
  <div class="plan-card ${key} ${isCurrent ? "is-current" : ""} ${suggested ? "is-suggested" : ""}">
    ${suggested ? `<div class="sug-tag">${icon("spark", 12)} ${t("suggested")}</div>` : ""}
    <div class="plan-head">
      <div class="plan-name">${icon(key === "elite" ? "crown" : key === "standard" ? "check" : "spark", 18)} ${t("plan_" + key)}</div>
      <div class="plan-tag">${t("plan_" + key + "_tag")}</div>
    </div>
    <div class="plan-price">${price}</div>
    <ul class="plan-feats">${featList.map(f => `<li>${icon("check", 14)} ${t(f)}</li>`).join("")}</ul>
    ${suggested ? `<p class="muted" style="font-size:12px">${t("suggested_why")}</p>` : ""}
    ${btn}
  </div>`;
}

function viewPlan(g) {
  const ps = planStatus(g);
  const statusKey = ps.status === "active" ? "plan_status_active" : ps.status === "lapsed" ? "plan_status_lapsed" : "plan_status_free";
  const statusClass = ps.status === "active" ? "green" : ps.status === "lapsed" ? "red" : "grey";
  return `
  <div class="card plan-status-card">
    <div>
      <div class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">${t("your_plan")}</div>
      <div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:var(--forest);margin:2px 0">
        ${g.plan === "elite" ? icon("crown", 22) : ""} ${t("plan_" + (g.plan || "start"))}
      </div>
      <span class="pill ${statusClass}">${t(statusKey)}</span>
      ${ps.validUntil ? `<span class="muted" style="margin-left:8px">${t("plan_renews")} ${fmtDate(ps.validUntil)}${ps.daysLeft != null && ps.daysLeft > 0 ? " · " + ps.daysLeft + "d" : ""}</span>` : ""}
    </div>
    <div class="row-actions">
      ${ps.status !== "active" || g.plan === "start"
        ? `<button class="btn ghost small" onclick="App.renewFree()">${icon("check", 14)} ${t("renew_free_btn")}</button>` : ""}
    </div>
  </div>
  <p class="muted" style="margin:0 0 16px;padding:0 4px">${icon("spark", 14)} ${t("plan_pay_at_shareout")}</p>
  <div class="plan-grid">
    ${planCard(g, "start")}
    ${planCard(g, "standard")}
    ${planCard(g, "elite")}
  </div>`;
}

/* ----- settings ----- */

function viewSettings(g) {
  const order = g.rotation.map(id => member(g, id)).filter(m => m && m.active);
  const orderRows = order.map((m, i) => `
    <tr class="${i === (g.rotationIndex % (order.length || 1)) ? "paid" : ""}">
      <td>${i + 1}</td><td>${esc(m.name)}</td>
      <td class="right row-actions">
        <button class="btn small ghost" ${i === 0 ? "disabled" : ""} onclick="App.moveRotation('${m.id}',-1)">↑</button>
        <button class="btn small ghost" ${i === order.length - 1 ? "disabled" : ""} onclick="App.moveRotation('${m.id}',1)">↓</button>
      </td>
    </tr>`).join("");

  const typePicker = Object.keys(TYPES).map(key => `
    <div class="pick-card ${g.type === key ? "sel" : ""}" onclick="App.setGroupType('${key}')">
      ${photo(TYPES[key].img)}<span>${typeLabel(key)}</span>
    </div>`).join("");

  return `
  <div class="card">
    <h3>${icon("gear", 17)} ${t("house_settings")}</h3>
    <div class="formrow">
      <label class="field"><span>${t("house_name")}</span><input type="text" id="gName" value="${esc(g.name)}"></label>
      <label class="field"><span>${t("contribution_per")}</span><input type="number" id="gContribution" value="${g.contribution}"></label>
    </div>
    <div class="formrow">
      <label class="field"><span>${t("frequency")}</span>
        <select id="gFrequency">
          ${[["weekly", "weekly"], ["bi-weekly", "biweekly"], ["monthly", "monthly"]].map(([v, k]) => `<option value="${v}" ${g.frequency === v ? "selected" : ""}>${t(k)}</option>`).join("")}
        </select></label>
      <label class="field"><span>${t("late_fine")}</span><input type="number" id="gFine" value="${g.fineLate || 0}"></label>
    </div>
    <button class="btn" onclick="App.saveSettings()">${t("save_settings")}</button>
  </div>
  <div class="card">
    <h3>${icon("spark", 17)} ${t("kind_house")}</h3>
    <div class="pick-grid">${typePicker}</div>
  </div>
  <div class="card">
    <h3>${icon("dice", 17)} ${t("rotation_order")}</h3>
    <p class="muted">${t("rotation_hint")}</p>
    <button class="btn ghost small" onclick="App.shuffleRotation()">${icon("dice", 14)} ${t("ballot_draw")}</button>
    <div class="scrollwrap mt">
      <table><thead><tr><th>#</th><th>${t("member")}</th><th></th></tr></thead><tbody>${orderRows}</tbody></table>
    </div>
  </div>
  <div class="card">
    <h3>${icon("download", 17)} ${t("data")}</h3>
    <div class="row-actions" style="justify-content:flex-start">
      <button class="btn ghost" onclick="App.exportGroup()">${t("export_house")}</button>
      <button class="btn warn" onclick="App.deleteGroup()">${t("delete_house")}</button>
    </div>
    <p class="muted mt">${t("data_hint")}</p>
  </div>`;
}

/* ---------- modal ---------- */

function openModal(html) {
  document.getElementById("modalBox").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
}

/* ============================================================
 * App actions
 * ============================================================ */

const App = {

  tab(t) { ui.tab = t; render(); },
  goHome() { render(); },
  selectGroup(id) { state.activeGroupId = id; ui = { tab: "dashboard", sittingId: null, levyId: null, newType: ui.newType }; save(); render(); },
  selectSitting(id) { ui.sittingId = id; render(); },
  selectLevy(id) { ui.levyId = id; render(); },
  setLang(l) { state.lang = l; save(); render(); },
  closeModal() { document.getElementById("modalOverlay").classList.add("hidden"); },

  filterRows(input) {
    const q = input.value.trim().toLowerCase();
    const card = input.closest(".card");
    card.querySelectorAll("tbody tr").forEach(tr => {
      const hay = tr.getAttribute("data-search") || "";
      tr.style.display = !q || hay.includes(q) ? "" : "none";
    });
  },

  /* group lifecycle */
  showNewGroup(presetType) {
    ui.newType = presetType || ui.newType || "family";
    const typeCards = Object.keys(TYPES).map(key => `
      <div class="pick-card ${ui.newType === key ? "sel" : ""}" data-type="${key}" onclick="App.pickType(this)">
        ${photo(TYPES[key].img)}<span>${typeLabel(key)}</span>
      </div>`).join("");
    openModal(`
      <h3>${t("new_house")}</h3>
      <p class="muted" style="margin-top:-8px">${t("what_kind")}</p>
      <div class="pick-grid">${typeCards}</div>
      <label class="field"><span>${t("house_name")}</span><input type="text" id="ngName" placeholder="e.g. Mankon Family Njangi"></label>
      <div class="formrow">
        <label class="field"><span>${t("contribution_fcfa")}</span><input type="number" id="ngContribution" value="5000"></label>
        <label class="field"><span>${t("frequency")}</span>
          <select id="ngFrequency"><option value="weekly">${t("weekly")}</option><option value="bi-weekly">${t("biweekly")}</option><option value="monthly" selected>${t("monthly")}</option></select>
        </label>
      </div>
      <label class="field"><span>${t("late_fine_fcfa")}</span><input type="number" id="ngFine" value="500"></label>
      <button class="btn" onclick="App.createGroup()">${t("create_house_btn")}</button>`);
  },

  pickType(el) {
    ui.newType = el.getAttribute("data-type");
    el.parentElement.querySelectorAll(".pick-card").forEach(c => c.classList.remove("sel"));
    el.classList.add("sel");
  },

  createGroup() {
    const name = document.getElementById("ngName").value.trim();
    if (!name) return alert(t("give_name"));
    const g = {
      id: uid(), name, type: ui.newType || "family",
      contribution: Number(document.getElementById("ngContribution").value) || 0,
      frequency: document.getElementById("ngFrequency").value,
      fineLate: Number(document.getElementById("ngFine").value) || 0,
      rotationMode: "fixed", rotationIndex: 0,
      members: [], rotation: [], sittings: [], levies: [], transactions: [],
      plan: "start",
      validUntil: new Date(Date.now() + YEAR_MS).toISOString(), // free year from creation
      subHistory: [],
    };
    state.groups.push(g);
    state.activeGroupId = g.id;
    ui.tab = "members"; ui.sittingId = null; ui.levyId = null;
    save(); this.closeModal(); render();
  },

  setGroupType(key) { const g = activeGroup(); g.type = key; save(); render(); },

  saveSettings() {
    const g = activeGroup();
    g.name = document.getElementById("gName").value.trim() || g.name;
    g.contribution = Number(document.getElementById("gContribution").value) || g.contribution;
    g.frequency = document.getElementById("gFrequency").value;
    g.fineLate = Number(document.getElementById("gFine").value) || 0;
    save(); render();
  },

  deleteGroup() {
    const g = activeGroup();
    if (!confirm(`Delete "${g.name}"? Export a backup first!`)) return;
    state.groups = state.groups.filter(x => x.id !== g.id);
    state.activeGroupId = state.groups.length ? state.groups[0].id : null;
    save(); render();
  },

  /* members (with free-tier member cap) */
  addMember() {
    const g = activeGroup();
    const name = document.getElementById("mName").value.trim();
    if (!name) return alert(t("enter_name"));
    const ps = planStatus(g);
    if (!ps.effective.premium && activeMembers(g).length >= ps.effective.maxMembers) {
      return this.showPaywall("members");
    }
    const m = { id: uid(), name, phone: document.getElementById("mPhone").value.trim(), active: true };
    g.members.push(m); g.rotation.push(m.id);
    save(); render();
  },

  bulkAddMembers() {
    const g = activeGroup();
    const lines = document.getElementById("mBulk").value.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return alert(t("paste_line"));
    const ps = planStatus(g);
    const cap = ps.effective.maxMembers;
    let added = 0, blocked = false;
    for (const line of lines) {
      if (!ps.effective.premium && activeMembers(g).length >= cap) { blocked = true; break; }
      const [name, phone] = line.split(",").map(s => (s || "").trim());
      if (!name) continue;
      const m = { id: uid(), name, phone: phone || "", active: true };
      g.members.push(m); g.rotation.push(m.id); added++;
    }
    save(); render();
    if (blocked) this.showPaywall("members");
  },

  toggleMember(id) {
    const g = activeGroup();
    const m = member(g, id);
    if (!m.active) { // reactivating counts against the cap
      const ps = planStatus(g);
      if (!ps.effective.premium && activeMembers(g).length >= ps.effective.maxMembers) return this.showPaywall("members");
    }
    m.active = !m.active; save(); render();
  },

  /* sittings & contributions */
  addSitting() {
    const g = activeGroup();
    const s = { id: uid(), date: document.getElementById("sitDate").value || todayISO(),
      label: document.getElementById("sitLabel").value.trim(), closed: false, disbursedTo: null };
    g.sittings.push(s); ui.sittingId = s.id; save(); render();
  },

  pay(sittingId, memberId, method) {
    const g = activeGroup();
    const remaining = g.contribution - paidForSitting(g, sittingId, memberId);
    if (remaining <= 0) return;
    addTx(g, { type: "contribution", memberId, sittingId, amount: remaining, method });
    render();
  },

  payAllUnpaid(sittingId, method) {
    const g = activeGroup();
    const unpaid = activeMembers(g).filter(m => paidForSitting(g, sittingId, m.id) < g.contribution);
    if (!unpaid.length) return alert(t("everyone_paid"));
    if (!confirm(`Mark ${unpaid.length} members as paid (${method})?`)) return;
    for (const m of unpaid) addTx(g, { type: "contribution", memberId: m.id, sittingId, amount: g.contribution - paidForSitting(g, sittingId, m.id), method });
    render();
  },

  reverse(sittingId, memberId) {
    const g = activeGroup();
    const paid = paidForSitting(g, sittingId, memberId);
    if (paid <= 0) return;
    if (!confirm(`Reverse ${fmt(paid)} for ${memberName(g, memberId)}? A correction entry will be added.`)) return;
    addTx(g, { type: "reversal-contribution", memberId, sittingId, amount: -paid, note: "Correction" });
    render();
  },

  fineUnpaid(sittingId) {
    const g = activeGroup();
    if (!g.fineLate) return alert(t("set_fine_first"));
    const unpaid = activeMembers(g).filter(m => paidForSitting(g, sittingId, m.id) < g.contribution);
    if (!unpaid.length) return alert(t("nobody_fine"));
    if (!confirm(`Record a ${fmt(g.fineLate)} fine for ${unpaid.length} members?`)) return;
    for (const m of unpaid) addTx(g, { type: "fine", memberId: m.id, sittingId, amount: g.fineLate, method: "cash", note: "Late fine" });
    render();
  },

  disburse(sittingId) {
    const g = activeGroup();
    const ben = currentBeneficiary(g);
    if (!ben) return;
    const pot = sittingTotal(g, sittingId);
    if (!confirm(`Pay the pot of ${fmt(pot)} to ${ben.name} and close this sitting?`)) return;
    addTx(g, { type: "payout", memberId: ben.id, sittingId, amount: -pot, method: "MoMo/OM or cash", note: "Pot disbursement" });
    const s = g.sittings.find(x => x.id === sittingId);
    s.closed = true; s.disbursedTo = ben.id; g.rotationIndex += 1;
    save(); render();
  },

  closeSittingOnly(sittingId) {
    const g = activeGroup();
    g.sittings.find(x => x.id === sittingId).closed = true;
    save(); render();
  },

  /* trouble fund */
  addLevy() {
    const g = activeGroup();
    const reason = document.getElementById("levyReason").value.trim();
    const amount = Number(document.getElementById("levyAmount").value);
    if (!reason || !amount) return alert(t("enter_reason_amount"));
    const l = { id: uid(), date: todayISO(), reason, amount };
    g.levies.push(l); ui.levyId = l.id; save(); render();
  },

  payLevy(levyId, memberId, method) {
    const g = activeGroup();
    const l = g.levies.find(x => x.id === levyId);
    const remaining = l.amount - levyPaid(g, levyId, memberId);
    if (remaining <= 0) return;
    addTx(g, { type: "levy-payment", memberId, levyId, amount: remaining, method, note: l.reason });
    render();
  },

  troublePayout() {
    const g = activeGroup();
    const memberId = document.getElementById("tpMember").value;
    const amount = Number(document.getElementById("tpAmount").value);
    const reason = document.getElementById("tpReason").value.trim();
    if (!amount) return alert(t("enter_amount"));
    const bal = troubleBalance(g);
    if (amount > bal && !confirm(`Payout ${fmt(amount)} is more than the fund balance (${fmt(bal)}). Record anyway?`)) return;
    addTx(g, { type: "trouble-payout", memberId, amount: -amount, note: reason || "Trouble fund benefit" });
    render();
  },

  /* receipts */
  receiptFor(sittingId, memberId) {
    const g = activeGroup();
    const tx = g.transactions.slice().reverse().find(t => t.sittingId === sittingId && t.memberId === memberId && t.type === "contribution");
    if (tx) this.showReceipt(receiptText(g, tx));
  },
  levyReceiptFor(levyId, memberId) {
    const g = activeGroup();
    const tx = g.transactions.slice().reverse().find(t => t.levyId === levyId && t.memberId === memberId && t.type === "levy-payment");
    if (tx) this.showReceipt(receiptText(g, tx));
  },
  showReceipt(text) {
    openModal(`
      <h3>${t("receipt")}</h3>
      <pre class="receipt" id="receiptText">${esc(text)}</pre>
      <div class="row-actions" style="justify-content:flex-start">
        <button class="btn" onclick="App.copyReceipt()">${t("copy_whatsapp")}</button>
        <button class="btn ghost" onclick="App.closeModal()">${t("close")}</button>
      </div>`);
  },
  copyReceipt() {
    const text = document.getElementById("receiptText").innerText;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => alert(t("copied"))).catch(() => prompt(t("copy_whatsapp"), text));
  },

  /* rotation */
  shuffleRotation() {
    const g = activeGroup();
    if (!confirm(t("ballot_draw") + "?")) return;
    for (let i = g.rotation.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [g.rotation[i], g.rotation[j]] = [g.rotation[j], g.rotation[i]];
    }
    g.rotationIndex = 0; save(); render();
  },
  moveRotation(memberId, dir) {
    const g = activeGroup();
    const i = g.rotation.indexOf(memberId), j = i + dir;
    if (i < 0 || j < 0 || j >= g.rotation.length) return;
    [g.rotation[i], g.rotation[j]] = [g.rotation[j], g.rotation[i]];
    save(); render();
  },

  /* ---------- billing ---------- */

  switchPlan(key) {
    const g = activeGroup();
    g.plan = key;
    if (key === "start") g.validUntil = new Date(Date.now() + YEAR_MS).toISOString();
    save(); render();
  },

  renewFree() {
    const g = activeGroup();
    if (g.plan !== "start") g.plan = "start"; // free renewal lands on Start
    g.validUntil = new Date(Date.now() + YEAR_MS).toISOString();
    save(); render();
    alert(t("renewed_free"));
  },

  startPay(key) {
    const p = PLANS[key];
    openModal(`
      <h3>${icon(key === "elite" ? "crown" : "coins", 20)} ${t("pay_title")} ${t("plan_" + key)}</h3>
      <div class="pay-amount">${fmt(p.price)} <span>${t("per_year")}</span></div>
      <label class="field"><span>${t("pay_to")}</span>
        <input type="text" value="${KOLA_MOMO}" readonly style="font-weight:700;letter-spacing:.04em">
      </label>
      <p class="muted" style="font-size:13px">${t("pay_steps")}</p>
      <label class="field"><span>${t("tx_id")}</span><input type="text" id="payRef" placeholder="e.g. PP24XXXXXX"></label>
      <div class="row-actions" style="justify-content:flex-start">
        <button class="btn ${key === "elite" ? "gold" : ""}" onclick="App.confirmPay('${key}')">${icon("check", 15)} ${t("activate")}</button>
        <button class="btn ghost" onclick="App.closeModal()">${t("close")}</button>
      </div>`);
  },

  confirmPay(key) {
    const g = activeGroup();
    const p = PLANS[key];
    const ref = (document.getElementById("payRef").value || "").trim();
    g.plan = key;
    g.validUntil = new Date(Date.now() + YEAR_MS).toISOString();
    g.subHistory = g.subHistory || [];
    g.subHistory.push({ date: todayISO(), plan: key, amount: p.price, ref, method: "MoMo/OM" });
    // record on the ledger too, for transparency
    save(); this.closeModal(); render();
    alert(t("pay_recorded"));
  },

  showPaywall(kind) {
    const g = activeGroup();
    const msg = kind === "members" ? t("limit_members") : t("locked_msg");
    openModal(`
      <h3>${icon("lock", 20)} ${t("locked_feature")}</h3>
      <p>${msg}</p>
      <div class="plan-grid two">
        ${planCard(g, "standard")}
        ${planCard(g, "elite")}
      </div>
      <button class="btn ghost mt" onclick="App.closeModal()">${t("later")}</button>`);
  },

  /* import / export */
  exportAll() { downloadJSON(state, "kola-backup-" + todayISO() + ".json"); },
  exportGroup() { const g = activeGroup(); downloadJSON(g, "kola-" + g.name.replace(/\W+/g, "-").toLowerCase() + "-" + todayISO() + ".json"); },

  importAll(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.groups) {
          if (!confirm("Replace ALL data on this phone with the backup?")) return;
          state = data;
        } else if (data.id && data.members) {
          state.groups.push(data); state.activeGroupId = data.id;
        } else throw new Error("unrecognized");
        save(); render();
      } catch (e) { alert("That file is not a valid Kola backup."); }
      input.value = "";
    };
    reader.readAsText(file);
  },

  exportCSV() {
    const g = activeGroup();
    const head = "date,member,type,method,note,amount\n";
    const body = g.transactions.map(tx => [tx.date, csv(memberName(g, tx.memberId)), tx.type, csv(tx.method), csv(tx.note), tx.amount].join(",")).join("\n");
    triggerDownload(new Blob([head + body], { type: "text/csv" }), "kola-ledger-" + todayISO() + ".csv");
  },
};

function csv(s) { s = String(s == null ? "" : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function downloadJSON(obj, filename) { triggerDownload(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), filename); }
function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

window.App = App;
render();
