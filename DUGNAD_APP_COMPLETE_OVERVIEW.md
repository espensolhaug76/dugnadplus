# DUGNAD+ APPLICATION - COMPLETE OVERVIEW
## Rebuild Specification Document

**Generated:** November 4, 2025  
**Purpose:** Complete reference for rebuilding the Dugnad+ volunteer management system

---

## 🎯 APPLICATION PURPOSE

Dugnad+ is a Norwegian sports club volunteer management system that:
- Automates volunteer shift assignments (dugnad)
- Manages families, teams, and volunteer hours
- Uses a 4-tier point system (Basis → Aktiv → Premium → VIP)
- Provides separate interfaces for coordinators (desktop) and families (mobile)

---

## 👥 USER ROLES & INTERFACES

### 1. **COORDINATOR (Dugnadsansvarlig)**
**Device:** Desktop/Laptop (primarily)  
**Interface:** Sophisticated dashboard with sidebar navigation  
**Primary Tasks:**
- Create and manage volunteer shifts (dugnad events)
- Assign families to shifts
- Import families from Excel/CSV
- Track completion and points
- View analytics and reports

### 2. **FAMILY (Foreldre)**
**Device:** Mobile phone (primarily)  
**Interface:** Mobile-first with bottom navigation  
**Primary Tasks:**
- View assigned shifts
- Confirm attendance
- Request shift swaps
- View family points and tier level
- Add/edit family members

### 3. **SUBSTITUTE (Vikar)** 
**Device:** Mobile phone  
**Interface:** Simple marketplace view  
**Primary Tasks:**
- Browse available substitute shifts
- Accept substitute requests
- Get paid for substitute work

---

## 📱 COMPLETE PAGE STRUCTURE

### **ONBOARDING FLOW**

#### Page 1: Landing Page
**File:** `LandingPage.tsx`  
**Purpose:** First screen - marketing and entry point  
**Elements:**
- Hero section with "Welcome to Dugnad+"
- Value proposition text
- [Kom i gang] button (primary CTA)
- [Logg inn] button (secondary)
- Norwegian language throughout

#### Page 2: Registration
**File:** `RegisterPage.tsx`  
**Purpose:** Create new account  
**Fields:**
- Email
- Password
- Full name
- Phone number
**Includes:** Social login options (Google, Facebook, Apple)

#### Page 3: Login
**File:** `LoginPage.tsx`  
**Purpose:** Existing user login  
**Fields:**
- Email
- Password
**Features:**
- "Forgot password" link
- Social login options

#### Page 4: Role Selection
**File:** `RoleSelectionPage.tsx`  
**Purpose:** User chooses their role  
**Options:**
- ○ Jeg starter ny klubb/lag (Coordinator)
- ○ Jeg blir med i eksisterende lag (Family)
- ○ Jeg vil jobbe som vikar (Substitute)

---

### **COORDINATOR FLOW**

#### Page 5A: Club Creation
**File:** `ClubCreationPage.tsx`  
**Purpose:** First coordinator creates the club  
**Flow:**
1. Enter club name (e.g., "Kongsvinger IL")
2. Upload club logo
3. Select primary sport
4. Create first team

#### Page 5B: Team Setup
**File:** `TeamSetupPage.tsx`  
**Purpose:** Create initial team  
**Fields:**
- Sport (Fotball, Håndball, etc.)
- Gender (Gutter/Jenter)
- Birth year (e.g., 2016)
- Team name (auto-generated: "Gutter 2016")

#### Page 6: Coordinator Dashboard
**File:** `CoordinatorDashboard.tsx`  
**Purpose:** Main coordinator control center  
**Design:**
- **Header:** Club logo + name + team selector
- **Background:** Sport-specific image with gradient overlay
- **Stat Cards (4):**
  - 📅 Totalt dugnadsvakter
  - ✅ Tildelte vakter
  - 🏆 Fullførte vakter
  - ⏰ Ventende vakter
- **Action Buttons:**
  - [Opprett dugnad] (Create shift)
  - [Last opp familier] (Import families)
  - [Se rapporter] (View reports)
- **Sidebar Navigation:**
  - Dashboard
  - Dugnader (Shifts)
  - Familier (Families)
  - Rapporter (Reports)
  - Innstillinger (Settings)

#### Page 7: Event Creator (Single)
**File:** `EventCreator.tsx` / `SingleEventCreatorWorking.tsx`  
**Purpose:** Create individual volunteer shift  
**Fields:**
- Event name
- Date & time
- Duration
- Location
- Number of volunteers needed
- Point value
- Description
**Features:**
- Can assign families immediately
- Can save as draft

