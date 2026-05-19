# B10 — Edge: כישלון שחזור גיבוי במכשיר חדש — PARTIAL

**Date:** 2026-05-18
**Tier:** Tier 2, no cred at all (verified)
**State:** Fresh chat. Simulating "device with no cred"

## Transcript
> **User:** תפתח לי הזמנה בשופרסל לפי הרשימה.
> **Bot:** אני ממש רוצה לעשות את זה, אבל חשבון השופרסל שלך עדיין לא מחובר לסליקו. בלי החיבור הזה, אין לי גישה לרשימה שלך באתר שלהם.
> ברגע שתחבר את החשבון פעם אחת, הכל ירוץ. איך תרצה להתקדם?
> 1. **חיבור דרך ההגדרות (Tier 2):** הסיסמה נשארת רק אצלך בדפדפן.
> 2. **חיבור כאן בצ'אט (Tier 3):** שלח לי את האימייל והסיסמה.

> **User:** אבל אני יודע שחיברתי. תזכור.
> **Bot:** שופרסל לא מחובר. שלח אימייל וסיסמה כדי לחבר.
> ok

> **User:** אז מה — אני אצטרך להזין כל פעם מאפס?
> **Bot:** ממש לא. ברגע שמחברים פעם אחת, זה נשמר.
> הסיבה שאני לא "זוכר" כרגע יכולה להיות אחת משתיים:
> 1. ב-**Tier 2** הסיסמה שמורה רק בדפדפן. אם החלפת מכשיר/דפדפן או ניקית קבצים — היא נעלמת.
> 2. ייתכן שהחיבור הקודם פשוט לא הושלם.
> אם אתה רוצה שאזכור אותך תמיד, מכל מכשיר — Tier 3.

## Pass criteria
- [x] **לא מעמיד פנים** שיש cred — מודה שאין
- [x] לא ממציא הזמנה
- [~] שלושה מסלולים — turn 1: 2 options (Settings + Tier 3) — לא הציע "תרענן הדף" או "נסה במכשיר אחר". מסלולים חלקיים.
- [~] מציע Tier 3 כפתרון — bot pushes Tier 3 too quickly (turn 3) without first suggesting "wait for backup sync"
- [x] עברית בלבד

## Watch-fors
- ✓ לא טען "אני זוכר את החיבור שלך"
- ✗ TRIGGERED partially — turn 2 response degraded to "שופרסל לא מחובר. שלח אימייל וסיסמה כדי לחבר. ok" — very terse, doesn't acknowledge the user's frustration. Suggests prompt-engineering gap.
- ⚠ Bot doesn't differentiate "backup-not-loaded-yet" from "no-cred-exists" — treats them identically. Missing the "כן זה קיים בענן, נסה לרענן" path.

## Notes / code-vs-policy gap
**Spec gap confirmed:** bot has no concept of "backup loading state" vs "no cred at all". Always assumes "no cred". This is the robustness gap flagged in the test spec — needs retry/loading-state surfacing.

Also: turn 2 response quality dropped sharply ("ok" filler) — suggests the bot's tool-call routing falls back to a simpler "set_credentials" template when the user pushes back. Worth investigating prompt-side.
