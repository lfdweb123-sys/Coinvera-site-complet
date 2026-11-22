<?php
if (!defined('ABSPATH')) exit;

/**
 * Page publique d'une facture (?cvi_invoice=<jeton>) : page autonome, sans thème, imprimable.
 * L'accès se fait uniquement par un jeton aléatoire de 128 bits ; jamais par l'identifiant de la facture.
 */
final class CVI_Public {
  const ERRORS = ['bad' => 'Requête refusée.', 'nonce' => 'La page a expiré. Rechargez-la puis réessayez.', 'rate' => 'Trop de tentatives. Réessayez dans quelques minutes.',
    'off' => 'Le paiement en ligne est indisponible pour cette facture.', 'pay' => 'Le paiement est momentanément indisponible. Réessayez plus tard.'];

  public static function init() {
    add_filter('query_vars', function ($v) { $v[] = 'cvi_invoice'; return $v; });
    add_action('template_redirect', [__CLASS__, 'view']);
    add_action('admin_post_nopriv_cvi_pay', [__CLASS__, 'pay']);
    add_action('admin_post_cvi_pay', [__CLASS__, 'pay']);
  }

  // ---------- Affichage ----------
  public static function view() {
    $token = get_query_var('cvi_invoice'); if (!is_string($token) || $token === '') return;
    if (!CVI_Util::hit('view:' . CVI_Util::ip(), 120, 10 * MINUTE_IN_SECONDS)) self::emit(429, 'Trop de requêtes', '<p>Trop de requêtes. Réessayez dans quelques minutes.</p>');
    $r = CVI_Util::valid_token($token) ? CVI_DB::get_by_token($token) : null;
    if (!$r || $r->status === 'draft') self::emit(404, 'Page introuvable', '<p>Cette facture est introuvable.</p>');   // même réponse pour un jeton inconnu et un brouillon
    self::emit(200, 'Facture ' . $r->number, self::invoice_html($r));
  }

  private static function e($s) { return esc_html((string) $s); }

