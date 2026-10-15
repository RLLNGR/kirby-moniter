<?php

namespace Rllngr\Moniter;

use Locale;
use Throwable;

/**
 * Résumé de l'audience pour la vue du Panel, calculé sur place depuis stats.sqlite.
 * Même logique que `statsSummary` côté Moniter (server/src/cron/stats.js) : garder les deux alignés.
 */
class Summary
{
    const PERIODS = ['7', '30', 'month', '90', '365'];

    // Hôte d'origine → famille. L'ordre compte : gemini.google.com et mail.google.com avant google.
    const REFERRER_KINDS = [
        'ai'     => '/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|mistral\.ai)$/',
        'mail'   => '/(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|webmail\.|mail\.)/',
        'search' => '/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|qwant\.com|search\.yahoo\.com|yahoo\.com|yandex\.[a-z]+|baidu\.com|startpage\.com|search\.brave\.com|lilo\.org)$/',
        'social' => '/(^|\.)(facebook\.com|fb\.com|instagram\.com|t\.co|twitter\.com|x\.com|linkedin\.com|lnkd\.in|pinterest\.[a-z.]+|pin\.it|youtube\.com|tiktok\.com|reddit\.com|threads\.net|bsky\.app|mastodon\.[a-z]+|whatsapp\.com|wa\.me)$/',
    ];

    // Les clics depuis l'app Moniter ne sont pas une provenance
    const MONITER_HOST = 'moniter.rollinger.design';

    private static ?array $tzCountry = null;
    private static ?array $tzShared  = null;

    public static function addDays(string $day, int $n): string
    {
        return date('Y-m-d', strtotime("$day 12:00 $n days"));
    }

    /**
     * Période affichée et période de comparaison, de même longueur. Bornes : [start, end[.
     * « month » : du 1er à aujourd'hui, comparé aux mêmes jours du mois précédent.
     */
    public static function range(string $period): array
    {
        $today = date('Y-m-d');
        $end   = static::addDays($today, 1);
        if ($period === 'month') {
            $start     = substr($today, 0, 8) . '01';
            $prevStart = date('Y-m-01', strtotime("$start 12:00 -1 month"));
            $elapsed   = (int) round((strtotime($end) - strtotime($start)) / 86400);
            // 31 mars → comparé au 1er–29 février, pas au-delà du mois précédent
            $prevEnd   = min(static::addDays($prevStart, $elapsed), $start);
            return compact('period', 'start', 'end', 'prevStart', 'prevEnd') + ['days' => $elapsed];
        }
        $days  = in_array($period, ['7', '30', '90', '365'], true) ? (int) $period : 30;
        $start = static::addDays($end, -$days);
        return [
            'period' => (string) $days, 'days' => $days, 'start' => $start, 'end' => $end,
            'prevStart' => static::addDays($start, -$days), 'prevEnd' => $start,
        ];
    }

    private static function one(string $sql, array $params = []): mixed
    {
        $q = Stats::db()->prepare($sql);
        $q->execute($params);
        return $q->fetchColumn();
    }

    private static function all(string $sql, array $params): array
    {
        $q = Stats::db()->prepare($sql);
        $q->execute($params);
        return $q->fetchAll(\PDO::FETCH_ASSOC);
    }

    private static function firstDay(string $table, string $where = ''): ?string
    {
        return static::one("SELECT MIN(day) FROM $table WHERE 1 $where") ?: null;
    }

    /** Temps moyen par page vue, seulement sur les jours où le site mesurait déjà le temps (≥ 1.3) */
    private static function averageSeconds(?string $first, string $from, string $to): ?int
    {
        if (!$first) return null;
        $r = static::all('SELECT COALESCE(SUM(secs), 0) AS s, COALESCE(SUM(n), 0) AS v FROM views WHERE day >= ? AND day < ?', [max($first, $from), $to])[0];
        return $r['v'] && $r['s'] ? (int) round($r['s'] / $r['v']) : null;
    }

