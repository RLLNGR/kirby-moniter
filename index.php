<?php

use Kirby\Cms\App as Kirby;
use Kirby\Http\Response;

Kirby::plugin('rllngr/kirby-moniter', [
    'info' => [
        'version' => '1.0.0',
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

                return Response::json([
                    'kirby'   => $kirbyVersion,
                    'plugins' => $plugins,
                ]);
            },
        ],
    ],
]);
