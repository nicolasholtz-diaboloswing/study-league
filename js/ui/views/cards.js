// Album of cards, pack purchase and pack opening.
import * as C from '../components.js';
import * as A from '../art.js';
import * as E from '../effects.js';
import { PACK_COST } from '../../config.js';
import { buyPack, openFreePack } from '../../core/state.js';
import { uniqueCards } from '../../core/stats.js';
import { RARITIES } from '../../core/rewards.js';
import { listen } from './_meta.js';

const RARITY_TABS = [{ id: 'mine', label: 'Mes cartes' }, { id: 'all', label: 'Toutes' }, ...RARITIES.map((r) => ({ id: r, label: A.rarityLabel(r) }))];
const ODDS = RARITIES.map((r) => `<span class="odds__r odds__r--${r}">${A.rarityLabel(r)}</span>`).join(' · ');
const POS_TABS = [
  { id: 'all', label: 'Tous' }, { id: 'GK', label: 'Gardiens' }, { id: 'DEF', label: 'Défenseurs' },
  { id: 'MID', label: 'Milieux' }, { id: 'FWD', label: 'Attaquants' },
];

export default {
  title: 'Cartes',
  async mount(el, ctx) {
    const state = ctx.state;
    if (!state) {
      el.innerHTML = `<div class="page page--narrow">${C.emptyState({ icon: '🃏', title: 'Les cartes sont pour les joueurs', text: 'Connecte-toi avec un compte joueur pour voir un album.' })}</div>`;
      return;
    }
    const cards = [...ctx.cards].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
    const filter = { rarity: uniqueCards(state) > 0 ? 'mine' : 'all', pos: 'all' };
    let newIds = new Set();
    let busy = false;
    let heldToasts = [];   // badge toasts wait until the reveal is over, so they never cover its title
    const flushToasts = () => { const t = heldToasts; heldToasts = []; for (const m of t) ctx.toast(m, 'gold'); };
    const byId = new Map(ctx.cards.map((c) => [c.id, c]));
    const env = () => ({ now: ctx.now(), rng: ctx.rng, cards: ctx.cards, catalog: ctx.catalog, clubs: ctx.clubs });

    // ---------- album ----------
    const progress = () => {
      const n = uniqueCards(state), total = cards.length;
      const per = RARITIES.map((r) => {
        const all = cards.filter((c) => c.rarity === r);
        return `<span class="cprog__r cprog__r--${r}"><i></i>${A.rarityLabel(r)} ${all.filter((c) => state.cards[c.id]).length}/${all.length}</span>`;
      }).join('');
      return `<div class="panel cprog"><div class="row row--between row--center"><h2 class="cprog__title"><span class="num">${n}</span><small>/${total}</small> cartes</h2>${n >= total ? C.pill('Album complet !', 'gold') : ''}</div>
        <div class="cprog__track" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${n}" aria-label="Cartes collectées"><span style="width:${(n / total * 100).toFixed(1)}%"></span></div>
        <div class="cprog__rars">${per}</div></div>`;
    };

    const packPanel = () => {
      const free = state.freePacks || 0, coins = state.coins || 0;
      const fan = `<div class="packbox__fan" aria-hidden="true">${A.cardBack({ size: 'sm' })}${A.cardBack({ size: 'sm' })}${A.cardBack({ size: 'sm' })}</div>`;
      let head, btn;
      if (free > 0) {
        head = `<h2 class="packbox__title">Paquet offert !</h2><p class="text-dim">Tu as ${free} paquet${free > 1 ? 's' : ''} offert${free > 1 ? 's' : ''} qui t'attend${free > 1 ? 'ent' : ''}. 3 cartes dedans.</p>`;
        btn = C.button({ label: 'Ouvrir mon paquet offert', variant: 'gold', size: 'lg', block: true, icon: '🎁', attrs: { 'data-pack': 'free' } });
      } else if (coins >= PACK_COST) {
        head = `<h2 class="packbox__title">Ouvrir un paquet</h2><p class="text-dim">3 cartes pour ${PACK_COST} pièces. Tu en as ${coins}.</p>`;
        btn = C.button({ label: `Acheter un paquet · ${PACK_COST} pièces`, variant: 'gold', size: 'lg', block: true, icon: '🃏', attrs: { 'data-pack': 'buy' } });
      } else {
        head = `<h2 class="packbox__title">Ouvrir un paquet</h2><p class="text-dim">Un paquet coûte ${PACK_COST} pièces. Gagne des matchs pour en avoir plus. Tu en as ${coins}.</p>`;
        btn = C.button({ label: `Encore ${PACK_COST - coins} pièces`, variant: 'secondary', size: 'lg', block: true, disabled: true });
      }
      const odds = `<p class="odds"><span class="odds__list">${ODDS}</span><span class="odds__hint">Plus c'est rare, plus c'est fort.</span></p>`;
      return `<div class="panel panel--gold packbox ${free > 0 ? 'packbox--free' : ''}">${fan}<div class="packbox__body">${head}${btn}${odds}</div></div>`;
    };

    const gridHtml = () => {
      const mine = filter.rarity === 'mine';
      const shown = cards.filter((c) => (filter.rarity === 'all' || mine || c.rarity === filter.rarity) && (filter.pos === 'all' || c.pos === filter.pos) && (!mine || state.cards[c.id]));
      // owned first (the list is already sorted by rating), then the missing ones
      shown.sort((a, b) => (state.cards[b.id] ? 1 : 0) - (state.cards[a.id] ? 1 : 0));
      const have = shown.filter((c) => state.cards[c.id]).length;
      const cells = shown.map((c) => {
        const n = state.cards[c.id] || 0;
        if (!n) return `<div class="album__cell album__cell--missing">${A.cardMissing(c)}</div>`;
        const isNew = newIds.has(c.id);
        return `<div class="album__cell ${isNew ? 'is-new' : ''}" data-card-id="${A.esc(c.id)}">${A.card(c, { count: n })}${isNew ? '<span class="album__new">NOUVEAU</span>' : ''}</div>`;
      }).join('');
      return `<p class="text-dim text-sm album__count"><b class="num">${have}</b> sur ${shown.length} dans cette liste</p>
        <div class="grid grid--cards album">${cells || C.emptyState({ icon: '🔍', title: 'Aucune carte ici', text: mine ? 'Ouvre un paquet pour commencer ta collection.' : '' })}</div>`;
    };

    const renderAlbum = () => {
      el.innerHTML = `<div class="page cards-page">${C.pageHead('Mes cartes', { kicker: 'Album', sub: `Gagne des pièces en jouant, puis achète un paquet ici : ${PACK_COST} pièces = 3 cartes.` })}
        <div class="cards-top">${progress()}${packPanel()}</div>
        <div class="stack stack--sm">
          ${C.tabs(RARITY_TABS, filter.rarity, { scroll: true, attrs: { 'data-filter': 'rarity', 'aria-label': 'Filtrer par rareté' } })}
          ${C.tabs(POS_TABS, filter.pos, { scroll: true, attrs: { 'data-filter': 'pos', 'aria-label': 'Filtrer par poste' } })}
        </div>
        <div id="album-grid">${gridHtml()}</div></div>`;
      const first = el.querySelector('.album__cell.is-new');
      if (first) first.scrollIntoView({ block: 'center', behavior: 'auto' });
    };

    // ---------- pack opening ----------
    const clearPending = async () => {
      if (!state.pendingReveal) return;
      state.pendingReveal = null;
      await ctx.save();
    };
    const showStage = async (kind, got) => {
      document.body.classList.add('in-pack');
      el.innerHTML = `<div class="page page--narrow pack-stage">
        <header class="page-head text-center"><span class="page-head__kicker">${kind === 'free' ? 'Paquet offert' : 'Ton paquet'}</span><h1 id="stage-title">Touche une carte !</h1><p class="page-head__sub" id="stage-sub">Retourne tes ${got.length} cartes une par une.</p></header>
        <div id="pack-host"></div>
        <div class="pack pack-caps" id="pack-caps">${got.map((_, i) => `<div class="pack-cap" data-cap="${i}"></div>`).join('')}</div>
        <div class="pack-actions stack stack--sm" id="pack-actions" hidden></div></div>`;
      const host = el.querySelector('#pack-host'), title = el.querySelector('#stage-title'), sub = el.querySelector('#stage-sub');
      let left = got.length;
      await E.revealPack(host, got.map((g) => g.card), {
        onReveal: (c, i) => {
          const cap = el.querySelector(`[data-cap="${i}"]`);
          if (!cap) return;
          const big = c.rarity === 'legend' ? 'LÉGENDE !' : c.rarity === 'epic' ? 'ÉPIQUE !' : A.rarityLabel(c.rarity);
          cap.innerHTML = `<span class="pack-cap__rar pack-cap__rar--${c.rarity}">${big}</span>${got[i].isNew ? '<span class="pack-cap__new">NOUVEAU</span>' : '<span class="pack-cap__dup">Déjà dans ton album</span>'}`;
          cap.classList.add('is-on');
          left -= 1;
          if (left === 0) clearPending();   // all cards seen: the reveal must not replay after a reload
          title.textContent = c.rarity === 'legend' ? 'Une légende !' : c.rarity === 'epic' ? 'Carte épique !' : left > 0 ? `Encore ${left} carte${left > 1 ? 's' : ''}` : 'Paquet ouvert !';
          sub.textContent = c.name;
          if (c.rarity === 'legend' || c.rarity === 'epic') el.querySelector('.pack-stage')?.classList.add('is-' + c.rarity);
        },
      });
      const actions = el.querySelector('#pack-actions');
      if (!actions) return; // the player left this screen meanwhile
      const nNew = got.filter((g) => g.isNew).length;
      title.textContent = 'Paquet ouvert !';
      sub.textContent = nNew ? `${nNew} nouvelle${nNew > 1 ? 's' : ''} carte${nNew > 1 ? 's' : ''} dans ton album.` : 'Que des doubles cette fois. Tente encore !';
      flushToasts();
      const more = (state.freePacks || 0) > 0 ? 'free' : (state.coins || 0) >= PACK_COST ? 'buy' : null;
      actions.innerHTML = C.button({ label: 'Voir mon album', variant: 'gold', size: 'lg', block: true, attrs: { 'data-act': 'album' } })
        + (more ? C.button({ label: more === 'free' ? 'Ouvrir un autre paquet offert' : `Acheter un autre paquet · ${PACK_COST} pièces`, variant: 'secondary', block: true, attrs: { 'data-pack': more } }) : '');
      actions.hidden = false;
      actions.querySelector('button')?.focus({ preventScroll: true });
      newIds = new Set(got.filter((g) => g.isNew).map((g) => g.card.id));
    };

    const openPack = async (kind) => {
      if (busy) return; // a double tap must not buy twice
      busy = true;
      let out;
      try {
        out = kind === 'free' ? openFreePack(state, env()) : buyPack(state, env());
        Object.assign(state, out.state);
        // the drawn cards travel with the purchase in the same save, so a reload can resume the reveal
        state.pendingReveal = { kind, ids: out.cards.map((g) => g.card.id), fresh: out.cards.map((g) => !!g.isNew) };
        await ctx.save();
      } catch {
        busy = false;
        ctx.toast('Impossible d\'ouvrir le paquet.', 'bad');
        renderAlbum();
        return;
      }
      for (const ev of out.events) if (ev.type === 'badge') heldToasts.push(`Nouvelle médaille : ${ev.badge.name}`);
      try { await showStage(kind, out.cards); } finally { busy = false; }
    };

    const stop = listen(el, 'click', (ev) => {
      const pk = ev.target.closest('[data-pack]');
      if (pk && !pk.disabled) { openPack(pk.dataset.pack); return; }
      if (ev.target.closest('[data-act="album"]')) { document.body.classList.remove('in-pack'); clearPending(); renderAlbum(); window.scrollTo(0, 0); return; }
      const tab = ev.target.closest('[data-tab]');
      const group = tab?.closest('[data-filter]');
      if (group) {
        filter[group.dataset.filter] = tab.dataset.tab;
        group.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
        el.querySelector('#album-grid').innerHTML = gridHtml();
      }
    });

    // a reveal cut short by a reload (coins spent, cards already in the album) resumes here
    const pr = state.pendingReveal;
    const resumed = pr && Array.isArray(pr.ids) ? pr.ids.map((id, i) => (byId.has(id) ? { card: byId.get(id), isNew: !!pr.fresh?.[i] } : null)).filter(Boolean) : [];
    if (resumed.length) showStage(pr.kind === 'free' ? 'free' : 'buy', resumed);
    else { if (pr) clearPending(); renderAlbum(); }
    return () => {
      stop();
      document.body.classList.remove('in-pack');
      flushToasts();
      clearPending();
    };
  },
};
