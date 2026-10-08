<?php

use Kirby\Cms\App as Kirby;
use Kirby\Http\Response;
use Rllngr\Moniter\Stats;

require_once __DIR__ . '/src/Stats.php';

function moniterAuthorized(): bool
{
    $key      = kirby()->option('moniter.key', '');
    $provided = $_SERVER['HTTP_X_MONITER_KEY'] ?? '';
    return !empty($key) && hash_equals($key, $provided);
}

Kirby::plugin('rllngr/kirby-moniter', [
    'info' => [
        'version' => '1.3.0',
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
            // Script du beacon : chemin, référent, fuseau horaire et langue du navigateur à l'arrivée ; au départ, le temps où la page
            // est restée visible (plafonné à 30 min). Aucun identifiant, rien n'est stocké côté navigateur.
            'pattern' => 'moniter/beacon.js',
            'method'  => 'GET',
            'action'  => function () {
                $js = "(function(){var s=document.currentScript;if(!s)return;"
                    . "var b=s.src.replace(/beacon\\.js.*$/,''),p=location.pathname,z='';"
                    . "function send(u,d){try{navigator.sendBeacon?navigator.sendBeacon(u,d):fetch(u,{method:'POST',body:d,keepalive:true})}catch(e){}}"
                    . "try{z=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}"
                    . "send(b+'hit',JSON.stringify({p:p,r:document.referrer,z:z,l:navigator.language||''}));"
                    . "var t=0,v=document.visibilityState==='visible'?Date.now():0,sent=0;"
                    . "function flush(){if(v){t+=Date.now()-v;v=0}var n=Math.min(Math.round(t/1000),1800),d=n-sent;if(d>0){sent=n;send(b+'time',JSON.stringify({p:p,t:d}))}}"
                    . "document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')v=Date.now();else flush()});"
                    . "addEventListener('pagehide',flush);})();";
                return new Response($js, 'application/javascript', 200, ['Cache-Control' => 'public, max-age=86400']);
            },
        ],
        [
            'pattern' => 'moniter/hit',
            'method'  => 'POST',
            'action'  => function () {
                if (option('moniter.stats', true)) Stats::handleHit();
                return new Response('', 'text/plain', 204);
            },
        ],
        [
            'pattern' => 'moniter/time',
            'method'  => 'POST',
            'action'  => function () {
                if (option('moniter.stats', true)) Stats::handleTime();
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
