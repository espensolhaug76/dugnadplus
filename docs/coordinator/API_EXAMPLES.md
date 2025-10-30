# 🔌 Dugnad+ API Usage Examples

Complete code examples for implementing the coordinator functionality.

---

## 1. Creating a Full Season of Shifts

### Weekly Home Games
```typescript
import { DugnadCoordinatorService } from './services/dugnad-coordinator-service';

const coordinator = new DugnadCoordinatorService();
const teamId = 'your-team-id';
const coordinatorId = 'your-user-id';

// Create 15 Saturday home games (kiosk duty)
const homeGameShifts = Array.from({ length: 15 }, (_, i) => {
  const date = new Date('2025-03-15');
  date.setDate(date.getDate() + (i * 7)); // Every 7 days
  
  return {
    date,
    startTime: '10:00',
    endTime: '14:00',
    role: 'kiosk' as const,
    requiredPeople: 2,
    pointValue: 400 // 4 hours × 100 points/hour
  };
});

await coordinator.createSeasonShifts(teamId, homeGameShifts, coordinatorId);
```

### Tournament Day (Multiple Roles)
```typescript
// Tournament day with different roles
const tournamentDate = new Date('2025-05-20');

const tournamentShifts = [
  {
    date: tournamentDate,
    startTime: '08:00',
    endTime: '12:00',
    role: 'setup' as const,
    requiredPeople: 3,
    pointValue: 400
  },
  {
    date: tournamentDate,
    startTime: '12:00',
    endTime: '18:00',
    role: 'kiosk' as const,
    requiredPeople: 2,
    pointValue: 600
  },
  {
    date: tournamentDate,
    startTime: '18:00',
    endTime: '20:00',
    role: 'cleanup' as const,
    requiredPeople: 3,
    pointValue: 200
  }
];

await coordinator.createSeasonShifts(teamId, tournamentShifts, coordinatorId);
```

---

## 2. Running Automatic Assignment

### Basic Auto-Assignment
```typescript
// Assign all pending shifts
const result = await coordinator.assignShiftsAutomatically(teamId);

console.log(`✅ Assigned: ${result.assignments.length} shifts`);
console.log(`❌ Unassigned: ${result.unassignedShifts.length} shifts`);
console.log(`⚠️ Warnings: ${result.warnings.join(', ')}`);

if (!result.success) {
  console.log('Some shifts need manual attention or marketplace');
}
```

### Assignment for Specific Date Range
```typescript
// Only assign shifts in March
const marchStart = new Date('2025-03-01');
const result = await coordinator.assignShiftsAutomatically(teamId, marchStart);
```

### Handling Assignment Results
```typescript
const result = await coordinator.assignShiftsAutomatically(teamId);

// Process successful assignments
for (const assignment of result.assignments) {
  console.log(`Family ${assignment.family_id} → Shift ${assignment.shift_id}`);
  
  // Send custom notification
  await sendCustomNotification(assignment.family_id, {
    title: 'Ny vakt tildelt',
    body: 'Sjekk appen for detaljer'
  });
}

// Handle unassigned shifts
for (const shift of result.unassignedShifts) {
  // Auto-escalate to marketplace
  await coordinator.escalateToMarketplace(shift.id);
}
```

---

## 3. Managing Points

### Award Points for Completed Shift
```typescript
import { supabase } from './supabase';

async function awardShiftPoints(assignmentId: string) {
  // Get shift and assignment details
  const { data: assignment } = await supabase
    .from('shift_assignments')
    .select(`
      *,
      shift:shifts(*)
    `)
    .eq('id', assignmentId)
    .single();
  
  if (!assignment) return;
  
  // Add to point history (triggers automatic family point update)
  await supabase.from('point_history').insert({
    family_id: assignment.family_id,
    point_type: 'base',
    points_earned: assignment.shift.point_value,
    reason: `Completed ${assignment.shift.role} shift`,
    related_shift_id: assignment.shift.id,
    related_role: assignment.shift.role
  });
  
  // Update assignment status
  await supabase
    .from('shift_assignments')
    .update({ 
      status: 'completed',
      completed_date: new Date().toISOString()
    })
    .eq('id', assignmentId);
}
```

### Award Bonus Points
```typescript
async function awardBonusPoints(
  familyId: string, 
  points: number, 
  reason: string
) {
  await supabase.from('point_history').insert({
    family_id: familyId,
    point_type: 'bonus',
    points_earned: points,
    reason
  });
}

// Example: Short notice substitute
await awardBonusPoints(
  'family-id',
  50,
  'Took shift with less than 48 hours notice'
);

// Example: Perfect attendance
await awardBonusPoints(
  'family-id',
  100,
  'Perfect attendance for spring season'
);
```

