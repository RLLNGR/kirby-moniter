<?php
// Tests sans Kirby : php tests/unit.php — classement des assistants IA, reconnaissance et comptage des robots.
// La base est un stats.sqlite temporaire ; kirby() est remplacé par un faux qui ne donne que le dossier des logs.

require __DIR__ . '/../src/Stats.php';
require __DIR__ . '/../src/Summary.php';

use Rllngr\Moniter\Stats;
use Rllngr\Moniter\Summary;

$tmp = sys_get_temp_dir() . '/moniter-unit-' . bin2hex(random_bytes(4));
mkdir($tmp);
function kirby()
{
    global $tmp;
    return new class($tmp) {
        public function __construct(private string $root) {}
        public function root(string $name): string { return $this->root; }
    };
}

$failed = 0;
function same($expected, $actual, string $label): void
{
    global $failed;
    if ($expected === $actual) { echo "ok   $label\n"; return; }
    $failed++;
    echo "FAIL $label\n     attendu : " . json_encode($expected, JSON_UNESCAPED_UNICODE) . "\n     obtenu  : " . json_encode($actual, JSON_UNESCAPED_UNICODE) . "\n";
}

// ── Domaines d'assistants ────────────────────────────────────────────────────────────
foreach (['chatgpt.com', 'chat.openai.com', 'www.perplexity.ai', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com',
          'copilot.cloud.microsoft', 'm365.cloud.microsoft', 'chat.mistral.ai', 'grok.com', 'x.ai', 'chat.deepseek.com',
          'meta.ai', 'duck.ai', 'you.com'] as $host) {
    same('ai', Summary::referrerKind($host), "assistant : $host");
}
same('social', Summary::referrerKind('x.com'), 'x.com reste un réseau social');
same('search', Summary::referrerKind('www.google.com'), 'google.com reste un moteur');
same('search', Summary::referrerKind('kagi.com'), 'kagi.com est un moteur');
same('other', Summary::referrerKind('max.ai'), 'max.ai n\'est pas x.ai');
same('chatgpt.com', Stats::aiSource(' WWW.ChatGPT.com '), 'utm_source chatgpt.com');
same(null, Stats::aiSource('newsletter-octobre'), 'utm_source de campagne');
same(null, Stats::aiSource('chatgpt'), 'utm_source sans domaine');

// ── Robots d'IA ──────────────────────────────────────────────────────────────────────
$uas = [
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot' => ['GPTBot', 'training'],
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot' => ['ChatGPT-User', 'user'],
    'Mozilla/5.0 (Macintosh) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot' => ['OAI-SearchBot', 'search'],
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)' => ['Perplexity-User', 'user'],
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)' => ['PerplexityBot', 'search'],
    'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)' => ['ClaudeBot', 'training'],
    'Mozilla/5.0 (compatible; claude-user/1.0)' => ['Claude-User', 'user'],
    'Claude-SearchBot/1.0' => ['Claude-SearchBot', 'search'],
    'CCBot/2.0 (https://commoncrawl.org/faq/)' => ['CCBot', 'training'],
    'meta-externalfetcher/1.1 (+/documentation/sharing/webmasters/web-crawlers)' => ['meta-externalfetcher', 'user'],
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)' => ['Applebot', 'search'],
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)' => ['MistralAI-User', 'user'],
];
foreach ($uas as $ua => [$name, $family]) {
    same(['name' => $name, 'family' => $family], Stats::aiBot($ua), "robot : $name");
    same(true, Stats::isBot($ua), "$name exclu de l'audience humaine");
}
$human = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
same(null, Stats::aiBot($human), 'un navigateur n\'est pas un robot d\'IA');
same(false, Stats::isBot($human), 'un navigateur compte dans l\'audience');
same(null, Stats::aiBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), 'Googlebot n\'est pas compté comme robot d\'IA');
same(null, Stats::aiBot('Applebot-Extended'), 'Applebot-Extended (consigne robots.txt) n\'est pas Applebot');
same(null, Stats::aiBot(''), 'User-Agent vide');

// Le middleware des fronts Nuxt porte la même liste
preg_match('/const AI_BOTS = \[(.*?)\n\]/s', file_get_contents(__DIR__ . '/../nuxt/src/runtime/server/bots.ts'), $m);
preg_match_all("/'([^']+)'/", preg_replace('#^\s*//.*$#m', '', $m[1]), $names); // sans les lignes de commentaire
same(array_merge(...array_values(Stats::AI_BOTS)), $names[1], 'nuxt/src/runtime/server/bots.ts : même liste de robots que Stats::AI_BOTS');