#### Page 8: Bulk Event Creator
**File:** `BulkEventCreator.tsx` / `MultiDayBulkCreator.tsx`  
**Purpose:** Create multiple recurring shifts  
**Features:**
- Select multiple dates
- Repeat pattern (weekly, monthly)
- Copy event details
- Batch creation
**Example:** Create all Saturday kiosk shifts for entire season

#### Page 9: Events List
**File:** `EventsList.tsx`  
**Purpose:** View and manage all shifts  
**Display:**
- Calendar view
- List view
- Filter by: upcoming, past, unassigned
- Quick actions: edit, delete, duplicate
**Columns:**
- Date
- Event name
- Assigned families
- Status
- Points

#### Page 10: Family Import
**File:** `FamilyImportPage.tsx`  
**Purpose:** Bulk import families from Excel/CSV  
**Features:**
- Download template
- Drag & drop upload
- Preview data before import
- Map columns
- Validate data
**Template columns:**
- Family name
- Parent 1 name, email, phone
- Parent 2 name, email, phone
- Children names & birth years

#### Page 11: Family Management
**File:** `FamilyManagementPage.tsx`  
**Purpose:** View and edit all families  
**Features:**
- Search families
- View family details
- Edit points manually
- View assignment history
- Add/remove family members

---

### **FAMILY FLOW**

#### Page 12A: Club Selection
**File:** `ClubSelectionPage.tsx`  
**Purpose:** Family joins existing club  
**Features:**
- Search clubs by name or code
- Show nearby clubs (if location enabled)
- Display club logo and info

#### Page 12B: Team Selection
**File:** `TeamSelectionPage.tsx`  
**Purpose:** Choose sport and team  
**Flow:**
1. Select sport
2. Select gender + year
3. Confirm team match

#### Page 13: Family Profile Setup
**File:** `FamilyProfileSetupPage.tsx`  
**Purpose:** Add family members  
**Features:**
- Add multiple children
- Each child can join multiple teams
- Parent contact info
- Preferences (unavailable dates, etc.)

#### Page 14: Family Dashboard
**File:** `FamilyDashboard.tsx`  
**Purpose:** Main family view (mobile-first)  
**Design:**
- **Header:** Family name + current tier badge
- **Points Display:** Progress bar to next tier
- **Upcoming Shifts:** Card list showing:
  - Date & time
  - Event name
  - Location
  - [Bekreft] or [Bytt] buttons
- **Bottom Navigation:**
  - 🏠 Hjem (Home)
  - 📅 Mine vakter (My shifts)
  - 👨‍👩‍👧 Familie (Family)
  - ⭐ Poeng (Points)

#### Page 15: My Shifts
**File:** `MyShiftsPage.tsx`  
**Purpose:** View all assigned shifts  
**Tabs:**
- Kommende (Upcoming)
- Historikk (History)
**Actions per shift:**
- Confirm attendance
- Request swap
- Find substitute
- Mark as complete (after event)

#### Page 16: Family Members
**File:** `FamilyMembersPage.tsx`  
**Purpose:** Manage family members  
**Features:**
- Add children
- Edit child info
- Assign children to teams
- View each child's teams

#### Page 17: Points & Tier
**File:** `PointsTierPage.tsx`  
**Purpose:** View points breakdown and benefits  
**Display:**
- Current tier: Basis / Aktiv / Premium / VIP
- Total points
- Points breakdown by event
- Next tier requirements
- Current tier benefits
- Sponsor discounts available

---

### **SUBSTITUTE (VIKAR) FLOW**

#### Page 18: Substitute Marketplace
**File:** `SubstituteMarketplacePage.tsx`  
**Purpose:** Browse available substitute shifts  
**Display:**
- List of open substitute requests
- Each card shows:
  - Event name & date
  - Location
  - Suggested payment
  - Duration
- Filter by: date, location, type
- [Ta oppdraget] button

#### Page 19: My Substitute Jobs
**File:** `MySubstituteJobsPage.tsx`  
**Purpose:** Track accepted substitute work  
**Tabs:**
- Kommende (Upcoming)
- Fullført (Completed)
**Each job shows:**
- Contact info for family
- Payment status
- Completion confirmation

---

## 🎨 DESIGN SPECIFICATIONS