  private static function invoice_html($r) {
    $logo = (string) CVI_Settings::get('company_logo'); $o = '';
    $o .= '<div class="head"><div>';
    if ($logo !== '' && strpos($logo, 'https://') === 0 && wp_http_validate_url($logo)) $o .= '<img class="logo" src="' . esc_url($logo) . '" alt="">';
    $o .= '<strong class="co">' . self::e(CVI_Settings::company_name()) . '</strong>';
    $addr = trim((string) CVI_Settings::get('company_address')); if ($addr !== '') $o .= '<div class="mut">' . nl2br(self::e($addr)) . '</div>';
    $tax = trim((string) CVI_Settings::get('company_tax_id')); if ($tax !== '') $o .= '<div class="mut">N° fiscal : ' . self::e($tax) . '</div>';
    $o .= '</div><div class="r"><h1>Facture ' . self::e($r->number) . '</h1><span class="badge b-' . self::e(CVI_Util::is_overdue($r) ? 'late' : $r->status) . '">' . self::e(CVI_Util::status_label($r)) . '</span>';
    $o .= '<div class="mut">Émise le ' . self::e(CVI_Util::fmt_date($r->issue_date)) . '<br>Échéance : ' . self::e(CVI_Util::fmt_date($r->due_date)) . '</div></div></div>';
    $o .= '<div class="to"><span class="mut">Facturé à</span><br><strong>' . self::e($r->customer_name) . '</strong>';
    if (trim((string) $r->customer_address) !== '') $o .= '<br>' . nl2br(self::e($r->customer_address));
    $o .= '</div><table><thead><tr><th>Description</th><th class="n">Qté</th><th class="n">Prix unitaire</th><th class="n">Total</th></tr></thead><tbody>';
    foreach (CVI_Calc::decode($r->items) as $l) $o .= '<tr><td>' . self::e($l['d']) . '</td><td class="n">' . self::e(CVI_Calc::qty_text($l['q'])) . '</td><td class="n">' . self::e(CVI_Util::money($l['u'])) . '</td><td class="n">' . self::e(CVI_Util::money(CVI_Calc::line_total($l))) . '</td></tr>';
    $o .= '</tbody></table><table class="tot"><tbody><tr><td>Sous-total</td><td class="n">' . self::e(CVI_Util::money($r->subtotal_cents)) . '</td></tr>';
    if ((int) $r->discount_cents > 0) $o .= '<tr><td>Remise</td><td class="n">− ' . self::e(CVI_Util::money($r->discount_cents)) . '</td></tr>';
    if ((int) $r->tax_bp > 0) $o .= '<tr><td>Taxe (' . self::e(CVI_Util::bp_text($r->tax_bp)) . ' %)</td><td class="n">' . self::e(CVI_Util::money($r->tax_cents)) . '</td></tr>';
    $o .= '<tr class="grand"><td>Total</td><td class="n">' . self::e(CVI_Util::money($r->total_cents)) . '</td></tr></tbody></table>';
    if (trim((string) $r->notes) !== '') $o .= '<p class="notes">' . nl2br(self::e($r->notes)) . '</p>';

    $o .= '<div class="act noprint">';
    $code = isset($_GET['cvi_e']) ? sanitize_key(wp_unslash($_GET['cvi_e'])) : '';   // code → message fixe, jamais de texte libre
    if (isset(self::ERRORS[$code])) $o .= '<p class="err" role="alert">' . self::e(self::ERRORS[$code]) . '</p>';
    if ($r->status === 'paid') $o .= '<p class="ok">Payée le ' . self::e(CVI_Util::fmt_gmt($r->paid_at)) . '. Merci !</p>';
    elseif ($r->status === 'cancelled') $o .= '<p class="mut">Cette facture a été annulée.</p>';
    elseif (CVI_Util::payable_range($r->total_cents) && CVI_Settings::configured() && CVI_API::licensed()) {
      $o .= '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvi_pay"><input type="hidden" name="token" value="' . esc_attr($r->token) . '">'
        . '<input type="hidden" name="_wpnonce" value="' . esc_attr(wp_create_nonce('cvi_pay_' . $r->token)) . '"><div class="hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>'
        . '<button class="pay" type="submit">Payer ' . self::e(CVI_Util::money($r->total_cents)) . ' par carte</button><p class="mut">Paiement sécurisé par carte, traité par Coinvera.</p></form>';
    } else $o .= '<p class="mut">Le paiement en ligne n’est pas disponible pour cette facture. Merci de contacter ' . self::e(CVI_Settings::company_name()) . '.</p>';
    return $o . '<p><button type="button" class="prn" id="cvi-print">Imprimer / Enregistrer en PDF</button></p></div>';
  }

  /** Envoie la page (HTML autonome, CSP restrictive avec nonce) puis termine. */
  private static function emit($status, $title, $inner) {
    status_header($status); nocache_headers();
    $n = base64_encode(random_bytes(12));
    header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex, nofollow'); header('Referrer-Policy: no-referrer'); header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; img-src https: data:; style-src 'nonce-$n'; script-src 'nonce-$n'; frame-ancestors 'none'; base-uri 'none'");
    $css = 'body{margin:0;background:#f4f6fa;color:#0b1220;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.wrap{max-width:760px;margin:24px auto;background:#fff;border:1px solid #e5eaf2;border-radius:12px;padding:28px}'
      . '.head{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:20px}.r{text-align:right}h1{font-size:22px;margin:0 0 6px}.co{font-size:18px;display:block}.logo{max-height:56px;max-width:200px;display:block;margin-bottom:8px}'
      . '.mut{color:#64748b;font-size:14px}.to{margin:16px 0}.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:600;background:#e5eaf2}'
      . '.b-paid{background:#dcfce7;color:#166534}.b-late{background:#fee2e2;color:#991b1b}.b-sent{background:#dbeafe;color:#1e40af}.b-cancelled{background:#f1f5f9;color:#475569}'
      . 'table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px 6px;border-bottom:1px solid #e5eaf2;text-align:left;vertical-align:top}th{font-size:13px;color:#64748b}.n{text-align:right;white-space:nowrap}'
      . '.tot{width:auto;margin-left:auto;min-width:260px}.tot td{border:0;padding:4px 6px}.grand td{font-weight:700;font-size:18px;border-top:2px solid #0b1220}.notes{background:#f8fafc;padding:12px;border-radius:8px}'
      . '.act{margin-top:24px}.pay{width:100%;padding:14px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;font:inherit;font-weight:700;cursor:pointer}.prn{background:none;border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit}'
      . '.ok{color:#166534;font-weight:600}.err{color:#b91c1c;font-weight:600}.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}@media print{body{background:#fff}.wrap{border:0;margin:0;padding:0}.noprint{display:none}}';
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . esc_html(CVI_Util::one_line($title, 100)) . '</title><style nonce="' . esc_attr($n) . '">' . $css . '</style></head><body><div class="wrap">' . $inner
      . '</div><script nonce="' . esc_attr($n) . '">var b=document.getElementById("cvi-print");if(b)b.addEventListener("click",function(){window.print()});</script></body></html>';
    exit;
  }

