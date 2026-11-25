# Jisr Launchpad : livre blanc

Version 0.1 · 22 novembre 2026 · Phase de réseau de test

Jisr (جسر, « pont ») est une plateforme de lancement de meme coins où chaque jeton a un prix plancher couvert par de l'argent conservé dans un contrat dont personne ne peut retirer les fonds. Ce document explique son fonctionnement, ce qu'elle protège, ce qu'elle ne protège pas, et ce qui est construit aujourd'hui.

## 1. Le problème

La plupart des lancements de meme coins finissent de la même manière. Les premiers acheteurs et le créateur détiennent des jetons qui ne leur ont presque rien coûté, et ils les vendent à ceux qui arrivent ensuite. Sur une courbe de liaison classique, l'argent du pool ne représente qu'une fraction de la valeur de marché : le prix n'a donc rien sous lui quand les ventes commencent. Les protections habituelles (blocages, libération progressive, taxes à la vente) reposent sur une promesse à tenir ou sur une règle qui peut être modifiée.

Jisr supprime les jetons bon marché du début et place de l'argent réel sous chaque jeton.

## 2. Fonctionnement d'un jeton

Tous les jetons lancés sur Jisr ont les mêmes conditions. Le créateur choisit seulement le nom, le symbole, l'image, la description et les liens.

| Condition | Valeur |
|---|---|
| Offre totale | 1,000,000,000 jetons, créés une seule fois |
| Vente | Les 800,000,000 premiers jetons à un prix fixe unique |
| Prix de vente (réserve en dollars) | $0.0001 par jeton, soit une capitalisation de $100,000 |
| Au-dessus du plancher | Les 200,000,000 derniers jetons, sur une courbe de prix croissante |
| Frais de transaction | 5 % de chaque achat et de chaque vente |
| Limite par portefeuille | 2.5 % de l'offre (25,000,000 jetons) par portefeuille |
| Jetons donnés au créateur | Aucun |

### 2.1 Un seul prix pour tous

Les 800 premiers millions de jetons sont vendus au même prix à tout le monde, créateur compris. Il n'y a pas de tour initial à bas prix : personne ne détient de jetons qui lui ont coûté moins cher que les vôtres.

### 2.2 Le plancher couvert

Chaque jeton qui sort du marché dépose un prix plancher dans la **réserve du plancher** de ce jeton. La réserve contient donc toujours de quoi racheter tous les jetons en circulation au prix plancher. Tout détenteur peut revendre au marché à tout moment et recevoir le prix plancher, moins les frais de 5 %.

Exemple avec une réserve en dollars :

| Étape | Montant |
|---|---|
| Vous payez | $1,000.00 |
| Frais à l'achat (5 %) | $50.00 |
| Jetons reçus | 9,500,000 |
| Vous les revendez tous au prix plancher | $950.00 avant frais |
| Frais à la vente (5 %) | $47.50 |
| Vous recevez | $902.50 |

Un achat suivi d'une vente au prix plancher coûte 9.75 % de frais. C'est le maximum qu'un acheteur au prix plancher peut perdre du fait du mécanisme lui-même. Les risques de la section 6 sont distincts.

### 2.3 Graduation et plancher croissant

Quand les 800 millions de jetons de la vente sont vendus, le jeton est **gradué**. À partir de là, les 2 % de chaque transaction qui restent dans la réserve la rendent plus grande que nécessaire, et le prix plancher est relevé en conséquence :

> prix plancher = réserve du plancher ÷ le plus grand de (jetons en circulation, 800,000,000)

Le prix plancher ne baisse jamais. À la graduation, la réserve contient environ $81,684 pour un jeton à $100,000 : le plancher démarre donc environ 2.1 % au-dessus du prix de vente et monte avec le volume des échanges.

### 2.4 Au-dessus du plancher

Les 200 derniers millions de jetons coûtent le prix plancher plus une prime qui augmente à mesure qu'ils s'épuisent. La prime est conservée dans une **réserve de primes** distincte et elle est restituée quand les jetons sont revendus le long de la même ligne.

