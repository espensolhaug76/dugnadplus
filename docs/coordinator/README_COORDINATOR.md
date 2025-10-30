# Dugnad+ Coordinator Module (Dugnadsansvarlig)

## Overview
The coordinator module is designed to minimize administrative burden for dugnadsansvarlig (volunteer coordinators) by automating shift distribution based on a fair point system.

## Core Philosophy
**"Enter once, system handles the rest"**
- Coordinators input all season shifts in one session
- Automatic assignment based on fairness algorithm
- Only notified when action is required
- 14-day buffer for families to self-manage swaps

## Key Features

### 1. Season Shift Creation
**File:** `SeasonShiftCreator.tsx`

Coordinators can create shifts for an entire season in one interface:
- Single shift creation
- Recurring shift patterns (weekly, biweekly, monthly)
- Automatic point value calculation based on:
  - Duration (hours)
  - Role type (kiosk: 100 pts/hr, baking: 50 pts/hr, etc.)
- Visual overview of all created shifts

**Usage:**
```typescript
const coordinator = new DugnadCoordinatorService();

await coordinator.createSeasonShifts(teamId, [
  {
    date: new Date('2025-03-15'),
    startTime: '10:00',
    endTime: '14:00',
    role: 'kiosk',
    requiredPeople: 2,
    pointValue: 400
  },
  // ... more shifts
], coordinatorId);
```

### 2. Automatic Shift Assignment
**File:** `dugnad-coordinator-service.ts`

The heart of the system - fair, automatic distribution.

**Algorithm Priority:**
1. **Protected groups excluded**: Coach families, coordinators, team leaders
2. **Lowest total points first**: Families with fewer points get priority
3. **Balanced distribution**: No family gets too many shifts
4. **Conflict avoidance**: No double-booking on same date

**Assignment Process:**
```typescript
await coordinator.assignShiftsAutomatically(teamId);
// Returns: { 
//   success: true, 
//   assignments: [...], 
//   unassignedShifts: [...],
//   warnings: [...]
// }
```

**Point System Integration:**
- Base points: From completed duties, coaching roles
- Family points: Transferable across siblings in different sports
- Level calculation: Automatic (100pts=L1, 300pts=L2, 500pts=L3, 1000pts=L4)
- Protected status: Coaches start at higher level with exemptions

### 3. Coordinator Dashboard
**File:** `CoordinatorDashboard.tsx`

A clean, actionable overview showing:
- **Quick stats**: Total, assigned, pending, completed shifts
- **Alerts**: Families needing followup, shifts needing coverage
- **One-click actions**: 
  - Create season shifts
  - Auto-assign pending shifts
  - View family overview
- **How it works**: Built-in guide for new coordinators

**Dashboard Stats:**
```typescript
{
  totalShifts: 48,
  assignedShifts: 38,
  pendingShifts: 7,
  completedShifts: 3,
  familiesNeedingFollowup: 5,
  upcomingIssues: 2
}
```

### 4. Buffer Period & Escalation

**14-Day Buffer System:**
- Families get 14 days before shift to:
  - Confirm attendance
  - Request swap with another family
  - Find a substitute from marketplace
- Automatic reminders at day 14, day 7, day 3

**Escalation to Marketplace:**
If no action taken by buffer date:
1. Shift automatically posted to substitute marketplace
2. Registered substitutes receive push notification
3. Competitive bidding begins
4. Family can accept offer or keep trying to find swap

**Implementation:**
```typescript
// Automatically triggered by cron job
if (currentDate >= shift.buffer_date && !shift.assigned) {
  await coordinator.escalateToMarketplace(shift.id);
}
```

## Database Schema

### Key Tables
**File:** `schema.sql`

1. **teams**: Sports teams/clubs
2. **families**: Family units with point totals
3. **users**: Individual family members
4. **shifts**: All season shifts
5. **shift_assignments**: Who's assigned to what
6. **point_history**: Audit trail of point changes
7. **shift_swaps**: Family-to-family swap requests
8. **substitutes**: Teenagers/adults offering services
9. **substitute_requests**: Marketplace requests

### Automatic Triggers

**Point Updates:**
```sql
-- Automatically updates family points when history added
CREATE TRIGGER update_points_trigger 
AFTER INSERT ON point_history
FOR EACH ROW EXECUTE FUNCTION update_family_points();
```

**Level Calculation:**
```sql
-- Automatically recalculates level when points change
CREATE TRIGGER calculate_level_trigger 
BEFORE UPDATE OF base_points, family_points ON families
FOR EACH ROW EXECUTE FUNCTION calculate_family_level();
```

**Notifications:**
```sql
-- Automatically sends notification when shift assigned
CREATE TRIGGER notify_assignment_trigger 
AFTER INSERT ON shift_assignments
FOR EACH ROW EXECUTE FUNCTION notify_shift_assignment();
```

## Protected Groups

Certain roles are exempt from automatic assignment or get preferred treatment:

### Coach Families
- **Exemption**: No automatic assignments
- **Starting level**: Level 3 (500 points)
- **Rationale**: Already contributing significant time
- **Point earning**: Still earn points for voluntary shifts

### Coordinators
- **Exemption**: No automatic assignments
- **Starting level**: Level 4 (1000+ points)
- **Bonus**: +500 points per season
- **Rationale**: Administrative role is substantial contribution

### Team Leaders
- **Exemption**: 50% fewer automatic assignments
- **Starting level**: Level 2 (300 points)
- **Rationale**: Significant organizational responsibilities

## Point System Details

### Point Values by Role
```typescript
{
  kiosk: 100 points/hour,
  ticket_sales: 100 points/hour,
  setup: 100 points/hour,
  cleanup: 100 points/hour,
  baking: 50 points/instance,
  transport: 75 points/hour,
  coach: 1000 points/season,
  assistant_coach: 500 points/season,
  coordinator: 500 bonus + level 4 start
}
```

