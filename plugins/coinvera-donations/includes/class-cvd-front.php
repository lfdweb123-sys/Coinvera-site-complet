<?php
if (!defined('ABSPATH')) exit;

/** Côté visiteur : shortcodes, formulaire de don et création du paiement. */
final class CVD_Front {
  public static function init() {
    add_action('wp_enqueue_scripts', [__CLASS__, 'assets']);
    add_action('rest_api_init', [__CLASS__, 'routes']);
    add_shortcode('coinvera_donate', [__CLASS__, 'sc_donate']);
    add_shortcode('coinvera_progress', [__CLASS__, 'sc_progress']);
    add_shortcode('coinvera_donors', [__CLASS__, 'sc_donors']);
    add_shortcode('coinvera_campaign', [__CLASS__, 'sc_campaign']);
  }

  public static function assets() {
    wp_register_style('cvd', CVD_URL . 'assets/cvd.css', [], CVD_VERSION);
    wp_register_script('cvd', CVD_URL . 'assets/cvd.js', [], CVD_VERSION, true);
    wp_localize_script('cvd', 'CVD', ['url' => esc_url_raw(rest_url('coinvera-donations/v1/donate')),
      'i18n' => ['sending' => 'Redirection vers le paiement…', 'error' => 'Le don n’a pas pu être créé. Réessayez dans un instant.', 'amount' => 'Indiquez un montant valide.']]);
  }
  private static function enqueue() { wp_enqueue_style('cvd'); wp_enqueue_script('cvd'); }

  // ---------- Shortcodes ----------
  public static function sc_progress($a) {
    $a = shortcode_atts(['id' => 0], $a, 'coinvera_progress'); $c = CVD_Campaigns::get($a['id']); if (!$c) return '';
    self::enqueue(); return self::progress($c);
  }
  public static function sc_donors($a) {
    $a = shortcode_atts(['id' => 0, 'limit' => 10], $a, 'coinvera_donors'); $c = CVD_Campaigns::get($a['id']); if (!$c) return '';
    self::enqueue(); return self::donors($c, (int) $a['limit']);
  }
  public static function sc_donate($a) {
    $a = shortcode_atts(['id' => 0, 'amounts' => '', 'button' => 'Faire un don', 'title' => ''], $a, 'coinvera_donate');
    self::enqueue(); return self::form((int) $a['id'], $a);
  }
  public static function sc_campaign($a) {
    $a = shortcode_atts(['id' => 0], $a, 'coinvera_campaign'); $c = CVD_Campaigns::get($a['id']); if (!$c) return '';
    self::enqueue();
    $out = '<div class="cvd-campaign"><h3 class="cvd-title">' . esc_html($c['title']) . '</h3>';
    if (trim($c['content']) !== '') $out .= '<div class="cvd-desc">' . wp_kses_post(wpautop($c['content'])) . '</div>';   // pas de do_shortcode : évite toute récursion
    return $out . self::progress($c) . self::form($c['id'], ['amounts' => '', 'button' => 'Faire un don', 'title' => '']) . self::donors($c, 10) . '</div>';
  }

