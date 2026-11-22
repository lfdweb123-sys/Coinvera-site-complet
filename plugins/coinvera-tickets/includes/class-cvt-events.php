<?php
if (!defined('ABSPATH')) exit;

/** Événements : type de contenu privé « cvt_event », types de billets, boîtes d'édition. */
final class CVT_Events {
  const CPT = 'cvt_event';
  private static $cache = [];

  public static function init() {
    add_action('init', [__CLASS__, 'register']);
    add_action('add_meta_boxes', function () {
      add_meta_box('cvt_event', 'Événement et billets', [__CLASS__, 'box'], self::CPT, 'normal', 'high');
      add_meta_box('cvt_stats', 'Statistiques', [__CLASS__, 'box_stats'], self::CPT, 'side');
    });
    add_action('save_post_' . self::CPT, [__CLASS__, 'save'], 10, 2);
    add_action('admin_enqueue_scripts', function ($hook) {
      $s = get_current_screen(); if (!$s || $s->post_type !== self::CPT || !in_array($hook, ['post.php', 'post-new.php'], true)) return;
      wp_enqueue_script('cvt-admin', CVT_URL . 'assets/cvt-admin.js', [], CVT_VERSION, true);
    });
  }
  public static function register() {
    register_post_type(self::CPT, ['labels' => ['name' => 'Événements', 'singular_name' => 'Événement', 'add_new_item' => 'Nouvel événement', 'edit_item' => 'Modifier l’événement', 'menu_name' => 'Événements'],
      'public' => false, 'show_ui' => true, 'show_in_menu' => 'cvt-orders', 'show_in_rest' => false, 'supports' => ['title', 'editor', 'thumbnail'], 'capability_type' => 'post', 'map_meta_cap' => true, 'rewrite' => false, 'query_var' => false]);
  }

  private static function ts($local) { if (!$local) return 0; $g = get_gmt_from_date($local . ':00'); $t = strtotime($g . ' UTC'); return $t ? (int) $t : 0; }

  /** Événement lisible et borné, ou null. */
  public static function get($id) {
    $id = (int) $id; if ($id < 1) return null;
    if (array_key_exists($id, self::$cache)) return self::$cache[$id];
    $p = get_post($id); $out = null;
    if ($p && $p->post_type === self::CPT && $p->post_status === 'publish') {
      $m = function ($k) use ($id) { return get_post_meta($id, '_cvt_' . $k, true); };
      $types = []; $raw = json_decode((string) $m('types'), true); $cap = max(1, (int) $m('capacity'));
      foreach (is_array($raw) ? array_slice($raw, 0, 10) : [] as $t)
        if (is_array($t) && isset($t['id'], $t['name'], $t['price_cents']) && preg_match('/^[a-z0-9]{3,12}$/', (string) $t['id']) && (int) $t['price_cents'] >= 100 && (int) $t['price_cents'] <= CVT_Util::MAX_CENTS)
          $types[(string) $t['id']] = ['id' => (string) $t['id'], 'name' => CVT_Util::one_line((string) $t['name'], 80), 'price' => (int) $t['price_cents'], 'quota' => max(0, min($cap, (int) ($t['quota'] ?? 0)))];
      $out = ['id' => $id, 'title' => CVT_Util::one_line($p->post_title, 150), 'desc' => (string) $p->post_content, 'image' => (string) get_the_post_thumbnail_url($id, 'large'),
        'starts_local' => (string) $m('starts_at'), 'starts_ts' => self::ts((string) $m('starts_at')), 'venue' => CVT_Util::one_line((string) $m('venue'), 150), 'address' => CVT_Util::one_line((string) $m('address'), 250),
        'capacity' => $cap, 'open_ts' => self::ts((string) $m('sales_open')), 'close_ts' => self::ts((string) $m('sales_close')), 'max' => max(1, min(20, (int) ($m('max_per_order') ?: 10))), 'closed' => (bool) $m('closed'), 'types' => $types];
    }
    return self::$cache[$id] = $out;
  }
  /** open | closed | past | not_open | ended */
  public static function sale_state($ev, $now = null) {
    $now = $now ?? time();
    if ($ev['closed'] || !$ev['types']) return 'closed';
    if ($ev['starts_ts'] && $now > $ev['starts_ts'] + 6 * HOUR_IN_SECONDS) return 'past';
    if ($ev['open_ts'] && $now < $ev['open_ts']) return 'not_open';
    if ($ev['close_ts'] && $now > $ev['close_ts']) return 'ended';
    return 'open';
  }
  public static function all_published() { return get_posts(['post_type' => self::CPT, 'post_status' => 'publish', 'numberposts' => 200, 'orderby' => 'title', 'order' => 'ASC']); }

