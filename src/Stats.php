<?php

namespace Rllngr\Moniter;

use PDO;
use Throwable;

/**
 * Compteur de pages vues sans cookie ni identifiant.
 *
 * On ne stocke que : jour, chemin de la page, nombre de vues, secondes passées
 * (+ domaine d'origine pour les visites venant d'un autre site, + fuseau horaire du navigateur).
 * Aucune IP, aucun User-Agent, aucun cookie — rien qui permette
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

    public static function record(string $path, ?string $referrer, string $siteHost, ?string $tz = null): void
    {
        $db  = static::db();
        $day = date('Y-m-d');

        $db->prepare('INSERT INTO views (day, path, n) VALUES (?, ?, 1)
                      ON CONFLICT(day, path) DO UPDATE SET n = n + 1')
           ->execute([$day, $path]);

        // Domaine d'origine uniquement, et seulement s'il est externe
        $refHost = $referrer ? strtolower((string) parse_url($referrer, PHP_URL_HOST)) : '';
        $refHost = preg_replace('/^www\./', '', $refHost);
        $own     = preg_replace('/^www\./', '', strtolower($siteHost));
        if ($refHost && $refHost !== $own && mb_strlen($refHost) <= 100) {
            $db->prepare('INSERT INTO referrers (day, host, n) VALUES (?, ?, 1)
                          ON CONFLICT(day, host) DO UPDATE SET n = n + 1')
               ->execute([$day, $refHost]);
        }

        if ($tz && preg_match('#^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$#', $tz) && strlen($tz) <= 40) {
            $db->prepare('INSERT INTO zones (day, tz, n) VALUES (?, ?, 1)
                          ON CONFLICT(day, tz) DO UPDATE SET n = n + 1')
               ->execute([$day, $tz]);
        }

        // Ménage occasionnel
        if (random_int(1, 200) === 1) {
            $limit = date('Y-m-d', strtotime('-' . static::RETENTION_DAYS . ' days'));
            $db->prepare('DELETE FROM views WHERE day < ?')->execute([$limit]);
            $db->prepare('DELETE FROM referrers WHERE day < ?')->execute([$limit]);
            $db->prepare('DELETE FROM zones WHERE day < ?')->execute([$limit]);
        }
    }

    /** Ajoute le temps visible d'une page vue aujourd'hui (une page ouverte avant minuit ne compte pas). */
    public static function recordTime(string $path, int $secs): void
    {
        static::db()->prepare('UPDATE views SET secs = secs + ? WHERE day = ? AND path = ?')
            ->execute([$secs, date('Y-m-d'), $path]);
    }

    public static function export(string $since): array
    {
        $db = static::db();
        $pages = $db->prepare('SELECT day AS d, path AS p, n AS v, secs AS s FROM views WHERE day >= ? ORDER BY day');
        $pages->execute([$since]);
        $refs = $db->prepare('SELECT day AS d, host AS h, n AS v FROM referrers WHERE day >= ? ORDER BY day');
        $refs->execute([$since]);
        $zones = $db->prepare('SELECT day AS d, tz AS z, n AS v FROM zones WHERE day >= ? ORDER BY day');
        $zones->execute([$since]);

        return [
            'since'     => $since,
            'today'     => date('Y-m-d'),
            'pages'     => $pages->fetchAll(PDO::FETCH_ASSOC),
            'referrers' => $refs->fetchAll(PDO::FETCH_ASSOC),
            'zones'     => $zones->fetchAll(PDO::FETCH_ASSOC),
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
            static::record(
                $body['p'],
                is_string($body['r'] ?? null) ? $body['r'] : null,
                (string) parse_url($origin, PHP_URL_HOST),
                is_string($body['z'] ?? null) ? $body['z'] : null
            );
        } catch (Throwable $e) {
            // silencieux : les stats ne doivent jamais casser le site
        }
    }

    /** Temps visible envoyé au départ de la page (par tranches, plafonné à 30 min par page vue). */
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
