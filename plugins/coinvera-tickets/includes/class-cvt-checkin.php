<?php
if (!defined('ABSPATH')) exit;

/** Contrôle d'entrée : API REST (cookie + nonce + capacité) et interface mobile. */
final class CVT_Checkin {
  public static function init() {
    add_filter('user_has_cap', function ($caps, $req, $args, $user) { if (!empty($caps['edit_others_posts'])) $caps['cvt_checkin'] = true; return $caps; }, 10, 4);   // éditeurs et administrateurs par défaut
    add_action('rest_api_init', function () {
      register_rest_route('cvt/v1', '/checkin', ['methods' => 'POST', 'permission_callback' => [__CLASS__, 'can'], 'callback' => [__CLASS__, 'scan']]);
    });
    add_action('wp_enqueue_scripts', function () { wp_register_script('cvt-checkin', CVT_URL . 'assets/cvt-checkin.js', [], CVT_VERSION, true); wp_register_style('cvt', CVT_URL . 'assets/cvt.css', [], CVT_VERSION); });
    add_action('admin_enqueue_scripts', function () { wp_register_script('cvt-checkin', CVT_URL . 'assets/cvt-checkin.js', [], CVT_VERSION, true); wp_register_style('cvt', CVT_URL . 'assets/cvt.css', [], CVT_VERSION); });
    add_shortcode('coinvera_checkin', [__CLASS__, 'shortcode']);
  }
  public static function can() { return is_user_logged_in() && current_user_can(apply_filters('cvt_checkin_capability', 'cvt_checkin')); }

  public static function scan(WP_REST_Request $req) {
    $uid = get_current_user_id(); $p = $req->get_json_params(); if (!is_array($p)) $p = [];
    if (!CVT_Util::hit('ck:' . $uid, 120, MINUTE_IN_SECONDS)) return new WP_REST_Response(['result' => 'rate'], 429);
    $eid = isset($p['event']) && is_scalar($p['event']) ? (int) $p['event'] : 0; if (!CVT_Events::get($eid)) return new WP_REST_Response(['result' => 'bad_event'], 400);
    $code = CVT_Codes::parse(isset($p['code']) && is_scalar($p['code']) ? (string) $p['code'] : '');
    if ($code === '') return new WP_REST_Response(['result' => 'invalid'], 200);   // format ou contrôle faux : rejeté avant toute requête SQL
    $t = CVT_DB::ticket_by_code($code); if (!$t) return new WP_REST_Response(['result' => 'unknown'], 200);
    if ((int) $t->event_id !== $eid) return new WP_REST_Response(['result' => 'other_event'], 200);
    $out = function ($r, $t) use ($eid) { $s = CVT_DB::stats($eid); return new WP_REST_Response(['result' => $r, 'type' => $t ? $t->type_name : '', 'holder' => $t ? $t->holder_name : '', 'used' => $s['used'], 'sold' => $s['sold']], 200); };
    if ($t->status === 'void') return $out('void', $t);
    if (CVT_DB::mark_used($code, $eid, $uid)) return $out('ok', $t);
    $t = CVT_DB::ticket_by_code($code);   // pas de ligne modifiée : déjà utilisé (ou annulé entre-temps)
    if ($t && $t->status === 'used') { $u = $t->used_by ? get_userdata((int) $t->used_by) : null; $r = $out('used', $t); $r->data['at'] = CVT_Util::datetime($t->used_at); $r->data['by'] = $u ? $u->display_name : ''; return $r; }
    return $out($t && $t->status === 'void' ? 'void' : 'unknown', $t);
  }

  public static function ui($event_id) {
    wp_enqueue_style('cvt'); wp_enqueue_script('cvt-checkin');
    wp_localize_script('cvt-checkin', 'CVTC', ['url' => esc_url_raw(rest_url('cvt/v1/checkin')), 'nonce' => wp_create_nonce('wp_rest')]);
    $s = CVT_DB::stats((int) $event_id);
    return '<div class="cvt-checkin" data-event="' . (int) $event_id . '"><p class="cvt-count"><strong class="cvt-used">' . (int) $s['used'] . '</strong> contrôlés / <strong class="cvt-sold">' . (int) $s['sold'] . '</strong> vendus</p>'
      . '<form class="cvt-ck-form"><input type="text" class="cvt-code" inputmode="text" autocomplete="off" autocapitalize="characters" placeholder="Code du billet" maxlength="40"> <button type="submit" class="cvt-btn">Valider</button> <button type="button" class="cvt-btn cvt-scan" hidden>Scanner</button></form>'
      . '<video class="cvt-video" playsinline muted hidden></video><div class="cvt-result" role="status" aria-live="assertive"></div></div>';
  }
  public static function shortcode($a) {
    if (!self::can()) return '<p>Accès réservé à l’équipe de contrôle.</p>';
    $a = shortcode_atts(['event' => 0], $a, 'coinvera_checkin'); if (!CVT_Events::get((int) $a['event'])) return '<p>Événement introuvable.</p>';
    return self::ui((int) $a['event']);
  }
}