### Bonus Points
- Short notice substitute (<48h): +50
- Helping others find swaps: +25
- Perfect attendance (all shifts): +100 end of season

### Family Transferable Points
Points earned by one family member for sibling teams:
- Head coach for sibling: +200 bonus
- Coach for sibling: +100 bonus  
- Dugnad for sibling: +25 bonus

### Level Benefits
- **Level 0 (<100pts)**: No benefits, highest assignment priority
- **Level 1 (100-299pts)**: 10% local business discounts
- **Level 2 (300-499pts)**: 15% discounts, slightly fewer assignments
- **Level 3 (500-999pts)**: 20% discounts, 50% fewer assignments
- **Level 4 (1000+pts)**: 25% discounts, VIP perks, minimal assignments

## Notification Strategy

**Philosophy: Notify only when action required**

### When Families Are Notified:
1. Initial assignment (with 14-day buffer)
2. 7 days before shift (reminder)
3. 3 days before shift (urgent reminder if unconfirmed)
4. Swap request received
5. Substitute available for their shift

### When Coordinator Is Notified:
1. Unassigned shifts after auto-assignment
2. No-show reported
3. Multiple missed shifts by same family
4. System errors/issues

### When NOT to Notify:
- Daily summaries (too much noise)
- Every point earned (visible in app)
- Other families' assignments (privacy)

## Usage Example: Full Season Workflow

### Step 1: Season Setup (One Time)
```typescript
// Coordinator opens app, goes to "Create Season Shifts"
const shifts = [
  // Home games every Saturday, 10am-2pm
  // Recurring: weekly, 15 occurrences
  { 
    startDate: '2025-03-15',
    startTime: '10:00',
    endTime: '14:00',
    role: 'kiosk',
    requiredPeople: 2,
    recurring: 'weekly',
    count: 15
  },
  // Tournament days (manual entry)
  {
    date: '2025-05-20',
    startTime: '08:00',
    endTime: '18:00',
    role: 'ticket_sales',
    requiredPeople: 3
  }
];

// Click "Save Season Shifts" → 30+ shifts created in database
```

### Step 2: Automatic Assignment
```typescript
// Coordinator clicks "Auto-Assign" button
// System runs algorithm:
// 1. Get all 44 families
// 2. Sort by points (lowest first)
// 3. Exclude coach families (already level 3+)
// 4. Distribute 30 shifts fairly
// Result: 38 assigned, 2 need marketplace

// Families automatically notified via push notification
```

### Step 3: Buffer Period (Automatic)
```typescript
// Family sees notification: "Shift assigned for April 12"
// They have until March 29 (14 days before) to:
// Option A: Confirm attendance (one tap)
// Option B: Request swap (search for family to swap with)
// Option C: Find substitute (post to marketplace)

// If no action by March 29:
//   → Automatically escalated to marketplace
//   → Substitutes notified
//   → Competitive bidding begins
```

### Step 4: Minimal Coordinator Involvement
```typescript
// Coordinator only gets alerts for:
// - 2 shifts still unassigned (marketplace active)
// - 1 family with 3 consecutive no-confirms (needs followup)

// Otherwise: System runs itself
// Families manage their own swaps
// Marketplace handles substitutes
// Points update automatically
```

## API Documentation

### DugnadCoordinatorService

```typescript
class DugnadCoordinatorService {
  // Create all season shifts at once
  createSeasonShifts(
    teamId: string,
    shifts: ShiftTemplate[],
    coordinatorId: string
  ): Promise<{ shiftIds: string[]; message: string }>

  // Run automatic assignment algorithm
  assignShiftsAutomatically(
    teamId: string,
    shiftDate?: Date
  ): Promise<AssignmentResult>

  // Get coordinator dashboard data
  getCoordinatorDashboard(
    teamId: string
  ): Promise<DashboardData>

  // Handle shift swaps between families
  processShiftSwap(
    originalAssignmentId: string,
    requestingFamilyId: string,
    targetFamilyId: string
  ): Promise<{ success: boolean; message: string }>

  // Escalate to marketplace when buffer expires
  escalateToMarketplace(
    shiftId: string
  ): Promise<void>
}
```

## Testing Strategy

### Unit Tests
- Point calculation accuracy
- Assignment algorithm fairness
- Protected group exclusions
- Level calculation logic

### Integration Tests
- Full season creation workflow
- Automatic assignment with 44 families
- Swap approval process
- Marketplace escalation trigger

### Pilot Test (Kil Fotball G9)
- **Target**: 44 families, 8 hours/season each
- **Duration**: Spring 2025 season
- **Metrics**:
  - % of shifts covered without coordinator intervention
  - Time saved vs. manual coordination
  - Family satisfaction scores
  - Substitute marketplace usage

## Future Enhancements

1. **AI-Powered Scheduling**: Predict optimal assignment times based on past behavior
2. **Conflict Detection**: Integrate with family calendars to avoid conflicts
3. **Multi-Sport Families**: Automatic point transfer across all sports
4. **Predictive Alerts**: "Family X likely to no-show based on pattern"
5. **Gamification**: Badges, achievements for high contributors

## Technical Stack

- **Frontend**: React Native (iOS/Android)
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Real-time**: Supabase Realtime subscriptions
- **Notifications**: Firebase Cloud Messaging (FCM)
- **Language**: Norwegian Bokmål

## Support & Documentation

For implementation questions or feature requests:
- GitHub Issues: `dugnadplus/issues`
- Email: support@dugnadplus.no
- Docs: `docs.dugnadplus.no`

---

**Built with ❤️ to make Norwegian dugnad easier for everyone**