  public static function box($post) {
    wp_nonce_field('cvt_event_' . $post->ID, 'cvt_event_nonce'); $m = function ($k, $d = '') use ($post) { $v = get_post_meta($post->ID, '_cvt_' . $k, true); return $v === '' ? $d : $v; };
    echo '<table class="form-table" role="presentation">';
    printf('<tr><th><label for="cvt_starts">Début</label></th><td><input type="datetime-local" id="cvt_starts" name="cvt_starts_at" value="%s"> <span class="description">Heure du site.</span></td></tr>', esc_attr(str_replace(' ', 'T', (string) $m('starts_at'))));
    printf('<tr><th><label>Lieu</label></th><td><input type="text" name="cvt_venue" class="regular-text" maxlength="150" value="%s" placeholder="Nom du lieu"><br><input type="text" name="cvt_address" class="large-text" maxlength="250" value="%s" placeholder="Adresse"></td></tr>', esc_attr($m('venue')), esc_attr($m('address')));
    printf('<tr><th><label>Capacité totale</label></th><td><input type="number" min="1" max="1000000" name="cvt_capacity" value="%d" class="small-text"> <span class="description">Jauge garantie : jamais dépassée, même avec des achats simultanés.</span></td></tr>', (int) $m('capacity', 100));
    printf('<tr><th><label>Billets max par commande</label></th><td><input type="number" min="1" max="20" name="cvt_max" value="%d" class="small-text"></td></tr>', (int) $m('max_per_order', 10));
    printf('<tr><th><label>Fenêtre de vente</label></th><td>du <input type="datetime-local" name="cvt_sales_open" value="%s"> au <input type="datetime-local" name="cvt_sales_close" value="%s"> <span class="description">Facultatif.</span></td></tr>', esc_attr(str_replace(' ', 'T', (string) $m('sales_open'))), esc_attr(str_replace(' ', 'T', (string) $m('sales_close'))));
    printf('<tr><th>Ventes</th><td><label><input type="checkbox" name="cvt_closed" value="1"%s> Fermer les ventes</label></td></tr></table>', checked((bool) $m('closed'), true, false));
    $types = json_decode((string) $m('types', '[]'), true); if (!is_array($types) || !$types) $types = [['id' => '', 'name' => 'Standard', 'price_cents' => 1000, 'quota' => 0]];
    echo '<h4>Types de billets (1 à 10)</h4><table class="widefat" id="cvt-types"><thead><tr><th>Nom</th><th style="width:130px">Prix (USD, min 1)</th><th style="width:130px">Quota (0 = jauge)</th><th style="width:30px"></th></tr></thead><tbody>';
    $row = function ($i, $t) { return '<tr class="cvt-type"><td><input type="hidden" name="cvt_types[' . $i . '][id]" value="' . esc_attr($t['id'] ?? '') . '"><input type="text" class="large-text" maxlength="80" name="cvt_types[' . $i . '][name]" value="' . esc_attr($t['name'] ?? '') . '"></td>'
      . '<td><input type="text" inputmode="decimal" class="small-text" name="cvt_types[' . $i . '][price]" value="' . esc_attr(isset($t['price_cents']) ? rtrim(rtrim(number_format($t['price_cents'] / 100, 2, '.', ''), '0'), '.') : '') . '"></td><td><input type="number" min="0" class="small-text" name="cvt_types[' . $i . '][quota]" value="' . (int) ($t['quota'] ?? 0) . '"></td><td><button type="button" class="button-link cvt-rm" aria-label="Supprimer">✕</button></td></tr>'; };
    foreach (array_values($types) as $i => $t) echo $row($i, $t);
    echo '</tbody></table><template id="cvt-tpl">' . $row('__I__', []) . '</template><p><button type="button" class="button" id="cvt-add">Ajouter un type</button></p><p class="description">Les prix sont lus côté serveur à chaque achat : le formulaire public ne peut pas les modifier. Pas de billet gratuit dans cette version (utilisez « Émettre des billets offerts »).</p>';
  }
  public static function save($id, $post) {
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (!isset($_POST['cvt_event_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash((string) $_POST['cvt_event_nonce'])), 'cvt_event_' . $id) || !current_user_can('edit_post', $id)) return;
    $dt = function ($k) { $v = isset($_POST[$k]) && is_scalar($_POST[$k]) ? sanitize_text_field(wp_unslash((string) $_POST[$k])) : ''; return preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $v) ? str_replace('T', ' ', $v) : ''; };
    $txt = function ($k, $n) { return isset($_POST[$k]) && is_scalar($_POST[$k]) ? mb_substr(trim(sanitize_text_field(wp_unslash((string) $_POST[$k]))), 0, $n) : ''; };
    $cap = max(1, min(1000000, isset($_POST['cvt_capacity']) ? absint($_POST['cvt_capacity']) : 100));
    update_post_meta($id, '_cvt_starts_at', $dt('cvt_starts_at')); update_post_meta($id, '_cvt_sales_open', $dt('cvt_sales_open')); update_post_meta($id, '_cvt_sales_close', $dt('cvt_sales_close'));
    update_post_meta($id, '_cvt_venue', $txt('cvt_venue', 150)); update_post_meta($id, '_cvt_address', $txt('cvt_address', 250)); update_post_meta($id, '_cvt_capacity', $cap);
    update_post_meta($id, '_cvt_max_per_order', max(1, min(20, isset($_POST['cvt_max']) ? absint($_POST['cvt_max']) : 10))); update_post_meta($id, '_cvt_closed', empty($_POST['cvt_closed']) ? 0 : 1);
    $out = []; $raw = isset($_POST['cvt_types']) && is_array($_POST['cvt_types']) ? wp_unslash($_POST['cvt_types']) : [];
    foreach (array_slice($raw, 0, 10) as $t) {
      if (!is_array($t)) continue; $name = isset($t['name']) && is_scalar($t['name']) ? mb_substr(trim(sanitize_text_field((string) $t['name'])), 0, 80) : '';
      $c = CVT_Util::to_cents(isset($t['price']) && is_scalar($t['price']) ? (string) $t['price'] : '', 100); if ($name === '' || $c === null) continue;
      $tid = isset($t['id']) && is_scalar($t['id']) && preg_match('/^[a-z0-9]{3,12}$/', (string) $t['id']) ? (string) $t['id'] : 't' . bin2hex(random_bytes(3));   // identifiant stable : les billets déjà vendus restent rattachés
      $out[] = ['id' => $tid, 'name' => $name, 'price_cents' => $c, 'quota' => min($cap, max(0, isset($t['quota']) ? absint($t['quota']) : 0))];
    }
    update_post_meta($id, '_cvt_types', wp_json_encode($out)); unset(self::$cache[(int) $id]);
  }
  public static function box_stats($post) {
    $s = CVT_DB::stats((int) $post->ID); $cap = max(1, (int) get_post_meta($post->ID, '_cvt_capacity', true));
    printf('<p>Vendus : <strong>%d</strong><br>Réservés (paiement en cours) : <strong>%d</strong><br>Contrôlés : <strong>%d</strong><br>Restants : <strong>%d</strong> / %d</p>', $s['sold'], $s['held'], $s['used'], max(0, $cap - $s['sold'] - $s['held']), $cap);
    echo '<p><code>[coinvera_event id="' . (int) $post->ID . '"]</code></p>';
  }
}
