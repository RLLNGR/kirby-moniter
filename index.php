<?php

use Kirby\Cms\App as Kirby;
use Kirby\Http\Response;
use Rllngr\Moniter\Stats;
use Rllngr\Moniter\Summary;

require_once __DIR__ . '/src/Stats.php';
require_once __DIR__ . '/src/Summary.php';

function moniterAuthorized(): bool
{
    $key      = kirby()->option('moniter.key', '');
    $provided = $_SERVER['HTTP_X_MONITER_KEY'] ?? '';
    return !empty($key) && hash_equals($key, $provided);
}

/** Vue Audience du Panel : `moniter.panel` = true (tous), false (personne) ou une liste de rôles */
function moniterPanelAccess(): bool
{
    $user   = kirby()->user();
    $option = option('moniter.panel', true);
    if (!$user || $option === false) return false;
    return $option === true || in_array($user->role()->name(), (array) $option, true);
}

Kirby::plugin('rllngr/kirby-moniter', [
    'info' => [
        'version' => '1.5.1',
    ],
    // Vue Audience dans le Panel (Kirby ≥ 4 : k-panel-inside n'existe pas en 3)
    'areas' => version_compare(Kirby::version(), '4.0.0', '>=') ? [
        'moniter' => fn () => [
            'label' => t('moniter.audience'),
            'icon'  => 'chart',
            'menu'  => moniterPanelAccess(),
            'link'  => 'audience',
            'views' => [
                [
                    'pattern' => 'audience',
                    'action'  => function () {
                        if (!moniterPanelAccess()) {
                            throw new Kirby\Exception\PermissionException(t('moniter.forbidden'));
                        }
                        $period = get('period', '30');
                        $period = in_array($period, Summary::PERIODS, true) ? $period : '30';
                        $error  = match (true) {
                            !option('moniter.stats', true) => 'disabled',
                            !Stats::available()            => 'sqlite',
                            default                        => null,
                        };
                        return [
                            'component' => 'k-moniter-audience-view',
                            'title'     => t('moniter.audience'),
                            'props'     => [
                                'period' => $period,
                                'error'  => $error,
                                'stats'  => $error ? null : Summary::summary($period, kirby()->user()->language()),
                                // Tracés des pays (Natural Earth 110m, domaine public), chargés seulement s'il y a des pays
                                'map'    => kirby()->plugin('rllngr/kirby-moniter')->asset('world-110m.json')?->url(),
                            ],
                        ];
                    },
                ],
            ],
        ],
    ] : [],
    'translations' => [
        'fr' => require __DIR__ . '/translations/fr.php',
        'en' => require __DIR__ . '/translations/en.php',
    ],
    'hooks' => [
        // Ajoute le beacon aux pages HTML rendues par Kirby (compatible cache de pages)
        'page.render:after' => function (string $contentType, array $data, string $html, $page) {
            if ($contentType !== 'html' || !option('moniter.stats', true)) return $html;
            if ($page->isErrorPage() || stripos($html, '</body>') === false) return $html;
            $tag = '<script src="' . url('moniter/beacon.js') . '" defer></script>';
            return preg_replace('#</body>#i', $tag . '</body>', $html, 1);
        },
    ],
    'routes' => [
        [
            // Script du beacon (voir src/beacon.js) : aucun identifiant, seul le chemin de la page d'entrée
            // est gardé en sessionStorage le temps de l'onglet, pour mesurer le rebond.
            'pattern' => 'moniter/beacon.js',
            'method'  => 'GET',
            'action'  => function () {
                return new Response(file_get_contents(__DIR__ . '/src/beacon.js'), 'application/javascript', 200, ['Cache-Control' => 'public, max-age=86400']);
            },
        ],
        [
            'pattern' => 'moniter/(hit|time|continue|action)',
            'method'  => 'POST',
            'action'  => function (string $kind) {
                if (option('moniter.stats', true)) {
                    match ($kind) {
                        'hit'      => Stats::handleHit(),
                        'time'     => Stats::handleTime(),
                        'continue' => Stats::handleContinue(),
                        'action'   => Stats::handleAction(),
                    };
                }
                return new Response('', 'text/plain', 204);
            },
        ],
        [
            // Export pour Moniter (même clé que /moniter/status)
            'pattern' => 'moniter/stats',
            'method'  => 'GET',
            'action'  => function () {
                if (!moniterAuthorized()) return Response::json(['error' => 'Unauthorized'], 401);
                if (!Stats::available()) return Response::json(['error' => 'pdo_sqlite manquant'], 501);
                $since = get('since');
                if (!is_string($since) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) {
                    $since = date('Y-m-d', strtotime('-30 days'));
                }
                return Response::json(Stats::export($since));
            },
        ],
        [
            'pattern' => 'moniter/status',
            'method'  => 'GET',
            'action'  => function () {
                $kirby = kirby();

                if (!moniterAuthorized()) {
                    return Response::json(['error' => 'Unauthorized'], 401);
                }

                // Version de Kirby
                $kirbyVersion = Kirby::version();

                // Plugins installés (nom => version)
                $plugins = [];
                foreach ($kirby->plugins() as $plugin) {
                    $info    = $plugin->info();
                    $name    = $info['name'] ?? $plugin->name();
                    // version() lit composer/installed.php : fiable même sans champ "version" dans composer.json
                    $version = $plugin->version();
                    $plugins[$name] = $version;
                }

                // Activité contenu
                $collections = $kirby->option('moniter.collections', null);
                $allPages    = $kirby->site()->index()->filterBy('isDraft', false);

                if (!empty($collections) && is_array($collections)) {
                    $allPages = $allPages->filter(function ($page) use ($collections) {
                        $segment = $page->parents()->first()
                            ? $page->parents()->last()->slug()
                            : $page->slug();
                        return in_array($segment, $collections, true);
                    });
                }

                $sorted = $allPages->sortBy('modified', 'desc');

                $limit  = (int) ($kirby->option('moniter.limit', 10));
                $latest = [];
                foreach ($sorted->slice(0, $limit) as $page) {
                    $latest[] = [
                        'title'    => $page->title()->value(),
                        'uri'      => $page->uri(),
                        'url'      => $page->url(),
                        'modified' => date('Y-m-d\TH:i:s', $page->modified()),
                        'template' => $page->template()->name(),
                    ];
                }

                $lastModified = $sorted->first()
                    ? date('Y-m-d\TH:i:s', $sorted->first()->modified())
                    : null;

                return Response::json([
                    'kirby'   => $kirbyVersion,
                    'php'     => PHP_VERSION,
                    'plugins' => $plugins,
                    'stats'   => option('moniter.stats', true) && Stats::available(),
                    'content' => [
                        'last_modified' => $lastModified,
                        'pages_count'   => $allPages->count(),
                        'latest'        => $latest,
                    ],
                ]);
            },
        ],
    ],
]);