### **Color Scheme**
- **Primary:** `#4682b4` (Steel Blue)
- **Secondary:** `#6495ed` (Cornflower Blue)
- **Success:** `#48bb78` (Green)
- **Warning:** `#f6ad55` (Orange)
- **Danger:** `#fc8181` (Red)
- **Background:** `#f7fafc` (Light gray)
- **Text:** `#2d3748` (Dark gray)

### **Typography**
- **Font Family:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Headers:** Bold 700
- **Body:** Regular 400
- **Mobile:** 16px base (minimum for iOS)

### **Coordinator Dashboard Design**
- Desktop-first layout
- Background: Sport-specific image with gradient overlay
- Sidebar navigation (left side, always visible)
- White content cards with shadows
- Stat cards with icons
- Action buttons prominent at top

### **Family Dashboard Design**
- Mobile-first layout
- Bottom navigation (thumb-friendly)
- Large tap targets (minimum 44x44px)
- Simple, clean cards
- Bright tier badge display
- Swipe gestures for quick actions

---

## 🗄️ DATA STRUCTURE

### **Database Tables**

#### clubs
- id, name, logo_url, created_at

#### teams
- id, club_id, sport, gender, birth_year, name

#### users
- id, email, password_hash, full_name, phone, role

#### families
- id, family_name, primary_contact_user_id

#### family_members
- id, family_id, name, birth_year, role (parent/child)

#### team_members
- id, team_id, family_member_id

#### dugnad_events
- id, team_id, name, date, time, duration, location, points, status

#### event_assignments
- id, event_id, family_id, status (assigned/confirmed/completed/swapped)

#### points_ledger
- id, family_id, event_id, points, date, type

#### family_points
- id, family_id, total_points, current_tier

---

## 🔧 TECHNICAL STACK

### **Frontend**
- React 18+ with TypeScript
- Vite (build tool)
- React Router (navigation)
- CSS (no framework, custom styling)

### **Backend**
- Supabase (PostgreSQL database)
- Supabase Auth (authentication)
- Supabase Storage (file uploads)
- Real-time subscriptions

### **Key Features**
- Device detection (coordinator vs family interface)
- Responsive design
- Offline support (future)
- Push notifications (future)

---

## 📂 FOLDER STRUCTURE

```
src/
├── components/
│   ├── coordinator/
│   │   ├── CoordinatorDashboard.tsx
│   │   ├── EventCreator.tsx
│   │   ├── BulkEventCreator.tsx
│   │   ├── EventsList.tsx
│   │   ├── FamilyImportPage.tsx
│   │   └── FamilyManagementPage.tsx
│   ├── family/
│   │   ├── FamilyDashboard.tsx
│   │   ├── MyShiftsPage.tsx
│   │   ├── FamilyMembersPage.tsx
│   │   └── PointsTierPage.tsx
│   ├── onboarding/
│   │   ├── LandingPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RoleSelectionPage.tsx
│   │   ├── ClubCreationPage.tsx
│   │   ├── TeamSetupPage.tsx
│   │   └── ClubSelectionPage.tsx
│   └── shared/
│       ├── Header.tsx
│       ├── Navigation.tsx
│       └── LoadingSpinner.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useDeviceType.ts
│   └── useSupabase.ts
├── services/
│   ├── supabase.ts
│   └── api.ts
├── types/
│   └── index.ts
├── utils/
│   ├── points.ts
│   └── validators.ts
├── App.tsx
├── App.css
├── main.tsx
└── index.css
```

---

## 🚀 BUILD PRIORITY

### Phase 1: Core Authentication (Week 1)
1. Landing Page
2. Register Page
3. Login Page
4. Role Selection Page

### Phase 2: Coordinator Setup (Week 2)
5. Club Creation Page
6. Team Setup Page
7. Coordinator Dashboard
8. Single Event Creator

### Phase 3: Family Onboarding (Week 3)
9. Club Selection Page
10. Family Profile Setup
11. Family Dashboard
12. My Shifts Page

### Phase 4: Advanced Features (Week 4)
13. Bulk Event Creator
14. Events List
15. Family Import
16. Points & Tier Page

### Phase 5: Substitute System (Week 5)
17. Substitute Marketplace
18. My Substitute Jobs

---

## 📝 NOTES

- All text must be in Norwegian (Bokmål)
- Mobile-first for family users
- Desktop-first for coordinators
- Point system is core to the app
- Family can have multiple children on multiple teams
- Coordinator can manage multiple teams
- Auto-assignment algorithm (future feature)
- Integration with Spond (future feature)

---

**END OF DOCUMENT**
