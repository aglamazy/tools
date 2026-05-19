# A04 — השוואת מחיר קוקה קולה — FAIL
**Run:** 2026-05-18 (rerun)
**Saliko version:** dev local (localhost:3101), dry-run on, isolated context `saliko-class-A-anon-rerun`

## Transcript
> User: כמה עולה שישייה של קוקה קולה בשופרסל?
> Bot: הייתה לי תקלה קטנה בחיפוש המחיר בשופרסל כרגע. רוצה שאנסה לחפש שוב או שנבדוק מוצר אחר?

> User: ובמקור השפע?
> Bot: לא מצאתי "שישייה של קוקה קולה" במקור השפע. רוצה שאחפש פשוט "קוקה קולה" ונראה מה מופיע?

> User: אז איפה זול יותר?
> Bot: שגיאה בחיפוש "קולה" בשופרסל.
>
> ok
>
> [picker: בחר "קולה" (הזמנה): בייבי מיקס תרד ורוקולה משק בכור / חסות ועלים 11.9₪ / עלי רוקולה משק בכור / חסות ועלים 12.9₪]

## Pass criteria
- [ ] קריאה אמיתית ל-search_product (פעמיים, פעם לכל חנות) — Shufersal call FAILED both times (auth required), Retalix found nothing.
- [x] לא ממציא מחירים — bot did not invent prices.
- [ ] עונה גם בלי שהמשתמש מחובר — *partial*. Retalix searches ran without auth (good); Shufersal searches failed with "credentials not configured" (bug).
- [x] עברית בלבד.

## Watch-fors
- ok: לא ממציא מחירים.
- ok: לא לחץ על הרשמה (אבל לא הסביר את החסם בצורה נקייה).
- ok: לא ערבב חנויות בתשובה אחת בלי לסמן.
- TRIGGERED: "ok" leaked as raw chat text in turn 3 — looks like a stray model token, not the previous run's `call:` leak, but still a leak.
- TRIGGERED: Turn 3 returned a *picker* for "קולה" (matched Hebrew "רוקלה" = rocket / lettuce) instead of an answer to "where is it cheaper" — search-quality + flow bug.

## Notes
- **The `call:` raw-text leak is GONE.** This is the primary signal that the cold-start `call:` text leak (the original bug #2) has been resolved. The model now emits proper `functionCall` objects via the Gemini API, so the executor parses them correctly. The model change from `gemini-2.5-flash` (pinned) to `gemini-flash-latest` (alias) is what did it.
- **NEW failure mode surfaced: Shufersal search requires authentication.** The Shufersal client throws `Error: Shufersal credentials not configured` at `app/services/grocery/shufersalClient.ts:325` when `loadCredentials(uid)` returns null. For an anon user this fails every time. The test spec explicitly says "catalog reads should work for anon" — they do not, in fact, because the shufersal client logs in *before* searching. This affects A04, A06, A07.
- **NEW failure mode surfaced: Gemini "thought_signature missing" 400 errors** on the second model turn (after a tool result is sent back). Captured many times in run.log. The retry path drops tools and asks for a plain text reply, which produces the "תקלה קטנה" message visible to the user.
- **Tool-jam detection did NOT fire** because the model never emits the `call: name(args)` text pattern anymore — it goes straight to a proper functionCall. The jam fix (escalate to gemini-2.5-pro) was conditioned on a syntactic pattern that no longer occurs. The underlying problem the jam fix targeted is fixed by a *different* mechanism (the model alias change).

## Delta vs previous run
**Same verdict (FAIL → FAIL), but the failure mechanism is different.** Previously: `call:` raw text leaked to the user. Now: function call is correctly invoked but the Shufersal backend returns "credentials not configured" for anon users, then a Gemini API "thought_signature missing" error on the retry, then a fallback "תקלה קטנה" reply. The `call:` leak is genuinely gone; the catalog-anon-read bug is now the dominant blocker. Net: same outcome for the user (no price comparison), different root cause.