  // ---------- Rendu ----------
  private static function progress($c) {
    $t = CVD_DB::totals($c['id']); $out = '<div class="cvd-progress">';
    if ($c['goal'] > 0) {
      $pct = (int) min(100, floor($t['raised'] * 100 / $c['goal']));
      $out .= '<div class="cvd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' . $pct . '"><span style="width:' . $pct . '%"></span></div>';
      $out .= '<p class="cvd-stats"><strong>' . esc_html(CVD_Util::money($t['raised'])) . '</strong> collectés sur ' . esc_html(CVD_Util::money($c['goal'])) . ' <span>(' . $pct . ' %)</span></p>';
    } else $out .= '<p class="cvd-stats"><strong>' . esc_html(CVD_Util::money($t['raised'])) . '</strong> collectés</p>';
    $out .= '<p class="cvd-meta">' . (int) $t['count'] . ' don' . ($t['count'] > 1 ? 's' : '');
    if ($c['deadline'] !== '') { $days = (int) floor((strtotime($c['deadline']) - strtotime(current_time('Y-m-d'))) / DAY_IN_SECONDS); $out .= $days >= 0 ? ' · ' . ($days === 0 ? 'dernier jour' : $days . ' jour' . ($days > 1 ? 's' : '') . ' restant' . ($days > 1 ? 's' : '')) : ' · terminée'; }
    return $out . '</p></div>';
  }
  private static function donors($c, $limit) {
    if (!$c['show_donors']) return '';
    $rows = CVD_DB::donors($c['id'], $limit); if (!$rows) return '';
    $out = '<div class="cvd-donors"><h4>Derniers donateurs</h4><ul>';
    foreach ($rows as $r) $out .= '<li><strong>' . esc_html($r->donor_name) . '</strong> · ' . esc_html(CVD_Util::money($r->amount_cents)) . ($r->message !== '' ? '<em>' . esc_html($r->message) . '</em>' : '') . '</li>';
    return $out . '</ul></div>';
  }
  private static function form($cid, $a) {
    $c = $cid ? CVD_Campaigns::get($cid) : null;
    if ($cid && !$c) return '';
    if ($c && !CVD_Campaigns::is_open($c)) return '<p class="cvd-closed">Cette cagnotte est terminée. Merci à tous les donateurs !</p>';
    if (!CVD_Settings::ready() || !CVD_API::licensed())
      return current_user_can('manage_options') ? '<p class="cvd-closed">[Administrateur] Dons indisponibles : vérifiez la licence et les clés API dans <a href="' . esc_url(admin_url('admin.php?page=cvd-settings')) . '">Dons Coinvera → Réglages</a>.</p>' : '<p class="cvd-closed">Les dons sont momentanément indisponibles.</p>';
    $min = $c && $c['min'] ? $c['min'] : (CVD_Util::to_cents(CVD_Settings::get('min_amount')) ?: 100);
    $list = CVD_Util::parse_amounts($a['amounts'] !== '' ? $a['amounts'] : ($c && $c['suggested'] !== '' ? $c['suggested'] : (string) CVD_Settings::get('suggested')));
    $uid = 'cvd' . wp_unique_id(); $woo = CVD_Woo::mode_on();
    $e = isset($_GET['cvd_err']) ? sanitize_key(wp_unslash($_GET['cvd_err'])) : ''; $err = self::ERRORS[$e] ?? '';   // code → message fixe, jamais de texte libre
    ob_start(); ?>
    <div class="cvd-wrap" id="cvd"><?php if ($a['title'] !== '') echo '<h3 class="cvd-title">' . esc_html($a['title']) . '</h3>'; ?>
    <form class="cvd-form" method="post" action="<?php echo $woo ? esc_url(admin_url('admin-post.php')) : '#'; ?>" novalidate data-mode="<?php echo $woo ? 'woo' : 'api'; ?>" data-campaign="<?php echo (int) $cid; ?>" data-min="<?php echo (int) $min; ?>">
      <?php if ($woo) : ?><input type="hidden" name="action" value="cvd_woo_add"><input type="hidden" name="campaign" value="<?php echo (int) $cid; ?>"><?php endif; ?>
      <fieldset class="cvd-amounts"><legend>Montant du don (USD)</legend>
        <?php foreach ($list as $i => $cents) : ?>
          <label class="cvd-chip"><input type="radio" name="preset" value="<?php echo esc_attr($cents / 100); ?>"><span><?php echo esc_html(CVD_Util::money($cents)); ?></span></label>
        <?php endforeach; ?>
        <label class="cvd-other" for="<?php echo esc_attr($uid); ?>-amount"><span class="screen-reader-text">Autre montant</span>
          <input type="text" inputmode="decimal" id="<?php echo esc_attr($uid); ?>-amount" name="amount" placeholder="Autre montant" autocomplete="off" maxlength="9"> $</label>
        <p class="cvd-hint">Minimum <?php echo esc_html(CVD_Util::money($min)); ?>.</p>
      </fieldset>
      <p><label for="<?php echo esc_attr($uid); ?>-name">Nom (optionnel)</label><input type="text" id="<?php echo esc_attr($uid); ?>-name" name="name" maxlength="120" autocomplete="name"></p>
      <?php if (!$woo) : ?><p><label for="<?php echo esc_attr($uid); ?>-email">E-mail (optionnel, pour le reçu)</label><input type="email" id="<?php echo esc_attr($uid); ?>-email" name="email" maxlength="190" autocomplete="email"></p><?php endif; ?>
      <p><label for="<?php echo esc_attr($uid); ?>-msg">Message (optionnel)</label><textarea id="<?php echo esc_attr($uid); ?>-msg" name="message" rows="2" maxlength="500"></textarea></p>
      <p class="cvd-check"><label><input type="checkbox" name="anonymous" value="1"> Don anonyme (mon nom n’apparaît pas sur le site)</label></p>
      <div class="cvd-hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
      <button type="submit" class="cvd-btn"><?php echo esc_html($a['button']); ?></button>
      <p class="cvd-msg" role="alert" aria-live="polite"><?php echo esc_html($err); ?></p>
      <p class="cvd-secure"><?php echo $woo ? 'Vous serez dirigé vers la page de paiement de la boutique.' : 'Paiement sécurisé par carte, traité par Coinvera.'; ?></p>
    </form>
    <?php if (!$woo) : ?><noscript><p class="cvd-closed">JavaScript est nécessaire pour effectuer un don.</p></noscript><?php endif; ?></div>
    <?php return ob_get_clean();
  }

