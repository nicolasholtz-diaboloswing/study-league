// "Plus" menu: links to the other screens and sign out.
import * as C from '../components.js';

export default {
  title: 'Plus',
  async mount(el, ctx) {
    const coach = !ctx.state;
    const item = (href, icon, label, sub) => `<a class="menu-item" href="${href}"><span class="menu-item__icon" aria-hidden="true">${icon}</span>
      <span class="menu-item__text"><b>${label}</b><small>${sub}</small></span><span class="menu-item__go" aria-hidden="true">›</span></a>`;
    el.innerHTML = `<div class="page page--narrow">
      ${C.pageHead('Plus', { kicker: ctx.state ? ctx.state.profile.displayName : (ctx.user?.username || '') })}
      <nav class="stack stack--sm" aria-label="Menu">
        ${coach ? '' : item('#/badges', '🏅', 'Badges', 'Tes médailles gagnées et à gagner')}
        ${coach ? '' : item('#/rivals', '⚡', 'Classement des rivaux', 'Compare-toi aux autres joueurs')}
        ${coach ? '' : item('#/profile', '👤', 'Profil', 'Ton club, tes chiffres')}
        ${item('#/help', '❓', 'Comment jouer', 'Les règles en quelques mots')}
      </nav>
      ${C.button({ label: 'Se déconnecter', variant: 'danger', block: true, attrs: { 'data-action': 'logout' } })}
    </div>`;
    const onClick = async (e) => {
      if (!e.target.closest('[data-action=logout]')) return;
      await ctx.signOut();
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  },
};