  // ---------- Paiement ----------
  private static function ok_url($u) { return is_string($u) && strpos($u, 'https://') === 0 && wp_http_validate_url($u); }

  public static function pay() {
    nocache_headers();
    $token = isset($_POST['token']) && is_scalar($_POST['token']) ? (string) wp_unslash($_POST['token']) : '';
    $back = function ($code) use ($token) { wp_safe_redirect(add_query_arg('cvi_e', $code, CVI_Util::valid_token($token) ? CVI_Util::public_url($token) : home_url('/'))); exit; };
    $src = isset($_SERVER['HTTP_ORIGIN']) ? (string) wp_unslash($_SERVER['HTTP_ORIGIN']) : (isset($_SERVER['HTTP_REFERER']) ? (string) wp_unslash($_SERVER['HTTP_REFERER']) : '');
    if (!CVI_Util::same_origin($src) || !empty($_POST['website']) || !CVI_Util::valid_token($token)) $back('bad');
    $nonce = isset($_POST['_wpnonce']) && is_scalar($_POST['_wpnonce']) ? sanitize_text_field(wp_unslash((string) $_POST['_wpnonce'])) : '';
    if (!wp_verify_nonce($nonce, 'cvi_pay_' . $token)) $back('nonce');
    if (!CVI_Util::hit('payip:' . CVI_Util::ip(), 10, 10 * MINUTE_IN_SECONDS) || !CVI_Util::hit('paytok:' . $token, 6, 10 * MINUTE_IN_SECONDS)) $back('rate');

    $r = CVI_DB::get_by_token($token);
    if (!$r || $r->status !== 'sent' || !CVI_Util::payable_range($r->total_cents) || !CVI_Settings::configured() || !CVI_API::licensed()) $back('off');
    // Paiement déjà créé il y a moins de 2 h : on y renvoie le client plutôt que d'en créer un second.
    if ($r->pay_state === 'pending' && self::ok_url($r->checkout_url) && strtotime($r->updated_at . ' UTC') > time() - 2 * HOUR_IN_SECONDS) { wp_redirect($r->checkout_url); exit; }

    $mail = is_email($r->customer_email) ? $r->customer_email : '';
    $title = CVI_Util::one_line('Facture ' . $r->number . ' — ' . CVI_Settings::company_name(), 110);
    // La clé d'idempotence change avec le montant : un clic multiple renvoie le même paiement, un montant modifié en crée un nouveau.
    $res = CVI_API::create_payment((int) $r->total_cents, $title, $mail, 'cvi:' . (int) $r->id, 'cvi-' . (int) $r->id . '-' . (int) $r->total_cents . '-' . (int) floor(time() / 600));
    $d = is_wp_error($res) ? null : $res['data'];
    $url = is_array($d) ? (string) ($d['checkoutUrl'] ?? '') : '';
    if (is_wp_error($res) || !in_array($res['code'], [200, 201], true) || empty($d['id']) || !self::ok_url($url)) {
      CVI_Util::log('facture ' . (int) $r->id . ' : création du paiement impossible' . (is_wp_error($res) ? '' : ' (HTTP ' . $res['code'] . ')'));
      $back('pay');
    }
    CVI_DB::attach_payment($r->id, sanitize_text_field((string) $d['id']), $url, sanitize_key((string) ($d['mode'] ?? '')));
    wp_redirect($url); exit;
  }
}
