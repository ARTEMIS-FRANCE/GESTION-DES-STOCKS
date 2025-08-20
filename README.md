# GESTION DE STOCK — ARTEMIS
Application web statique (HTML/CSS/JS) **prête pour GitHub Pages**, sans Node ni build.
Données stockées dans **Firebase Firestore** (config incluse).

## Comptes par défaut
- **admin / admin** (rôle `admin`)
- **demo / demo** (rôle `agence`, agence par défaut : IDF)

> Les comptes et les **agences** sont créés automatiquement au premier lancement si la base est vide.  
Agences par défaut : `DEPOT, HAUT DE FRANCE, IDF, GRAND EST, RHONE ALPES, PACA, OCCITANIE, NOUVELLE AQUITAINE, AUTRE`.

## Déploiement ultra-simple (GitHub Pages)
1. Créez un dépôt **public** (ex: `gestion-de-stock`).
2. Glissez-déposez **tous les fichiers** de ce ZIP à la racine du dépôt.
3. *Settings → Pages* → *Deploy from branch* → `main` + `/root`.
4. Ouvrez l’URL générée.

## Fonctionnalités
- Authentification Firestore (rôles `admin` et `agence`).
- Sélecteur d’agence (verrouillé pour le rôle `agence`).
- **Catalogue** : références, prix d’achat, revendeur, code-barres/QR (scan caméra), seuils mini (global + par taille), alerte “sous seuil”, filtre **À réassort**.
- **Mouvements** : Entrées / Sorties / Transferts (impactent les stocks de l’agence).
- **Stats** : quantités & valorisation + entrées/sorties sur période (export Excel).
- **Réassort** : badge *N articles sous seuil* + export Excel du brouillon.
- **Import/Export (admin)** : Produits (Excel/JSON), Mouvements (Excel), Import Excel feuille `Produits`.
- **Admin** : gestion Agences, gestion Utilisateurs (création, mise à jour, **suppression**), purge historique.

## Modèle Firestore
- `agencies` : { name }
- `users` : { login, passHash (SHA-256), role: 'admin'|'agence', agency }
- `products` : { reference, name, category, price, vendor, barcode, affectation, seuilGlobal, seuilTaille: {XS,S,M,L,XL,XXL,3XL} }
- `stock` : { productId, agency, size, qty } (clé = `productId|agency|size`)
- `movements` : { type, productId, size, qty, fromAgency, toAgency, userLogin, ts }

## Règles Firestore (à adapter)
Pour tester vite, vous pouvez autoriser lecture/écriture larges (non recommandé).  
Mettre en place des règles restreignant l’écriture et/ou ajouter Firebase Auth si nécessaire.

## Librairies
- Firebase v10 (CDN modules)
- SheetJS (XLSX) pour export/import Excel
- html5-qrcode pour scan code-barres/QR

## Notes
- La caméra nécessite HTTPS (GitHub Pages est OK).
- Si vous changez le projet Firebase, modifiez la config dans `app.js`.
