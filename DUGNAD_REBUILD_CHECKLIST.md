# DUGNAD+ REBUILD CHECKLIST
## Simple Step-by-Step Guide

**Start Fresh:** New clean Vite + React + TypeScript project

---

## ✅ COMPONENTS TO BUILD (19 Total)

### **GROUP 1: ONBOARDING (5 files)**

#### ✅ 1. LandingPage.tsx
- Hero section
- "Velkommen til Dugnad+" heading
- [Kom i gang] button → goes to RegisterPage
- [Logg inn] button → goes to LoginPage

#### ✅ 2. RegisterPage.tsx
- Email input
- Password input
- Full name input
- Phone number input
- Social login buttons (Google, Facebook, Apple)
- [Opprett konto] button → goes to RoleSelectionPage

#### ✅ 3. LoginPage.tsx
- Email input
- Password input
- [Logg inn] button → goes to role-specific dashboard
- "Glemt passord?" link
- Social login buttons

#### ✅ 4. RoleSelectionPage.tsx
- Radio buttons:
  - ○ Jeg starter ny klubb/lag (Coordinator)
  - ○ Jeg blir med i eksisterende lag (Family)
  - ○ Jeg vil jobbe som vikar (Substitute)
- [Fortsett] button → routes based on selection

#### ✅ 5A. ClubCreationPage.tsx (for Coordinators)
- Club name input
- Logo upload
- Sport dropdown
- [Opprett klubb] button → goes to TeamSetupPage

#### ✅ 5B. TeamSetupPage.tsx (for Coordinators)
- Sport selection (Fotball, Håndball, etc.)
- Gender selection (Gutter/Jenter)
- Birth year input
- Auto-generate team name
- [Opprett lag] button → goes to CoordinatorDashboard

---

### **GROUP 2: COORDINATOR PAGES (6 files)**

#### ✅ 6. CoordinatorDashboard.tsx
**Layout:**
- Left sidebar navigation
- Main content area with:
  - Club logo + name at top
  - 4 stat cards with icons
  - 3 action buttons
  - Background: sport image with overlay

**Stats:**
- 📅 Totalt dugnadsvakter
- ✅ Tildelte vakter
- 🏆 Fullførte vakter
- ⏰ Ventende vakter

**Action Buttons:**
- [Opprett dugnad]
- [Last opp familier]
- [Se rapporter]

**Sidebar:**
- Dashboard (active)
- Dugnader
- Familier
- Rapporter
- Innstillinger

#### ✅ 7. EventCreator.tsx (Single event)
**Form fields:**
- Event navn
- Dato
- Klokkeslett
- Varighet
- Sted
- Antall frivillige
- Poeng
- Beskrivelse
- [Lagre] and [Avbryt] buttons

#### ✅ 8. BulkEventCreator.tsx (Multiple events)
**Form fields:**
- Event navn template
- Start dato
- Slutt dato
- Gjenta pattern (Hver uke, Hver måned)
- Klokkeslett
- Varighet
- Sted
- Antall frivillige
- Poeng
- [Opprett alle] button
- Shows preview of events to be created

#### ✅ 9. EventsList.tsx
**Display:**
- Table/List view
- Columns: Dato, Navn, Tildelte, Status, Poeng
- Filter dropdown (Kommende, Tidligere, Utildelt)
- Search bar
- Action buttons per row: Rediger, Slett, Dupliser

#### ✅ 10. FamilyImportPage.tsx
**Features:**
- [Last ned mal] button (downloads Excel template)
- Drag & drop area for file upload
- Preview table showing data
- [Importer familier] button
- Shows: success/error messages

#### ✅ 11. FamilyManagementPage.tsx
**Display:**
- Search bar
- Family list (cards or table)
- Each family shows:
  - Family name
  - Members count
  - Total points
  - Current tier
  - [Vis detaljer] button
- Can edit family details in modal

---

### **GROUP 3: FAMILY PAGES (5 files)**

#### ✅ 12A. ClubSelectionPage.tsx (for Families)
- Search input for club name
- List of clubs (with logos)
- [Velg klubb] button per club
- Goes to TeamSelectionPage

#### ✅ 12B. TeamSelectionPage.tsx (for Families)
- Sport dropdown
- Gender + Year selection
- Shows matching team
- [Bli med på lag] button
- Goes to FamilyProfileSetupPage

#### ✅ 13. FamilyProfileSetupPage.tsx
**Form:**
- Add children section:
  - Child name
  - Birth year
  - [Legg til barn] button (can add multiple)
