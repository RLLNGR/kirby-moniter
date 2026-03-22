# kirby-moniter

Plugin Kirby léger qui expose un endpoint sécurisé pour le tableau de bord [Moniter](https://moniter.rollinger.design) — suivi de version et de disponibilité des sites clients.

## Installation

### Via Composer (recommandé)

```bash
composer require rollinger/kirby-moniter
```

### Manuellement

Copier le dossier dans `site/plugins/moniter/`.

## Configuration

Ajouter la clé API dans `site/config/config.php` :

```php
return [
    'moniter.key' => 'votre-clé-générée-par-moniter',
    // ...
];
```

La clé est générée automatiquement par le dashboard Moniter lors de l'ajout d'un client.

## Endpoint

```
GET /moniter/status
Header: X-Moniter-Key: <clé>
```

### Réponse

```json
{
  "kirby": "5.3.2",
  "plugins": {
    "auteur/plugin": "1.2.0"
  }
}
```

### Erreur (clé invalide)

```json
{ "error": "Unauthorized" }
```

HTTP `401`

## Sécurité

- Comparaison de la clé via `hash_equals()` (protection timing attack)
- Sans clé valide dans le header `X-Moniter-Key`, l'endpoint retourne systématiquement `401`
- Ne jamais committer la clé dans le repo du site client — utiliser une variable d'environnement si nécessaire

## Compatibilité

- Kirby **4.x** et **5.x**
- PHP **8.0+**

## Licence

MIT — [rollinger.design](https://rollinger.design)