### Check Family Points and Level
```typescript
async function getFamilyStatus(familyId: string) {
  const { data: family } = await supabase
    .from('families')
    .select('*')
    .eq('id', familyId)
    .single();
  
  return {
    familyName: family.family_name,
    basePoints: family.base_points,
    familyPoints: family.family_points,
    totalPoints: family.total_points,
    currentLevel: family.level,
    isProtected: family.protected_group
  };
}
```

---

## 4. Coordinator Dashboard Queries

### Get Dashboard Statistics
```typescript
async function getDashboardStats(teamId: string) {
  // Total shifts
  const { count: totalShifts } = await supabase
    .from('shifts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);
  
  // Assigned shifts
  const { count: assignedShifts } = await supabase
    .from('shift_assignments')
    .select('*, shift:shifts!inner(*)', { count: 'exact', head: true })
    .eq('shift.team_id', teamId);
  
  // Pending shifts (no assignments)
  const { data: pendingShifts } = await supabase
    .from('shifts')
    .select('id')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .is('shift_assignments', null);
  
  // Completed shifts
  const { count: completedShifts } = await supabase
    .from('shifts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('status', 'completed');
  
  return {
    totalShifts: totalShifts || 0,
    assignedShifts: assignedShifts || 0,
    pendingShifts: pendingShifts?.length || 0,
    completedShifts: completedShifts || 0
  };
}
```

### Get Families Needing Followup
```typescript
async function getFamiliesNeedingFollowup(teamId: string) {
  // Families with unconfirmed assignments within 7 days
  const { data: unconfirmed } = await supabase
    .from('shift_assignments')
    .select(`
      *,
      family:families(*),
      shift:shifts(*)
    `)
    .eq('shift.team_id', teamId)
    .eq('status', 'assigned')
    .lt('shift.date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
    .is('confirmed_date', null);
  
  // Families with multiple no-shows
  const { data: noShows } = await supabase
    .from('shift_assignments')
    .select('family_id, count')
    .eq('status', 'no_show')
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
  
  return {
    unconfirmedAssignments: unconfirmed || [],
    frequentNoShows: noShows || []
  };
}
```

---

## 5. Shift Swap Management

### Create Swap Request
```typescript
async function requestShiftSwap(
  assignmentId: string,
  requestingFamilyId: string,
  targetFamilyId: string,
  message: string
) {
  const { data, error } = await supabase
    .from('shift_swaps')
    .insert({
      original_assignment_id: assignmentId,
      requesting_family_id: requestingFamilyId,
      target_family_id: targetFamilyId,
      request_message: message,
      status: 'pending'
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // Notify target family
  await sendSwapNotification(targetFamilyId, data.id);
  
  return data;
}
```

### Accept/Decline Swap
```typescript
async function respondToSwap(
  swapId: string,
  accept: boolean,
  responseMessage?: string
) {
  const { data: swap } = await supabase
    .from('shift_swaps')
    .update({
      status: accept ? 'accepted' : 'declined',
      response_message: responseMessage,
      responded_at: new Date().toISOString()
    })
    .eq('id', swapId)
    .select()
    .single();
  
  if (accept && swap) {
    // Update the assignments
    await coordinator.processShiftSwap(
      swap.original_assignment_id,
      swap.requesting_family_id,
      swap.target_family_id!
    );
  }
  
  return swap;
}
```

---

## 6. Substitute Marketplace

### Post Shift to Marketplace
```typescript
async function postToMarketplace(
  shiftId: string,
  familyId: string,
  offeredRate: number,
  notes?: string
) {
  // Create substitute request
  const { data: request } = await supabase
    .from('substitute_requests')
    .insert({
      shift_id: shiftId,
      requesting_family_id: familyId,
      offered_rate: offeredRate,
      request_notes: notes,
      status: 'open'
    })
    .select()
    .single();
  
  // Notify all active substitutes
  const { data: substitutes } = await supabase
    .from('substitutes')
    .select('user_id')
    .eq('is_active', true);
  
  for (const sub of substitutes || []) {
    await sendMarketplaceNotification(sub.user_id, request.id);
  }
  
  return request;
}
```

### Accept Substitute Offer
```typescript
async function acceptSubstituteOffer(
  requestId: string,
  substituteId: string,
  acceptedRate: number
) {
  // Update request
  await supabase
    .from('substitute_requests')
    .update({
      substitute_id: substituteId,
      accepted_rate: acceptedRate,
      status: 'accepted'
    })
    .eq('id', requestId);
  
  // Create new assignment for substitute
  const { data: request } = await supabase
    .from('substitute_requests')
    .select('shift_id')
    .eq('id', requestId)
    .single();
  
  // Original family gets credited points (they found solution)
  // Substitute earns money but no points (they're not family member)
}
```

---

