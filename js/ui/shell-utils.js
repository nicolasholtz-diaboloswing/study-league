// Small helpers shared by the app shell and the game-flow views (no side effects).
import { PLAYER_CLUB_ID, divisionName, computeTable, clubOf } from '../core/league.js';
import { levelInfo } from '../core/rewards.js';
import { dayKey, dayStreak } from '../core/stats.js';
import { FREE_PACK_EVERY_N_LEVELS } from '../config.js';
import { flag } from './art.js';

/** The player's club as a plain club object {name, short, colors, crest}. */
export function myClub(state) {
  const p = state?.profile || {};
  const c = state?.league?.season && clubOf(state.league.season, PLAYER_CLUB_ID);
  const name = p.club || c?.name || 'Mon club';
  return {
    name, short: (c && c.name === name ? c.short : name.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').slice(0, 3).toUpperCase()) || 'MC',
    colors: p.colors || c?.colors || ['#1e40af', '#fbbf24'], crest: p.crest || c?.crest || 'shield',
  };
}

/** Scoreboard "home/away" from the player's point of view. */
export function sides(me, opp, isHome = true) {
  return isHome ? { home: me, away: opp } : { home: opp, away: me };
}

/** Level numbers for xpBar from a raw XP total. */
export function levelBar(xp) {
  const i = levelInfo(xp);
  return { level: i.level, xp: xp - i.levelStart, next: i.nextLevelAt - i.levelStart };
}

/** Table rows shaped for components.leagueTable. */
export function tableRows(season) {
  return computeTable(season).map((r) => ({
    pos: r.position, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts,
    isYou: r.isPlayer, club: { name: r.name, short: r.short, colors: r.colors, crest: r.crest },
  }));
}

/** Streak tile text. played today -> come back tomorrow; streak alive but not played today -> play today (urgent); none -> start one. */
export function streakInfo(state, now) {
  const days = dayStreak(state, now);
  const today = state?.streak?.lastDay === dayKey(now);
  if (days > 0 && today) return { days, text: 'Reviens demain pour continuer !', urgent: false };
  if (days > 0) return { days, text: `Joue aujourd'hui pour garder ta série de ${days} jour${days > 1 ? 's' : ''} !`, urgent: true };
  return { days: 0, text: 'Joue un match pour lancer ta série', urgent: false };
}

/** Next level that gives a free pack, and the level reached with `level`. */
export const nextPackLevel = (level) => (Math.floor(level / FREE_PACK_EVERY_N_LEVELS) + 1) * FREE_PACK_EVERY_N_LEVELS;

/**
 * One rivalry line from the leaderboard (entries { uid, displayName, username, xp }), from my point of view.
 * The closest player above me wins; else the closest below. Returns { text, rival, kind: 'above'|'below'|'tie' } or null when alone.
 * `name` is raw text (escape it when rendering); text contains it.
 */
export function rivalryLine(board, myUid, myXp) {
  const others = (board || []).filter((r) => r && r.uid !== myUid && Number.isFinite(r.xp));
  if (!others.length) return null;
  const nameOf = (r) => String(r.displayName || r.username || 'Un joueur');
  const above = others.filter((r) => r.xp > myXp).sort((a, b) => a.xp - b.xp)[0];
  if (above) return { kind: 'above', rival: nameOf(above), diff: above.xp - myXp, text: `${nameOf(above)} est devant : il te manque ${above.xp - myXp} XP pour le dépasser` };
  const below = others.sort((a, b) => b.xp - a.xp)[0];
  if (below.xp === myXp) return { kind: 'tie', rival: nameOf(below), diff: 0, text: `Tu es à égalité avec ${nameOf(below)}` };
  return { kind: 'below', rival: nameOf(below), diff: myXp - below.xp, text: `Tu es devant ${nameOf(below)} de ${myXp - below.xp} XP` };
}

/** Name of a player passed by this match (was ahead of `xpBefore`, now behind `xpAfter`), or null. */
export function overtaken(board, myUid, xpBefore, xpAfter) {
  const passed = (board || []).filter((r) => r && r.uid !== myUid && Number.isFinite(r.xp) && r.xp > xpBefore && r.xp < xpAfter).sort((a, b) => b.xp - a.xp)[0];
  return passed ? String(passed.displayName || passed.username || 'Un joueur') : null;
}

export const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);

export { divisionName };

/** Topics of a subject, flattened with their subject; used by play and training. */
export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

/** Subject names are shown as stored; English subject gets a French label for the child. */
export function subjectLabel(s) {
  return s.id === 'en' ? 'Anglais' : s.name;
}

/** Topic display name: French names stay, English topics keep their English name (it is the thing being learnt). */
export const topicName = (t) => t.name;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Safe localStorage helpers (can throw in private windows). */
export function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
export function lsDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

/** Icon html for a subject: an SVG flag for languages (Windows has no flag emoji), else the emoji. */
export function subjectIcon(subjectId, fallback = '⚽') {
  return subjectId === 'en' ? flag('England', 36) : subjectId === 'fr' ? flag('France', 36) : fallback;
}
