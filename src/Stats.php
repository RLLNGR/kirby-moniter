<?php

namespace Rllngr\Moniter;

use PDO;
use Throwable;

/**
 * Compteur de pages vues sans cookie ni identifiant.
 *
 * On ne stocke que des compteurs par jour, chacun dans sa table (jamais croisés entre eux) :
 * pages vues et temps de lecture, domaine d'origine, fuseau horaire + région de la langue,
 * langue, type d'appareil, pages d'entrée (et si la visite s'est poursuivie), clics sortants,
 * campagnes. Aucune IP, aucun User-Agent, aucun cookie, aucun identifiant — rien qui permette
 * de reconnaître un visiteur.
 */
class Stats
{
    // Robots, outils de monitoring et navigateurs automatisés — filtrés au comptage, jamais enregistrés
    const BOT_PATTERN = '/bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|preview|lighthouse|pagespeed|gtmetrix|headless|phantom|selenium|puppeteer|playwright|monitor|uptime|pingdom|statuscake|curl|wget|python|httpclient|axios|node-fetch|undici|go-http|java\/|okhttp|scrapy|feed|rss/i';

    const RETENTION_DAYS = 400;

    private static ?PDO $db = null;

    public static function available(): bool
    {
        return extension_loaded('pdo_sqlite');
    }

