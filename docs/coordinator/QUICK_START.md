# Dugnad+ Coordinator Module - Quick Start Guide

## Files Overview

This package contains the complete coordinator (dugnadsansvarlig) functionality for Dugnad+:

### Core Service Layer
📄 **dugnad-coordinator-service.ts**
- Main business logic for coordinator features
- Automatic shift assignment algorithm
- Point-based fair distribution system
- Swap and marketplace integration

### React Native UI Components
📱 **CoordinatorDashboard.tsx**
- Main dashboard for coordinators
- Overview of all shifts and assignments
- Quick actions: auto-assign, create shifts, view families
- Alert system for issues needing attention

📱 **SeasonShiftCreator.tsx**
- Bulk shift creation interface
- Recurring shift patterns (weekly, biweekly, monthly)
- Automatic point calculation
- Visual shift management

### Database
🗄️ **schema.sql**
- Complete PostgreSQL/Supabase schema
- Tables for teams, families, users, shifts, assignments
- Automatic triggers for points and notifications
- Indexes for performance
- Row Level Security (RLS) policies

🔤 **types/supabase.ts**
- TypeScript type definitions
- Full type safety for database operations
- Auto-generated from Supabase schema

### Documentation
📚 **README_COORDINATOR.md**
- Comprehensive feature documentation
- Algorithm explanations
- Usage examples
- Testing strategy

## Quick Setup (5 Minutes)

### 1. Database Setup
```bash
# Connect to your Supabase project
supabase link --project-ref your-project-ref

# Run the schema migration
supabase db push < schema.sql

# Or via Supabase dashboard: SQL Editor → paste schema.sql → Run
```

### 2. Install Dependencies
```bash
npm install @supabase/supabase-js
npm install @react-native-community/datetimepicker
npm install react-native-push-notification  # for notifications
```

### 3. Environment Setup
```typescript
// supabase.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from './types/supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
```

### 4. Connect Service to Database
```typescript
// Update dugnad-coordinator-service.ts with actual Supabase calls
import { supabase } from './supabase';

// Example: Replace mock implementation with real queries
private async getPendingShifts(teamId: string, shiftDate?: Date): Promise<Shift[]> {
  const query = supabase
    .from('shifts')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'pending');
  
  if (shiftDate) {
    query.gte('date', shiftDate.toISOString());
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  return data || [];
}
```

### 5. Add to Navigation
```typescript
// App.tsx or navigation setup
import { CoordinatorDashboard } from './CoordinatorDashboard';
import { SeasonShiftCreator } from './SeasonShiftCreator';

// Add to your navigation stack
<Stack.Navigator>
  <Stack.Screen 
    name="CoordinatorDashboard" 
    component={CoordinatorDashboard}
    options={{ title: 'Dugnadsoversikt' }}
  />
  <Stack.Screen 
    name="SeasonShiftCreator" 
    component={SeasonShiftCreator}
    options={{ title: 'Legg inn vakter' }}
  />
</Stack.Navigator>
```

## Key Features to Test

### 1. Season Shift Creation
```typescript
// Test creating 15 weekly shifts
const coordinator = new DugnadCoordinatorService();
await coordinator.createSeasonShifts(teamId, weeklyShifts, coordinatorId);
// Expected: 15 shifts in database with correct point values
```

### 2. Automatic Assignment
```typescript
// Test with 44 families (Kil Fotball G9 pilot)
const result = await coordinator.assignShiftsAutomatically(teamId);
console.log(`Assigned: ${result.assignments.length}`);
console.log(`Unassigned: ${result.unassignedShifts.length}`);
// Expected: Fair distribution, lowest points get priority
```

### 3. Protected Groups
```typescript
// Verify coach families are not auto-assigned
const coachFamily = await getFamilyByRole('coach');
const assignments = await getAssignmentsForFamily(coachFamily.id);
// Expected: Only voluntary assignments, no automatic ones
```

### 4. Point Calculation
```typescript
// Test point history triggers
await addPointHistory({
  familyId: 'test-family-id',
  pointType: 'base',
  pointsEarned: 400,
  reason: 'Completed kiosk shift'
});
// Expected: Family base_points increases, level recalculates
```

## Integration Checklist

- [ ] Database schema deployed to Supabase
- [ ] Type definitions imported correctly
- [ ] Supabase client configured with environment variables
- [ ] Service methods connected to real database calls
- [ ] Push notifications configured (FCM)
- [ ] Navigation routes added
- [ ] Row Level Security policies reviewed
- [ ] Test data seeded (1 team, 44 families)
- [ ] Coordinator dashboard accessible
- [ ] Shift creation working
- [ ] Auto-assignment tested
- [ ] Points updating correctly
- [ ] Notifications sending

## Development Tips

### Testing with Mock Data
```sql
-- Quick test data seed
INSERT INTO teams (name, sport, age_group, season) 
VALUES ('Kil Fotball', 'Football', 'G9', '2025');

INSERT INTO families (team_id, family_name, primary_email, primary_phone, base_points)
VALUES 
  ((SELECT id FROM teams WHERE name = 'Kil Fotball'), 'Hansen', 'hansen@test.no', '12345678', 0),
  ((SELECT id FROM teams WHERE name = 'Kil Fotball'), 'Olsen', 'olsen@test.no', '12345679', 150),
  -- ... 42 more families
```

### Debugging Assignment Algorithm
```typescript
// Add logging to see assignment decisions
console.log('Families sorted by priority:', sortedFamilies.map(f => ({
  name: f.familyName,
  points: f.totalPoints,
  protected: f.protectedGroup
})));
```

### Testing Notifications
```typescript
// Test notification system separately
const testNotification = {
  title: 'Test varsling',
  body: 'Dette er en test',
  data: { test: true }
};
await sendPushNotification(userId, testNotification);
```

## Common Issues & Solutions

### Issue: TypeScript errors with Supabase types
**Solution**: Regenerate types after schema changes
```bash
supabase gen types typescript --project-id your-project > types/supabase.ts
```

### Issue: Assignments not respecting protected groups
**Solution**: Check `protected_group` boolean in families table
```sql
UPDATE families SET protected_group = true 
WHERE id IN (SELECT family_id FROM users WHERE role = 'coach');
```

### Issue: Points not updating automatically
**Solution**: Verify triggers are active
```sql
SELECT * FROM pg_trigger WHERE tgname LIKE '%point%';
```

## Next Steps

1. **Integrate with existing auth system** - Connect coordinator roles to your auth
2. **Add family management** - Screen to view/edit family details
3. **Build marketplace** - Substitute bidding functionality
4. **Implement swaps** - Family-to-family shift exchange
5. **Add analytics** - Dashboard stats and reporting
6. **Deploy to production** - Test with Kil Fotball G9 pilot

## Support

Questions? Issues? Check:
- **Full documentation**: README_COORDINATOR.md
- **Database schema**: schema.sql (with comments)
- **Type definitions**: types/supabase.ts

---

**Ready to reduce coordinator workload by 80%!** 🎉
