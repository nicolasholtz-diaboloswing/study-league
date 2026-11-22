// Study League UI components. Convention: every component is a pure function returning an HTML string.
// Interactive hooks are data-attributes (data-action, data-choice, ...). Views attach listeners themselves.
// Only the three helpers at the bottom (showModal, closeModal, showToast, updateTimer) touch the DOM.
import { GOAL_EVERY_N_CORRECT } from '../config.js';
import { meterText } from './rules.js';
import { crest, esc, flag, football, safeColor, trophy } from './art.js';

export { esc };

/** Join attribute map {data-x: 1, disabled: true} into an attribute string. */
const attrs = (o = {}) => Object.entries(o).filter(([, v]) => v !== false && v != null)
  .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(' ');
const cx = (...c) => c.filter(Boolean).join(' ');
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
const nb = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ================= Buttons ================= */
/**
 * @param {{label:string, variant?:'primary'|'gold'|'secondary'|'ghost'|'danger', size?:'sm'|'md'|'lg', href?:string,
 *   block?:boolean, disabled?:boolean, icon?:string, id?:string, type?:string, attrs?:object, cls?:string}} o
 * href => <a>, otherwise <button>. Example: button({label:'Play match', variant:'primary', size:'lg', attrs:{'data-action':'play'}})
 */
export function button(o) {
  const { label, variant = 'primary', size = 'md', href, block, disabled, icon, id, type = 'button', cls } = o;
  const c = cx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', cls);
  const inner = `${icon ? `<span class="btn__icon" aria-hidden="true">${icon}</span>` : ''}<span class="btn__label">${esc(label)}</span>`;
  const common = { id, class: c, ...(o.attrs || {}) };
  if (href && !disabled) return `<a ${attrs({ ...common, href })}>${inner}</a>`;
  return `<button ${attrs({ ...common, type, disabled })}>${inner}</button>`;
}

/* ================= Small atoms ================= */
/** @param {string} text @param {'neutral'|'gold'|'ok'|'bad'|'info'} [tone] */
export const pill = (text, tone = 'neutral') => `<span class="pill pill--${tone}">${esc(text)}</span>`;

/** Coin amount with coin icon. */
export const coins = (n) => `<span class="coins"><span class="coin-icon" aria-hidden="true">$</span><span class="num">${esc(n)}</span><span class="sr-only"> pièces</span></span>`;

/** Segmented tabs / sort switch. items: [{id,label}] active: id. Buttons carry data-tab="id". */
export function tabs(items, active, o = {}) {
  return `<div class="tabs ${o.scroll ? 'tabs--scroll' : ''}" role="tablist" ${attrs(o.attrs)}>${items.map((t) =>
    `<button class="tabs__tab" role="tab" type="button" data-tab="${esc(t.id)}" aria-selected="${t.id === active}">${esc(t.label)}</button>`).join('')}</div>`;
}

/** Section wrapper: heading + optional right-hand link + body html. */
export function section(title, body, o = {}) {
  return `<section class="section ${o.cls || ''}"><div class="section__head"><h2 class="section__title">${esc(title)}</h2>${o.link ? `<a class="section__link" href="${esc(o.link.href)}">${esc(o.link.label)}</a>` : ''}</div>${body}</section>`;
}

/** Page header: optional kicker above title. */
export const pageHead = (title, o = {}) => `<header class="page-head">${o.kicker ? `<span class="page-head__kicker">${esc(o.kicker)}</span>` : ''}<h1>${esc(title)}</h1>${o.sub ? `<p class="page-head__sub">${esc(o.sub)}</p>` : ''}</header>`;

/** Generic surface. */
export const panel = (html, o = {}) => `<div class="panel ${o.tone ? 'panel--' + o.tone : ''} ${o.cls || ''}">${html}</div>`;

/* ================= Stars + XP ================= */
const STAR = 'M12 2.6l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.6l-5.9 3.3 1.2-6.6L2.4 9.6l6.7-.9z';
/** Mastery stars 0..max (default 3). */
export function stars(value = 0, o = {}) {
  const max = o.max || 3, size = o.size || 18;
  return `<span class="stars" role="img" aria-label="${esc(value)} of ${esc(max)} stars">${Array.from({ length: max }, (_, i) =>
    `<svg class="stars__s ${i < value ? 'is-on' : ''}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${STAR}"/></svg>`).join('')}</span>`;
}

