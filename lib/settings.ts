import { db } from './firebase-admin';
export const DEFAULTS = { platformFeeBps: 150, processingFeeBps: 150, apiActivationUsd: 50,
  // Retraits par adresse : 'manual' = chaque retrait attend la validation de l'administrateur (Admin > Retraits) ; 'auto' = envoi automatique par Bybit (clé Bybit ou relais requis).
  withdrawalMode: 'manual' as 'manual' | 'auto',
  minWithdrawalUsd: 10, withdrawalFeeTRX: 1.3, withdrawalFeeETH: 5, withdrawalFeeBSC: 1, maxWithdrawalUsd: 5000, freeTrials: 2, maxLicenseActivations: 1, pluginVersion: '0.1.0', chains: { USDT: ['TRX', 'ETH', 'BSC'] } as Record<string, string[]>,
  // Relances WhatsApp (plugin coinvera-reminders) : noms des modèles Meta pré-approuvés, partagés par tous les marchands.
  whatsappCartTemplate: 'cvr_cart_reminder', whatsappStatusTemplate: 'cvr_order_status', whatsappLang: 'fr',
  // Confirmation paiement à la livraison (coinvera-cod) et échéances (coinvera-installments) : messages utilitaires, facturés au tarif « statut ».
  whatsappCodTemplate: 'cvc_cod_confirm', whatsappInstallmentTemplate: 'cvp_installment_due',
  // Prix facturé au marchand par message WhatsApp *délivré* (USD), catégorie « marketing » (relance panier) et
  // « utilitaire » (statut de commande) — à ajuster selon le tarif Meta réel pour vos marchés (Business Manager >
  // WhatsApp Manager > Facturation) plus votre marge : ce sont des valeurs de départ, pas un tarif vérifié.
  whatsappRateCartUsd: 0.07, whatsappRateStatusUsd: 0.02,
  // Numéros WhatsApp / Telegram : activation du service et prix fixe en XOF (converti en USD au taux du jour).
  numbersEnabled: 1, numbersPriceXof: 8500 };
export async function getSettings() {
  // Si Firestore est injoignable (ex. build sans identifiants), on retombe sur les valeurs par defaut.
  try { const s = await db.doc('admin_settings/pricing').get(); return { ...DEFAULTS, ...(s.data() ?? {}) }; }
  catch { return { ...DEFAULTS }; }
}
