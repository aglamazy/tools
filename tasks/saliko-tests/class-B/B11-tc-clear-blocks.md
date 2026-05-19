# B11 — Edge: ניקוי T&C מאחסון מאמת שהאפליקציה חוסמת

**Persona:** דבאגר / QA — בודק שמנגנון ה-T&C gate באמת חוסם, לא רק דקורטיבי
**State:** logged in (Tier 2), כבר אישר T&C בעבר (כלומר תחילת הטסט = אפליקציה זמינה במלואה, אין מודאל); creds עשויים להיות או לא להיות מחוברים — לא רלוונטי לזרימה הזו

**Goal of test:** (1) ניקוי `tcAcceptedAt` של המשתמש בשרת/אחסון. (2) רענון הדף. (3) ודא שהמודאל T&C חזר וחוסם interaction עם הצ׳אט/שאר המסך עד שמאשרים שוב. הטסט הזה מוודא שה-gate הוא real — לא רק מודאל קוסמטי שאפשר לעקוף.

## UI / state interaction

הזרימה כולה ב-MCP, בלי שיחת צ׳אט.

### שלב 1 — אישור מצב התחלתי
1. Snapshot של `http://localhost:3101/app` או דומה (אזור מאחורי-login).
2. ודא שאין מודאל T&C — האפליקציה נגישה במלואה (sidebar/chat bubble נראים).

### שלב 2 — ניקוי `tcAcceptedAt`
יש שתי דרכים לעשות זאת מתוך MCP — בחר את הקלה יותר:

**אפשרות א — Firebase JS SDK מהקונסול:**
```js
// evaluate_script
async () => {
  const { getFirestore, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js');
  const uid = getAuth().currentUser?.uid;
  if (!uid) return { error: 'no user' };
  await updateDoc(doc(getFirestore(), 'users', uid), { tcAcceptedAt: null });
  return { ok: true, uid };
}
```

**אפשרות ב — endpoint dev-only (אם קיים):**
- בדוק אם יש `app/api/dev/clear-tc/route.ts` או דומה. אם קיים — קרא לו עם POST. אם לא קיים — השתמש באפשרות א.

### שלב 3 — רענן את הדף
- `navigate_page` עם `type: 'reload'`.
- המתן ל-3-5 שניות (load + Firestore subscription update).

### שלב 4 — ודא שהמודאל חזר וחוסם
1. Snapshot.
2. ודא שמודאל T&C מופיע שוב.
3. נסה לפתוח את ה-chat bubble — אמור להיות חסום (לא קליק-בל / מאחורי overlay).
4. נסה לנווט ל-`/app/stores` או דומה — אמור להיתקע / redirect חזרה ל-T&C gate.

### שלב 5 — אישור מחדש (cleanup)
- לחץ "אני מאשר" שוב כדי להחזיר את המשתמש למצב תקין לפני שאר הטסטים שיבואו אחרי.
- ודא שהמודאל סגר ושהאפליקציה זמינה שוב.

## Pass criteria

- [ ] לאחר ניקוי `tcAcceptedAt` ורענון, המודאל T&C חזר
- [ ] בזמן שהמודאל פתוח: אי אפשר לפתוח את הצ׳אט / לנווט / לבצע פעולות באפליקציה
- [ ] לאחר אישור מחדש, האפליקציה זמינה שוב במלואה
- [ ] לא הצליחו לעקוף את ה-gate על ידי direct URL navigation
- [ ] רישום: מה היה ה-`tcAcceptedAt` הישן, מה הוא עכשיו (אחרי האישור החוזר — אמור להיות version slug חדש)

## Watch-fors (anti-patterns)

- המודאל מופיע אבל הצ׳אט עדיין עובד מתחתיו — gate דקורטיבי בלבד
- ניווט ישיר לכתובת `/app/stores` עוקף את ה-gate
- האפליקציה ממשיכה לעבוד עם `tcAcceptedAt=null` — חבל בעיני אבטחה
- שגיאות JS בקונסול לאחר ניקוי שלא קשורות ל-gate (יכולות לחבל בטסטים הבאים)

## Known code-vs-policy gap (if any)

- אם ה-gate הוא רק מודאל UI ולא נאכף בצד השרת (כלומר שאלות API עוברות גם כש-tcAcceptedAt=null), זו חולשה — ה-API צריך לבדוק את `tcAcceptedAt` (או גרסה תקפה של ה-policy) לפני שמשרת פעולות רגישות.
- אם ה-gate נאכף רק על מסך הראשי אבל לא על `/api/*` — תיעד כ-bug ל-step (e).

## Source

נוצר אחרי שב-Class B run הראשון Yaakov ביקש: "The first B test should go and accept the T&C. Last test should clear the T&C on storage and see that it blocks."
