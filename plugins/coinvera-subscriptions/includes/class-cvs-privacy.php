<?php
if (!defined('ABSPATH')) exit;

/** Outils RGPD de WordPress. */
final class CVS_Privacy {
  public static function init() {
    add_filter('wp_privacy_personal_data_exporters', function ($e) { $e['coinvera-subscriptions'] = ['exporter_friendly_name' => 'Abonnements Coinvera', 'callback' => [__CLASS__, 'export']]; return $e; });
    add_filter('wp_privacy_personal_data_erasers', function ($e) { $e['coinvera-subscriptions'] = ['eraser_friendly_name' => 'Abonnements Coinvera', 'callback' => [__CLASS__, 'erase']]; return $e; });
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera Subscriptions', wp_kses_post('<p>Lors d’une inscription, nous enregistrons le nom, l’adresse e-mail et l’historique des paiements d’abonnement. Un compte est créé après le premier paiement confirmé. Le paiement par carte est traité par Coinvera : les données de carte ne passent jamais par ce site.</p>'));
    });
  }
  public static function export($email, $page = 1) {
    $items = [];
    foreach (CVS_DB::subs_by_email(sanitize_email($email), (int) $page, 100) as $s) {
      $plan = CVS_Plans::get($s->plan_id); $d = [['name' => 'Plan', 'value' => $plan ? $plan['title'] : '#' . $s->plan_id], ['name' => 'Nom', 'value' => $s->name], ['name' => 'Statut', 'value' => $s->status], ['name' => 'Fin de période', 'value' => (string) $s->period_end]];
      foreach (CVS_DB::charges_of($s->id) as $c) $d[] = ['name' => 'Paiement ' . $c->created_at, 'value' => CVS_Util::money($c->amount_cents) . ' — ' . $c->status];
      $items[] = ['group_id' => 'cvs-subscriptions', 'group_label' => 'Abonnements', 'item_id' => 'cvs-' . $s->id, 'data' => $d];
    }
    return ['data' => $items, 'done' => count($items) < 100];
  }
  public static function erase($email, $page = 1) {
    $n = CVS_DB::anonymize_email(sanitize_email($email));   // montants et dates conservés (obligation comptable)
    return ['items_removed' => $n > 0, 'items_retained' => false, 'messages' => $n ? ['Les données personnelles de ' . $n . ' abonnement(s) ont été effacées et les abonnements actifs résiliés ; montants et dates sont conservés à titre comptable.'] : [], 'done' => true];
  }
}
