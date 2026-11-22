// Small helpers shared by the cards, badges, rivals, coach, profile and help views.
import { esc } from '../art.js';

export { esc };

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** 14 nov. 2026 */
export function fmtDate(ts, withYear = true) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`;
}

/** 18 h 05 */
export function fmtHour(ts) {
  const d = new Date(ts);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 2 h 15, 42 min, 0 min */
export function fmtDuration(ms) {
  const min = Math.round((ms || 0) / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** « Aujourd'hui, 18 h 05 », « Hier », « Il y a 3 jours », « Jamais » */
export function relTime(ts, now) {
  if (!ts) return 'Jamais';
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(now) - day(ts)) / 86400000);
  if (diff <= 0) return `Aujourd'hui, ${fmtHour(ts)}`;
  if (diff === 1) return `Hier, ${fmtHour(ts)}`;
  return `Il y a ${diff} jours`;
}

/** Same three letters as the league module uses for the player's club. */
export function shortOf(name) {
  const letters = String(name || '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'ME').padEnd(3, 'X');
}

/** Club object for the crest art, from a leaderboard summary or a profile. */
export function clubFrom(name, colors) {
  return { name: name || 'Mon club', short: shortOf(name), colors: colors || ['#1e40af', '#fbbf24'], crest: 'shield' };
}

export const SQUADS = { u13: 'Pro', u10: 'Académie' };

/** Escape for an attribute or text. */
export const e = esc;

/** Delegated listener that is removed by the returned cleanup (the #view element is reused). */
export function listen(el, type, handler) {
  const ac = new AbortController();
  el.addEventListener(type, handler, { signal: ac.signal });
  return () => ac.abort();
}
