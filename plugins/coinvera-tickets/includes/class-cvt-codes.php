<?php
if (!defined('ABSPATH')) exit;

/** Codes de billet : 10 caractères aléatoires base32 + 6 caractères de contrôle (HMAC). Un code mal formé ou au contrôle faux est rejeté avant toute requête SQL. */
final class CVT_Codes {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  private static function b32($bin, $n) {
    $bits = ''; foreach (str_split($bin) as $ch) $bits .= str_pad(decbin(ord($ch)), 8, '0', STR_PAD_LEFT);
    $out = ''; for ($i = 0; $i < $n; $i++) $out .= self::ALPHA[bindec(substr($bits, $i * 5, 5))];
    return $out;
  }
  private static function check($c10) { return self::b32(hash_hmac('sha256', $c10, wp_salt('auth') . '|cvt', true), 6); }

  public static function generate() {
    $c = ''; for ($i = 0; $i < 10; $i++) $c .= self::ALPHA[random_int(0, 31)];
    return $c . self::check($c);
  }
  /** Normalise une saisie (espaces, tirets, minuscules) ; retourne le code valide ou '' (sans toucher à la base). */
  public static function parse($raw) {
    if (!is_string($raw) || strlen($raw) > 40) return '';
    $c = strtoupper(preg_replace('/[\s-]+/', '', $raw));
    if (!preg_match('/^[A-Z2-7]{16}$/', $c)) return '';
    return hash_equals(self::check(substr($c, 0, 10)), substr($c, 10)) ? $c : '';
  }
  public static function pretty($c) { return implode('-', str_split((string) $c, 4)); }
}