## 7. Notifications

### Send Push Notification
```typescript
import * as admin from 'firebase-admin';

async function sendPushNotification(
  userId: string,
  notification: {
    title: string;
    body: string;
    data?: any;
  }
) {
  // Get user's FCM token
  const { data: user } = await supabase
    .from('users')
    .select('fcm_token')
    .eq('id', userId)
    .single();
  
  if (!user?.fcm_token) return;
  
  // Send via FCM
  await admin.messaging().send({
    token: user.fcm_token,
    notification: {
      title: notification.title,
      body: notification.body
    },
    data: notification.data || {}
  });
  
  // Store in database
  await supabase.from('notifications').insert({
    user_id: userId,
    type: notification.data?.type || 'shift_assigned',
    title: notification.title,
    body: notification.body,
    data: notification.data
  });
}
```

### Schedule Shift Reminders
```typescript
async function scheduleShiftReminders(assignmentId: string) {
  const { data: assignment } = await supabase
    .from('shift_assignments')
    .select(`
      *,
      shift:shifts(*),
      family:families(*)
    `)
    .eq('id', assignmentId)
    .single();
  
  if (!assignment) return;
  
  const shiftDate = new Date(assignment.shift.date);
  const now = new Date();
  
  // 7 days before
  const sevenDaysBefore = new Date(shiftDate);
  sevenDaysBefore.setDate(sevenDaysBefore.getDate() - 7);
  
  if (now < sevenDaysBefore) {
    // Schedule reminder
    // (Use a job queue like BullMQ or cron job)
  }
  
  // 3 days before
  const threeDaysBefore = new Date(shiftDate);
  threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
  
  if (now < threeDaysBefore) {
    // Schedule urgent reminder
  }
}
```

---

## 8. Reporting & Analytics

### Generate Season Report
```typescript
async function generateSeasonReport(teamId: string) {
  // Total participation
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select(`
      *,
      family:families(family_name),
      shift:shifts(*)
    `)
    .eq('shift.team_id', teamId);
  
  // Group by family
  const familyStats = assignments?.reduce((acc, a) => {
    const familyId = a.family_id;
    if (!acc[familyId]) {
      acc[familyId] = {
        familyName: a.family.family_name,
        shiftsAssigned: 0,
        shiftsCompleted: 0,
        noShows: 0,
        totalPoints: 0
      };
    }
    
    acc[familyId].shiftsAssigned++;
    if (a.status === 'completed') {
      acc[familyId].shiftsCompleted++;
      acc[familyId].totalPoints += a.shift.point_value;
    }
    if (a.status === 'no_show') {
      acc[familyId].noShows++;
    }
    
    return acc;
  }, {});
  
  return {
    totalFamilies: Object.keys(familyStats || {}).length,
    totalShifts: assignments?.length || 0,
    completionRate: calculateCompletionRate(assignments),
    familyStats
  };
}

function calculateCompletionRate(assignments: any[]) {
  const completed = assignments?.filter(a => a.status === 'completed').length || 0;
  const total = assignments?.length || 1;
  return Math.round((completed / total) * 100);
}
```

---

## 9. Error Handling

### Robust API Calls
```typescript
async function safeAssignShifts(teamId: string) {
  try {
    const result = await coordinator.assignShiftsAutomatically(teamId);
    
    if (!result.success) {
      // Log warnings but don't throw
      console.warn('Some shifts unassigned:', result.warnings);
    }
    
    return result;
  } catch (error) {
    console.error('Assignment failed:', error);
    
    // Notify coordinator
    await notifyCoordinator(teamId, {
      type: 'error',
      message: 'Automatic assignment failed',
      error: error.message
    });
    
    // Return safe default
    return {
      success: false,
      assignments: [],
      unassignedShifts: [],
      warnings: ['System error occurred']
    };
  }
}
```

---

## 10. Testing Helpers

### Create Test Data
```typescript
async function seedTestData() {
  // Create test team
  const { data: team } = await supabase
    .from('teams')
    .insert({
      name: 'Test Team',
      sport: 'Football',
      age_group: 'G9',
      season: '2025'
    })
    .select()
    .single();
  
  // Create test families
  const families = Array.from({ length: 10 }, (_, i) => ({
    team_id: team.id,
    family_name: `Test Family ${i + 1}`,
    primary_email: `family${i + 1}@test.no`,
    primary_phone: `1234567${i}`,
    base_points: i * 100 // Varying points
  }));
  
  await supabase.from('families').insert(families);
  
  console.log('✅ Test data created');
}
```

---

**Pro Tips:**
- Always use transactions for complex operations
- Add extensive logging for debugging
- Test with edge cases (0 points, 1000+ points, protected groups)
- Monitor database query performance
- Use database indexes on frequently queried columns
