/**
 * User-facing text for the delete-account flow (aglamazo#412/#413). Hebrew, in
 * non-personal forms (no gendered imperatives) like the rest of the app. The
 * app has no English UI or i18n layer, so there is no English copy to keep in
 * step; when one exists these are the strings to translate.
 */

export const DELETED_NOTICE = {
  title: 'החשבון נמחק',
  cloudGone: 'החשבון וכל הנתונים שלו נמחקו מהענן. הפעולה אינה הפיכה.',
  dataStillHere: 'הנתונים עדיין שמורים במכשיר הזה, ובכל מכשיר אחר שהשתמש בחשבון — הם לא נמחקו אוטומטית.',
  stepsIntro: 'להסרת הנתונים מהמכשירים:',
  steps: [
    'במכשיר הזה: ללחוץ על "מחיקת הנתונים ממכשיר זה" ולאשר.',
    'בכל מכשיר אחר שהשתמש בחשבון: לפתוח את האפליקציה — תוצג הודעה זו — וללחוץ על אותו כפתור.',
    'אפשר גם למחוק את נתוני האתר בהגדרות הדפדפן.',
  ],
  syncStopped: 'הסנכרון לענן הופסק במכשיר הזה ולא יופעל מחדש עד למחיקת הנתונים ממנו.',
  wipeButton: 'מחיקת הנתונים ממכשיר זה',
  keepButton: 'להמשיך להשתמש בנתונים במכשיר, בלי סנכרון',
  wipeConfirm: 'למחוק את כל הנתונים במכשיר הזה? אי אפשר לשחזר אותם.',
  wipeYes: 'כן, למחוק',
  wipeNo: 'לא',
  wipeFailed: 'מחיקת הנתונים מהמכשיר נכשלה. אפשר לנסות שוב, או למחוק את נתוני האתר בהגדרות הדפדפן.',
} as const
