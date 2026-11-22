<?php
if (!defined('ABSPATH')) exit;

/** Public : inscription, page de paiement d'une échéance, contenu réservé, espace membre. */
final class CVS_Front {
  const ERRORS = ['bad' => 'Requête refusée.', 'nonce' => 'La page a expiré. Rechargez-la puis réessayez.', 'rate' => 'Trop de tentatives. Réessayez dans quelques minutes.',
    'off' => 'Le paiement en ligne est indisponible pour cette échéance.', 'pay' => 'Le paiement est momentanément indisponible. Réessayez plus tard.'];

  public static function init() {
    add_action('wp_enqueue_scripts', function () {
      wp_register_style('cvs', CVS_URL . 'assets/cvs.css', [], CVS_VERSION);
      wp_register_script('cvs', CVS_URL . 'assets/cvs.js', [], CVS_VERSION, true);
      wp_localize_script('cvs', 'CVS', ['url' => esc_url_raw(rest_url('coinvera-subscriptions/v1/subscribe')), 'i18n' => ['error' => 'Une erreur est survenue. Réessayez.', 'sending' => 'Redirection vers le paiement sécurisé…']]);
    });
    add_shortcode('coinvera_subscribe', [__CLASS__, 'sc_subscribe']);
    add_shortcode('coinvera_members', [__CLASS__, 'sc_members']);
    add_shortcode('coinvera_account', [__CLASS__, 'sc_account']);
    add_filter('query_vars', function ($v) { $v[] = 'cvs_pay'; return $v; });
    add_action('template_redirect', [__CLASS__, 'pay_page']);
    add_action('rest_api_init', function () { register_rest_route('coinvera-subscriptions/v1', '/subscribe', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => [__CLASS__, 'subscribe']]); });   // public volontairement : protégé par origine, honeypot et limites
    add_action('admin_post_nopriv_cvs_pay', [__CLASS__, 'pay']); add_action('admin_post_cvs_pay', [__CLASS__, 'pay']);
    add_action('admin_post_cvs_cancel', [__CLASS__, 'cancel']);
    add_filter('the_content', [__CLASS__, 'gate'], 9);
  }
  private static function enqueue() { wp_enqueue_style('cvs'); wp_enqueue_script('cvs'); }

  // ---------- Inscription ----------
  public static function sc_subscribe($a) {
    $a = shortcode_atts(['plan' => 0], $a, 'coinvera_subscribe'); $plan = CVS_Plans::get((int) $a['plan']);
    if (!$plan) return current_user_can('manage_options') ? '<p><em>Coinvera Abonnements : plan introuvable.</em></p>' : '';
    if ($plan['closed']) return '<div class="cvs-box"><p>Ce plan n’accepte plus de nouvelles inscriptions.</p></div>';
    if (!CVS_Settings::configured() || !CVS_API::licensed()) return '<div class="cvs-box"><p>Les inscriptions sont momentanément indisponibles.</p></div>';
    self::enqueue(); $consent = trim((string) CVS_Settings::get('consent_text')); $u = wp_get_current_user();
    $o = '<div class="cvs-box"><h3>' . esc_html($plan['title']) . '</h3><p class="cvs-price">' . esc_html(CVS_Util::money($plan['price'])) . ' / ' . esc_html(CVS_Util::UNITS[$plan['unit']]) . '</p>';
    if ($plan['desc'] !== '') $o .= '<p>' . esc_html(wp_trim_words($plan['desc'], 60)) . '</p>';
    $o .= '<form class="cvs-form" data-plan="' . (int) $plan['id'] . '" novalidate><p><label>Nom<br><input type="text" name="name" maxlength="120" required autocomplete="name" value="' . esc_attr($u->exists() ? $u->display_name : '') . '"></label></p>'
      . '<p><label>E-mail<br><input type="email" name="email" maxlength="190" required autocomplete="email" value="' . esc_attr($u->exists() ? $u->user_email : '') . '"></label></p>'
      . '<div class="cvs-hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>';
    if ($consent !== '') $o .= '<p><label><input type="checkbox" name="consent" value="1" required> ' . esc_html($consent) . '</label></p>';
    return $o . '<p><button type="submit" class="cvs-btn">S’abonner et payer par carte</button></p><p class="cvs-msg" role="alert"></p><p class="cvs-note">Paiement sécurisé par carte, traité par Coinvera.</p></form></div>';
  }

  private static function err($code, $msg, $status) { return new WP_Error($code, $msg, ['status' => $status]); }
  public static function subscribe(WP_REST_Request $req) {
    $src = (string) $req->get_header('origin'); if ($src === '') $src = (string) $req->get_header('referer');
    $p = $req->get_json_params(); if (!is_array($p) || !CVS_Util::same_origin($src)) return self::err('cvs_bad', 'Requête refusée.', 403);
    if (!empty($p['website'])) return self::err('cvs_bad', 'Requête refusée.', 403);   // honeypot
    if (!CVS_Util::hit('subip:' . CVS_Util::ip(), 8, 10 * MINUTE_IN_SECONDS) || !CVS_Util::hit('suball', 200, HOUR_IN_SECONDS)) return self::err('cvs_rate', 'Trop de tentatives. Réessayez dans quelques minutes.', 429);
    $plan = CVS_Plans::get(isset($p['plan']) && is_scalar($p['plan']) ? (int) $p['plan'] : 0);
    $name = isset($p['name']) && is_scalar($p['name']) ? mb_substr(trim(sanitize_text_field((string) $p['name'])), 0, 120) : '';
    $email = isset($p['email']) && is_scalar($p['email']) ? sanitize_email((string) $p['email']) : '';
    if (!$plan || $plan['closed'] || $name === '' || !is_email($email) || strlen($email) > 190) return self::err('cvs_inv', 'Vérifiez votre nom et votre e-mail.', 400);
    if (trim((string) CVS_Settings::get('consent_text')) !== '' && empty($p['consent'])) return self::err('cvs_consent', 'Le consentement est requis.', 400);
    if (!CVS_Util::hit('subem:' . strtolower($email), 4, HOUR_IN_SECONDS)) return self::err('cvs_rate', 'Trop de tentatives. Réessayez dans quelques minutes.', 429);
    if (!CVS_Settings::configured() || !CVS_API::licensed()) return self::err('cvs_off', 'Inscriptions indisponibles pour le moment.', 503);
    // Même réponse que l'e-mail soit déjà abonné ou non (pas d'énumération) : un paiement sur un abonnement existant le prolonge.
    $sid = CVS_DB::add_sub($plan['id'], strtolower($email), $name); $cid = $sid ? CVS_DB::add_charge($sid, 'first', $plan['price'], CVS_Util::now()) : 0;
    $sub = $sid ? CVS_DB::sub($sid) : null; $charge = $cid ? CVS_DB::charge($cid) : null;
    $r = CVS_Pay::start($charge, $sub, $plan);
    if (empty($r['url'])) { if ($sid) CVS_DB::delete_pending_sub($sid); return self::err('cvs_pay', 'Paiement momentanément indisponible. Réessayez plus tard.', 502); }
    return new WP_REST_Response(['redirect' => $r['url']], 200);
  }

  // ---------- Page de paiement d'une échéance ----------
  public static function pay_page() {
    $token = get_query_var('cvs_pay'); if (!is_string($token) || $token === '') return;
    if (!CVS_Util::hit('payview:' . CVS_Util::ip(), 120, 10 * MINUTE_IN_SECONDS)) self::emit(429, 'Trop de requêtes', '<p>Trop de requêtes. Réessayez dans quelques minutes.</p>');
    $c = CVS_Util::is_token($token) ? CVS_DB::charge_by_token($token) : null; $s = $c ? CVS_DB::sub($c->sub_id) : null;
    if (!$c || !$s) self::emit(404, 'Page introuvable', '<p>Ce lien de paiement est introuvable.</p>');
    $plan = CVS_Plans::get($s->plan_id); $o = '<h1>' . esc_html($plan ? $plan['title'] : 'Abonnement') . '</h1><p class="mut">' . esc_html(CVS_Util::money($c->amount_cents)) . ($plan ? ' / ' . esc_html(CVS_Util::UNITS[$plan['unit']]) : '') . '</p>';
    $code = isset($_GET['cvs_e']) ? sanitize_key(wp_unslash($_GET['cvs_e'])) : '';
    if (isset(self::ERRORS[$code])) $o .= '<p class="err" role="alert">' . esc_html(self::ERRORS[$code]) . '</p>';
    if ($c->status === 'paid') $o .= '<p class="ok">Paiement reçu. Votre abonnement est valable jusqu’au ' . esc_html(CVS_Util::date($s->period_end)) . '. Merci !</p>';
    elseif ($c->status !== 'pending') $o .= '<p>Cette échéance n’est plus à payer.</p>';
    else {
      $base = ($s->period_end && $s->period_end > CVS_Util::now()) ? $s->period_end : CVS_Util::now();
      if ($plan) $o .= '<p>Période couverte : jusqu’au <strong>' . esc_html(CVS_Util::date(CVS_Util::add_period($base, $plan['unit']))) . '</strong>.</p>';
      $o .= '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvs_pay"><input type="hidden" name="token" value="' . esc_attr($token) . '"><input type="hidden" name="_wpnonce" value="' . esc_attr(wp_create_nonce('cvs_pay_' . $token)) . '">'
        . '<div class="hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div><button class="pay" type="submit">Payer ' . esc_html(CVS_Util::money($c->amount_cents)) . ' par carte</button><p class="mut">Paiement sécurisé par carte, traité par Coinvera.</p></form>';
    }
    self::emit(200, 'Paiement de l’abonnement', $o);
  }
  private static function emit($status, $title, $inner) {
    status_header($status); nocache_headers(); $n = base64_encode(random_bytes(12));
    header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex, nofollow'); header('Referrer-Policy: no-referrer'); header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; style-src 'nonce-$n'; frame-ancestors 'none'; base-uri 'none'");
    $css = 'body{margin:0;background:#f4f6fa;color:#0b1220;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.wrap{max-width:480px;margin:40px auto;background:#fff;border:1px solid #e5eaf2;border-radius:12px;padding:28px}h1{font-size:22px;margin:0 0 6px}.mut{color:#64748b;font-size:14px}'
      . '.pay{width:100%;padding:14px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;font:inherit;font-weight:700;cursor:pointer}.ok{color:#166534;font-weight:600}.err{color:#b91c1c;font-weight:600}.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}';
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . esc_html(CVS_Util::one_line($title, 100)) . '</title><style nonce="' . esc_attr($n) . '">' . $css . '</style></head><body><div class="wrap">' . $inner . '</div></body></html>';
    exit;
  }
  public static function pay() {
    nocache_headers();
    $token = isset($_POST['token']) && is_scalar($_POST['token']) ? (string) wp_unslash($_POST['token']) : '';
    $back = function ($code) use ($token) { wp_safe_redirect(add_query_arg('cvs_e', $code, CVS_Util::is_token($token) ? add_query_arg('cvs_pay', $token, home_url('/')) : home_url('/'))); exit; };
    $src = isset($_SERVER['HTTP_ORIGIN']) ? (string) wp_unslash($_SERVER['HTTP_ORIGIN']) : (isset($_SERVER['HTTP_REFERER']) ? (string) wp_unslash($_SERVER['HTTP_REFERER']) : '');
    if (!CVS_Util::same_origin($src) || !empty($_POST['website']) || !CVS_Util::is_token($token)) $back('bad');
    $nonce = isset($_POST['_wpnonce']) && is_scalar($_POST['_wpnonce']) ? sanitize_text_field(wp_unslash((string) $_POST['_wpnonce'])) : '';
    if (!wp_verify_nonce($nonce, 'cvs_pay_' . $token)) $back('nonce');
    if (!CVS_Util::hit('payip:' . CVS_Util::ip(), 10, 10 * MINUTE_IN_SECONDS) || !CVS_Util::hit('paytok:' . $token, 6, 10 * MINUTE_IN_SECONDS)) $back('rate');
    $c = CVS_DB::charge_by_token($token); $s = $c ? CVS_DB::sub($c->sub_id) : null; if (!$c || !$s) $back('off');
    $r = CVS_Pay::start($c, $s, CVS_Plans::get($s->plan_id));
    if (empty($r['url'])) $back($r['err'] ?? 'off');
    wp_redirect($r['url']); exit;
  }

  // ---------- Contenu réservé ----------
  private static function msg($plan_ids) {
    $o = '<div class="cvs-box cvs-locked"><p>Ce contenu est réservé aux abonnés.</p>';
    if (!is_user_logged_in()) $o .= '<p><a href="' . esc_url(wp_login_url((string) get_permalink())) . '">Se connecter</a></p>';
    if (count($plan_ids) === 1 && CVS_Plans::get($plan_ids[0])) $o .= do_shortcode('[coinvera_subscribe plan="' . (int) $plan_ids[0] . '"]');
    return $o . '</div>';
  }
  public static function sc_members($a, $content = '') {
    $a = shortcode_atts(['plan' => ''], $a, 'coinvera_members'); $ids = array_values(array_filter(array_map('absint', explode(',', (string) $a['plan']))));
    if (CVS_Access::has(get_current_user_id(), $ids) || current_user_can('manage_options')) return do_shortcode((string) $content);
    self::enqueue(); return self::msg($ids);
  }
  public static function gate($content) {
    $post = get_post(); if (!$post || !get_post_meta($post->ID, '_cvs_restricted', true)) return $content;
    $ids = array_values(array_filter(array_map('absint', (array) get_post_meta($post->ID, '_cvs_plans', true))));
    if (current_user_can('edit_post', $post->ID) || CVS_Access::has(get_current_user_id(), $ids)) return $content;
    self::enqueue();
    return '<p>' . esc_html(wp_trim_words(wp_strip_all_tags(strip_shortcodes((string) $post->post_content)), 30)) . '</p>' . self::msg($ids);   // aperçu seulement, jamais le contenu complet
  }

  // ---------- Espace membre ----------
  public static function sc_account() {
    if (!is_user_logged_in()) return '<div class="cvs-box"><p>Connectez-vous pour gérer votre abonnement.</p><p><a href="' . esc_url(wp_login_url((string) get_permalink())) . '">Se connecter</a></p></div>';
    self::enqueue(); $subs = CVS_DB::subs_of_user(get_current_user_id());
    if (!$subs) return '<div class="cvs-box"><p>Vous n’avez aucun abonnement.</p></div>';
    $o = '';
    foreach ($subs as $s) {
      $plan = CVS_Plans::get($s->plan_id); $pend = CVS_DB::pending_renewal($s->id);
      $o .= '<div class="cvs-box"><h3>' . esc_html($plan ? $plan['title'] : 'Abonnement') . '</h3><p>Statut : <strong>' . esc_html(CVS_Access::label($s->status)) . '</strong><br>' . ($s->period_end ? 'Valable jusqu’au ' . esc_html(CVS_Util::date($s->period_end)) : '') . '</p>';
      if ($pend && $s->status !== 'cancelled') $o .= '<p><a class="cvs-btn" href="' . esc_url(CVS_Mail::pay_url($pend)) . '">Payer maintenant (' . esc_html(CVS_Util::money($pend->amount_cents)) . ')</a></p>';
      if (in_array($s->status, ['active', 'past_due'], true))
        $o .= '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" onsubmit="return confirm(\'Annuler le renouvellement ? Votre accès reste valable jusqu’à la fin de la période payée.\')"><input type="hidden" name="action" value="cvs_cancel"><input type="hidden" name="id" value="' . (int) $s->id . '">'
          . wp_nonce_field('cvs_cancel_' . (int) $s->id, '_wpnonce', false, false) . '<button type="submit" class="cvs-link">Annuler le renouvellement</button></form>';
      $o .= '</div>';
    }
    return $o;
  }
  public static function cancel() {
    if (!is_user_logged_in()) wp_die('Connexion requise.', 403);
    $id = isset($_POST['id']) ? absint($_POST['id']) : 0; check_admin_referer('cvs_cancel_' . $id);
    $s = CVS_DB::sub($id); if (!$s || (int) $s->user_id !== get_current_user_id()) wp_die('Accès refusé.', 403);   // seul le titulaire annule son abonnement
    CVS_DB::cancel($id); wp_safe_redirect(wp_get_referer() ?: home_url('/')); exit;
  }
}
