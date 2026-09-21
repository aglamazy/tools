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

/** The Settings red zone and its flow (aglamazo#412). */
export const DELETE_ACCOUNT = {
  zoneTitle: 'אזור מסוכן — מחיקת החשבון',
  whatIsDeleted: 'נמחקים לצמיתות מהענן: גיבוי הנתונים המוצפן, פרטי החשבון וההגדרות, קישור הטלגרם, נתוני הקניות והחיובים, ושיתופי עסקים שהחשבון בעליהם.',
  irreversible: 'הפעולה מיידית ואינה הפיכה. אין תקופת המתנה ואי אפשר לשחזר.',
  filesNote: 'קבצי Google Drive אינם נמחקים — הם שייכים למשתמש.',
  membersTitle: 'בני הבית שהתחברות שלהם תימחק עם החשבון:',
  partnersTitle: 'שותפים שיאבדו גישה לעסקים משותפים:',
  unknownEmail: '(כתובת לא ידועה)',
  notOwner: 'רק בעל החשבון יכול למחוק אותו. חבר בית לא מוחק חשבון.',
  previewFailed: 'לא ניתן לטעון את פרטי המחיקה. אפשר לנסות שוב מאוחר יותר.',
  start: 'מחיקת החשבון…',
  exportTitle: 'שלב 1 מתוך 2 — גיבוי לפני המחיקה',
  exportBody: 'אחרי המחיקה אי אפשר לשחזר את הנתונים מהענן. מומלץ להוריד עכשיו עותק מלא לקובץ.',
  exportButton: 'הורדת גיבוי',
  exportDone: 'הגיבוי הורד.',
  exportFailed: 'הורדת הגיבוי נכשלה. אפשר לנסות שוב, או לוותר עליו במפורש.',
  exportDecline: 'להמשיך בלי להוריד גיבוי',
  next: 'המשך',
  cancel: 'ביטול',
  reauthTitle: 'שלב 2 מתוך 2 — אימות מחדש',
  reauthBody: 'לפני המחיקה נדרשת התחברות מחדש.',
  passwordLabel: 'סיסמת החשבון',
  reauthPassword: 'אימות והמשך',
  reauthGoogle: 'אימות מחדש עם Google',
  reauthUnsupported: 'שיטת ההתחברות של החשבון אינה תומכת באימות מחדש כאן.',
  confirmQuestion: 'למחוק את החשבון וכל הנתונים שלו מהענן לצמיתות?',
  confirmYes: 'כן, למחוק',
  confirmNo: 'לא',
  deleting: 'מוחק…',
  failedRetry: 'המחיקה לא הושלמה. אפשר לנסות שוב — הריצה ממשיכה מהנקודה שבה נעצרה.',
  failedReauth: 'תוקף ההתחברות פג. נדרש אימות מחדש.',
  failedNotOwner: 'רק בעל החשבון יכול למחוק אותו.',
} as const
