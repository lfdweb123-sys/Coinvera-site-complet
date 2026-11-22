<?php
if (!defined('ABSPATH')) exit;

/**
 * Calcul des factures. Tout se fait en ENTIERS (centièmes), jamais en flottants, et TOUJOURS côté serveur :
 * le navigateur n'envoie que des lignes brutes (description, quantité, prix unitaire), jamais un total.
 */
final class CVI_Calc {
  const MAX_LINES = 100;

  /**
   * Lignes saisies [['desc'=>, 'qty'=>, 'unit'=>], …] -> lignes nettoyées [['d'=>, 'q'=>centièmes, 'u'=>centimes], …].
   * Les lignes entièrement vides sont ignorées. Retourne un WP_Error('cvi_line', message) si une ligne est invalide.
   */
  public static function lines($raw) {
    if (!is_array($raw)) return new WP_Error('cvi_line', 'Ajoutez au moins une ligne.');
    $out = []; $n = 0;
    foreach ($raw as $r) {
      $n++;
      if (!is_array($r)) return new WP_Error('cvi_line', "Ligne $n invalide.");
      $d = isset($r['desc']) && is_scalar($r['desc']) ? trim(sanitize_text_field((string) $r['desc'])) : '';
      $q = isset($r['qty']) && is_scalar($r['qty']) ? trim((string) $r['qty']) : '';
      $u = isset($r['unit']) && is_scalar($r['unit']) ? trim((string) $r['unit']) : '';
      if ($d === '' && $u === '') continue;                                      // ligne vide
      if (count($out) >= self::MAX_LINES) return new WP_Error('cvi_line', 'Cent lignes maximum.');
      $qc = CVI_Util::parse_dec($q === '' ? '1' : $q, 6);                        // quantité : 0,01 à 999 999,99
      $uc = CVI_Util::parse_dec($u, 7);                                          // prix unitaire : jusqu'à 9 999 999,99 $
      if ($d === '' || $qc === null || $qc < 1 || $uc === null) return new WP_Error('cvi_line', "Ligne $n invalide : description, quantité et prix unitaire sont requis.");
      $out[] = ['d' => mb_substr($d, 0, 200), 'q' => $qc, 'u' => $uc];
    }
    return $out ? $out : new WP_Error('cvi_line', 'Ajoutez au moins une ligne.');
  }

  /** Total d'une ligne en centimes : quantité (centièmes) × prix, arrondi à l'entier le plus proche. */
  public static function line_total($l) { return intdiv(((int) $l['q']) * ((int) $l['u']) + 50, 100); }

  /**
   * Totaux. $discount en centimes, $tax_bp en points de base (1800 = 18 %).
   * Retourne ['subtotal','discount','tax','total'] ou un WP_Error (remise supérieure au sous-total, montant démesuré).
   */
  public static function totals(array $lines, $discount, $tax_bp) {
    $sub = 0; foreach ($lines as $l) $sub += self::line_total($l);
    $discount = (int) $discount; $tax_bp = (int) $tax_bp;
    if ($sub < 1 || $sub > CVI_Util::MAX_CENTS) return new WP_Error('cvi_total', 'Montant hors limites.');
    if ($discount < 0 || $discount > $sub) return new WP_Error('cvi_total', 'La remise ne peut pas dépasser le sous-total.');
    if ($tax_bp < 0 || $tax_bp > 10000) return new WP_Error('cvi_total', 'Taux de taxe invalide.');
    $taxable = $sub - $discount;
    $tax = intdiv($taxable * $tax_bp + 5000, 10000);
    return ['subtotal' => $sub, 'discount' => $discount, 'tax' => $tax, 'total' => $taxable + $tax];
  }

  /** Lignes stockées (JSON) -> tableau fiable, même si la base a été modifiée à la main. */
  public static function decode($json) {
    $a = json_decode((string) $json, true); $out = [];
    if (!is_array($a)) return $out;
    foreach (array_slice($a, 0, self::MAX_LINES) as $l)
      if (is_array($l) && isset($l['d'], $l['q'], $l['u']) && is_string($l['d']) && is_int($l['q']) && is_int($l['u']) && $l['q'] > 0 && $l['u'] >= 0)
        $out[] = ['d' => mb_substr($l['d'], 0, 200), 'q' => $l['q'], 'u' => $l['u']];
    return $out;
  }
  public static function encode(array $lines) { return wp_json_encode(array_values($lines)); }
  public static function qty_text($q) { $q = (int) $q; return $q % 100 === 0 ? (string) intdiv($q, 100) : rtrim(rtrim(number_format($q / 100, 2, ',', ''), '0'), ','); }
}