// ── Comptage : un compteur par jour et par robot, la page seulement à la demande d'un utilisateur ──
Stats::handleBotVisit(array_key_first($uas), '/projets');            // GPTBot
Stats::handleBotVisit(array_key_first($uas), '/projets');
Stats::handleBotVisit('Mozilla/5.0; compatible; ChatGPT-User/1.0', '/projets/tour');
Stats::handleBotVisit('Mozilla/5.0; compatible; Perplexity-User/1.0', '/projets/tour');
Stats::handleBotVisit('Mozilla/5.0; compatible; ChatGPT-User/1.0', '/panel/site'); // Panel : jamais compté
Stats::handleBotVisit($human, '/projets');                            // humain : pas ici
$today  = date('Y-m-d');
$export = Stats::export($today);
same([
    ['d' => $today, 'b' => 'ChatGPT-User', 'v' => 1, 'f' => 'user'],
    ['d' => $today, 'b' => 'GPTBot', 'v' => 2, 'f' => 'training'],
    ['d' => $today, 'b' => 'Perplexity-User', 'v' => 1, 'f' => 'user'],
], $export['bots'], 'export : robots par jour, avec leur famille');
same([['d' => $today, 'p' => '/projets/tour', 'v' => 2]], $export['bot_pages'], 'export : pages lues à la demande seulement');
same([], $export['pages'], 'les robots n\'entrent pas dans les pages vues');
$columns = array_column(Stats::db()->query('PRAGMA table_info(bots)')->fetchAll(PDO::FETCH_ASSOC), 'name');
same(['day', 'name', 'n'], $columns, 'table bots : jour, nom, compteur — rien d\'autre');

// ── Arrivées : utm_source d'assistant sans adresse d'origine ─────────────────────────
$hit = fn (array $h) => Stats::record($h + ['p' => '/', 'r' => '', 'z' => 'Europe/Paris', 'l' => 'fr-FR', 'd' => 'desktop', 'e' => 1], 'exemple.com');
$hit(['c' => 'chatgpt.com', 's' => 'chatgpt.com']);                                  // appli ChatGPT
$hit(['c' => 'perplexity.ai']);                                                      // ancien beacon : pas de `s`
$hit(['r' => 'https://chatgpt.com/', 'c' => 'chatgpt.com', 's' => 'chatgpt.com']);   // site chatgpt.com
$hit(['c' => 'newsletter', 's' => 'brevo']);                                         // vraie campagne
$hit([]);                                                                            // accès direct
$hit(['c' => 'chatgpt.com', 's' => 'chatgpt.com', 'e' => 0]);                        // page suivante : pas une arrivée
$export = Stats::export($today);
same([['d' => $today, 'h' => 'chatgpt.com', 'v' => 2], ['d' => $today, 'h' => 'perplexity.ai', 'v' => 1]], $export['referrers'], 'l\'assistant devient la provenance');
same([['d' => $today, 'p' => '/', 'v' => 5, 'c' => 0, 'x' => 2]], $export['entries'], 'ces arrivées ne sont plus « directes »');
same([['d' => $today, 'c' => 'newsletter', 'v' => 1]], $export['campaigns'], 'ni des campagnes');

// ── Résumé (vue du Panel) ─────────────────────────────────────────────────────────────
// Données d'avant la 1.8, écrites telles quelles : 2 arrivées « directes » rangées en campagne deepseek.com
Stats::db()->exec("INSERT INTO campaigns (day, name, n) VALUES ('$today', 'chat.deepseek.com', 2)");
Stats::db()->exec("UPDATE entries SET n = n + 2, direct = direct + 2 WHERE day = '$today' AND path = '/'");
$summary = Summary::summary('7');
$kinds   = array_column($summary['sources'], 'views', 'kind');
same(['ai' => 5, 'direct' => 2], $kinds, 'résumé : provenance, anciennes campagnes d\'assistant comprises');
same([['name' => 'newsletter', 'views' => 1]], $summary['campaigns'], 'résumé : campagnes sans les assistants');
same(5, $summary['ai']['visits'], 'bloc IA : visites humaines');
same(['user' => 2, 'search' => 0, 'training' => 2], $summary['ai']['families'], 'bloc IA : robots par famille');
same([['path' => '/projets/tour', 'views' => 2]], $summary['ai']['bot_pages'], 'bloc IA : pages lues à la demande');
same($today, $summary['ai']['bots_since'], 'bloc IA : premier jour compté');

array_map('unlink', glob("$tmp/moniter/*"));
rmdir("$tmp/moniter");
rmdir($tmp);
echo $failed ? "\n$failed échec(s)\n" : "\nTout passe.\n";
exit($failed ? 1 : 0);