  // ---------- Validation commune (mode direct et mode WooCommerce) ----------
  const ERRORS = ['cvd_off' => 'Les dons sont momentanément indisponibles.', 'cvd_rate' => 'Trop de tentatives. Réessayez dans quelques minutes.', 'cvd_amount' => 'Montant invalide.',
    'cvd_campaign' => 'Cette cagnotte n’accepte plus de dons.', 'cvd_email' => 'Adresse e-mail invalide.', 'cvd_origin' => 'Requête refusée.', 'cvd_bad' => 'Requête refusée.', 'cvd_cart' => 'Le don n’a pas pu être ajouté au panier.'];

  private static function err($code, $msg, $status) { return new WP_Error($code, $msg, ['status' => $status]); }

  /** Contrôle l'origine, le champ piège, le débit, la licence puis chaque champ. Retourne un tableau nettoyé ou un WP_Error. */
  public static function validate(array $p, $src) {
    // 1. Origine : la requête doit venir de ce site (si le navigateur l'indique).
    if ($src !== '' && strtolower((string) wp_parse_url($src, PHP_URL_HOST)) !== strtolower((string) wp_parse_url(home_url(), PHP_URL_HOST))) return self::err('cvd_origin', 'Requête refusée.', 403);
    // 2. Champ piège : un robot le remplit, un humain ne le voit pas.
    if (!empty($p['website'])) return self::err('cvd_bad', 'Requête refusée.', 400);
    // 3. Limites de débit par adresse IP et globale (en mode direct, chaque don crée un paiement chez Coinvera).
    if (!CVD_Util::hit('ip:' . CVD_Util::ip(), 6, 10 * MINUTE_IN_SECONDS) || !CVD_Util::hit('all', 120, HOUR_IN_SECONDS)) return self::err('cvd_rate', 'Trop de tentatives. Réessayez dans quelques minutes.', 429);
    if (!CVD_Settings::ready() || !CVD_API::licensed()) return self::err('cvd_off', 'Les dons sont momentanément indisponibles.', 503);
    // 4. Validation stricte, côté serveur uniquement.
    $cid = isset($p['campaign']) && is_scalar($p['campaign']) ? absint($p['campaign']) : 0; $c = null;
    if ($cid) { $c = CVD_Campaigns::get($cid); if (!$c || !CVD_Campaigns::is_open($c)) return self::err('cvd_campaign', 'Cette cagnotte n’accepte plus de dons.', 422); }
    $cents = CVD_Util::to_cents(isset($p['amount']) && is_scalar($p['amount']) ? (string) $p['amount'] : '');
    $min = max(100, $c && $c['min'] ? $c['min'] : (CVD_Util::to_cents(CVD_Settings::get('min_amount')) ?: 100));
    if ($cents === null || $cents < $min) return self::err('cvd_amount', 'Montant invalide (minimum ' . CVD_Util::money($min) . ').', 422);
    $name = isset($p['name']) && is_scalar($p['name']) ? mb_substr(sanitize_text_field((string) $p['name']), 0, 120) : '';
    $mail = isset($p['email']) && is_scalar($p['email']) ? sanitize_email((string) $p['email']) : '';
    if (!empty($p['email']) && (!is_email($mail) || strlen($mail) > 190)) return self::err('cvd_email', 'Adresse e-mail invalide.', 422);
    $msg = isset($p['message']) && is_scalar($p['message']) ? mb_substr(sanitize_textarea_field((string) $p['message']), 0, 500) : '';
    return ['c' => $c, 'cid' => $cid, 'cents' => $cents, 'name' => $name, 'mail' => $mail, 'msg' => $msg, 'anon' => !empty($p['anonymous'])];
  }