| Jetons de la courbe vendus | Prix du jeton suivant | Valeur de marché à ce prix |
|---|---|---|
| 0 | $0.0001 | $100,000 |
| 100,000,000 | environ $0.0004 | environ $400,000 |
| 150,000,000 | environ $0.0016 | environ $1,600,000 |
| 190,000,000 (fin de la courbe) | environ $0.04 | environ $40,000,000 |

Le plancher ne couvre que le prix plancher. Un acheteur qui paie une prime au-dessus du plancher peut perdre cette prime si d'autres vendent avant lui.

### 2.5 Où vont les 5 %

| Part | Destinataire | But |
|---|---|---|
| 1 % | Le créateur du jeton | Versé seulement quand le jeton est échangé |
| 2 % | La réserve du plancher du jeton | Relève le plancher pour tous les détenteurs après la graduation |
| 2 % | Le portefeuille de la plateforme | Fait fonctionner la plateforme |

### 2.6 La limite par portefeuille

Aucun portefeuille ne peut détenir plus de 2.5 % de l'offre d'un jeton. Cela s'applique à tous les portefeuilles, celui du créateur compris. La limite restreint ce qu'une adresse peut vendre d'un coup. Elle ne peut pas empêcher une personne d'utiliser plusieurs portefeuilles : une blockchain ne sait pas que deux adresses appartiennent à la même personne.

## 3. Qui contrôle quoi

| Élément | Qui peut déplacer ses fonds ou le modifier |
|---|---|
| Les réserves d'un jeton | Personne. L'argent ne sort que vers un vendeur selon la formule, vers le créateur au titre des frais de 1 %, ou vers le portefeuille de la plateforme au titre des frais de 2 % |
| Un jeton | Ses détenteurs uniquement. Pas de nouvelle émission, pas de pause, pas de liste noire, pas de changement de frais |
| Le portefeuille de la plateforme | L'équipe de la plateforme. Il reçoit les frais de 2 % |
| Le propriétaire de la fabrique | Peut changer l'adresse du portefeuille de la plateforme. Rien d'autre |

Les contrats du jeton et du marché n'ont ni propriétaire, ni mise à jour, ni pause, ni fonction de retrait. Le créateur n'a aucun droit particulier après le lancement. Les tests figent la liste complète des fonctions qui peuvent modifier l'état : ajouter une fonction d'administration fait échouer la compilation.

Le coût de cette conception : si un bug est découvert après le lancement, personne ne peut mettre en pause ni corriger un marché en service.

## 4. Pour les créateurs

- Lancer un jeton coûte une transaction réseau. Il n'y a pas de frais de listing.
- Le créateur ne reçoit aucun jeton. Pour en détenir, il achète au prix de vente comme tout le monde, dans la même limite de 2.5 %.
- Le créateur gagne 1 % de chaque transaction sur son jeton, versé automatiquement dans son portefeuille au fil des transactions.
- Rien de ce que le créateur achète n'est bloqué ni libéré par étapes, puisqu'il a payé le même prix que tout autre acheteur.

## 5. Réseaux et monnaies de réserve

- **Réseaux.** Les contrats fonctionnent sur tout réseau EVM : Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon, Avalanche, Robinhood Chain et d'autres. Un jeton vit sur le réseau où il a été lancé.
- **Monnaie de réserve.** Chaque déploiement de la plateforme fixe le prix de ses jetons et les couvre dans un seul token : un stablecoin en dollars (USDT ou USDC) ou un autre token standard, comme une action tokenisée. Avec une action tokenisée, le plancher est un nombre d'actions : sa valeur en dollars suit donc l'action.
- **Payer avec la monnaie du réseau.** Là où un routeur d'échange est connecté, les acheteurs peuvent payer et être payés en ETH ou en BNB. Le paiement est converti à l'entrée et à la sortie ; la réserve ne contient que le token de réserve.
- **Recevoir sur un autre réseau.** Sur une plateforme adossée à l'USDC, un vendeur peut vendre sur le réseau du jeton et recevoir les dollars sur un autre réseau. Le transfert passe par le pont USDC de Circle (CCTP), et la plateforme ne détient rien entre-temps. Circle prélève ses propres frais sur le montant. Ce n'est pas disponible sur une plateforme adossée à l'USDT ou à une action tokenisée, ni sur BNB Chain et Robinhood Chain, que le pont de Circle ne dessert pas.