- List of added children
- For each child: [Velg lag] button (can join multiple teams)
- [Fullfør registrering] button → goes to FamilyDashboard

#### ✅ 14. FamilyDashboard.tsx
**Mobile-first layout:**
- Header: Family name + tier badge
- Points progress bar
- Upcoming shifts (cards):
  - Date & time
  - Event name
  - Location
  - [Bekreft] or [Bytt] buttons
- Bottom navigation:
  - 🏠 Hjem
  - 📅 Mine vakter
  - 👨‍👩‍👧 Familie
  - ⭐ Poeng

#### ✅ 15. MyShiftsPage.tsx
**Tabs:**
- Kommende
- Historikk

**Each shift card:**
- Date & time
- Event name
- Location
- Status badge
- Actions:
  - [Bekreft deltakelse]
  - [Be om bytte]
  - [Finn vikar]
  - [Merk som fullført] (after event)

#### ✅ 16. FamilyMembersPage.tsx
**Display:**
- List of family members
- Each member card:
  - Name
  - Birth year
  - Teams (badges)
  - [Rediger] button
- [Legg til barn] button

#### ✅ 17. PointsTierPage.tsx
**Display:**
- Current tier: Large badge (Basis/Aktiv/Premium/VIP)
- Total points: Big number
- Progress to next tier: Progress bar
- Points breakdown: Table showing:
  - Date
  - Event
  - Points earned
- Current benefits list
- Next tier benefits (locked, grayed out)

---

### **GROUP 4: SUBSTITUTE PAGES (2 files)**

#### ✅ 18. SubstituteMarketplacePage.tsx
**Display:**
- Filter bar (date, location, type)
- List of open substitute requests (cards):
  - Event name
  - Date & time
  - Location
  - Suggested payment (kr)
  - Duration
  - [Ta oppdraget] button

#### ✅ 19. MySubstituteJobsPage.tsx
**Tabs:**
- Kommende
- Fullført

**Each job card:**
- Event details
- Family contact info
- Payment amount
- Status
- [Kontakt familie] button
- [Merk som fullført] button

---

## 🗂️ SUPPORTING FILES NEEDED

### **App.tsx**
- Router setup
- Route definitions for all 19 pages
- Device detection
- Auth state management

### **App.css**
- Global styles
- Color variables
- Common components (buttons, cards, inputs)

### **main.tsx**
- App entry point
- Render App component

### **index.css**
- CSS reset
- Base styles

### **types/index.ts**
- TypeScript interfaces for:
  - User
  - Club
  - Team
  - Family
  - Event
  - Assignment
  - Points

### **hooks/useDeviceType.ts**
- Detect if user is on mobile or desktop
- Return 'mobile' or 'desktop'

### **hooks/useAuth.ts**
- Authentication state
- Login/logout functions
- Current user info

### **services/supabase.ts**
- Supabase client initialization
- Database queries
- Auth functions

---

## 🎯 REBUILD STRATEGY

### **Option A: Build from scratch (Recommended)**
1. Create new Vite project
2. Build components one by one
3. Test each component as you go
4. Connect to Supabase at the end

### **Option B: Fix current project**
1. Delete everything except package.json
2. Rebuild folder structure properly
3. Copy components from overview doc

---

## 📋 CODING ORDER

**Week 1:**
1. LandingPage
2. RegisterPage
3. LoginPage
4. RoleSelectionPage
5. Test: Complete signup flow

**Week 2:**
6. ClubCreationPage
7. TeamSetupPage
8. CoordinatorDashboard
9. EventCreator
10. Test: Coordinator can create club and event

**Week 3:**
11. ClubSelectionPage
12. TeamSelectionPage
13. FamilyProfileSetupPage
14. FamilyDashboard
15. Test: Family can join and see dashboard

**Week 4:**
16. MyShiftsPage
17. FamilyMembersPage
18. PointsTierPage
19. Test: Complete family experience

**Week 5:**
20. BulkEventCreator
21. EventsList
22. FamilyImportPage
23. FamilyManagementPage
24. Test: All coordinator features

**Week 6:**
25. SubstituteMarketplacePage
26. MySubstituteJobsPage
27. Polish UI/UX
28. Test complete app

---

## ✨ NEXT STEP

**What do you want to do?**

A. Start fresh rebuild (new Vite project)
B. Generate all 19 component files with basic structure
C. Build one complete section first (e.g., onboarding)
D. Something else

---

**END OF CHECKLIST**