  // ---------- Création d'un don (mode direct : paiement par carte via l'API Coinvera) ----------
  public static function routes() {
    register_rest_route('coinvera-donations/v1', '/donate', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => [__CLASS__, 'donate']]);   // public volontairement : anonyme, protégé par validate()
  }

  public static function donate(WP_REST_Request $req) {
    nocache_headers();
    if (CVD_Woo::mode_on()) return self::err('cvd_off', 'Les dons passent par la boutique.', 409);
    $p = $req->get_json_params(); if (!is_array($p)) $p = $req->get_body_params();
    $v = self::validate($p, (string) ($req->get_header('origin') ?: $req->get_header('referer')));
    if (is_wp_error($v)) return $v;
    $c = $v['c']; $cents = $v['cents']; $mail = $v['mail'];

    // Enregistrement puis création du paiement. Le don reste "pending" tant que Coinvera ne l'a pas confirmé.
    $id = CVD_DB::insert(['campaign_id' => $v['cid'], 'amount_cents' => $cents, 'donor_name' => $v['name'], 'donor_email' => $mail, 'message' => $v['msg'], 'anonymous' => $v['anon']]);
    if (!$id) return self::err('cvd_db', 'Le don n’a pas pu être enregistré.', 500);
    $title = 'Don — ' . ($c ? $c['title'] : get_bloginfo('name'));
    $res = CVD_API::create_payment($cents, CVD_Util::one_line($title, 110), $mail, 'cvd:' . $id, 'cvd-' . $id . '-' . wp_hash($id . home_url()));
    $d = is_wp_error($res) ? null : $res['data'];
    $url = is_array($d) ? (string) ($d['checkoutUrl'] ?? '') : '';
    if (is_wp_error($res) || !in_array($res['code'], [200, 201], true) || empty($d['id']) || strpos($url, 'https://') !== 0 || !wp_http_validate_url($url)) {
      CVD_DB::transition($id, 'failed'); CVD_Util::log("don $id : création du paiement impossible" . (is_wp_error($res) ? '' : ' (HTTP ' . $res['code'] . ')'));
      return self::err('cvd_pay', 'Le paiement est momentanément indisponible. Réessayez plus tard.', 502);
    }
    CVD_DB::attach_payment($id, sanitize_text_field((string) $d['id']), sanitize_key((string) ($d['mode'] ?? '')));
    return new WP_REST_Response(['ok' => true, 'redirect' => $url], 200);
  }
}