/**
 * XP / level bar. `xp` = XP gained inside the current level, `next` = XP needed for this level.
 * compact => single-line version for the top bar.
 */
export function xpBar({ level, xp, next, compact = false }) {
  const pct = next > 0 ? clamp(xp / next, 0, 1) * 100 : 100;
  return `<div class="xp ${compact ? 'xp--compact' : ''}" role="group" aria-label="Niveau ${esc(level)}, ${esc(xp)} sur ${esc(next)} XP">
    <span class="xp__level"><small>NIV</small><b class="num">${esc(level)}</b></span>
    <span class="xp__track"><span class="xp__fill" style="width:${pct.toFixed(1)}%"></span>${compact ? '' : `<span class="xp__label num">${esc(xp)} / ${esc(next)} XP</span>`}</span>
  </div>`;
}

/* ================= Scoreboard + attack meter ================= */
/**
 * Match scoreboard. home/away = club objects {name, short, colors, crest}.
 * @param {{home:object, away:object, homeScore:number, awayScore:number, minute?:number|string, status?:string, goalSide?:'home'|'away'}} o
 */
export function scoreboard({ home, away, homeScore = 0, awayScore = 0, minute, status, goalSide }) {
  const side = (club, score, s) => `<div class="sb__team sb__team--${s}">
      <div class="sb__crest">${crest(club, 56)}</div><div class="sb__name">${esc(club.name)}</div></div>`;
  return `<div class="scoreboard" role="group" aria-label="${esc(home.name)} ${esc(homeScore)}, ${esc(away.name)} ${esc(awayScore)}">
    <div class="scoreboard__lights" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="sb__row">
      ${side(home, homeScore, 'home')}
      <div class="sb__score"><span class="sb__digit ${goalSide === 'home' ? 'is-goal' : ''}" data-score="home">${esc(homeScore)}</span><span class="sb__dash">–</span><span class="sb__digit ${goalSide === 'away' ? 'is-goal' : ''}" data-score="away">${esc(awayScore)}</span></div>
      ${side(away, awayScore, 'away')}
    </div>
    <div class="sb__clock"><span class="sb__minute num" data-minute>${minute != null && minute !== '' ? esc(minute) + "'" : '&nbsp;'}</span>${status ? `<span class="sb__status">${esc(status)}</span>` : ''}</div>
  </div>`;
}

/**
 * Attack meter: GOAL_EVERY_N_CORRECT segments, step 0..N (N = BUT lit).
 * Optional `{ live: true }` replaces the bare « Attaque » label by the countdown (« Encore 2 bonnes réponses pour marquer »).
 */
export function attackMeter(step = 0, { live = false } = {}) {
  const N = GOAL_EVERY_N_CORRECT;
  const s = clamp(step, 0, N);
  const goal = s === N;
  const t = meterText(s);
  const label = live && !goal
    ? `<span class="attack__label attack__label--live ${t.ready ? 'is-ready' : ''}"><span class="attack__long">${esc(t.long)}</span><span class="attack__short" aria-hidden="true">${esc(t.short)}</span></span>`
    : '<span class="attack__label">Attaque</span>';
  const aria = goal ? 'But !' : live ? t.long : `Attaque : ${s} sur ${N}`;
  return `<div class="attack ${goal ? 'is-goal' : ''} ${live ? 'attack--live' : ''}" role="img" aria-label="${esc(aria)}">
    ${label}
    <span class="attack__track">${Array.from({ length: N }, (_, i) => `<span class="attack__seg ${s >= i + 1 ? 'is-on' : ''}"></span>`).join('')}</span>
    <span class="attack__goal">${football(22)}<b>BUT</b></span>
  </div>`;
}

/* ================= Question card ================= */
/**
 * @param {{number:number,total:number,prompt:string,type:'mcq'|'input',choices?:string[],
 *   status?:'idle'|'correct'|'wrong'|'timeout', selected?:number, correctAnswer?:string, explanation?:string,
 *   inputValue?:string, placeholder?:string, topic?:string, timer?:string}} q
 * mcq choices carry data-choice="index"; input form is <form data-answer-form> with <input name="answer">.
 * After an answer (status != idle) all inputs are disabled; the right choice is marked, the explanation shown.
 */
