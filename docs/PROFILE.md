# Profile ("הפרופיל שלי") — Improvement Plan

## Context
Tool helps academic students fill forms (university enrollment, course registration, scholarships).
Profile stores personal facts matched to form fields via AI.

## Current State

### Architecture
- **Dashboard page**: `app/(dashboard)/app/profile/page.tsx` — flat table, add/edit/delete facts
- **Extension sidebar**: `app/extension/sidebar/page.tsx` — view/edit profile + scan forms
- **API**: `app/api/profile-qa/route.ts` — CRUD on Firestore `profileQAs` collection
- **AI suggest**: `app/api/form-filler/suggest/route.ts` — Claude matches profile to form fields
- **Store**: `app/stores/profileQAStore.ts` — local Dexie CRUD
- **Types**: `app/types/profileQA.ts`
- **Content script**: `extension/content.js` — extracts form fields, fills values

### Current Data Model (flat)
```
question: "Date of birth"  →  answer: "06/09/2000"
question: "Nationality"    →  answer: "Israel"
question: "Degree"         →  answer: "B.Mus"
```

### Problem
Related fields are disconnected. A student has multiple study periods, courses, degrees — but
flat facts can't express "this grade belongs to this course at this institution in this semester".

## Design: Grouped Records

### A) Data Model — add grouping to ProfileQA

Add optional fields to existing ProfileQA:
```typescript
{
  // existing fields stay
  category?: string    // 'personal' | 'contact' | 'education' | 'work' | 'banking' | 'custom'
  groupId?: string     // links related facts: "study-1", "course-3"
  groupType?: string   // template: 'study' | 'course' | 'job'
  groupLabel?: string  // display: "B.Mus — HfM Weimar"
}
```

Facts with same `groupId` form a record card:
```
groupId: "study-1"  →  Institution: "HfM Weimar"
groupId: "study-1"  →  Degree: "B.Mus"
groupId: "study-1"  →  Field: "Violin"
groupId: "study-1"  →  Years: "2020–2024"
groupId: "study-1"  →  Completed: "Ja"

groupId: "study-2"  →  Institution: "HfM Weimar"
groupId: "study-2"  →  Degree: "M.Mus"
groupId: "study-2"  →  Field: "Violin"
groupId: "study-2"  →  Years: "2024–"
```

Flat facts (name, DOB, passport) have no `groupId` — unchanged.

### B) Extension: Group-to-Group Filling

Instead of AI matching all fields at once, user controls what fills what:

**Flow:**
1. User scans form → fields appear
2. Extension auto-groups form fields by proximity / section headers
3. User sees grouped form sections: "Education (5 fields)" / "Personal (3 fields)"
4. User clicks a form section → sees matching profile groups
5. Picks one (e.g. "B.Mus — HfM Weimar") → AI fills just those fields from that group

**Why:** User explicitly says "fill education section from my B.Mus record" instead of hoping AI picks the right degree. More accurate because context is narrower.

### Predefined Sections & Templates

**Personal (פרטים אישיים)** — flat facts
- First name, Last name, Full name
- Date of birth, Place of birth
- Gender, Nationality
- ID number, Passport number

**Contact (פרטי קשר)** — flat facts
- Email, Phone, Address, City, Postcode, Country

**Education (השכלה)** — repeatable record groups
- Template "study": Institution, Degree, Field, Start year, End year, Completed?, Grade, Thesis
- Template "course": Course name, Semester, Professor, Schedule, Credits, Grade

**Work (ניסיון)** — repeatable record groups
- Template "job": Employer, Role, Start date, End date, Description

**Banking (בנקאות)** — flat facts
- Bank name, Branch, Account number, IBAN, BIC/SWIFT

### Dashboard UI

```
▼ פרטים אישיים
  First name: [Yaakov    ]   Last name: [Cohen     ]
  DOB:        [06/09/2000]   Nationality: [Israel  ]

▼ השכלה
  ┌─ B.Mus — HfM Weimar ──────────────── [✕]┐
  │ Institution: [HfM Weimar  ]              │
  │ Degree:      [B.Mus       ]              │
  │ Field:       [Violin      ]              │
  │ Years:       [2020] – [2024]             │
  │ Completed:   [Ja          ]              │
  └──────────────────────────────────────────┘
  ┌─ M.Mus — HfM Weimar ──────────────── [✕]┐
  │ ...                                      │
  └──────────────────────────────────────────┘
  [+ הוסף תקופת לימודים]

  Courses:
  │ Musiktheorie II │ WS2025 │ Prof X │
  │ Kammermusik     │ SS2026 │ Prof Y │
  [+ הוסף קורס]

▼ שדות נוספים
  [+ הוסף עובדה חדשה]
```

### Extension Sidebar UI (group-to-group)

```
סרוק טופס    │   הפרופיל שלי

Form sections detected:
┌────────────────────────────────┐
│ ● Personal Info  (4 fields)   │  [Fill from: פרטים אישיים]
│ ● Education      (6 fields)   │  [Fill from: ▼ select group ]
│                                │    B.Mus — HfM Weimar
│                                │    M.Mus — HfM Weimar
│ ● Other          (2 fields)   │  [Fill all]
└────────────────────────────────┘
```

## Implementation Order

1. **Type + API**: Add `category`, `groupId`, `groupType`, `groupLabel` to ProfileQA type + Firestore
2. **Templates config**: Define group templates (study, course, job) as static config
3. **Dashboard UI**: Rebuild profile page with sections + grouped record cards
4. **Migration**: Auto-categorize existing flat facts by question text (best-effort)
5. **Extension sidebar**: Show groups, add group-to-group selection UI
6. **AI suggest update**: Accept selected group context, match within narrower scope
7. **Polish**: Duplicate record button, drag reorder, bulk delete

## Backward Compatibility
- Existing flat facts keep working (no groupId = ungrouped, shown in "custom" section)
- AI suggest still receives all facts — groups add context, not a breaking change
- Extension scan + save still creates flat facts — user organizes later
