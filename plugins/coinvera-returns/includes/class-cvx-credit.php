<?php
if (!defined('ABSPATH')) exit;

final class CVX_Credit {
  /** Montant total des lignes sélectionnées, d'après ce qui a réellement été payé (prix de la commande, pas le prix actuel du produit). */
  public static function items_total(WC_Order $order, array $items) {
    $total = 0.0;
    foreach ($order->get_items() as $item_id => $item) {
      if (!isset($items[$item_id])) continue;
      $qty = min((int) $items[$item_id], (int) $item->get_quantity()); if ($qty <= 0) continue;
      $unit = ((float) $item->get_total() + (float) $item->get_total_tax()) / max(1, (int) $item->get_quantity());
      $total += $unit * $qty;
    }
    return round($total, 2);
  }

  /** Génère un bon d'achat (coupon WooCommerce, usage unique, réservé au client) pour le montant demandé, bonus inclus. */
  public static function issue_credit(WC_Order $order, float $amount) {
    $amount = round($amount * (1 + CVX_Settings::bonus_pct() / 100), 2);
    $code = 'AVOIR-' . strtoupper(substr(md5($order->get_id() . '-' . wp_generate_password(8, false)), 0, 8));
    $coupon = new WC_Coupon();
    $coupon->set_code($code);
    $coupon->set_discount_type('fixed_cart');
    $coupon->set_amount($amount);
    $coupon->set_individual_use(true);
    $coupon->set_usage_limit(1);
    $coupon->set_email_restrictions([$order->get_billing_email()]);
    $coupon->set_date_expires(time() + CVX_Settings::credit_expiry_seconds());
    $coupon->set_description('Avoir Coinvera Returns — commande #' . $order->get_order_number());
    $coupon->save();
    return ['code' => $code, 'amount' => $amount];
  }

  /** Révoque un bon d'achat non utilisé (ex. demande annulée par erreur). Ne touche pas aux coupons déjà consommés. */
  public static function revoke_credit($code) {
    $id = wc_get_coupon_id_by_code($code); if (!$id) return false;
    $coupon = new WC_Coupon($id); if ($coupon->get_usage_count() > 0) return false;
    wp_delete_post($id, true); return true;
  }

  /** Enregistre un remboursement sur la commande (écriture comptable + remise en stock) sans jamais appeler l'API d'un
   *  moyen de paiement : Coinvera Returns fonctionne avec n'importe quelle passerelle, et ne peut donc pas savoir
   *  comment lui demander de rendre l'argent. Le marchand reste responsable du mouvement d'argent réel si celui-ci
   *  n'est pas déjà géré par sa passerelle. */
  public static function record_refund(WC_Order $order, float $amount, $reason) {
    return wc_create_refund(['amount' => $amount, 'reason' => CVX_Util::one_line($reason), 'order_id' => $order->get_id(), 'restock_items' => true]);
  }
}