export function questionCard(q) {
  const { number, total, prompt, type, choices = [], status = 'idle', selected, correctAnswer, explanation, inputValue = '', placeholder = 'Écris ta réponse', topic, timer = '', note = '' } = q;
  const done = status !== 'idle';
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  let body;
  if (type === 'mcq') {
    body = `<div class="choices" role="group" aria-label="Réponses">${choices.map((c, i) => {
      let st = '';
      if (done) { if (c === correctAnswer) st = 'is-correct'; else if (i === selected) st = 'is-wrong'; else st = 'is-dim'; }
      return `<button type="button" class="choice ${st}" data-choice="${i}" ${done ? 'disabled' : ''}><span class="choice__key">${letters[i]}</span><span class="choice__text">${esc(c)}</span>${st === 'is-correct' ? '<span class="choice__mark" aria-hidden="true">✓</span>' : st === 'is-wrong' ? '<span class="choice__mark" aria-hidden="true">✗</span>' : ''}</button>`;
    }).join('')}</div>`;
  } else {
    const st = status === 'correct' ? 'is-correct' : done ? 'is-wrong' : '';
    body = `<form class="answer-form" data-answer-form autocomplete="off">
      <input class="answer-input ${st}" name="answer" type="text" value="${esc(inputValue)}" placeholder="${esc(placeholder)}" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Ta réponse" ${done ? 'disabled' : ''}>
      ${done ? '' : '<button class="btn btn--gold btn--lg" type="submit"><span class="btn__label">Tirer !</span></button>'}
    </form>`;
  }
  const verdict = { correct: ['Bravo !', 'ok'], wrong: ['Raté !', 'bad'], timeout: ['Temps écoulé !', 'bad'] }[status];
  const feedback = `<div class="qcard__feedback" role="status" aria-live="polite">${done ? `
      <div class="feedback feedback--${verdict[1]}">
        <div class="feedback__verdict">${verdict[0]}</div>
        ${note ? `<div class="feedback__note">${esc(note)}</div>` : ''}
        ${status !== 'correct' && correctAnswer ? `<div class="feedback__answer">La réponse : <b>${esc(correctAnswer)}</b></div>` : ''}
        ${explanation ? `<div class="feedback__why">${esc(explanation)}</div>` : ''}
      </div>` : ''}</div>`;
  return `<article class="qcard qcard--${status}">
    <header class="qcard__head"><span class="qcard__no"><b class="num">${esc(number)}</b><small>/ ${esc(total)}</small></span>${topic ? `<span class="qcard__topic">${esc(topic)}</span>` : ''}<span class="qcard__timer">${timer}</span></header>
    <h2 class="qcard__prompt">${esc(prompt)}</h2>
    ${body}${feedback}
  </article>`;
}

/* ================= Timer ================= */
const RING_R = 24, RING_C = 2 * Math.PI * RING_R;
/**
 * Countdown timer. variant 'ring' (default, with seconds in the middle) or 'bar'.
 * Update live with updateTimer(el, remaining, total). Turns urgent under 25 %.
 */
export function timer({ remaining, total, variant = 'ring' }) {
  const f = total > 0 ? clamp(remaining / total, 0, 1) : 0;
  const urgent = f <= 0.25 ? 'is-urgent' : '';
  if (variant === 'bar') {
    return `<div class="timer timer--bar ${urgent}" data-timer role="timer" aria-label="${Math.ceil(remaining)} secondes restantes"><span class="timer__bar"><span class="timer__fill" style="width:${(f * 100).toFixed(1)}%"></span></span><span class="timer__sec num">${Math.ceil(remaining)}</span></div>`;
  }
  return `<div class="timer timer--ring ${urgent}" data-timer role="timer" aria-label="${Math.ceil(remaining)} secondes restantes">
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true"><circle class="timer__bg" cx="28" cy="28" r="${RING_R}"/><circle class="timer__fg" cx="28" cy="28" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${(RING_C * (1 - f)).toFixed(2)}" transform="rotate(-90 28 28)"/></svg>
    <span class="timer__sec num">${Math.ceil(remaining)}</span></div>`;
}

/* ================= League ================= */
/**
 * League table. rows: [{pos, club:{name,short,colors,crest}, played, won, drawn, lost, gf, ga, pts, isYou?}]
 * A gold "promotion zone" marker is drawn on rows 1..promotionSpots. compact => fewer columns (home page).
 */
