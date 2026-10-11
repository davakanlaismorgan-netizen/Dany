import { formatXof, PREMIUM_PRICE_XOF } from '@/lib/plans';

// Version des textes : enregistrée avec l'acceptation des CGU à l'inscription (profiles.terms_version).
export const LEGAL_VERSION = '2026-10';

export type LegalSlug = 'terms' | 'privacy' | 'notice';
export const LEGAL_SLUGS: LegalSlug[] = ['terms', 'privacy', 'notice'];
export const isLegalSlug = (v: unknown): v is LegalSlug => LEGAL_SLUGS.includes(v as LegalSlug);

export interface LegalSection { heading: string; paragraphs: string[] }
export interface LegalDoc { title: string; sections: LegalSection[] }
export interface LegalContext {
  company: string;
  address: string | null;
  registration: string | null;
  email: string | null;
}

// Textes de travail rédigés d'après le fonctionnement réel du service. Ils doivent être relus
// par un juriste avant publication (la page affiche « version provisoire » jusqu'à validation).
export function getLegalDoc(slug: LegalSlug, lang: 'fr' | 'en', c: LegalContext): LegalDoc {
  const price = formatXof(PREMIUM_PRICE_XOF, lang);
  const fr = lang === 'fr';
  const contact = c.email ?? (fr ? "l'adresse de contact de l'éditeur" : "the publisher's contact address");

  if (slug === 'terms') {
    return fr ? {
      title: "Conditions générales d'utilisation",
      sections: [
        { heading: '1. Objet', paragraphs: [
          `DAS est une plateforme en ligne de data science (projets, jeux de données, visualisations, etc.) éditée par ${c.company}. En créant un compte ou en utilisant le service, vous acceptez les présentes conditions.`] },
        { heading: '2. Compte', paragraphs: [
          "Vous vous engagez à fournir des informations exactes, à garder votre mot de passe confidentiel et à nous signaler tout usage non autorisé de votre compte. Vous êtes responsable de l'activité réalisée depuis votre compte."] },
        { heading: '3. Offres et limites', paragraphs: [
          "Le plan Gratuit comprend jusqu'à 3 projets, 5 visualisations et des jeux de données de 10 000 lignes maximum.",
          `Le plan Premium (${price} par mois) lève ces limites. Le plan Entreprise est proposé sur devis. Les prix applicables sont ceux affichés au moment du paiement.`] },
        { heading: '4. Paiement', paragraphs: [
          "Le paiement s'effectue par mobile money ou carte bancaire via le prestataire KKiaPay. Chaque paiement donne accès au plan Premium pour un mois ; il n'y a ni abonnement ni renouvellement automatique : vous renouvelez quand vous le souhaitez.",
          "À l'échéance, votre compte repasse au plan Gratuit. Vos données sont conservées ; seules les limites du plan Gratuit s'appliquent de nouveau aux nouvelles créations. Nous ne recevons ni ne conservons vos numéros de carte ou de mobile money."] },
        { heading: '5. Remboursement', paragraphs: [
          `Les paiements ne sont pas remboursables, sauf erreur de facturation ou défaillance du service imputable à l'éditeur. Toute demande est examinée au cas par cas en écrivant à ${contact}.`] },
        { heading: '6. Fonctionnalités en démonstration', paragraphs: [
          "Certaines fonctionnalités (assistant IA, AutoML, pipelines, rapports, marketplace, équipes) sont proposées en aperçu ou en démonstration. Les résultats qu'elles affichent sont illustratifs : ils ne constituent pas une analyse réelle de vos données et ne doivent pas servir de base à une décision."] },
        { heading: '7. Vos données et contenus', paragraphs: [
          "Vous restez propriétaire des données et fichiers que vous importez. Vous nous accordez uniquement le droit de les héberger et de les traiter pour fournir le service. Vous garantissez avoir le droit d'utiliser ces données et vous vous interdisez d'importer des contenus illicites."] },
        { heading: '8. Usage acceptable', paragraphs: [
          "Il est interdit de perturber le service, de tenter d'accéder aux données d'autres utilisateurs, de contourner les limites des plans, de faire de l'ingénierie inverse ou de revendre l'accès au service."] },
        { heading: '9. Disponibilité et responsabilité', paragraphs: [
          "Le service est fourni « en l'état », sans garantie de disponibilité continue ni de résultat. Dans la mesure permise par la loi applicable, la responsabilité de l'éditeur est limitée aux sommes que vous avez payées au cours des douze derniers mois. Nous vous recommandons de conserver une copie de vos données (un export est disponible dans Paramètres)."] },
        { heading: '10. Suspension et résiliation', paragraphs: [
          "Vous pouvez supprimer votre compte à tout moment depuis Paramètres : vos données et fichiers sont alors effacés. Nous pouvons suspendre un compte en cas de violation des présentes conditions."] },
        { heading: '11. Modification des conditions', paragraphs: [
          "Nous pouvons faire évoluer ces conditions ; la version en vigueur est celle publiée sur cette page. En cas de changement important, nous vous en informerons."] },
        { heading: '12. Droit applicable et contact', paragraphs: [
          `Les présentes conditions sont régies par le droit du pays du siège de l'éditeur, dont les tribunaux sont compétents sous réserve des règles protectrices applicables aux consommateurs. Contact : ${contact}.`] },
      ],
    } : {
      title: 'Terms of Service',
      sections: [
        { heading: '1. Purpose', paragraphs: [
          `DAS is an online data science platform (projects, datasets, visualizations, etc.) published by ${c.company}. By creating an account or using the service, you accept these terms.`] },
        { heading: '2. Account', paragraphs: [
          'You agree to provide accurate information, keep your password confidential and tell us about any unauthorized use of your account. You are responsible for the activity carried out from your account.'] },
        { heading: '3. Plans and limits', paragraphs: [
          'The Free plan includes up to 3 projects, 5 visualizations and datasets of up to 10,000 rows.',
          `The Premium plan (${price} per month) removes these limits. The Enterprise plan is available on quotation. The applicable prices are those displayed at the time of payment.`] },
        { heading: '4. Payment', paragraphs: [
          'Payment is made by mobile money or bank card through the provider KKiaPay. Each payment grants access to Premium for one month; there is no subscription and no automatic renewal: you renew whenever you wish.',
          'When the period ends, your account returns to the Free plan. Your data is kept; only the Free plan limits apply again to new items. We neither receive nor store your card or mobile money numbers.'] },
        { heading: '5. Refunds', paragraphs: [
          `Payments are non-refundable, except in case of a billing error or a service failure attributable to the publisher. Each request is reviewed case by case by writing to ${contact}.`] },
        { heading: '6. Demonstration features', paragraphs: [
          'Some features (AI assistant, AutoML, pipelines, reports, marketplace, teams) are offered as previews or demonstrations. The results they display are illustrative: they are not a real analysis of your data and must not be used as the basis for a decision.'] },
        { heading: '7. Your data and content', paragraphs: [
          'You remain the owner of the data and files you import. You grant us only the right to host and process them to provide the service. You warrant that you have the right to use this data and you agree not to upload unlawful content.'] },
        { heading: '8. Acceptable use', paragraphs: [
          "You must not disrupt the service, attempt to access other users' data, bypass plan limits, reverse engineer the service or resell access to it."] },
        { heading: '9. Availability and liability', paragraphs: [
          'The service is provided "as is", without any guarantee of continuous availability or of results. To the extent permitted by applicable law, the publisher\'s liability is limited to the amounts you paid during the previous twelve months. We recommend keeping a copy of your data (an export is available in Settings).'] },
        { heading: '10. Suspension and termination', paragraphs: [
          'You can delete your account at any time from Settings: your data and files are then erased. We may suspend an account that violates these terms.'] },
        { heading: '11. Changes to the terms', paragraphs: [
          'We may update these terms; the version in force is the one published on this page. We will inform you of any significant change.'] },
        { heading: '12. Governing law and contact', paragraphs: [
          `These terms are governed by the law of the country where the publisher is established, whose courts have jurisdiction, subject to the protective rules applicable to consumers. Contact: ${contact}.`] },
      ],
    };
  }

  if (slug === 'privacy') {
    const address = c.address ? `, ${c.address}` : '';
    return fr ? {
      title: 'Politique de confidentialité',
      sections: [
        { heading: '1. Responsable du traitement', paragraphs: [
          `${c.company}${address}. Contact pour toute question relative à vos données : ${contact}.`] },
        { heading: '2. Données que nous traitons', paragraphs: [
          "Compte : adresse email, nom, société, et, si vous les renseignez, téléphone et pays. Contenu : les projets, jeux de données, visualisations et autres éléments que vous créez ou importez. Paiement : référence de transaction, montant, date et mode de paiement (nous ne recevons ni ne conservons vos numéros de carte ou de mobile money, traités par KKiaPay). Acceptation des conditions : date et version. Techniques : journaux de connexion et adresse IP traités par nos hébergeurs pour assurer la sécurité du service."] },
        { heading: '3. Finalités et bases légales', paragraphs: [
          "Fournir le service et gérer votre compte (exécution du contrat) ; facturer et respecter nos obligations comptables (obligation légale) ; assurer la sécurité et prévenir la fraude (intérêt légitime). Nous n'utilisons pas vos données à des fins publicitaires et nous ne les vendons pas."] },
        { heading: '4. Prestataires (sous-traitants)', paragraphs: [
          "Supabase (base de données, authentification, stockage des fichiers), Vercel (hébergement du site), KKiaPay (paiements) et, lorsqu'ils sont activés, un prestataire d'envoi d'emails et un outil de suivi des erreurs. Ces prestataires n'agissent que sur nos instructions."] },
        { heading: '5. Transferts hors de votre pays', paragraphs: [
          "Certains prestataires peuvent héberger des données en dehors de votre pays. Nous nous assurons qu'ils offrent des garanties appropriées de protection."] },
        { heading: '6. Durées de conservation', paragraphs: [
          "Vos données de compte et vos contenus sont conservés tant que votre compte existe. Lorsque vous supprimez votre compte, elles sont effacées, ainsi que vos fichiers. Les enregistrements de paiement sont conservés pour nos obligations comptables, sans lien avec votre identité."] },
        { heading: '7. Vos droits', paragraphs: [
          `Vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité, d'opposition et de limitation. Dans Paramètres, vous pouvez modifier votre profil, exporter vos données (JSON) et supprimer votre compte. Pour toute autre demande : ${contact}. Vous pouvez aussi saisir l'autorité de protection des données de votre pays.`] },
        { heading: '8. Cookies et stockage local', paragraphs: [
          "Nous n'utilisons ni cookie publicitaire ni outil de mesure d'audience. Le navigateur conserve uniquement votre session de connexion et votre préférence de langue, strictement nécessaires au fonctionnement du service."] },
        { heading: '9. Sécurité', paragraphs: [
          "Les échanges sont chiffrés (HTTPS). Chaque utilisateur n'accède qu'à ses propres données (contrôle d'accès au niveau de la base). Les mots de passe sont gérés par le service d'authentification et ne sont jamais stockés en clair."] },
        { heading: '10. Mineurs', paragraphs: ["Le service s'adresse à des personnes majeures."] },
        { heading: '11. Modifications', paragraphs: ["Cette politique peut évoluer ; la version en vigueur est celle publiée sur cette page."] },
      ],
    } : {
      title: 'Privacy Policy',
      sections: [
        { heading: '1. Data controller', paragraphs: [
          `${c.company}${address}. Contact for any question about your data: ${contact}.`] },
        { heading: '2. Data we process', paragraphs: [
          'Account: email address, name, company and, if you provide them, phone and country. Content: the projects, datasets, visualizations and other items you create or import. Payment: transaction reference, amount, date and payment method (we neither receive nor store your card or mobile money numbers, which are handled by KKiaPay). Terms acceptance: date and version. Technical: connection logs and IP address processed by our hosting providers to keep the service secure.'] },
        { heading: '3. Purposes and legal bases', paragraphs: [
          'To provide the service and manage your account (performance of the contract); to invoice and meet our accounting obligations (legal obligation); to ensure security and prevent fraud (legitimate interest). We do not use your data for advertising and we do not sell it.'] },
        { heading: '4. Service providers (processors)', paragraphs: [
          'Supabase (database, authentication, file storage), Vercel (website hosting), KKiaPay (payments) and, when enabled, an email delivery provider and an error-monitoring tool. These providers act only on our instructions.'] },
        { heading: '5. Transfers outside your country', paragraphs: [
          'Some providers may host data outside your country. We make sure they offer appropriate safeguards.'] },
        { heading: '6. Retention', paragraphs: [
          'Your account data and content are kept as long as your account exists. When you delete your account, they are erased, along with your files. Payment records are kept for our accounting obligations, without any link to your identity.'] },
        { heading: '7. Your rights', paragraphs: [
          `You have the right of access, rectification, erasure, portability, objection and restriction. In Settings you can edit your profile, export your data (JSON) and delete your account. For any other request: ${contact}. You may also lodge a complaint with the data protection authority of your country.`] },
        { heading: '8. Cookies and local storage', paragraphs: [
          'We use no advertising cookies and no analytics tool. Your browser only keeps your login session and your language preference, which are strictly necessary for the service to work.'] },
        { heading: '9. Security', paragraphs: [
          'Exchanges are encrypted (HTTPS). Each user can only access their own data (access control enforced at database level). Passwords are managed by the authentication service and are never stored in clear text.'] },
        { heading: '10. Minors', paragraphs: ['The service is intended for adults.'] },
        { heading: '11. Changes', paragraphs: ['This policy may change; the version in force is the one published on this page.'] },
      ],
    };
  }

  // notice : mentions légales
  const lines = (items: Array<[string, string | null]>) => items.filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`);
  return fr ? {
    title: 'Mentions légales',
    sections: [
      { heading: 'Éditeur du site', paragraphs: lines([['Raison sociale', c.company], ['Adresse', c.address], ['Immatriculation', c.registration], ['Contact', c.email]]) },
      { heading: 'Hébergement', paragraphs: ["Site : Vercel Inc. Données et authentification : Supabase, Inc. (région choisie par l'éditeur)."] },
      { heading: 'Paiements', paragraphs: ["Les paiements sont traités par KKiaPay. L'éditeur ne reçoit ni ne conserve les numéros de carte ou de mobile money."] },
      { heading: 'Propriété intellectuelle', paragraphs: ['Le nom DAS, le logo et les contenus du site sont protégés. Toute reproduction non autorisée est interdite. Les marques citées appartiennent à leurs propriétaires respectifs.'] },
    ],
  } : {
    title: 'Legal notice',
    sections: [
      { heading: 'Publisher', paragraphs: lines([['Company', c.company], ['Address', c.address], ['Registration', c.registration], ['Contact', c.email]]) },
      { heading: 'Hosting', paragraphs: ['Website: Vercel Inc. Data and authentication: Supabase, Inc. (region chosen by the publisher).'] },
      { heading: 'Payments', paragraphs: ['Payments are processed by KKiaPay. The publisher neither receives nor stores card or mobile money numbers.'] },
      { heading: 'Intellectual property', paragraphs: ['The DAS name, the logo and the site content are protected. Any unauthorized reproduction is prohibited. Trademarks mentioned belong to their respective owners.'] },
    ],
  };
}
