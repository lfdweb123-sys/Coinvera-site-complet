<?php
if (!defined('ABSPATH')) exit;

/** Outils RGPD de WordPress (Outils → Exporter / Effacer les données personnelles). */
final class CVG_Privacy {
  public static function init() {
    add_filter('wp_privacy_personal_data_exporters', function ($e) { $e['coinvera-guard'] = ['exporter_friendly_name' => 'Coinvera Guard', 'callback' => [__CLASS__, 'export']]; return $e; });
    add_filter('wp_privacy_personal_data_erasers', function ($e) { $e['coinvera-guard'] = ['eraser_friendly_name' => 'Coinvera Guard', 'callback' => [__CLASS__, 'erase']]; return $e; });
    add_action('admin_init', function () {
      if (function_exists('wp_add_privacy_policy_content'))
        wp_add_privacy_policy_content('Coinvera Guard', wp_kses_post('<p>Coinvera Guard journalise, uniquement en cas de tentative bloquée ou signalée au checkout, l’adresse IP et l’adresse e-mail de facturation saisies, ainsi que le motif de la décision. Ces journaux sont conservés 90 jours maximum et servent exclusivement à la prévention de la fraude (intérêt légitime). Aucune donnée de carte bancaire n’est traitée par ce plugin.</p>'));
    });
  }
  public static function export($email, $page = 1) {
    $items = [];
    foreach (CVG_DB::by_email(sanitize_email($email), (int) $page, 100) as $r) $items[] = ['group_id' => 'cvg-guard', 'group_label' => 'Coinvera Guard', 'item_id' => 'cvg-' . $r->id, 'data' => [
      ['name' => 'Date', 'value' => $r->created_at], ['name' => 'Décision', 'value' => $r->action === 'blocked' ? 'Bloquée' : 'Signalée'], ['name' => 'Motif', 'value' => $r->reason], ['name' => 'IP', 'value' => $r->ip]]];
    return ['data' => $items, 'done' => count($items) < 100];
  }
  /** L'IP et l'e-mail sont effacés, mais la ligne (date, motif, décision) est conservée : c'est un journal de sécurité,
   *  nécessaire pour détecter des schémas d'attaque récurrents, qui ne permet plus d'identifier la personne. */
  public static function erase($email, $page = 1) {
    $n = CVG_DB::erase_email(sanitize_email($email));
    return ['items_removed' => $n > 0, 'items_retained' => false, 'messages' => [], 'done' => true];
  }
}