export function leagueTable({ rows, promotionSpots = 2, compact = false }) {
  const head = compact ? '<th>J</th><th>Diff</th><th>Pts</th>' : '<th>J</th><th>G</th><th>N</th><th>P</th><th class="hide-sm">BP</th><th class="hide-sm">BC</th><th>Diff</th><th>Pts</th>';
  const body = rows.map((r) => {
    const gd = nb(r.gd != null ? r.gd : r.gf - r.ga);
    const gdt = gd > 0 ? `+${gd}` : `${gd}`;
    r = { ...r, pos: nb(r.pos), played: esc(r.played), won: esc(r.won), drawn: esc(r.drawn), lost: esc(r.lost), gf: esc(r.gf), ga: esc(r.ga), pts: esc(r.pts) };
    const cells = compact
      ? `<td class="num">${r.played}</td><td class="num">${gdt}</td><td class="num lt__pts">${r.pts}</td>`
      : `<td class="num">${r.played}</td><td class="num">${r.won}</td><td class="num">${r.drawn}</td><td class="num">${r.lost}</td><td class="num hide-sm">${r.gf}</td><td class="num hide-sm">${r.ga}</td><td class="num">${gdt}</td><td class="num lt__pts">${r.pts}</td>`;
    const promo = r.pos <= promotionSpots;
    return `<tr class="${cx(r.isYou && 'is-you', promo && 'is-promo', r.pos === promotionSpots && 'is-promo-last')}">
      <td class="lt__pos"><span class="num">${r.pos}</span></td>
      <td class="lt__club"><div class="lt__cell"><span class="lt__crest">${crest(r.club, 26)}</span><span class="lt__name">${esc(r.club.name)}</span>${r.isYou ? '<span class="lt__you">TOI</span>' : ''}</div></td>${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="league-table ${compact ? 'is-compact' : ''}"><thead><tr><th class="lt__pos">#</th><th class="lt__club">Club</th>${head}</tr></thead><tbody>${body}</tbody></table>
    <p class="league-table__legend"><span class="promo-dot"></span> Zone de montée (les ${promotionSpots} premiers)</p></div>`;
}

/**
 * Fixture row. status: 'upcoming' | 'next' | 'played'. For played rows pass scores; `result` ('W'|'D'|'L') is the player's result.
 * `youSide` ('home'|'away') bolds the player's club. `href` makes the row a link (e.g. to the match).
 */
export function fixtureRow({ matchday, home, away, homeScore, awayScore, status = 'upcoming', result, youSide, href }) {
  result = ['W', 'D', 'L'].includes(result) ? result : undefined;
  status = ['upcoming', 'next', 'played'].includes(status) ? status : 'upcoming';
  youSide = youSide === 'home' || youSide === 'away' ? youSide : undefined;
  const mid = status === 'played'
    ? `<span class="fx__score num">${esc(homeScore)}<i>–</i>${esc(awayScore)}</span>`
    : `<span class="fx__vs">contre</span>`;
  const tag = result ? `<span class="fx__res fx__res--${result}" aria-label="${{ W: 'Victoire', D: 'Nul', L: 'Défaite' }[result]}">${result}</span>` : (status === 'next' ? '<span class="fx__next">À JOUER</span>' : '<span class="fx__res fx__res--none"></span>');
  const inner = `<span class="fx__md">${matchday != null ? 'J' + esc(matchday) : ''}</span>
    <span class="fx__team fx__team--home ${youSide === 'home' ? 'is-you' : ''}"><span class="fx__tn">${esc(home.name)}</span>${crest(home, 28)}</span>
    ${mid}
    <span class="fx__team fx__team--away ${youSide === 'away' ? 'is-you' : ''}">${crest(away, 28)}<span class="fx__tn">${esc(away.name)}</span></span>${tag}`;
  return href ? `<a class="fixture fixture--${status}" href="${esc(href)}">${inner}</a>` : `<div class="fixture fixture--${status}">${inner}</div>`;
}

/* ================= Topics, mastery, badges ================= */
/**
 * Topic tile. `href` or data attributes via `attrs`. coachPick adds the ribbon.
 * @param {{name:string, icon?:string, stars?:number, meta?:string, coachPick?:boolean, href?:string, locked?:boolean, attrs?:object}} o
 */
export function topicTile({ name, icon = '⚽', stars: st = 0, meta, coachPick, href, locked, attrs: a }) {
  const inner = `${coachPick ? '<span class="ribbon">Choix du coach</span>' : ''}
    <span class="tile__icon" aria-hidden="true">${icon}</span>
    <span class="tile__name">${esc(name)}</span>
    ${meta ? `<span class="tile__meta">${esc(meta)}</span>` : ''}
    ${stars(st, { size: 16 })}
    ${coachPick ? '<span class="tile__bonus">+50 % de pièces</span>' : ''}`;
  const c = cx('tile', coachPick && 'tile--pick', locked && 'tile--locked');
  return href && !locked ? `<a class="${c}" href="${esc(href)}" ${attrs(a)}>${inner}</a>` : `<button type="button" class="${c}" ${attrs({ ...a, disabled: locked })}>${inner}</button>`;
}

/** Mastery bar: label, percentage (0-100), optional stars 0-3. */
export function masteryBar({ label, pct, stars: st, meta }) {
  const p = clamp(Math.round(pct), 0, 100);
  const tone = p >= 90 ? 'gold' : p >= 70 ? 'ok' : p >= 50 ? 'info' : 'low';
  return `<div class="mbar mbar--${tone}"><div class="mbar__top"><span class="mbar__label">${esc(label)}</span>${meta ? `<span class="mbar__meta text-faint">${esc(meta)}</span>` : ''}${st != null ? stars(st, { size: 14 }) : ''}<span class="mbar__pct num">${p}%</span></div>
    <div class="mbar__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${esc(label)}"><span class="mbar__fill" style="width:${p}%"></span></div></div>`;
}

/** Badge medal. icon = emoji or short text. tier: 'bronze'|'silver'|'gold'. */
export function badgeMedal({ icon = '🏅', name, desc, unlocked = false, tier = 'gold' }) {
  return `<div class="medal medal--${tier} ${unlocked ? 'is-unlocked' : 'is-locked'}">
    <div class="medal__disc" aria-hidden="true"><span>${unlocked ? icon : '🔒'}</span></div>
    <div class="medal__name">${esc(name)}</div>
    ${desc ? `<div class="medal__desc">${esc(desc)}</div>` : ''}
    <span class="sr-only">${unlocked ? 'Débloqué' : 'Verrouillé'}</span></div>`;
}

/* ================= Rivals ================= */
/**
 * Leaderboard row. Rank 1-3 get podium styling. club = club object (crest shown). value is pre-formatted.
 * @param {{rank:number, name:string, club?:object, value:string|number, label?:string, isYou?:boolean, href?:string}} o
 */
export function leaderboardRow({ rank, name, club, value, label, isYou, href }) {
  const medal = rank <= 3 ? ['', '🥇', '🥈', '🥉'][rank] : '';
  const inner = `<span class="lb__rank ${rank <= 3 ? 'lb__rank--' + rank : ''}"><span class="num">${esc(rank)}</span></span>
    <span class="lb__crest">${club ? crest(club, 38) : ''}</span>
    <span class="lb__who"><span class="lb__name">${esc(name)}${isYou ? ' <em class="lt__you">TOI</em>' : ''}</span>${club ? `<span class="lb__club">${esc(club.name)}</span>` : ''}</span>
    <span class="lb__val"><span class="num">${esc(value)}</span>${label ? `<small>${esc(label)}</small>` : ''}</span>${medal ? `<span class="lb__medal" aria-hidden="true">${medal}</span>` : ''}`;
  const c = cx('lb', rank <= 3 && 'lb--podium lb--p' + rank, isYou && 'is-you');
  return href ? `<a class="${c}" href="${esc(href)}">${inner}</a>` : `<div class="${c}">${inner}</div>`;
}

/**
 * Head-to-head comparison. rows: [{label, me, rival, higherIsBetter?:true, format?:(v)=>string}] (me/rival numbers).
 * The better side of each stat is highlighted and its bar is longer.
 */
export function h2h({ me, rival, rows }) {
  const head = `<div class="h2h__head"><div class="h2h__who h2h__who--me">${me.club ? crest(me.club, 44) : ''}<b>${esc(me.name)}</b></div><div class="h2h__vs">VS</div><div class="h2h__who h2h__who--rival">${rival.club ? crest(rival.club, 44) : ''}<b>${esc(rival.name)}</b></div></div>`;
  const body = rows.map((r) => {
    const f = r.format || ((v) => v), hib = r.higherIsBetter !== false;
    const a = Number(r.me) || 0, b = Number(r.rival) || 0, max = Math.max(a, b, 1e-9);
    const win = a === b ? '' : ((a > b) === hib ? 'me' : 'rival');
    return `<div class="h2h__row"><span class="h2h__val h2h__val--me ${win === 'me' ? 'is-win' : ''} num">${esc(f(r.me))}</span>
      <div class="h2h__mid"><span class="h2h__label">${esc(r.label)}</span><span class="h2h__bars"><i class="h2h__bar h2h__bar--me ${win === 'me' ? 'is-win' : ''}" style="width:${(a / max * 100).toFixed(0)}%"></i><i class="h2h__bar h2h__bar--rival ${win === 'rival' ? 'is-win' : ''}" style="width:${(b / max * 100).toFixed(0)}%"></i></span></div>
      <span class="h2h__val h2h__val--rival ${win === 'rival' ? 'is-win' : ''} num">${esc(f(r.rival))}</span></div>`;
  }).join('');
  return `<div class="h2h">${head}${body}</div>`;
}

/* ================= Stats + charts ================= */
/** Stat tile. tone: 'default'|'gold'|'ok'|'bad'. */
export const statTile = ({ label, value, sub, icon, tone = 'default' }) => `<div class="stat stat--${tone}">${icon ? `<span class="stat__icon" aria-hidden="true">${icon}</span>` : ''}<span class="stat__value num">${esc(value)}</span><span class="stat__label">${esc(label)}</span>${sub ? `<span class="stat__sub">${esc(sub)}</span>` : ''}</div>`;

/**
 * Simple bar chart. data: [{label, value, highlight?}]. unit is appended in the aria-label / title.
 * Example: barChart({data:[{label:'Mon', value:3}], height:120, unit:'matches'})
 */
export function barChart({ data, height = 120, unit = '' }) {
  data = data.map((d) => ({ ...d, value: nb(d.value) }));
  const max = Math.max(1, ...data.map((d) => d.value));
  return `<div class="bars" style="--bars-h:${nb(height)}px" role="img" aria-label="Graphique : ${esc(data.map((d) => `${d.label} ${d.value}`).join(', '))} ${esc(unit)}">${data.map((d) => `<div class="bars__col ${d.highlight ? 'is-hl' : ''}" title="${esc(d.label)}: ${esc(d.value)} ${esc(unit)}">
    <span class="bars__val num">${esc(d.value || '')}</span><span class="bars__bar" style="height:calc(var(--bars-h) * ${(d.value / max).toFixed(3)})"></span><span class="bars__label">${esc(d.label)}</span></div>`).join('')}</div>`;
}

/* ================= Overlays + feedback ================= */
/**
 * Modal markup. Open with showModal(html); buttons with data-modal-close close it.
 * actions: array of button() html strings.
 */
export function modal({ title, body, actions = [], id = 'modal' }) {
  return `<div class="modal" data-modal role="presentation"><div class="modal__scrim" data-modal-close></div>
    <div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="${id}-t" tabindex="-1">
      <h2 class="modal__title" id="${id}-t">${esc(title)}</h2><div class="modal__body">${body}</div>
      ${actions.length ? `<div class="modal__actions">${actions.join('')}</div>` : ''}</div></div>`;
}

/** Toast markup. tone: 'info'|'ok'|'bad'|'gold'. Normally via showToast(). */
export const toast = ({ message, tone = 'info', icon }) => `<div class="toast toast--${tone}" role="status">${icon ? `<span class="toast__icon" aria-hidden="true">${icon}</span>` : ''}<span>${esc(message)}</span></div>`;

/** Empty state with optional action (button() html). */
export const emptyState = ({ icon = '⚽', title, text, action = '' }) => `<div class="empty"><div class="empty__icon" aria-hidden="true">${icon}</div><h3 class="empty__title">${esc(title)}</h3>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}${action}</div>`;

/** Trophy reward banner (title won, promotion). */
export const rewardBanner = ({ title, text }) => `<div class="reward"><div class="reward__art">${trophy(64)}</div><div><div class="reward__title">${esc(title)}</div>${text ? `<div class="reward__text">${esc(text)}</div>` : ''}</div></div>`;

/* ================= Forms ================= */
/**
 * Text-like field. type: text|password|email|number. error shows red text and aria-invalid.
 * Example: field({label:'Username', name:'username', required:true, hint:'Letters and digits'})
 */
export function field({ label, name, type = 'text', value = '', placeholder = '', hint, error, required, autocomplete, attrs: a }) {
  const id = `f-${name}`;
  return `<div class="field ${error ? 'has-error' : ''}"><label class="field__label" for="${id}">${esc(label)}${required ? '<span class="field__req" aria-hidden="true"> *</span>' : ''}</label>
    <input class="input" id="${id}" name="${esc(name)}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${autocomplete ? `autocomplete="${autocomplete}"` : ''} ${error ? `aria-invalid="true" aria-describedby="${id}-m"` : hint ? `aria-describedby="${id}-m"` : ''} ${attrs(a)}>
    ${error || hint ? `<p class="field__msg" id="${id}-m">${esc(error || hint)}</p>` : ''}</div>`;
}

/** Select. options: [{value,label}] */
export function selectField({ label, name, options, value, hint }) {
  const id = `f-${name}`;
  return `<div class="field"><label class="field__label" for="${id}">${esc(label)}</label><select class="input select" id="${id}" name="${esc(name)}">${options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${hint ? `<p class="field__msg">${esc(hint)}</p>` : ''}</div>`;
}

/** Big radio cards (e.g. squad choice). options: [{value,label,desc,icon}] */
export function choiceGroup({ label, name, options, value }) {
  return `<fieldset class="field choicegroup"><legend class="field__label">${esc(label)}</legend><div class="choicegroup__grid">${options.map((o) => `<label class="choicecard"><input type="radio" name="${esc(name)}" value="${esc(o.value)}" ${o.value === value ? 'checked' : ''}><span class="choicecard__box">${o.icon ? `<span class="choicecard__icon" aria-hidden="true">${o.icon}</span>` : ''}<span class="choicecard__label">${esc(o.label)}</span>${o.desc ? `<span class="choicecard__desc">${esc(o.desc)}</span>` : ''}</span></label>`).join('')}</div></fieldset>`;
}

/** Colour swatch picker (kit colours). colors: hex[]; renders radio inputs named `name`. */
export function colorPicker({ label, name, colors, value }) {
  return `<fieldset class="field"><legend class="field__label">${esc(label)}</legend><div class="swatches">${colors.map((c) => `<label class="swatch"><input type="radio" name="${esc(name)}" value="${esc(c)}" ${c === value ? 'checked' : ''}><span class="swatch__dot" style="background:${esc(safeColor(c, '#888888'))}"><span class="sr-only">${esc(c)}</span></span></label>`).join('')}</div></fieldset>`;
}

/* ================= DOM helpers (the only impure functions) ================= */
let lastFocus = null;
/** Insert modal html into #modal-root (or body), focus the dialog, close on scrim/Esc/[data-modal-close]. Returns the element. */
export function showModal(html) {
  closeModal();
  const root = document.getElementById('modal-root') || document.body;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const el = wrap.firstElementChild;
  root.appendChild(el);
  lastFocus = document.activeElement;
  const box = el.querySelector('.modal__box');
  box?.focus();
  el.addEventListener('click', (e) => { if (e.target.closest('[data-modal-close]')) closeModal(); });
  el._esc = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', el._esc);
  return el;
}
export function closeModal() {
  document.querySelectorAll('[data-modal]').forEach((el) => { document.removeEventListener('keydown', el._esc); el.remove(); });
  lastFocus?.focus?.(); lastFocus = null;
}
/** Show a toast in #toasts for `ms` (default 3200). */
export function showToast(message, tone = 'info', opt = {}) {
  const host = document.getElementById('toasts') || document.body;
  const wrap = document.createElement('div');
  wrap.innerHTML = toast({ message, tone, icon: opt.icon });
  const el = wrap.firstElementChild;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); }, opt.ms || 3200);
  return el;
}
/** Update a rendered timer() in place (ring or bar). */
export function updateTimer(el, remaining, total) {
  const t = el.matches?.('[data-timer]') ? el : el.querySelector('[data-timer]');
  if (!t) return;
  const f = total > 0 ? clamp(remaining / total, 0, 1) : 0;
  t.classList.toggle('is-urgent', f <= 0.25);
  const sec = t.querySelector('.timer__sec'); if (sec) sec.textContent = Math.ceil(remaining);
  const fg = t.querySelector('.timer__fg'); if (fg) fg.setAttribute('stroke-dashoffset', (RING_C * (1 - f)).toFixed(2));
  const fill = t.querySelector('.timer__fill'); if (fill) fill.style.width = `${(f * 100).toFixed(1)}%`;
  t.setAttribute('aria-label', `${Math.ceil(remaining)} secondes restantes`);
}
export { flag };