    private static function db(): PDO
    {
        if (static::$db) return static::$db;

        $dir = kirby()->root('logs') . '/moniter';
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        $db = new PDO('sqlite:' . $dir . '/stats.sqlite');
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->exec('PRAGMA busy_timeout = 3000');
        $db->exec('PRAGMA journal_mode = WAL');
        $db->exec('CREATE TABLE IF NOT EXISTS views (
            day  TEXT NOT NULL,
            path TEXT NOT NULL,
            n    INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, path)
        ) WITHOUT ROWID');
        // 1.3 : secondes cumulées où la page est restée visible
        try { $db->exec('ALTER TABLE views ADD COLUMN secs INTEGER NOT NULL DEFAULT 0'); } catch (Throwable $e) {}
        // 1.3 : fuseau horaire du navigateur (« Europe/Paris »), d'où Moniter déduit le pays — jamais l'IP
        $db->exec('CREATE TABLE IF NOT EXISTS zones (
            day  TEXT NOT NULL,
            tz   TEXT NOT NULL,
            n    INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, tz)
        ) WITHOUT ROWID');
        // 1.3 : langue principale du navigateur (« fr », « en »…)
        $db->exec('CREATE TABLE IF NOT EXISTS langs (
            day  TEXT NOT NULL,
            lang TEXT NOT NULL,
            n    INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, lang)
        ) WITHOUT ROWID');
        // 1.4 : fuseau + région de la langue (« fr-BE » → BE), pour départager les fuseaux partagés
        //       entre plusieurs pays ; remplace `zones` (toujours exportée pour l'historique)
        $db->exec('CREATE TABLE IF NOT EXISTS locales (
            day    TEXT NOT NULL,
            tz     TEXT NOT NULL,
            region TEXT NOT NULL,
            n      INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, tz, region)
        ) WITHOUT ROWID');
        // 1.4 : mobile / tablet / desktop, déduit dans le navigateur (écran tactile + taille d'écran)
        $db->exec('CREATE TABLE IF NOT EXISTS devices (
            day  TEXT NOT NULL,
            type TEXT NOT NULL,
            n    INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, type)
        ) WITHOUT ROWID');
        // 1.4 : pages d'entrée — n arrivées, dont `cont` suivies d'une autre page, dont `direct` sans référent
        $db->exec('CREATE TABLE IF NOT EXISTS entries (
            day    TEXT NOT NULL,
            path   TEXT NOT NULL,
            n      INTEGER NOT NULL DEFAULT 0,
            cont   INTEGER NOT NULL DEFAULT 0,
            direct INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, path)
        ) WITHOUT ROWID');
        // 1.4 : clics sur tel:, mailto:, liens vers un autre site, fichiers
        $db->exec('CREATE TABLE IF NOT EXISTS actions (
            day    TEXT NOT NULL,
            type   TEXT NOT NULL,
            target TEXT NOT NULL,
            n      INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, type, target)
        ) WITHOUT ROWID');
        // 1.4 : utm_campaign (ou utm_source) des arrivées
        $db->exec('CREATE TABLE IF NOT EXISTS campaigns (
            day  TEXT NOT NULL,
            name TEXT NOT NULL,
            n    INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, name)
        ) WITHOUT ROWID');
        $db->exec('CREATE TABLE IF NOT EXISTS referrers (
            day  TEXT NOT NULL,
            host TEXT NOT NULL,
            n    INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, host)
        ) WITHOUT ROWID');

        return static::$db = $db;
    }

    public static function isBot(?string $ua): bool
    {
        return empty($ua) || preg_match(static::BOT_PATTERN, $ua) === 1;
    }

    /**
     * Origines autorisées à envoyer des hits : le site Kirby lui-même
     * + les fronts headless déclarés dans `moniter.stats.origins`.
     */
    public static function allowedOrigin(?string $origin): bool
    {
        if (empty($origin)) return false;
        $host    = parse_url($origin, PHP_URL_HOST);
        $allowed = array_merge(
            [kirby()->url()],
            (array) kirby()->option('moniter.stats.origins', [])
        );
        foreach ($allowed as $url) {
            if ($host && strcasecmp($host, (string) parse_url($url, PHP_URL_HOST)) === 0) return true;
        }
        return false;
    }

    public static function normalizePath(string $path): ?string
    {
        $path = parse_url($path, PHP_URL_PATH) ?? '';
        $path = '/' . trim(rawurldecode($path), '/');
        if (mb_strlen($path) > 200) return null;
        // Panel, API, fichiers techniques : jamais comptés
        if (preg_match('#^/(panel|api|media|assets|moniter|_nuxt|__nuxt|favicon|robots\.txt|sitemap)#i', $path)) return null;
        return $path;
    }

    const TABLES = ['views', 'referrers', 'zones', 'locales', 'langs', 'devices', 'entries', 'actions', 'campaigns'];
    const DEVICES = ['mobile', 'tablet', 'desktop'];
    const ACTIONS = ['tel', 'mail', 'out', 'file'];

    private static function bump(string $sql, array $params): void
    {
        static::db()->prepare($sql)->execute($params);
    }

    /**
     * Une page vue. $hit : p (chemin, déjà normalisé), r (référent), z (fuseau), l (langue « fr-BE »),
     * d (appareil), e (1 = arrivée sur le site, envoyé par le beacon ≥ 1.4), c (campagne).
     */
    public static function record(array $hit, string $siteHost): void
    {
        $day  = date('Y-m-d');
        $path = $hit['p'];
        $str  = fn ($k) => is_string($hit[$k] ?? null) ? $hit[$k] : '';

        static::bump('INSERT INTO views (day, path, n) VALUES (?, ?, 1)
                      ON CONFLICT(day, path) DO UPDATE SET n = n + 1', [$day, $path]);

        // Domaine d'origine uniquement, et seulement s'il est externe
        $refHost = $str('r') ? strtolower((string) parse_url($str('r'), PHP_URL_HOST)) : '';
        $refHost = preg_replace('/^www\./', '', $refHost);
        $own     = preg_replace('/^www\./', '', strtolower($siteHost));
        $external = $refHost && $refHost !== $own;
        if ($external && mb_strlen($refHost) <= 100) {
            static::bump('INSERT INTO referrers (day, host, n) VALUES (?, ?, 1)
                          ON CONFLICT(day, host) DO UPDATE SET n = n + 1', [$day, $refHost]);
        }

        // « fr-BE » → langue « fr », région « BE »
        $parts  = explode('-', str_replace('_', '-', $str('l')));
        $lang   = strtolower($parts[0]);
        $region = strtoupper($parts[1] ?? '');
        if (!preg_match('/^[A-Z]{2}$/', $region)) $region = '';
        $tz = $str('z');
        if (!preg_match('#^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$#', $tz) || strlen($tz) > 40) $tz = '';
        if ($tz !== '' || $region !== '') {
            static::bump('INSERT INTO locales (day, tz, region, n) VALUES (?, ?, ?, 1)
                          ON CONFLICT(day, tz, region) DO UPDATE SET n = n + 1', [$day, $tz, $region]);
        }
        if (preg_match('/^[a-z]{2,3}$/', $lang)) {
            static::bump('INSERT INTO langs (day, lang, n) VALUES (?, ?, 1)
                          ON CONFLICT(day, lang) DO UPDATE SET n = n + 1', [$day, $lang]);
        }

        if (in_array($str('d'), static::DEVICES, true)) {
            static::bump('INSERT INTO devices (day, type, n) VALUES (?, ?, 1)
                          ON CONFLICT(day, type) DO UPDATE SET n = n + 1', [$day, $str('d')]);
        }

        // Arrivée sur le site : seulement si le beacon le dit (les anciens snippets Nuxt n'envoient pas `e`)
        if (($hit['e'] ?? 0) === 1) {
            $direct = $str('r') === '' ? 1 : 0;
            static::bump('INSERT INTO entries (day, path, n, direct) VALUES (?, ?, 1, ?)
                          ON CONFLICT(day, path) DO UPDATE SET n = n + 1, direct = direct + excluded.direct', [$day, $path, $direct]);
            $campaign = mb_strtolower(trim($str('c')));
            if ($campaign !== '' && mb_strlen($campaign) <= 60) {
                static::bump('INSERT INTO campaigns (day, name, n) VALUES (?, ?, 1)
                              ON CONFLICT(day, name) DO UPDATE SET n = n + 1', [$day, $campaign]);
            }
        }

        // Ménage occasionnel
        if (random_int(1, 200) === 1) {
            $limit = date('Y-m-d', strtotime('-' . static::RETENTION_DAYS . ' days'));
            foreach (static::TABLES as $table) {
                static::bump("DELETE FROM $table WHERE day < ?", [$limit]);
            }
        }
    }

    /** La visite arrivée sur $path s'est poursuivie sur une autre page (le rebond se déduit de l'inverse). */
    public static function recordContinue(string $path): void
    {
        static::bump('UPDATE entries SET cont = MIN(n, cont + 1) WHERE day = ? AND path = ?', [date('Y-m-d'), $path]);
    }

    public static function recordAction(string $type, string $target): void
    {
        static::bump('INSERT INTO actions (day, type, target, n) VALUES (?, ?, ?, 1)
                      ON CONFLICT(day, type, target) DO UPDATE SET n = n + 1', [date('Y-m-d'), $type, $target]);
    }

    /** Ajoute le temps de lecture d'une page vue aujourd'hui (une page ouverte avant minuit ne compte pas). */
    public static function recordTime(string $path, int $secs): void
    {
        static::db()->prepare('UPDATE views SET secs = secs + ? WHERE day = ? AND path = ?')
            ->execute([$secs, date('Y-m-d'), $path]);
    }

    public static function export(string $since): array
    {
        $db  = static::db();
        $all = function (string $sql) use ($db, $since) {
            $q = $db->prepare($sql);
            $q->execute([$since]);
            return $q->fetchAll(PDO::FETCH_ASSOC);
        };

        return [
            'since'     => $since,
            'today'     => date('Y-m-d'),
            'version'   => 2,
            'pages'     => $all('SELECT day AS d, path AS p, n AS v, secs AS s FROM views WHERE day >= ? ORDER BY day'),
            'referrers' => $all('SELECT day AS d, host AS h, n AS v FROM referrers WHERE day >= ? ORDER BY day'),
            // Avant 1.4 : fuseau seul (région vide). Le jour de la mise à jour, un même fuseau peut venir des deux tables.
            'zones'     => array_merge(
                $all("SELECT day AS d, tz AS z, '' AS r, n AS v FROM zones WHERE day >= ? ORDER BY day"),
                $all('SELECT day AS d, tz AS z, region AS r, n AS v FROM locales WHERE day >= ? ORDER BY day')
            ),
            'langs'     => $all('SELECT day AS d, lang AS l, n AS v FROM langs WHERE day >= ? ORDER BY day'),
            'devices'   => $all('SELECT day AS d, type AS t, n AS v FROM devices WHERE day >= ? ORDER BY day'),
            'entries'   => $all('SELECT day AS d, path AS p, n AS v, cont AS c, direct AS x FROM entries WHERE day >= ? ORDER BY day'),
            'actions'   => $all('SELECT day AS d, type AS t, target AS g, n AS v FROM actions WHERE day >= ? ORDER BY day'),
            'campaigns' => $all('SELECT day AS d, name AS c, n AS v FROM campaigns WHERE day >= ? ORDER BY day'),
        ];
    }

    /** Corps JSON d'un envoi du beacon, ou null s'il ne doit pas compter (robot, Panel, autre site…). */
    private static function beaconBody(): ?array
    {
        if (!static::available()) return null;
        $kirby = kirby();
        // Les personnes connectées au Panel (le client qui édite, toi) ne comptent pas
        if ($kirby->user()) return null;
        if (static::isBot($_SERVER['HTTP_USER_AGENT'] ?? null)) return null;
        if (!static::allowedOrigin($_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? null)) return null;

        $body = json_decode($kirby->request()->body()->contents() ?: '', true);
        if (!is_array($body) || !is_string($body['p'] ?? null)) return null;
        $body['p'] = static::normalizePath($body['p']);
        return $body['p'] === null ? null : $body;
    }

    /** Hit reçu du beacon. Ne lève jamais d'erreur vers le visiteur. */
    public static function handleHit(): void
    {
        try {
            $body = static::beaconBody();
            if (!$body) return;
            $origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
            static::record($body, (string) parse_url($origin, PHP_URL_HOST));
        } catch (Throwable $e) {
            // silencieux : les stats ne doivent jamais casser le site
        }
    }

    /** La page d'entrée `p` a été suivie d'une autre page dans le même onglet. */
    public static function handleContinue(): void
    {
        try {
            $body = static::beaconBody();
            if ($body) static::recordContinue($body['p']);
        } catch (Throwable $e) {
        }
    }

    /** Clic sur un lien téléphone, e-mail, vers un autre site ou vers un fichier. */
    public static function handleAction(): void
    {
        try {
            $body = static::beaconBody();
            if (!$body) return;
            $type   = $body['a'] ?? '';
            $target = is_string($body['g'] ?? null) ? trim($body['g']) : '';
            if (!in_array($type, static::ACTIONS, true) || $target === '' || mb_strlen($target) > 120) return;
            static::recordAction($type, $target);
        } catch (Throwable $e) {
        }
    }

    /** Temps de lecture envoyé au départ de la page (par tranches, plafonné à 30 min par page vue). */
    public static function handleTime(): void
    {
        try {
            $body = static::beaconBody();
            if (!$body) return;
            $secs = (int) ($body['t'] ?? 0);
            if ($secs < 1 || $secs > 1800) return;
            static::recordTime($body['p'], $secs);
        } catch (Throwable $e) {
        }
    }
}
