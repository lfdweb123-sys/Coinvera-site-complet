<?php
if (!defined('ABSPATH')) exit;

/** Public : vitrine d'un événement, achat, page des billets (QR). */
final class CVT_Front {
  const STATES = ['closed' => 'Les ventes sont fermées.', 'past' => 'Cet événement est terminé.', 'not_open' => 'Les ventes ne sont pas encore ouvertes.', 'ended' => 'Les ventes sont terminées.'];

  public static function init() {
    add_action('wp_enqueue_scripts', function () {
      wp_register_style('cvt', CVT_URL . 'assets/cvt.css', [], CVT_VERSION); wp_register_script('cvt', CVT_URL . 'assets/cvt.js', [], CVT_VERSION, true);
      wp_localize_script('cvt', 'CVT', ['url' => esc_url_raw(rest_url('coinvera-tickets/v1/buy')), 'i18n' => ['error' => 'Une erreur est survenue. Réessayez.', 'sending' => 'Redirection vers le paiement sécurisé…', 'pick' => 'Choisissez au moins un billet.']]);
    });
    add_shortcode('coinvera_event', [__CLASS__, 'sc_event']);
    add_filter('query_vars', function ($v) { $v[] = 'cvt_ticket'; return $v; });
    add_action('template_redirect', [__CLASS__, 'ticket_page']);
    add_action('rest_api_init', function () { register_rest_route('coinvera-tickets/v1', '/buy', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => [__CLASS__, 'buy']]); });   // public volontairement : protégé par origine, honeypot et limites
  }

  public static function sc_event($a) {
    $a = shortcode_atts(['id' => 0], $a, 'coinvera_event'); $ev = CVT_Events::get((int) $a['id']);
    if (!$ev) return current_user_can('manage_options') ? '<p><em>Coinvera Billetterie : événement introuvable ou non publié.</em></p>' : '';
    wp_enqueue_style('cvt'); wp_enqueue_script('cvt'); $now = CVT_Util::now();
    $o = '<div class="cvt-box"><h3>' . esc_html($ev['title']) . '</h3>';
    if ($ev['starts_local'] !== '') $o .= '<p class="cvt-meta">' . esc_html(date_i18n('j F Y, H:i', strtotime($ev['starts_local']))) . ($ev['venue'] !== '' ? ' — ' . esc_html($ev['venue']) : '') . ($ev['address'] !== '' ? '<br>' . esc_html($ev['address']) : '') . '</p>';
    if ($ev['desc'] !== '') $o .= '<div class="cvt-desc">' . wp_kses_post(wpautop($ev['desc'])) . '</div>';
    $state = CVT_Events::sale_state($ev); $left = $ev['capacity'] - CVT_DB::taken($ev['id'], null, $now);
    if ($state !== 'open') return $o . '<p class="cvt-state">' . esc_html(self::STATES[$state] ?? '') . '</p></div>';
    if ($left < 1) return $o . '<p class="cvt-state">Complet.</p></div>';
    if (!CVT_Settings::configured() || !CVT_API::licensed()) return $o . '<p class="cvt-state">La billetterie est momentanément indisponible.</p></div>';
    if (CVT_Settings::get('show_remaining')) $o .= '<p class="cvt-left">Il reste ' . (int) $left . ' place(s).</p>';
    $o .= '<form class="cvt-form" data-event="' . (int) $ev['id'] . '" data-max="' . (int) min($ev['max'], $left) . '" novalidate><div class="cvt-types">';
    foreach ($ev['types'] as $t) {
      $tl = $t['quota'] > 0 ? $t['quota'] - CVT_DB::taken($ev['id'], $t['id'], $now) : PHP_INT_MAX; $soldout = $tl < 1;
      $o .= '<div class="cvt-type" data-price="' . (int) $t['price'] . '"><span class="cvt-tname">' . esc_html($t['name']) . '</span><span class="cvt-tprice">' . esc_html(CVT_Util::money($t['price'])) . '</span>';
      $o .= $soldout ? '<span class="cvt-soldout">Épuisé</span>' : '<span class="cvt-qty"><button type="button" class="cvt-minus" aria-label="Moins de billets ' . esc_attr($t['name']) . '">−</button><input type="text" inputmode="numeric" class="cvt-n" data-type="' . esc_attr($t['id']) . '" value="0" aria-label="Quantité ' . esc_attr($t['name']) . '" readonly><button type="button" class="cvt-plus" aria-label="Plus de billets ' . esc_attr($t['name']) . '">+</button></span>';
      $o .= '</div>';
    }
    return $o . '</div><p><label>Nom<br><input type="text" name="name" maxlength="120" required autocomplete="name"></label></p><p><label>E-mail (vos billets y seront envoyés)<br><input type="email" name="email" maxlength="190" required autocomplete="email"></label></p>'
      . '<div class="cvt-hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div><p class="cvt-total">Total : <strong>0 $</strong> <span class="cvt-note">(indicatif : recalculé à l’achat)</span></p>'
      . '<p><button type="submit" class="cvt-btn">Acheter par carte</button></p><p class="cvt-msg" role="alert"></p><p class="cvt-note">Paiement sécurisé par carte, traité par Coinvera. Vos places sont réservées ' . (int) CVT_Settings::get('hold_minutes') . ' minutes.</p></form></div>';
  }

  private static function err($code, $msg, $status) { return new WP_Error($code, $msg, ['status' => $status]); }
  public static function buy(WP_REST_Request $req) {
    $src = (string) $req->get_header('origin'); if ($src === '') $src = (string) $req->get_header('referer');
    $p = $req->get_json_params(); if (!is_array($p) || !CVT_Util::same_origin($src) || !empty($p['website'])) return self::err('cvt_bad', 'Requête refusée.', 403);
    if (!CVT_Util::hit('buyip:' . CVT_Util::ip(), 8, 10 * MINUTE_IN_SECONDS) || !CVT_Util::hit('buyall', 300, HOUR_IN_SECONDS)) return self::err('cvt_rate', 'Trop de tentatives. Réessayez dans quelques minutes.', 429);
    $ev = CVT_Events::get(isset($p['event']) && is_scalar($p['event']) ? (int) $p['event'] : 0);
    $name = isset($p['name']) && is_scalar($p['name']) ? mb_substr(trim(sanitize_text_field((string) $p['name'])), 0, 120) : ''; $email = isset($p['email']) && is_scalar($p['email']) ? sanitize_email((string) $p['email']) : '';
    if (!$ev || $name === '' || !is_email($email) || strlen($email) > 190) return self::err('cvt_inv', 'Vérifiez votre nom et votre e-mail.', 400);
    if (CVT_Events::sale_state($ev) !== 'open') return self::err('cvt_closed', self::STATES[CVT_Events::sale_state($ev)] ?? 'Ventes fermées.', 409);
    if (!CVT_Settings::configured() || !CVT_API::licensed()) return self::err('cvt_off', 'Billetterie indisponible pour le moment.', 503);
    if (!CVT_Util::hit('buyem:' . strtolower($email), 5, HOUR_IN_SECONDS)) return self::err('cvt_rate', 'Trop de tentatives. Réessayez dans quelques minutes.', 429);
    $qty = []; $raw = isset($p['qty']) && is_array($p['qty']) ? $p['qty'] : [];   // seules les quantités sont lues : les prix viennent du serveur
    foreach ($raw as $tid => $n) { $tid = (string) $tid; if (isset($ev['types'][$tid]) && is_scalar($n) && preg_match('/^\d{1,2}$/', (string) $n)) $qty[$tid] = (int) $n; }
    $r = CVT_DB::create_order($ev, $qty, $name, strtolower($email), (int) CVT_Settings::get('hold_minutes'));
    if (isset($r['err'])) {
      if ($r['err'] === 'full' || $r['err'] === 'quota') return self::err('cvt_full', $r['left'] > 0 ? 'Il ne reste que ' . (int) $r['left'] . ' place(s).' : 'Désolé, c’est complet.', 409);
      return self::err('cvt_bad', $r['err'] === 'busy' ? 'Forte affluence, réessayez dans un instant.' : 'Commande invalide.', $r['err'] === 'busy' ? 503 : 400);
    }
    $o = CVT_DB::order($r['order']); $title = CVT_Util::one_line('Billets — ' . $ev['title'], 110);
    $res = CVT_API::create_payment((int) $o->total_cents, $title, $o->buyer_email, 'cvt:' . (int) $o->id, 'cvt-' . (int) $o->id . '-' . (int) $o->total_cents);
    $d = is_wp_error($res) ? null : $res['data']; $url = is_array($d) ? (string) ($d['checkoutUrl'] ?? '') : '';
    if (is_wp_error($res) || !in_array($res['code'], [200, 201], true) || empty($d['id']) || strpos($url, 'https://') !== 0 || !wp_http_validate_url($url)) {
      CVT_DB::release($o->id); CVT_Util::log('commande ' . (int) $o->id . ' : création du paiement impossible');   // la place est libérée immédiatement
      return self::err('cvt_pay', 'Paiement momentanément indisponible. Réessayez plus tard.', 502);
    }
    CVT_DB::attach_payment($o->id, sanitize_text_field((string) $d['id']), $url, sanitize_key((string) ($d['mode'] ?? '')));
    return new WP_REST_Response(['redirect' => $url], 200);
  }

  // ---------- Page des billets ----------
  private static function e($s) { return esc_html((string) $s); }
  public static function ticket_page() {
    $token = get_query_var('cvt_ticket'); if (!is_string($token) || $token === '') return;
    if (!CVT_Util::hit('tview:' . CVT_Util::ip(), 120, 10 * MINUTE_IN_SECONDS)) self::emit(429, 'Trop de requêtes', '<p>Trop de requêtes. Réessayez dans quelques minutes.</p>', false);
    $o = CVT_Util::is_token($token) ? CVT_DB::order_by_token($token) : null;
    if (!$o) self::emit(404, 'Page introuvable', '<p>Cette page est introuvable.</p>', false);
    $ev = CVT_Events::get($o->event_id); $refresh = false; $in = '<h1>' . self::e($ev ? $ev['title'] : 'Billets') . '</h1>';
    if ($ev) $in .= '<p class="mut">' . self::e($ev['starts_local'] !== '' ? date_i18n('j F Y, H:i', strtotime($ev['starts_local'])) : '') . ($ev['venue'] !== '' ? ' — ' . self::e($ev['venue']) : '') . ($ev['address'] !== '' ? '<br>' . self::e($ev['address']) : '') . '</p>';
    if ($o->status === 'pending' && $o->pay_state === 'pending' && CVT_Util::hit('tchk:' . (int) $o->id, 1, 20)) { CVT_Confirm::check($o); $o = CVT_DB::order($o->id); }   // le client voit ses billets dès que le paiement est confirmé
    if ($o->status === 'paid' || $o->status === 'refunded') {
      if ($o->status === 'refunded') $in .= '<p class="err">Cette commande a été remboursée : les billets sont annulés.</p>';
      foreach (CVT_DB::tickets_of($o->id) as $t) {
        $lbl = ['valid' => 'Valide', 'used' => 'Déjà utilisé', 'void' => 'Annulé', 'held' => 'En attente'][$t->status] ?? $t->status;
        $in .= '<div class="tk tk-' . self::e($t->status) . '"><div class="qr" data-code="' . self::e($t->code) . '" role="img" aria-label="QR code du billet"></div><div><strong>' . self::e($t->type_name) . '</strong><br>' . self::e($t->holder_name) . '<br><code>' . self::e(CVT_Codes::pretty($t->code)) . '</code><br><span class="st">' . self::e($lbl) . '</span></div></div>';
      }
      $in .= '<p class="noprint"><button type="button" id="cvt-print">Imprimer</button></p>';
    } elseif ($o->status === 'pending') { $refresh = true; $in .= '<p>Paiement en cours de confirmation… Cette page se met à jour automatiquement. Vos places sont réservées jusqu’à ' . self::e(CVT_Util::datetime($o->hold_until)) . '.</p>'; }
    else $in .= '<p>Cette réservation a expiré' . ($o->pay_state === 'pending' ? ' ; si vous avez payé, vos billets arriveront par e-mail dès que le paiement sera confirmé' : '') . '.</p>';
    if ($o->pay_state === 'review') $in .= '<p class="err">Votre paiement est en cours de vérification par l’organisateur.</p>';
    self::emit(200, 'Vos billets', $in, $refresh);
  }
  private static function emit($status, $title, $inner, $refresh) {
    status_header($status); nocache_headers(); $n = base64_encode(random_bytes(12));
    header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex, nofollow'); header('Referrer-Policy: no-referrer'); header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; script-src 'nonce-$n'; style-src 'nonce-$n'; frame-ancestors 'none'; base-uri 'none'");
    $css = 'body{margin:0;background:#f4f6fa;color:#0b1220;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.wrap{max-width:560px;margin:24px auto;background:#fff;border:1px solid #e5eaf2;border-radius:12px;padding:24px}h1{font-size:22px;margin:0 0 6px}.mut{color:#64748b;font-size:14px}'
      . '.tk{display:flex;gap:16px;align-items:center;border:1px solid #e5eaf2;border-radius:10px;padding:12px;margin:12px 0;break-inside:avoid}.qr{width:140px;height:140px;flex:none}.qr svg{width:100%;height:100%}.tk-used,.tk-void{opacity:.55}.st{font-weight:700}.err{color:#b91c1c;font-weight:600}code{font-size:15px;letter-spacing:.5px}button{font:inherit;padding:8px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer}@media print{body{background:#fff}.wrap{border:0;margin:0}.noprint{display:none}}';
    $js = 'var b=document.getElementById("cvt-print");if(b)b.addEventListener("click",function(){window.print()});if(window.qrcode){document.querySelectorAll(".qr").forEach(function(el){var c=el.getAttribute("data-code");if(!/^[A-Z2-7]{16}$/.test(c))return;var q=qrcode(0,"M");q.addData(c);q.make();el.innerHTML=q.createSvgTag({cellSize:4,margin:2,scalable:true});});}';
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">' . ($refresh ? '<meta http-equiv="refresh" content="15">' : '') . '<title>' . esc_html(CVT_Util::one_line($title, 100)) . '</title><style nonce="' . esc_attr($n) . '">' . $css . '</style></head><body><div class="wrap">' . $inner
      . '</div><script nonce="' . esc_attr($n) . '" src="' . esc_url(CVT_URL . 'assets/qrcode.js') . '"></script><script nonce="' . esc_attr($n) . '">' . $js . '</script></body></html>';
    exit;
  }
}