## 6. Risques

Lisez cette section avant d'utiliser la plateforme avec quoi que ce soit de valeur.

- **Non audité.** Les contrats ont passé leurs propres tests, dont des échanges aléatoires et des simulations d'attaques. Ils n'ont pas été examinés par un auditeur de sécurité indépendant. Un bug pourrait entraîner une perte de fonds.
- **Pas de secours.** Personne ne peut mettre en pause ni réparer un marché en service. Cela protège la réserve contre les personnes et supprime le filet de sécurité contre les bugs.
- **Frais.** Acheter puis vendre au prix plancher coûte 9.75 % au total.
- **Risque de prime.** Le plancher protège le prix plancher. L'argent payé au-dessus du plancher n'est pas protégé.
- **Risque du token de réserve.** Un stablecoin peut perdre sa parité et son émetteur peut geler une adresse. Une action tokenisée suit son action et peut restreindre qui a le droit de la détenir. Les contrats ne peuvent se défendre contre rien de cela.
- **Risque d'échange.** Payer avec la monnaie du réseau dépend du routeur et de sa liquidité, et peut coûter plus cher que payer avec le token de réserve.
- **Risque de pont.** Une vente payée sur un autre réseau dépend du pont de Circle pour y livrer les dollars. Si Circle est lent ou s'arrête, la livraison attend. Les contrats ne peuvent ni l'accélérer ni annuler la vente.
- **Portefeuilles liés.** La limite de 2.5 % s'applique par adresse.
- **Les jetons envoyés au marché par simple transfert**, au lieu d'une vente, sont perdus pour l'expéditeur.
- **Le plancher est un mécanisme.** C'est le montant que le contrat paiera, en token de réserve, pour un jeton. Ce n'est pas une promesse de gain ni une assurance.

## 7. État d'avancement

| Partie | État |
|---|---|
| Contrats EVM | Construits et testés (47 tests de contrats) |
| Application web et page de déploiement | Construites et testées (25 tests dans le navigateur), en ligne |
| Déploiement de test | En ligne sur le réseau de test Sepolia, avec de l'argent de test sans valeur |
| Audit de sécurité indépendant | Non réalisé |
| Déploiement sur des réseaux réels | Non réalisé. Il vient après l'audit |
| Solana | Programme et page construits et testés ensemble. En ligne sur Solana devnet, un réseau de test avec de l'argent de test, et déployé de façon à ne jamais pouvoir être modifié. Pas sur le réseau réel |
| Vendre sur un réseau et recevoir sur un autre (pont) | Construit et testé avec des substituts des contrats de Circle. Pas encore exécuté sur le pont réel de Circle |

Déploiement de test sur Sepolia :

- Fabrique de la plateforme : `0x4e34BD62B8245Fa7841061eeFa010fF054FA9d06`
- Solana devnet: `5cbX2QdxMq948ySWxF6yHruKFtpp5Kf8WGA1wb3BaKC8`
- Site : https://w8nwzbf9h5-svg.github.io/jisr-launchpad/
- Code : https://github.com/w8nwzbf9h5-svg/jisr-launchpad

## 8. Avertissement

Ce document décrit un logiciel. Ce n'est ni une offre d'un jeton ni un conseil financier. Les jetons lancés sur Jisr sont créés par leurs créateurs, pas par la plateforme. Toute personne qui utilise la plateforme est responsable de ses propres décisions.

Ceci est une traduction. La version anglaise fait référence ; en cas de différence, le texte anglais s'applique.
