#!/bin/sh
# Tests sur un vrai Kirby : sh tests/http.sh /chemin/vers/un/kirby-de-test
# Le site doit charger ce plugin, avec 'moniter.key' => 'cle-de-test' dans sa config. Son stats.sqlite est remis à zéro :
# ne jamais le lancer sur un vrai site.
set -u
ROOT=${1:?Usage : sh tests/http.sh /chemin/vers/un/kirby-de-test}
PORT=${PORT:-8765}
BASE="http://127.0.0.1:$PORT"
KEY=cle-de-test
HUMAN='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
GPTBOT='Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot'
CHATGPT='Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'

rm -f "$ROOT"/site/logs/moniter/stats.sqlite*
(cd "$ROOT" && exec php -S "127.0.0.1:$PORT" kirby/router.php >/dev/null 2>&1) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "$BASE/" && break; sleep 0.3; done

FAILED=0
same() { # attendu, obtenu, libellé
  if [ "$1" = "$2" ]; then echo "ok   $3"; else echo "FAIL $3 — attendu « $1 », obtenu « $2 »"; FAILED=$((FAILED + 1)); fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
bot() { status -X POST "$BASE/moniter/bot" -H 'Content-Type: application/json' "$@"; }
# Comme navigator.sendBeacon : du texte brut (en formulaire, Kirby rangerait le corps dans $_POST)
hit() { status -X POST "$BASE/moniter/hit" -H "Origin: $BASE" -H 'Content-Type: text/plain' -A "$HUMAN" -d "$1"; }
BY_CHATGPT="{\"ua\":\"$CHATGPT\",\"p\":\"/projets?x=1\"}"
BY_HUMAN="{\"ua\":\"$HUMAN\",\"p\":\"/projets\"}"

# Pages servies par Kirby : deux fois la même pour passer aussi par le cache de pages
same 200 "$(status -A "$GPTBOT" "$BASE/")" 'GPTBot lit l’accueil'
same 200 "$(status -A "$GPTBOT" "$BASE/")" 'GPTBot relit l’accueil (cache de pages)'
same 200 "$(status -A "$CHATGPT" "$BASE/")" 'ChatGPT-User lit l’accueil'
same 200 "$(status -A "$HUMAN" "$BASE/")" 'un navigateur lit l’accueil'
same 404 "$(status -A "$GPTBOT" "$BASE/page-absente")" 'GPTBot sur une page absente'

# Route des fronts headless : la clé est obligatoire
same 401 "$(bot -d "$BY_CHATGPT")" '/moniter/bot sans clé'
same 401 "$(bot -H 'X-Moniter-Key: mauvaise' -d "$BY_CHATGPT")" '/moniter/bot avec une mauvaise clé'
same 204 "$(bot -H "X-Moniter-Key: $KEY" -d "$BY_CHATGPT")" '/moniter/bot avec la clé'
same 204 "$(bot -H "X-Moniter-Key: $KEY" -d "$BY_HUMAN")" '/moniter/bot : un navigateur est ignoré'
same 204 "$(bot -H "X-Moniter-Key: $KEY" -d 'pas du json')" '/moniter/bot : corps illisible ignoré'
same 404 "$(status -H "X-Moniter-Key: $KEY" "$BASE/moniter/bot")" '/moniter/bot en GET'

# Beacon : arrivée de l'appli ChatGPT (pas d'adresse d'origine, utm_source=chatgpt.com), puis accès direct
same 204 "$(hit '{"p":"/","r":"","e":1,"c":"chatgpt.com","s":"chatgpt.com"}')" 'arrivée avec utm_source=chatgpt.com'
same 204 "$(hit '{"p":"/","r":"","e":1,"c":""}')" 'arrivée directe'
same 204 "$(status -X POST "$BASE/moniter/hit" -H "Origin: $BASE" -H 'Content-Type: text/plain' -A "$CHATGPT" -d '{"p":"/","r":"","e":1}')" 'beacon envoyé par un robot'

same 401 "$(status "$BASE/moniter/stats")" 'export sans clé'
EXPORT=$(curl -s -H "X-Moniter-Key: $KEY" "$BASE/moniter/stats?since=$(date +%Y-%m-%d)")
[ -n "${EXPORT_TO:-}" ] && printf '%s' "$EXPORT" > "$EXPORT_TO"
pick() { printf '%s' "$EXPORT" | php -r '$d = json_decode(stream_get_contents(STDIN), true); echo json_encode(array_map(fn ($r) => array_diff_key($r, ["d" => 1]), $d[$argv[1]] ?? ["absent"]));' "$1"; }
same '[{"b":"ChatGPT-User","v":2,"f":"user"},{"b":"GPTBot","v":2,"f":"training"}]' "$(pick bots)" 'robots comptés (pages Kirby + signal du front)'
same '[{"p":"\/","v":1},{"p":"\/projets","v":1}]' "$(pick bot_pages)" 'pages lues à la demande d’un utilisateur'
same '[{"p":"\/","v":2,"s":0}]' "$(pick pages)" 'pages vues : les deux arrivées humaines seulement'
same '[{"h":"chatgpt.com","v":1}]' "$(pick referrers)" 'provenance : chatgpt.com'
same '[{"p":"\/","v":2,"c":0,"x":1}]' "$(pick entries)" 'une seule arrivée directe'
same '[]' "$(pick campaigns)" 'aucune campagne'

[ "$FAILED" = 0 ] && echo && echo 'Tout passe.' || { echo; echo "$FAILED échec(s)"; }
exit "$FAILED"