    /** Chiffres clés sur [from, to[ — chaque mesure seulement sur les jours où elle existait */
    private static function kpisFor(string $from, string $to, array $firsts): array
    {
        $views = fn ($a, $b) => (int) static::one('SELECT COALESCE(SUM(n), 0) FROM views WHERE day >= ? AND day < ?', [$a, $b]);
        $visits = $perVisit = $bounce = $direct = null;
        if ($firsts['entries'] && $firsts['entries'] < $to) {
            $since = max($firsts['entries'], $from);
            $e = static::all('SELECT COALESCE(SUM(n), 0) AS n, COALESCE(SUM(cont), 0) AS c, COALESCE(SUM(direct), 0) AS x
                              FROM entries WHERE day >= ? AND day < ?', [$since, $to])[0];
            if ($e['n']) {
                $visits   = (int) $e['n'];
                // Pages vues sur les mêmes jours que les entrées, sinon le ratio est faussé au passage en 1.4
                $perVisit = $views($since, $to) / $e['n'];
                $bounce   = 1 - $e['c'] / $e['n'];
                $direct   = (int) $e['x'];
            }
        }
        return [
            'views' => $views($from, $to), 'visits' => $visits, 'pages_per_visit' => $perVisit,
            'bounce' => $bounce, 'direct' => $direct, 'avg_seconds' => static::averageSeconds($firsts['seconds'], $from, $to),
        ];
    }

    public static function referrerKind(string $host): string
    {
        $h = preg_replace('/^www\./', '', strtolower($host));
        foreach (static::REFERRER_KINDS as $kind => $re) {
            if (preg_match($re, $h)) return $kind;
        }
        return 'other';
    }

    /**
     * Pays d'un visiteur : le fuseau d'abord. La région de la langue (« fr-BE » → BE) ne tranche qu'entre
     * les pays d'un fuseau partagé, ou quand le fuseau ne dit rien (UTC des navigateurs anti-pistage).
     */
    public static function countryOf(string $tz, string $region): ?string
    {
        static::$tzCountry ??= json_decode(file_get_contents(__DIR__ . '/data/tz-countries.json'), true);
        static::$tzShared  ??= json_decode(file_get_contents(__DIR__ . '/data/tz-shared-countries.json'), true);
        if ($region && in_array($region, static::$tzShared[$tz] ?? [], true)) return $region;
        return static::$tzCountry[$tz] ?? ($region ?: null);
    }

    private static function displayName(string $kind, string $code, string $locale): string
    {
        if (!class_exists(Locale::class)) return $code;
        try {
            $name = $kind === 'region' ? Locale::getDisplayRegion('-' . $code, $locale) : Locale::getDisplayLanguage($code, $locale);
            return $name ? mb_strtoupper(mb_substr($name, 0, 1)) . mb_substr($name, 1) : $code;
        } catch (Throwable $e) {
            return $code;
        }
    }

    public static function summary(string $period, string $locale = 'fr'): array
    {
        $r = static::range($period);
        ['start' => $start, 'end' => $end, 'prevStart' => $prevStart, 'prevEnd' => $prevEnd] = $r;
        $firsts = [
            'views'   => static::firstDay('views'),
            'seconds' => static::firstDay('views', 'AND secs > 0'),
            'entries' => static::firstDay('entries'),
        ];

        // Comparaison : seulement si la période précédente est entièrement couverte par la mesure (sinon +600 % trompeurs)
        $current = static::kpisFor($start, $end, $firsts);
        $before  = static::kpisFor($prevStart, $prevEnd, $firsts);
        $kpi = fn ($key, $first) => [
            'value'    => $current[$key],
            'previous' => $first && $first <= $prevStart ? $before[$key] : null,
        ];
        $kpis = [
            'views'           => $kpi('views', $firsts['views']),
            'visits'          => $kpi('visits', $firsts['entries']),
            'pages_per_visit' => $kpi('pages_per_visit', $firsts['entries']),
            'avg_seconds'     => $kpi('avg_seconds', $firsts['seconds']),
            'bounce'          => $kpi('bounce', $firsts['entries']),
        ];

        $span = [$start, $end];
        $byDay = array_column(static::all('SELECT day, SUM(n) AS views FROM views WHERE day >= ? AND day < ? GROUP BY day', $span), 'views', 'day');
        $daily = [];
        for ($d = $start; $d < $end; $d = static::addDays($d, 1)) {
            $daily[] = ['day' => $d, 'views' => (int) ($byDay[$d] ?? 0)];
        }

        $topPages = static::all('SELECT path, SUM(n) AS views, SUM(secs) AS seconds FROM views WHERE day >= ? AND day < ?
                                 GROUP BY path ORDER BY views DESC LIMIT 10', $span);
        $entryPages = array_map(fn ($e) => [
            'path' => $e['path'], 'entries' => (int) $e['entries'],
            'bounce' => $e['entries'] ? 1 - $e['cont'] / $e['entries'] : null,
        ], static::all('SELECT path, SUM(n) AS entries, SUM(cont) AS cont FROM entries WHERE day >= ? AND day < ?
                        GROUP BY path ORDER BY entries DESC LIMIT 10', $span));

        // Provenance : familles (recherche, réseaux…) + accès directs (entrées sans référent) + domaines
        $hosts = array_values(array_filter(
            static::all('SELECT host, SUM(n) AS views FROM referrers WHERE day >= ? AND day < ? GROUP BY host ORDER BY views DESC', $span),
            fn ($h) => preg_replace('/^www\./', '', $h['host']) !== static::MONITER_HOST
        ));
        $kinds = [];
        foreach ($hosts as $h) {
            $kind = static::referrerKind($h['host']);
            $kinds[$kind] = ($kinds[$kind] ?? 0) + $h['views'];
        }
        if ($current['direct']) $kinds['direct'] = $current['direct'];
        arsort($kinds);
        $sources = array_map(fn ($kind, $views) => ['kind' => $kind, 'views' => (int) $views], array_keys($kinds), $kinds);

        // Avant 1.4 : fuseau seul dans `zones` ; ensuite fuseau + région dans `locales`
        $locales = array_merge(
            static::all("SELECT tz, '' AS region, SUM(n) AS views FROM zones WHERE day >= ? AND day < ? GROUP BY tz", $span),
            static::all('SELECT tz, region, SUM(n) AS views FROM locales WHERE day >= ? AND day < ? GROUP BY tz, region', $span)
        );
        $byCountry = [];
        foreach ($locales as $l) {
            $code = static::countryOf($l['tz'], $l['region']) ?? '';
            $byCountry[$code] = ($byCountry[$code] ?? 0) + $l['views'];
        }
        arsort($byCountry);
        $countries = array_map(fn ($code, $views) => [
            'code' => $code, 'views' => (int) $views,
            'name' => $code === '' ? null : static::displayName('region', (string) $code, $locale),
        ], array_keys($byCountry), $byCountry);

        $languages = array_map(fn ($l) => [
            'code' => $l['lang'], 'views' => (int) $l['views'], 'name' => static::displayName('language', $l['lang'], $locale),
        ], static::all('SELECT lang, SUM(n) AS views FROM langs WHERE day >= ? AND day < ? GROUP BY lang ORDER BY views DESC', $span));

        $int = fn (array $rows, array $keys) => array_map(function ($row) use ($keys) {
            foreach ($keys as $k) $row[$k] = (int) $row[$k];
            return $row;
        }, $rows);

        return $r + [
            'kpis'        => $kpis,
            'daily'       => $daily,
            'has_data'    => (bool) $firsts['views'],
            'top_pages'   => $int($topPages, ['views', 'seconds']),
            'entry_pages' => $entryPages,
            'sources'     => $sources,
            'referrers'   => array_slice($int($hosts, ['views']), 0, 8),
            'countries'   => $countries,
            'languages'   => $languages,
            'devices'     => $int(static::all('SELECT type, SUM(n) AS views FROM devices WHERE day >= ? AND day < ? GROUP BY type ORDER BY views DESC', $span), ['views']),
            'actions'     => $int(static::all('SELECT type, target, SUM(n) AS clicks FROM actions WHERE day >= ? AND day < ?
                                               GROUP BY type, target ORDER BY clicks DESC LIMIT 12', $span), ['clicks']),
            'campaigns'   => $int(static::all('SELECT name, SUM(n) AS views FROM campaigns WHERE day >= ? AND day < ?
                                               GROUP BY name ORDER BY views DESC LIMIT 8', $span), ['views']),
        ];
    }
}
