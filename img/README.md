# Eigen foto's voor de drankknoppen

Zet hier je afbeeldingen (png of jpg), bv. `pint.png`, `frisdrank.png`, `bak.png`.

Koppel ze daarna in `members.js` via het `img`-veld, bv.:

```js
{ code: 'p', naam: 'Pint', emoji: '🍺', kleur: '#d9a441', order: 0, img: 'img/pint.png' },
```

en voor een bak:

```js
{ id: 'bak', naam: 'Bak', code: 'p', aantal: 24, emoji: '📦', kleur: '#8a5a22', img: 'img/bak.png' },
```

Tips:
- Vierkante afbeeldingen werken het mooist (de app schaalt ze in de knop).
- Houd ze klein (bv. 256×256) zodat de app snel laadt.
- Staat `img` leeg/null, dan toont de app gewoon de emoji.
