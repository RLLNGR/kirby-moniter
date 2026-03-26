<?php

use Kirby\Cms\App as Kirby;
use Kirby\Http\Response;

Kirby::plugin('rllngr/kirby-moniter', [
    'info' => [
        'version' => '1.1.2',
    ],
    'routes' => [
        [
            'pattern' => 'moniter/status',
            'method'  => 'GET',
            'action'  => function () {
                $kirby = kirby();

                // Vérification de la clé API
                $key      = $kirby->option('moniter.key', '');
                $provided = $_SERVER['HTTP_X_MONITER_KEY'] ?? '';

                if (empty($key) || !hash_equals($key, $provided)) {
                    return Response::json(['error' => 'Unauthorized'], 401);
                }

                // Version de Kirby
                $kirbyVersion = Kirby::version();

                // Plugins installés (nom => version)
                $plugins = [];
                foreach ($kirby->plugins() as $plugin) {
                    $info    = $plugin->info();
                    $name    = $info['name'] ?? $plugin->name();
                    $version = $info['version'] ?? null;
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
